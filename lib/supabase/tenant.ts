import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { getMasterClient } from './master'

const tenantClients = new Map<string, SupabaseClient>()

export async function getTenantConfig(tenantId: string) {
    const master = getMasterClient()
    const { data: tenant, error } = await master
        .from('tenants')
        .select('*')
        .eq('id', tenantId)
        .single()

    if (error || !tenant) {
        throw new Error(`Tenant ${tenantId} not found`)
    }

    return {
        url: tenant.supabase_url,
        anonKey: tenant.supabase_anon_key,
        serviceKey: tenant.supabase_service_key
    }
}

export async function getTenantClient(tenantId: string) {
    if (tenantClients.has(tenantId)) {
        return tenantClients.get(tenantId)!
    }

    const config = await getTenantConfig(tenantId)
    // Usamos service key para operaciones de servidor
    const client = createClient(config.url, config.serviceKey)
    tenantClients.set(tenantId, client)
    return client
}

// Helpers para Auth
export async function getTenantForUser(email: string): Promise<{ id: string; name: string; slug: string } | null> {
    const master = getMasterClient()
    const { data: user } = await master
        .from('users')
        .select('tenant_id, tenants(*)')
        .eq('email', email)
        .single()

    // tenants is returned as an array when using (*), get first item
    const tenant = Array.isArray(user?.tenants) ? user.tenants[0] : user?.tenants
    return tenant || null
}

export async function isUserAdmin(email: string) {
    const master = getMasterClient()
    const { data: user } = await master
        .from('users')
        .select('is_admin')
        .eq('email', email)
        .single()

    return user?.is_admin || false
}
