import { auth } from '@/lib/auth/config'
import { getAgentBySlug } from '@/lib/agents/service'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { checkUsageLimit, trackUsage } from '@/lib/billing/tracker'
// God Tool removed - now using atomic Skills architecture
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'
import { getClient } from '@/lib/supabase/client'
import { routeMessage, buildCombinedPrompt } from '@/lib/agents/router'
import { ResponseGuard } from '@/lib/validation/response-guard'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

export const maxDuration = 60 // Allow longer timeout for tools

async function getCompanyContext(tenantId: string): Promise<string | null> {
    try {
        const db = getClient()
        const { data, error } = await db
            .from('tenants')
            .select('company_context')
            .eq('id', tenantId)
            .single()

        if (error || !data?.company_context) return null
        return data.company_context
    } catch (e) {
        console.error('[Chat] Error fetching company context:', e)
        return null
    }
}

export async function POST(req: Request) {
    const session = await auth()

    if (!session?.user?.email || !session.tenant?.id) {
        return new Response('Unauthorized', { status: 401 })
    }

    let body: any
    try {
        body = await req.json()
    } catch (e) {
        console.error('Failed to parse request body:', e)
        return new Response(JSON.stringify({ error: 'Invalid JSON body' }), { status: 400 })
    }

    const { agentSlug, messages, sessionId, voiceMode } = body
    const tenantId = session.tenant.id

    console.log('[Chat] Request:', { agentSlug, sessionId, messagesCount: messages?.length })

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        console.error('[Chat] Invalid messages:', messages)
        return new Response(JSON.stringify({ error: 'Messages array is required' }), { status: 400 })
    }

    try {
        // 1. Billing Check (Before processing)
        // Estimate tokens: simplistic count (words * 1.3)
        const lastMessage = messages[messages.length - 1]
        const inputContent = lastMessage?.content || ''
        const estimatedInputTokens = Math.ceil(inputContent.length / 3)
        await checkUsageLimit(tenantId, session.user.email, estimatedInputTokens)

        // 2. Get Agent (with smart routing via router.ts)
        // Always start with Tuqui as orchestrator, then route to specialized agent if needed
        const conversationHistory = messages.slice(0, -1).map((m: any) => m.content)
        const routingResult = await routeMessage(tenantId, inputContent, conversationHistory)
        
        console.log(`[Chat] Routing: ${routingResult.selectedAgent?.slug || 'none'} (${routingResult.confidence}) - ${routingResult.reason}`)
        
        // Get the base agent (Tuqui) for personality
        const baseAgent = await getAgentBySlug(tenantId, agentSlug)
        if (!baseAgent) {
            return new Response('Agent not found', { status: 404 })
        }
        
        // Determine effective agent config (tools from routed agent, personality from base)
        let agent = baseAgent
        let effectiveTools = baseAgent.tools || []
        let systemPromptAddition = ''
        
        if (routingResult.selectedAgent && routingResult.confidence !== 'low') {
            // Use tools from the specialized agent
            if (routingResult.selectedAgent.tools.length > 0) {
                effectiveTools = routingResult.selectedAgent.tools
            }
            // Combine prompts if specialized agent has its own prompt
            if (routingResult.selectedAgent.system_prompt) {
                systemPromptAddition = `\n\n## 🎯 MODO ACTIVO: ${routingResult.selectedAgent.name}\n${routingResult.selectedAgent.system_prompt}`
            }
            console.log(`[Chat] Using specialized config: ${routingResult.selectedAgent.slug} with tools: ${effectiveTools.join(', ')}`)
        }

        // 3. System Prompt (already merged with custom instructions + company context)
        let systemSystem = agent.merged_system_prompt || agent.system_prompt || 'Sos un asistente útil.'
        
        // Replace {{CURRENT_DATE}} placeholder with actual date
        const now = new Date()
        const currentDate = now.toLocaleDateString('es-AR', { 
            weekday: 'long', 
            year: 'numeric', 
            month: 'long', 
            day: 'numeric' 
        })
        systemSystem = systemSystem.replace(/\{\{CURRENT_DATE\}\}/g, currentDate)
        
        // Add specialized prompt if routing detected a specialty
        if (systemPromptAddition) {
            systemSystem += systemPromptAddition
        }

        // Add context persistence rule
        systemSystem += '\n\nIMPORTANTE: Estás en una conversación fluida. Usa siempre los mensajes anteriores para entender referencias como "él", "eso", "ahora", o "qué productos?". No pidas aclaraciones si el contexto ya está en el historial.'

        // Note: Chain of Thought is now handled by Gemini's native thinkingConfig
        // We don't need to instruct the model to write <thinking> blocks manually

        // Add professional tool usage messaging
        systemSystem += '\n\nCUANDO USES HERRAMIENTAS: Comunicate de forma profesional y natural. En lugar de mensajes técnicos como "🔍 Consultando: sale.report...", usa frases amigables como:\n' +
            '- "Un momento, estoy buscando esa información..."\n' +
            '- "Déjame consultar los datos..."\n' +
            '- "Verificando en el sistema..."\n' +
            '- "Analizando la información..."\n' +
            'NUNCA menciones nombres técnicos de modelos, tablas o funciones. Mantené la conversación natural y profesional.'

        if (voiceMode) {
            systemSystem += '\n\nREGLA PARA VOZ: Sé extremadamente conciso. Respuestas de máximo 2 oraciones, tipo telegrama elegante. No des rodeos ni explicaciones largas excepto que te lo pidan explícitamente.'
        }

        if (agent.rag_enabled && !voiceMode) {
            try {
                console.log(`[Chat] RAG enabled for agent ${agent.slug}. Searching for: "${inputContent.substring(0, 50)}..."`)
                const docs = await searchDocuments(tenantId, agent.id, inputContent)
                console.log(`[Chat] RAG search returned ${docs.length} documents`)
                if (docs.length > 0) {
                    systemSystem += `\n\nCONTEXTO RELEVANTE (Usar para responder):\n${docs.map(d => `- ${d.content}`).join('\n')}`
                }
            } catch (ragError) {
                console.error('[Chat] RAG search failed:', ragError)
                // Continue without RAG if it fails
            }
        }

        console.log('[Chat] Loading tools:', effectiveTools)

        // Generate Stream using Skills architecture
        try {
            // All agents use standard AI SDK path with Skills
            let tools: any = {}
            try {
                tools = await getToolsForAgent(tenantId, effectiveTools, session.user.email!)
                console.log('[Chat] Tools loaded:', Object.keys(tools))
            } catch (toolsError) {
                console.error('[Chat] Error loading tools:', toolsError)
            }

            // If voiceMode is ON, we want a simple text response, not a stream
            // to make the client implementation simpler and avoiding parsing SSE
            if (voiceMode) {
                try {
                    const hasActiveTools = Object.keys(tools).length > 0

                    let responseText = ''
                    let totalTokens = 0

                    if (hasActiveTools) {
                        const { generateTextNative } = await import('@/lib/tools/native-gemini')
                        const result = await generateTextNative({
                            system: systemSystem,
                            messages,
                            tools,
                            maxSteps: 5
                        })
                        responseText = result.text
                        totalTokens = result.usage.totalTokens
                    } else {
                        const { generateText } = await import('ai')
                        const result = await generateText({
                            model: google('gemini-2.0-flash'),
                            system: systemSystem,
                            messages: messages.map((m: any) => ({
                                role: m.role as 'user' | 'assistant' | 'system',
                                content: m.content
                            })),
                        })
                        responseText = result.text
                        totalTokens = result.usage.totalTokens || 0
                    }

                    // Track usage
                    try {
                        await trackUsage(tenantId, session.user.email!, totalTokens)
                    } catch (e) {
                        console.error('[Chat] Failed to track usage:', e)
                    }

                    return new Response(responseText)
                } catch (voiceError: any) {
                    console.error('[Chat] VoiceMode generation error:', voiceError)
                    return new Response(JSON.stringify({
                        error: 'Voice generation failed',
                        details: voiceError.message,
                        stack: voiceError.stack
                    }), { status: 500 })
                }
            }

            const hasTools = Object.keys(tools).length > 0
            console.log('[Chat] Has tools:', hasTools, 'Tools:', Object.keys(tools))

            // Use native Gemini wrapper when we have tools (AI SDK has schema conversion issues)
            if (hasTools) {
                console.log('[Chat] Using native Gemini V2 with thinking support')
                const { generateTextWithThinking } = await import('@/lib/tools/native-gemini-v2')
                
                // Create a streaming response with thinking events
                const encoder = new TextEncoder()
                
                const stream = new ReadableStream({
                    async start(controller) {
                        try {
                            const result = await generateTextWithThinking({
                                model: 'gemini-3-flash-preview',
                                system: systemSystem,
                                messages,
                                tools,
                                maxSteps: 5,
                                thinkingLevel: 'medium', // Balanced thinking for most tasks
                                includeThoughts: true,
                                onThinkingStep: (step) => {
                                    // Emit tool execution event with t: prefix
                                    const event = `t:${JSON.stringify(step)}\n`
                                    controller.enqueue(encoder.encode(event))
                                },
                                onThinkingSummary: (summary) => {
                                    // Emit thinking summary with th: prefix
                                    const event = `th:${JSON.stringify({ text: summary })}\n`
                                    controller.enqueue(encoder.encode(event))
                                }
                            })

                            // Log thinking tokens used
                            if (result.usage.thinkingTokens) {
                                console.log(`[Chat] Thinking tokens used: ${result.usage.thinkingTokens}`)
                            }

                            // Emit the final text response
                            controller.enqueue(encoder.encode(result.text))
                            controller.close()
                            
                            // Track usage after stream completes
                            try {
                                await trackUsage(tenantId, session.user.email!, result.usage.totalTokens || 0)
                            } catch (e) {
                                console.error('[Chat] Failed to track usage:', e)
                            }
                        } catch (error: any) {
                            console.error('[Chat] Streaming error:', error)
                            controller.error(error)
                        }
                    }
                })

                return new Response(stream, {
                    headers: { 
                        'Content-Type': 'text/plain; charset=utf-8',
                        'X-Content-Type-Options': 'nosniff'
                    }
                })
            }

            // No tools - use AI SDK streamText
            console.log('[Chat] Calling streamText with model: gemini-2.0-flash (no tools)')
            const result = streamText({
                model: google('gemini-2.0-flash'),
                system: systemSystem,
                messages: messages.map((m: any) => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                })),
                onFinish: async (event: any) => {
                    try {
                        const { usage, text } = event
                        console.log('[Chat] Stream finished. Usage:', usage)

                        // Validar respuesta con ResponseGuard
                        if (text) {
                            const validation = ResponseGuard.validateResponse(text)
                            if (!validation.valid) {
                                console.warn('[Chat] Response validation warnings:', validation.warnings)
                                // Log para debugging pero no bloquear (para no interrumpir conversación)
                                if (validation.score < 50) {
                                    console.error('[Chat] Low confidence response (score:', validation.score, ')')
                                }
                            }
                        }

                        if (usage) {
                            await trackUsage(tenantId, session.user.email!, usage.totalTokens || 0)
                        }
                    } catch (e) {
                        console.error('[Chat] Failed to track usage:', e)
                    }
                }
            })

            console.log('[Chat] streamText result keys:', Object.keys(result))

            // Check for available response methods
            if (typeof (result as any).toDataStreamResponse === 'function') {
                console.log('[Chat] Using toDataStreamResponse')
                return (result as any).toDataStreamResponse()
            } else if (typeof (result as any).toTextStreamResponse === 'function') {
                console.log('[Chat] toDataStreamResponse missing, using toTextStreamResponse')
                return (result as any).toTextStreamResponse()
            } else if (typeof (result as any).toAIStreamResponse === 'function') {
                console.log('[Chat] Using toAIStreamResponse')
                return (result as any).toAIStreamResponse()
            } else {
                console.error('[Chat] No standard response method found on result. Available keys:', Object.keys(result))
                // Fallback: try to create a response from the text stream if available
                if ((result as any).textStream) {
                    console.log('[Chat] Fallback: Creating response from textStream')
                    return new Response((result as any).textStream, {
                        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                    })
                }
                throw new Error('AI SDK result missing response methods and textStream')
            }
        } catch (streamError: any) {
            console.error('[Chat] Error in streamText execution:', streamError)

            // Use friendly error messages
            const { getFriendlyError, formatErrorResponse } = await import('@/lib/errors/friendly-messages')
            const friendlyError = getFriendlyError(streamError)
            const response = formatErrorResponse(streamError)

            return new Response(JSON.stringify(response), { status: friendlyError.statusCode })
        }

    } catch (error: any) {
        console.error('Chat error:', error)

        // Use friendly error messages
        const { getFriendlyError, formatErrorResponse } = await import('@/lib/errors/friendly-messages')
        const friendlyError = getFriendlyError(error)
        const response = formatErrorResponse(error)

        return new Response(JSON.stringify(response), { status: friendlyError.statusCode })
    }
}
