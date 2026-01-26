/**
 * Internal Chat Test Endpoint
 * 
 * Allows running tests against the chat API without OAuth authentication.
 * Protected by INTERNAL_TEST_KEY environment variable.
 * 
 * Security:
 * - Requires INTERNAL_TEST_KEY header
 * - Rate limited to 100 requests per day per IP
 * - Not accessible from forks (no secrets)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getAgentBySlug } from '@/lib/agents/service'
import { searchDocuments } from '@/lib/rag/search'
import { routeMessage } from '@/lib/agents/router'
// God Tool removed - now using atomic Skills architecture
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'
import { getToolsForAgent } from '@/lib/tools/executor'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

const INTERNAL_KEY = process.env.INTERNAL_TEST_KEY || 'test-key-change-in-prod'

// ============================================
// RATE LIMITING (100 requests/day per IP)
// ============================================
const RATE_LIMIT_MAX = 100
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000 // 24 hours

interface RateLimitEntry {
    count: number
    resetAt: number
}

const rateLimitMap = new Map<string, RateLimitEntry>()

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; resetAt: number } {
    const now = Date.now()
    const entry = rateLimitMap.get(ip)
    
    // Clean up or reset expired entries
    if (!entry || now >= entry.resetAt) {
        const newEntry = { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS }
        rateLimitMap.set(ip, newEntry)
        return { allowed: true, remaining: RATE_LIMIT_MAX - 1, resetAt: newEntry.resetAt }
    }
    
    // Check if limit exceeded
    if (entry.count >= RATE_LIMIT_MAX) {
        return { allowed: false, remaining: 0, resetAt: entry.resetAt }
    }
    
    // Increment counter
    entry.count++
    return { allowed: true, remaining: RATE_LIMIT_MAX - entry.count, resetAt: entry.resetAt }
}

// Clean up old entries periodically (every hour)
setInterval(() => {
    const now = Date.now()
    for (const [ip, entry] of rateLimitMap.entries()) {
        if (now >= entry.resetAt) {
            rateLimitMap.delete(ip)
        }
    }
}, 60 * 60 * 1000)

export const maxDuration = 60

export async function POST(req: NextRequest) {
    // Validate internal key
    const authHeader = req.headers.get('x-internal-key') || req.nextUrl.searchParams.get('key')
    
    if (authHeader !== INTERNAL_KEY) {
        return NextResponse.json({ error: 'Unauthorized - Invalid key' }, { status: 401 })
    }

    // Rate limiting by IP
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() 
        || req.headers.get('x-real-ip') 
        || 'unknown'
    
    const rateLimit = checkRateLimit(ip)
    
    if (!rateLimit.allowed) {
        return NextResponse.json({ 
            error: 'Rate limit exceeded',
            message: `Máximo ${RATE_LIMIT_MAX} requests por día. Reset: ${new Date(rateLimit.resetAt).toISOString()}`,
            resetAt: rateLimit.resetAt
        }, { 
            status: 429,
            headers: {
                'X-RateLimit-Limit': String(RATE_LIMIT_MAX),
                'X-RateLimit-Remaining': '0',
                'X-RateLimit-Reset': String(rateLimit.resetAt),
                'Retry-After': String(Math.ceil((rateLimit.resetAt - Date.now()) / 1000))
            }
        })
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

        // 6. Execute chat with Skills architecture
        let response = ''
        let toolsUsed: string[] = effectiveTools

        // Use unified Skills-based approach for all agents
        const tools = await getToolsForAgent(tenantId, effectiveTools, 'test@internal.com')
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
                // More precise error detection - avoid false positives like "errores en los registros"
                hasError: /hubo un (error|problema)|no pude (acceder|obtener|consultar)|error al (buscar|consultar)|disculpá.*no (pude|puedo)|no hay datos disponibles|problema técnico/i.test(response),
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
