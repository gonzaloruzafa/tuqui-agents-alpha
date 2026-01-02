import { NextRequest, NextResponse } from 'next/server'
import { getTenantByPhone } from '@/lib/supabase/tenant'
import { sendWhatsApp } from '@/lib/twilio/client'
import { getAgentBySlug } from '@/lib/agents/service'
import { searchDocuments } from '@/lib/rag/search'
import { getToolsForAgent } from '@/lib/tools/executor'
import { getMasterClient } from '@/lib/supabase/master'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

export const maxDuration = 60 // Allow longer timeout for tools

export async function POST(req: NextRequest) {
    console.log('[WhatsApp] Webhook received')

    try {
        const rawBody = await req.text()
        console.log('[WhatsApp] Raw payload:', rawBody)

        const params = new URLSearchParams(rawBody)

        // Check if this is a Twilio Debugger event instead of a message
        if (params.has('Payload')) {
            console.log('[WhatsApp] Ignoring Twilio Debugger event')
            return new Response('OK (Debugger event ignored)', { status: 200 })
        }

        const from = params.get('From')
        const body = params.get('Body')

        if (!from || !body) {
            console.log('[WhatsApp] Invalid messaging payload. Params:', Object.fromEntries(params.entries()))
            return new Response(`Error: Se esperaba un mensaje de WhatsApp (From/Body). Recibido: ${Array.from(params.keys()).join(', ')}`, { status: 400 })
        }

        console.log(`[WhatsApp] Incoming from ${from}: ${body}`)

        // 1. Lookup Tenant by Phone
        const tenantInfo = await getTenantByPhone(from)
        console.log(`[WhatsApp] Lookup result for ${from}:`, tenantInfo ? 'Found' : 'NOT FOUND')

        if (!tenantInfo) {
            console.log(`[WhatsApp] Unauthorized phone: ${from}`)
            return new Response(`Unauthorized phone: ${from}`, { status: 401 })
        }

        const { id: tenantId, schema, userEmail } = tenantInfo
        console.log(`[WhatsApp] Routed to Tenant: ${tenantId} (${schema}) for ${userEmail}`)

        // 2. Load Orchestrator Agent (default or based on keywords)
        const { getAgentsForTenant } = await import('@/lib/agents/service')
        const allAgents = await getAgentsForTenant(tenantId)
        console.log(`[WhatsApp] Available agents for tenant ${tenantId}:`, allAgents.map(a => a.slug).join(', '))

        if (allAgents.length === 0) {
            console.error(`[WhatsApp] No agents found for tenant ${tenantId}`)
            await sendWhatsApp(tenantId, from, "Lo siento, no tenés agentes configurados. Por favor contacta a soporte.")
            return new Response('No agents found', { status: 404 })
        }

        // Try to find a default agent: tuqui-chat or the first one available
        const preferredSlug = 'tuqui-chat'
        let agent = allAgents.find(a => a.slug === preferredSlug) || allAgents[0]

        console.log(`[WhatsApp] selected Agent: ${agent.slug} (${agent.id})`)

        // 3. Prepare AI Context
        const systemPrompt = agent.system_prompt || ''

        // Fetch company context if exists
        const master = getMasterClient()
        const { data: tenantData } = await master
            .from('tenants')
            .select('company_context')
            .eq('id', tenantId)
            .single()

        const companyContext = tenantData?.company_context ? `CONTEXTO DE LA EMPRESA:\n${tenantData.company_context}\n\n` : ''
        const fullSystemPrompt = `${companyContext}${systemPrompt}`

        // 4. RAG Search (Optional but recommended)
        let ragContext = ""
        try {
            const searchResults = await searchDocuments(tenantId, agent.id, body, 3)
            if (searchResults.length > 0) {
                ragContext = "\n\nINFORMACIÓN RELEVANTE:\n" + searchResults.map(r => r.content).join("\n---\n")
            }
        } catch (e) {
            console.error('[WhatsApp] RAG Error:', e)
        }

        // 5. Load Tools
        const tools = await getToolsForAgent(tenantId, agent.tools || [])

        // 6. Generate Text
        console.log('[WhatsApp] Invoking Gemini...')
        const { text } = await generateText({
            model: google('gemini-2.0-flash'),
            system: fullSystemPrompt + ragContext,
            messages: [{ role: 'user', content: body }],
            tools: tools as any,
            maxSteps: 5
        } as any)

        // 7. Send Response back via Twilio
        console.log('[WhatsApp] Sending response...')
        await sendWhatsApp(tenantId, from, text)

        return new Response('OK', { status: 200 })

    } catch (error: any) {
        console.error('[WhatsApp] Webhook Error:', error)
        return new Response(JSON.stringify({
            error: error.message,
            stack: error.stack,
            hint: 'Check if whatsapp_phone column exists and environment variables are set'
        }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
}
