import { getClient } from '@/lib/supabase/client'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { checkUsageLimit, trackUsage } from '@/lib/billing/tracker'
import { chatWithOdoo } from '@/lib/tools/gemini-odoo'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { Agent } from '@/lib/agents/service'
import { routeMessage, buildCombinedPrompt } from '@/lib/agents/router'
import { ToolCallRecord } from '@/lib/supabase/chat-history'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

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

        // 5. Execution Path (using effective agent tools)
        const hasOdooTools = effectiveAgent.tools?.some((t: string) => t.startsWith('odoo'))
        let responseText = ''
        let totalTokens = 0
        let responseToolCalls: ToolCallRecord[] = []

        if (hasOdooTools) {
            // Path A: Odoo BI Agent (Native loop)
            console.log('[ChatEngine] Using Odoo BI Agent path')

            // Convert history for Gemini - include tool_calls for context persistence
            const history = messages.slice(0, -1).map(m => {
                let content = m.content
                // Enrich history with tool call info if available
                if (m.role === 'assistant' && m.tool_calls && m.tool_calls.length > 0) {
                    const toolInfo = m.tool_calls.map(tc => 
                        `[Tool: ${tc.name}${tc.result_summary ? ` → ${tc.result_summary}` : ''}]`
                    ).join(' ')
                    content = `${toolInfo}\n\n${content}`
                }
                return {
                    role: m.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: content }]
                }
            }) as any[]

            console.log('[ChatEngine] Odoo Path - System Prompt:', systemPrompt.substring(0, 200) + '...')
            console.log('[ChatEngine] Odoo Path - User Message:', inputContent)
            console.log('[ChatEngine] Odoo Path - History Count:', history.length)

            const odooRes = await chatWithOdoo(tenantId, systemPrompt, inputContent, history)

            console.log('[ChatEngine] Odoo Response:', JSON.stringify({
                text: odooRes.text.substring(0, 100) + '...',
                toolCalls: odooRes.toolCalls?.map(tc => tc.name),
                toolResults: odooRes.toolResults?.map(tr => ({
                    success: tr.success,
                    error: tr.error,
                    count: tr.count,
                    model: (tr.data as any)?.[0]?.['_model'] // Just in case
                }))
            }, null, 2))

            responseText = odooRes.text
            // Odoo BI Agent doesn't expose usage yet, using estimate for now
            totalTokens = responseText.length / 3
            
            // Extract tool calls for persistence
            if (odooRes.toolCalls && odooRes.toolCalls.length > 0) {
                responseToolCalls = odooRes.toolCalls.map(tc => ({
                    name: tc.name,
                    args: tc.args,
                    // Create a summary of the result for context
                    result_summary: odooRes.toolResults?.[0] ? 
                        `${odooRes.toolResults[0].count || 0} registros, total: ${odooRes.toolResults[0].total || 0}` : 
                        undefined
                }))
            }
        } else {
            // Path B: Standard Agent with Tools (Native Gemini wrapper)
            // Using native wrapper because AI SDK has schema conversion issues with Gemini 2.0
            console.log('[ChatEngine] Using Standard Agent path with native wrapper')
            const tools = await getToolsForAgent(tenantId, effectiveAgent.tools || [])
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
                    model: google('gemini-3-flash-preview'),
                    system: systemPrompt,
                    messages: messages as any
                } as any)
                responseText = result.text
                totalTokens = result.usage.totalTokens || 0
            }
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
