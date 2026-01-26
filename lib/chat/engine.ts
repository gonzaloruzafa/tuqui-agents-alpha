import { getClient } from '@/lib/supabase/client'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { checkUsageLimit, trackUsage } from '@/lib/billing/tracker'
// God Tool removed - now using atomic Skills architecture
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { Agent } from '@/lib/agents/service'
import { routeMessage, buildCombinedPrompt } from '@/lib/agents/router'
import { ToolCallRecord } from '@/lib/supabase/chat-history'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

/**
 * Format tool result into a detailed summary for history persistence.
 * This ensures the LLM has access to REAL data in subsequent turns.
 */
function formatToolResultSummary(toolResult: any): string {
    const parts: string[] = []
    
    // Include grouped data (most important for preventing hallucination)
    if (toolResult.grouped && Object.keys(toolResult.grouped).length > 0) {
        const entries = Object.entries(toolResult.grouped)
            .sort((a: any, b: any) => (b[1].total || 0) - (a[1].total || 0))
            .slice(0, 15) // Top 15 to keep context reasonable
        
        const dataLines = entries.map(([name, data]: [string, any]) => 
            `${name}: $${Math.round(data.total || 0).toLocaleString('es-AR')}`
        )
        parts.push(`DATOS: ${dataLines.join(' | ')}`)
    }
    
    // Include totals
    if (toolResult.total) {
        parts.push(`TOTAL: $${Math.round(toolResult.total).toLocaleString('es-AR')}`)
    }
    
    if (toolResult.count) {
        parts.push(`(${toolResult.count} registros)`)
    }
    
    return parts.join(' - ') || 'sin datos'
}

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
    tool_calls?: ToolCallRecord[]  // Tool calls for context persistence
}

export interface ChatEngineParams {
    tenantId: string
    userEmail: string
    agent: Agent
    messages: ChatMessage[]
    channel: 'web' | 'whatsapp'
}

export interface ChatEngineResponse {
    text: string
    toolCalls?: ToolCallRecord[]  // Tool calls from this response
    usage?: {
        totalTokens: number
    }
}

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
        console.error('[ChatEngine] Error fetching company context:', e)
        return null
    }
}

/**
 * Unified Chat Engine
 * Process a chat request from any channel (Web, WhatsApp, etc.)
 */
export async function processChatRequest(params: ChatEngineParams): Promise<ChatEngineResponse> {
    const { tenantId, userEmail, agent, messages, channel } = params
    const lastMessage = messages[messages.length - 1]
    const inputContent = lastMessage?.content || ''

    console.log(`[ChatEngine] Processing ${channel} request for tenant ${tenantId}, agent ${agent.slug}`)

    try {
        // 1. Billing Check
        const estimatedInputTokens = Math.ceil(inputContent.length / 3)
        await checkUsageLimit(tenantId, userEmail, estimatedInputTokens)

        // 2. Route to best sub-agent based on message content
        const conversationHistory = messages.slice(0, -1).map(m => m.content)
        const routingResult = await routeMessage(tenantId, inputContent, conversationHistory)
        
        console.log(`[ChatEngine] Routing: ${routingResult.selectedAgent?.slug || 'none'} (${routingResult.confidence}) - ${routingResult.reason}`)

        // Use sub-agent config if found, otherwise use main agent
        const effectiveAgent = routingResult.selectedAgent ? {
            ...agent,
            tools: routingResult.selectedAgent.tools.length > 0 ? routingResult.selectedAgent.tools : agent.tools,
            rag_enabled: routingResult.selectedAgent.rag_enabled || agent.rag_enabled
        } : agent

        // 3. Build System Prompt & Context
        let systemPrompt = agent.system_prompt || 'Sos un asistente útil.'

        // Inject current date for temporal context (usando DateService)
        const { DateService } = await import('@/lib/date/service')
        const currentDate = DateService.formatted()
        systemPrompt = systemPrompt.replace('{{CURRENT_DATE}}', currentDate)
        
        // Combine with sub-agent prompt if different specialty
        if (routingResult.selectedAgent && routingResult.selectedAgent.system_prompt && routingResult.confidence !== 'low') {
            systemPrompt = buildCombinedPrompt(
                systemPrompt,
                routingResult.selectedAgent.system_prompt,
                routingResult.selectedAgent.name
            )
        }

        const companyContext = await getCompanyContext(tenantId)

        if (companyContext) {
            systemPrompt += `\n\nCONTEXTO DE LA EMPRESA:\n${companyContext}`
        }

        if (channel === 'whatsapp') {
            systemPrompt += '\n\nREGLA PARA WHATSAPP: Sé conciso. Formato Markdown simple (negritas, listas). Máximo 1500 caracteres por mensaje.'
            systemPrompt += '\n\nIMPORTANTE: Estás en una conversación fluida. Usa siempre los mensajes anteriores para entender referencias como "él", "eso", "ahora", "Al reporte", "Diciembre 2025" o "qué productos?". No pidas aclaraciones si el contexto ya está en el historial.'
        }

        // 4. RAG Context (using effective agent config)
        if (effectiveAgent.rag_enabled) {
            try {
                // Search in main agent docs + sub-agent docs if different
                const agentId = routingResult.selectedAgent?.id || agent.id
                const docs = await searchDocuments(tenantId, agentId, inputContent)
                if (docs.length > 0) {
                    systemPrompt += `\n\nCONTEXTO RELEVANTE:\n${docs.map(d => `- ${d.content}`).join('\n')}`
                }
            } catch (ragError) {
                console.error('[ChatEngine] RAG search failed:', ragError)
            }
        }

        // 5. Execution Path (unified with Skills architecture)
        let responseText = ''
        let totalTokens = 0
        let responseToolCalls: ToolCallRecord[] = []

        console.log('[ChatEngine] Loading tools (including Skills if Odoo enabled)')
        const tools = await getToolsForAgent(tenantId, effectiveAgent.tools || [], userEmail)
        const hasTools = Object.keys(tools).length > 0

        if (hasTools) {
            const { generateTextNative } = await import('@/lib/tools/native-gemini')
            const result = await generateTextNative({
                system: systemPrompt,
                messages: messages as any,
                tools: tools as any,
                maxSteps: 5
            })
            responseText = result.text
            totalTokens = result.usage.totalTokens || 0
        } else {
            // No tools - use AI SDK (simpler, works fine without tools)
            const result = await generateText({
                model: google('gemini-2.0-flash'),
                system: systemPrompt,
                messages: messages as any
            } as any)
            responseText = result.text
            totalTokens = result.usage.totalTokens || 0
        }

        // 6. Track Usage
        try {
            await trackUsage(tenantId, userEmail, Math.ceil(totalTokens))
        } catch (e) {
            console.error('[ChatEngine] Failed to track usage:', e)
        }

        return {
            text: responseText,
            toolCalls: responseToolCalls.length > 0 ? responseToolCalls : undefined,
            usage: { totalTokens: Math.ceil(totalTokens) }
        }

    } catch (error: any) {
        console.error('[ChatEngine] Execution error:', error)
        throw error
    }
}
