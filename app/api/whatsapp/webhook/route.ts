import { NextRequest } from 'next/server'
import { getTenantByPhone } from '@/lib/supabase/tenant'
import { sendWhatsApp } from '@/lib/twilio/client'
import { getOrCreateWhatsAppSession, getSessionMessages, saveMessage } from '@/lib/supabase/chat-history'
import { processChatRequest } from '@/lib/chat/engine'

export const maxDuration = 60 // Allow longer timeout for tools

export async function POST(req: NextRequest) {
    console.log('[WhatsApp] Webhook received')

    try {
        const rawBody = await req.text()
        const headers = Object.fromEntries(req.headers.entries())
        console.log('[WhatsApp] Webhook request:', {
            headers,
            body: rawBody
        })

        const params = new URLSearchParams(rawBody)

        // 0. Handle Twilio Debugger
        if (params.has('Payload')) {
            console.log('[WhatsApp] Ignoring Twilio Debugger event')
            return new Response('<Response></Response>', {
                status: 200,
                headers: { 'Content-Type': 'text/xml' }
            })
        }

        const from = params.get('From')
        const body = params.get('Body')

        if (!from || !body) {
            console.log('[WhatsApp] Invalid messaging payload. Received keys:', Array.from(params.keys()).join(', '))
            return new Response(`Invalid payload. Received keys: ${Array.from(params.keys()).join(', ')}`, { status: 400 })
        }

        console.log(`[WhatsApp] Incoming from ${from}: ${body}`)

        // 1. Lookup Tenant by Phone
        const tenantInfo = await getTenantByPhone(from)
        if (!tenantInfo) {
            console.log(`[WhatsApp] Unauthorized phone: ${from}`)
            return new Response(`Unauthorized phone: ${from}`, { status: 401 })
        }

        const { id: tenantId, userEmail } = tenantInfo

        // 2. Load Agent
        const { getAgentsForTenant } = await import('@/lib/agents/service')
        const allAgents = await getAgentsForTenant(tenantId)

        if (allAgents.length === 0) {
            await sendWhatsApp(tenantId, from, "Lo siento, no tenés agentes configurados. Por favor contacta a soporte.")
            return new Response('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
        }

        // Default to tuqui-chat or the first available
        const agent = allAgents.find(a => a.slug === 'tuqui-chat') || allAgents[0]

        // 3. Chat History
        const sessionId = await getOrCreateWhatsAppSession(tenantId, agent.id, userEmail)
        const history = await getSessionMessages(tenantId, sessionId)

        // Save user message
        await saveMessage(tenantId, sessionId, 'user', body)

        // 4. Invoke Unified Chat Engine
        const result = await processChatRequest({
            tenantId,
            userEmail,
            agent,
            messages: [
                ...history.map(m => ({ role: m.role, content: m.content })),
                { role: 'user', content: body }
            ],
            channel: 'whatsapp'
        })

        // 5. Save assistant response and send via WhatsApp
        await saveMessage(tenantId, sessionId, 'assistant', result.text)
        await sendWhatsApp(tenantId, from, result.text)

        // 6. Return empty TwiML to Twilio
        return new Response('<Response></Response>', {
            status: 200,
            headers: { 'Content-Type': 'text/xml' }
        })

    } catch (error: any) {
        console.error('[WhatsApp] Webhook Error:', error)
        // Try to notify the user of the error via WhatsApp if possible
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' }
        })
    }
}
