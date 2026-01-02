import twilio from 'twilio'
import { getTenantClient, getTenantConfig } from '@/lib/supabase/tenant'
import { decrypt } from '@/lib/crypto'

export async function getTwilioClientForTenant(tenantId: string) {
    // For POC/Sandbox: If env vars are present, use them as global default
    const globalSid = process.env.TWILIO_ACCOUNT_SID
    const globalToken = process.env.TWILIO_AUTH_TOKEN

    console.log(`[Twilio] Global SID present: ${!!globalSid}, Global Token present: ${!!globalToken}`)

    if (globalSid && globalToken) {
        return twilio(globalSid, globalToken)
    }

    const db = await getTenantClient(tenantId)
    const { data: config } = await db
        .from('integrations')
        .select('*')
        .eq('type', 'twilio')
        .single()

    if (!config || !config.is_active || !config.config) return null

    const { account_sid, auth_token } = config.config
    return twilio(account_sid, auth_token)
}

export async function getTwilioConfig(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const { data: config } = await db
        .from('integrations')
        .select('*')
        .eq('type', 'twilio')
        .single()

    return config?.config || null
}

export async function sendWhatsApp(tenantId: string, to: string, message: string) {
    const client = await getTwilioClientForTenant(tenantId)
    if (!client) throw new Error('Twilio not configured for this tenant')

    // Support global Sandbox number
    const globalPhone = process.env.TWILIO_PHONE_NUMBER
    let from = ''

    if (globalPhone) {
        from = globalPhone.startsWith('whatsapp:') ? globalPhone : `whatsapp:${globalPhone}`
    } else {
        const config = await getTwilioConfig(tenantId)
        if (!config) throw new Error('Twilio config not found')
        from = `whatsapp:${config.iphone_number || config.phone_number}`
    }

    return client.messages.create({
        from,
        to: to.startsWith('whatsapp:') ? to : `whatsapp:${to}`,
        body: message
    })
}
