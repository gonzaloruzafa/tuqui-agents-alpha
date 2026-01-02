import { NextRequest } from 'next/server'
import { getTenantByPhone } from '@/lib/supabase/client'
import { sendWhatsApp } from '@/lib/twilio/client'
import { getOrCreateWhatsAppSession, getSessionMessages, saveMessage } from '@/lib/supabase/chat-history'
import { processChatRequest } from '@/lib/chat/engine'
import { getTuqui } from '@/lib/agents/service'

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

        // 0. Handle Twilio Debugger or Status Callbacks
        if (params.has('Payload') || params.has('MessageStatus')) {
            console.log('[WhatsApp] Ignoring Twilio event:', params.has('Payload') ? 'Debugger' : 'Status Callback')
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

        // 2. Get Tuqui (the default agent for WhatsApp)
        const agent = await getTuqui(tenantId)
        if (!agent) {
            console.error(`[WhatsApp] Tuqui agent not found for tenant ${tenantId}`)
            return new Response('Agent not found', { status: 500 })
        }
        console.log(`[WhatsApp] Using Tuqui with tools: ${agent.tools?.join(', ')}`)
        
        // 3. Get/create session
        const sessionId = await getOrCreateWhatsAppSession(tenantId, agent.id, userEmail)
        const history = await getSessionMessages(tenantId, sessionId)

        // Save user message
        await saveMessage(tenantId, sessionId, 'user', body)

        // 4. Invoke Chat Engine with Tuqui
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
        
        // WhatsApp limit is 1600 chars - split into multiple messages if needed
        const MAX_WA_LENGTH = 1500 // Leave buffer for special chars
        const responseText = result.text
        
        if (responseText.length <= MAX_WA_LENGTH) {
            await sendWhatsApp(tenantId, from, responseText)
        } else {
            // Split into chunks, trying to break at newlines or sentences
            const chunks: string[] = []
            let remaining = responseText
            
            while (remaining.length > 0) {
                if (remaining.length <= MAX_WA_LENGTH) {
                    chunks.push(remaining)
                    break
                }
                
                // Find a good break point (newline, period, or space)
                let breakPoint = remaining.lastIndexOf('\n', MAX_WA_LENGTH)
                if (breakPoint < MAX_WA_LENGTH * 0.5) {
                    breakPoint = remaining.lastIndexOf('. ', MAX_WA_LENGTH)
                }
                if (breakPoint < MAX_WA_LENGTH * 0.5) {
                    breakPoint = remaining.lastIndexOf(' ', MAX_WA_LENGTH)
                }
                if (breakPoint < MAX_WA_LENGTH * 0.3) {
                    breakPoint = MAX_WA_LENGTH // Force break
                }
                
                chunks.push(remaining.substring(0, breakPoint + 1).trim())
                remaining = remaining.substring(breakPoint + 1).trim()
            }
            
            // Send chunks with small delay to maintain order
            for (let i = 0; i < chunks.length; i++) {
                const chunkText = chunks.length > 1 
                    ? `(${i + 1}/${chunks.length}) ${chunks[i]}`
                    : chunks[i]
                await sendWhatsApp(tenantId, from, chunkText)
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 500)) // 500ms delay between chunks
                }
            }
        }

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
