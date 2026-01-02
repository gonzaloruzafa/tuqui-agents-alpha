import { getMasterClient } from '@/lib/supabase/master'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { checkUsageLimit, trackUsage } from '@/lib/billing/tracker'
import { chatWithOdoo } from '@/lib/tools/gemini-odoo'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'
import { Agent } from '@/lib/agents/service'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

export interface ChatMessage {
    role: 'user' | 'assistant' | 'system'
    content: string
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
    usage?: {
        totalTokens: number
    }
}

async function getCompanyContext(tenantId: string): Promise<string | null> {
    try {
        const db = getMasterClient()
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

        // 2. Build System Prompt & Context
        let systemPrompt = agent.system_prompt || 'Sos un asistente útil.'
        const companyContext = await getCompanyContext(tenantId)

        if (companyContext) {
            systemPrompt += `\n\nCONTEXTO DE LA EMPRESA:\n${companyContext}`
        }

        // Add context persistence rule
        systemPrompt += '\n\nIMPORTANTE: Estás en una conversación fluida. Usa siempre los mensajes anteriores para entender referencias. No pidas aclaraciones si el contexto ya está en el historial.'

        if (channel === 'whatsapp') {
            systemPrompt += '\n\nREGLA PARA WHATSAPP: Sé conciso pero útil. Usa formato Markdown simple (negritas, listas). No uses lenguaje excesivamente formal excepto que sea necesario.'
        }

        // 3. RAG Context
        if (agent.rag_enabled) {
            try {
                const docs = await searchDocuments(tenantId, agent.id, inputContent)
                if (docs.length > 0) {
                    systemPrompt += `\n\nCONTEXTO RELEVANTE:\n${docs.map(d => `- ${d.content}`).join('\n')}`
                }
            } catch (ragError) {
                console.error('[ChatEngine] RAG search failed:', ragError)
            }
        }

        // 4. Execution Path
        const hasOdooTools = agent.tools?.some((t: string) => t.startsWith('odoo'))
        let responseText = ''
        let totalTokens = 0

        if (hasOdooTools) {
            // Path A: Odoo BI Agent (Native loop)
            console.log('[ChatEngine] Using Odoo BI Agent path')

            // Convert history for Gemini
            const history = messages.slice(0, -1).map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
            })) as any[]

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
        } else {
            // Path B: Standard Agent (AI SDK)
            console.log('[ChatEngine] Using Standard Agent path')
            const tools = await getToolsForAgent(tenantId, agent.tools || [])

            const result = await generateText({
                model: google('gemini-2.0-flash'),
                system: systemPrompt,
                messages: messages as any,
                tools: tools as any,
                maxSteps: 5
            } as any)

            responseText = result.text
            totalTokens = result.usage.totalTokens || 0
        }

        // 5. Track Usage
        try {
            await trackUsage(tenantId, userEmail, Math.ceil(totalTokens))
        } catch (e) {
            console.error('[ChatEngine] Failed to track usage:', e)
        }

        return {
            text: responseText,
            usage: { totalTokens: Math.ceil(totalTokens) }
        }

    } catch (error: any) {
        console.error('[ChatEngine] Execution error:', error)
        throw error
    }
}
