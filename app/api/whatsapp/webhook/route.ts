import { NextRequest } from 'next/server'
import { getTenantByPhone } from '@/lib/supabase/tenant'
import { sendWhatsApp } from '@/lib/twilio/client'
import { getOrCreateWhatsAppSession, getSessionMessages, saveMessage, getRecentUserMessages } from '@/lib/supabase/chat-history'
import { processChatRequest } from '@/lib/chat/engine'
import { Agent } from '@/lib/agents/service'

export const maxDuration = 60 // Allow longer timeout for tools

/**
 * Intelligent Agent Router - Selects the best agent based on message content
 */
function selectBestAgent(message: string, agents: Agent[], history: string[] = []): Agent {
    const msgLower = message.toLowerCase()
    const fullContext = [...history, message].join(' ').toLowerCase()
    
    // Keywords for each agent type
    const odooKeywords = ['venta', 'compra', 'factura', 'cliente', 'producto', 'stock', 'inventario', 
        'cobro', 'pago', 'deuda', 'vendedor', 'pedido', 'trimestre', 'mes pasado', 'este año',
        'vendimos', 'compramos', 'facturamos', 'cobramos', 'pagamos', 'odoo', 'erp']
    
    const meliKeywords = ['mercadolibre', 'meli', 'publicacion', 'precio de', 'buscar producto', 
        'comparar precio', 'marketplace']
    
    const legalKeywords = ['ley', 'legal', 'contrato', 'demanda', 'abogado', 'juicio', 
        'indemnización', 'despido', 'sociedad', 'sas', 'srl']
    
    const accountingKeywords = ['iva', 'impuesto', 'monotributo', 'afip', 'ddjj', 'ganancias',
        'contador', 'balance', 'presentar declaración']

    // Score each agent type based on keyword matches
    const hasOdooIntent = odooKeywords.some(k => fullContext.includes(k))
    const hasMeliIntent = meliKeywords.some(k => fullContext.includes(k))
    const hasLegalIntent = legalKeywords.some(k => fullContext.includes(k))
    const hasAccountingIntent = accountingKeywords.some(k => fullContext.includes(k))

    // Priority: specific intent > RAG-enabled > general chat
    if (hasOdooIntent) {
        const odooAgent = agents.find(a => a.slug === 'tuqui-odoo' && a.is_active)
        if (odooAgent) {
            console.log('[WhatsApp Router] Selected tuqui-odoo based on intent keywords')
            return odooAgent
        }
    }
    
    if (hasMeliIntent) {
        const meliAgent = agents.find(a => a.slug === 'tuqui-mercadolibre' && a.is_active)
        if (meliAgent) {
            console.log('[WhatsApp Router] Selected tuqui-mercadolibre based on intent keywords')
            return meliAgent
        }
    }
    
    if (hasLegalIntent) {
        const legalAgent = agents.find(a => a.slug === 'tuqui-legal' && a.is_active)
        if (legalAgent) {
            console.log('[WhatsApp Router] Selected tuqui-legal based on intent keywords')
            return legalAgent
        }
    }
    
    if (hasAccountingIntent) {
        const accountingAgent = agents.find(a => a.slug === 'tuqui-contador' && a.is_active)
        if (accountingAgent) {
            console.log('[WhatsApp Router] Selected tuqui-contador based on intent keywords')
            return accountingAgent
        }
    }

    // Check if user is asking about company-specific docs
    const ragKeywords = ['documento', 'manual', 'procedimiento', 'política', 'protocolo']
    if (ragKeywords.some(k => msgLower.includes(k))) {
        const ragAgent = agents.find(a => a.rag_enabled && a.is_active)
        if (ragAgent) {
            console.log('[WhatsApp Router] Selected RAG-enabled agent')
            return ragAgent
        }
    }

    // Default to tuqui-chat or first available
    const defaultAgent = agents.find(a => a.slug === 'tuqui-chat' && a.is_active) || agents[0]
    console.log(`[WhatsApp Router] Using default agent: ${defaultAgent.slug}`)
    return defaultAgent
}

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

        // 2. Load Agents for tenant
        const { getAgentsForTenant } = await import('@/lib/agents/service')
        const allAgents = await getAgentsForTenant(tenantId)

        if (allAgents.length === 0) {
            await sendWhatsApp(tenantId, from, "Lo siento, no tenés agentes configurados. Por favor contacta a soporte.")
            return new Response('<Response></Response>', { status: 200, headers: { 'Content-Type': 'text/xml' } })
        }

        // 3. Get recent cross-agent history for intelligent routing
        const recentCrossAgentHistory = await getRecentUserMessages(tenantId, userEmail, 10)
        const recentMessages = recentCrossAgentHistory.map(m => m.content)
        
        // Intelligent Agent Selection based on message content + history
        const agent = selectBestAgent(body, allAgents, recentMessages)
        console.log(`[WhatsApp] Selected agent: ${agent.slug} (${agent.name})`)
        
        // Get/create session for the selected agent
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
