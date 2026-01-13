/**
 * Internal Chat Test Endpoint
 * 
 * Allows running tests against the chat API without OAuth authentication.
 * Protected by INTERNAL_TEST_KEY environment variable.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgentBySlug } from '@/lib/agents/service'
import { searchDocuments } from '@/lib/rag/search'
import { routeMessage } from '@/lib/agents/router'
import { streamChatWithOdoo } from '@/lib/tools/gemini-odoo'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'
import { getToolsForAgent } from '@/lib/tools/executor'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

const INTERNAL_KEY = process.env.INTERNAL_TEST_KEY || 'test-key-change-in-prod'

export const maxDuration = 60

export async function POST(req: NextRequest) {
    // Validate internal key
    const authHeader = req.headers.get('x-internal-key') || req.nextUrl.searchParams.get('key')
    
    if (authHeader !== INTERNAL_KEY) {
        return NextResponse.json({ error: 'Unauthorized - Invalid key' }, { status: 401 })
    }

    let body: any
    try {
        body = await req.json()
    } catch (e) {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { tenantId, agentSlug = 'tuqui', messages, sessionId, streaming = false } = body

    if (!tenantId) {
        return NextResponse.json({ error: 'tenantId is required' }, { status: 400 })
    }

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
        return NextResponse.json({ error: 'messages array is required' }, { status: 400 })
    }

    const startTime = Date.now()
    const testId = sessionId || `test-${Date.now()}`

    console.log(`[TestChat] Starting test ${testId} for tenant ${tenantId}`)

    try {
        // 1. Get Agent
        const agent = await getAgentBySlug(tenantId, agentSlug)
        if (!agent) {
            return NextResponse.json({ 
                error: 'Agent not found',
                testId,
                latencyMs: Date.now() - startTime
            }, { status: 404 })
        }

        // 2. Route message to determine specialty
        const inputContent = messages[messages.length - 1]?.content || ''
        const conversationHistory = messages.slice(0, -1).map((m: any) => m.content)
        const routingResult = await routeMessage(tenantId, inputContent, conversationHistory)

        console.log(`[TestChat] Routing: ${routingResult.selectedAgent?.slug || 'none'} (${routingResult.confidence})`)

        // 3. Build system prompt
        let systemPrompt = agent.merged_system_prompt || agent.system_prompt || 'Sos un asistente útil.'
        
        // Add specialized prompt if routed
        if (routingResult.selectedAgent?.system_prompt && routingResult.confidence !== 'low') {
            systemPrompt += `\n\n## 🎯 MODO ACTIVO: ${routingResult.selectedAgent.name}\n${routingResult.selectedAgent.system_prompt}`
        }

        systemPrompt += '\n\nIMPORTANTE: Usa el contexto de mensajes anteriores para entender referencias.'

        // 4. Get RAG context if enabled (non-blocking)
        let ragContext = ''
        if (agent.rag_enabled) {
            try {
                const docs = await searchDocuments(tenantId, agent.id, inputContent)
                if (docs.length > 0) {
                    ragContext = `\n\nCONTEXTO RELEVANTE:\n${docs.map(d => `- ${d.content}`).join('\n')}`
                }
            } catch (ragError) {
                console.warn('[TestChat] RAG search failed (continuing without RAG):', ragError)
            }
        }

        // 5. Determine which tools to use
        const effectiveTools = routingResult.selectedAgent?.tools?.length 
            ? routingResult.selectedAgent.tools 
            : agent.tools || []

        // 6. Execute chat based on tools
        let response = ''
        let toolsUsed: string[] = []

        // Check if Odoo agent
        const useOdoo = effectiveTools.includes('odoo_intelligent_query') || 
                       effectiveTools.includes('odoo') ||
                       routingResult.selectedAgent?.slug === 'odoo'

        if (useOdoo) {
            // Use Odoo-specific streaming
            const history = messages.slice(0, -1).map((m: any) => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            }))

            for await (const chunk of streamChatWithOdoo(tenantId, '', inputContent, history)) {
                if (typeof chunk === 'string') {
                    response += chunk
                }
            }
            toolsUsed.push('odoo_intelligent_query')
        } else {
            // Use native Gemini with proper tool schema conversion
            const tools = await getToolsForAgent(tenantId, effectiveTools)
            const { generateTextNative } = await import('@/lib/tools/native-gemini')
            
            const result = await generateTextNative({
                model: 'gemini-2.0-flash',
                system: systemPrompt + ragContext,
                messages: messages.map((m: any) => ({
                    role: m.role,
                    content: m.content
                })),
                tools,
                maxSteps: 5
            })

            response = result.text
            toolsUsed = effectiveTools
        }

        const latencyMs = Date.now() - startTime

        // 7. Build response with metrics
        const testResult = {
            testId,
            success: true,
            latencyMs,
            routing: {
                selectedAgent: routingResult.selectedAgent?.slug || null,
                confidence: routingResult.confidence,
                reason: routingResult.reason
            },
            agent: {
                slug: agent.slug,
                name: agent.name,
                ragEnabled: agent.rag_enabled
            },
            toolsAvailable: effectiveTools,
            toolsUsed,
            ragDocsFound: ragContext ? ragContext.split('\n-').length - 1 : 0,
            response: response,
            responseLength: response.length,
            // Quality indicators
            quality: {
                hasNumericData: /\$\s?[\d.,]+|\d+\s*(unidades|productos|ventas|pesos|facturas|clientes)/i.test(response),
                hasList: response.includes('- ') || response.includes('• ') || /^\d+\./m.test(response),
                hasError: /error|no pude|no encontré|disculpá|no hay datos/i.test(response),
                usedContext: messages.length > 1 && !/(qué|cuál|a qué te refer)/i.test(response)
            }
        }

        if (streaming) {
            // Return as streaming response for compatibility
            return new Response(response, {
                headers: {
                    'Content-Type': 'text/plain',
                    'X-Test-Id': testId,
                    'X-Latency-Ms': String(latencyMs),
                    'X-Routing': routingResult.selectedAgent?.slug || 'base'
                }
            })
        }

        return NextResponse.json(testResult)

    } catch (error: any) {
        console.error(`[TestChat] Error in test ${testId}:`, error)
        
        return NextResponse.json({
            testId,
            success: false,
            latencyMs: Date.now() - startTime,
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        }, { status: 500 })
    }
}
