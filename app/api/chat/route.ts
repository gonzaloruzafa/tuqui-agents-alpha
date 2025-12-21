import { auth } from '@/lib/auth/config'
import { getAgentBySlug } from '@/lib/agents/service'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { checkUsageLimit, trackUsage } from '@/lib/billing/tracker'
import { streamChatWithOdoo } from '@/lib/tools/gemini-odoo'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

export const maxDuration = 60 // Allow longer timeout for tools

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

    const { agentSlug, messages, sessionId } = body
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

        // 2. Get Agent
        const agent = await getAgentBySlug(tenantId, agentSlug)
        if (!agent) {
            return new Response('Agent not found', { status: 404 })
        }

        // 3. RAG Context
        let systemSystem = agent.system_prompt || 'Sos un asistente útil.'

        if (agent.rag_enabled) {
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

        // 4. Check if agent uses Odoo tools (use native Google SDK for these)
        const hasOdooTools = agent.tools?.some((t: string) => t.startsWith('odoo'))
        
        console.log('[Chat] Loading tools for agent tools:', agent.tools, 'hasOdoo:', hasOdooTools)

        // 5. Generate Stream
        try {
            // Use native Google SDK for Odoo agents (workaround for AI SDK bug with Gemini function calling)
            if (hasOdooTools) {
                console.log('[Chat] Using native Gemini SDK for Odoo agent')
                
                const stream = streamChatWithOdoo(
                    tenantId,
                    systemSystem,
                    inputContent
                )
                
                const encoder = new TextEncoder()
                const readable = new ReadableStream({
                    async start(controller) {
                        try {
                            for await (const chunk of stream) {
                                controller.enqueue(encoder.encode(chunk))
                            }
                            controller.close()
                        } catch (error) {
                            controller.error(error)
                        }
                    }
                })
                
                return new Response(readable, {
                    headers: { 'Content-Type': 'text/plain; charset=utf-8' }
                })
            }

            // Standard AI SDK path for non-Odoo agents
            let tools: any = {}
            try {
                tools = await getToolsForAgent(tenantId, agent.tools || [])
                console.log('[Chat] Tools loaded:', Object.keys(tools))
            } catch (toolsError) {
                console.error('[Chat] Error loading tools:', toolsError)
            }

            console.log('[Chat] Calling streamText with model: gemini-2.5-flash')
            const result = streamText({
                model: google('gemini-2.5-flash'),
                system: systemSystem,
                messages: messages.map((m: any) => ({
                    role: m.role as 'user' | 'assistant' | 'system',
                    content: m.content
                })),
                // Note: tools disabled for non-Odoo agents due to Gemini SDK compatibility issues
                // tools,
                onFinish: async (event: any) => {
                    // 6. Async Billing Tracking (After processing)
                    try {
                        const { usage } = event
                        console.log('[Chat] Stream finished. Usage:', usage)
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
            return new Response(JSON.stringify({ 
                error: 'Error generating response', 
                details: streamError.message,
                stack: streamError.stack
            }), { status: 500 })
        }

    } catch (error: any) {
        console.error('Chat error:', error)
        if (error.message.includes('limit reached')) {
            return new Response(JSON.stringify({ error: error.message }), { status: 403 })
        }
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
    }
}
