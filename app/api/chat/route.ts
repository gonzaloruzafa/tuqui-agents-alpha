import { auth } from '@/lib/auth/config'
import { getAgentBySlug } from '@/lib/agents/service'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { checkUsageLimit, trackUsage } from '@/lib/billing/tracker'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, convertToCoreMessages } from 'ai'
import { z } from 'zod'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

export const maxDuration = 60 // Allow longer timeout for tools

export async function POST(req: Request) {
    const session = await auth()

    if (!session?.user?.email || !session.tenant?.id) {
        return new Response('Unauthorized', { status: 401 })
    }

    const { agentSlug, messages, sessionId } = await req.json()
    const tenantId = session.tenant.id

    // Validate messages
    if (!messages || !Array.isArray(messages) || messages.length === 0) {
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
            const docs = await searchDocuments(tenantId, agent.id, inputContent)
            if (docs.length > 0) {
                systemSystem += `\n\nCONTEXTO RELEVANTE (Usar para responder):\n${docs.map(d => `- ${d.content}`).join('\n')}`
            }
        }

        // 4. Tools
        const tools = await getToolsForAgent(tenantId, agent.tools || [])

        // 5. Generate Stream
        const result = streamText({
            model: google('gemini-2.0-flash'),
            system: systemSystem,
            messages: convertToCoreMessages(messages),
            tools,
            onFinish: async (event) => {
                // 6. Async Billing Tracking (After processing)
                try {
                    const { usage } = event
                    if (usage) {
                        await trackUsage(tenantId, session.user.email!, usage.totalTokens || 0)
                    }
                } catch (e) {
                    console.error('Failed to track usage', e)
                }
            }
        })

        return (result as any).toDataStreamResponse()

    } catch (error: any) {
        console.error('Chat error:', error)
        if (error.message.includes('limit reached')) {
            return new Response(JSON.stringify({ error: error.message }), { status: 403 })
        }
        return new Response(JSON.stringify({ error: 'Internal Server Error' }), { status: 500 })
    }
}
