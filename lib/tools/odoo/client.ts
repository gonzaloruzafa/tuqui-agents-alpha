import { getTenantClient, getTenantConfig } from '@/lib/supabase/tenant'
import { decrypt } from '@/lib/crypto' // Need to implement crypto lib

export interface OdooConfig {
    url: string
    db: string
    username: string
    api_key: string // Encrypted
}

export class OdooClient {
    private url: string
    private db: string
    private username: string
    private apiKey: string
    private uid: number | null = null

    constructor(config: OdooConfig) {
        this.url = config.url.replace(/\/$/, '')
        this.db = config.db
        this.username = config.username
        this.apiKey = config.api_key
    }

    private async rpc(service: string, method: string, ...args: any[]) {
        const res = await fetch(`${this.url}/jsonrpc`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                jsonrpc: '2.0',
                method: 'call',
                params: {
                    service,
                    method,
                    args,
                },
                id: Math.floor(Math.random() * 1000000),
            }),
        })

        if (!res.ok) {
            throw new Error(`Odoo HTTP Error: ${res.statusText}`)
        }

        const data = await res.json()
        if (data.error) {
            throw new Error(`Odoo RPC Error: ${data.error.data?.message || data.error.message}`)
        }

        return data.result
    }

    async authenticate() {
        if (this.uid) return this.uid

        this.uid = await this.rpc(
            'common',
            'authenticate',
            this.db,
            this.username,
            this.apiKey,
            {}
        )

        if (!this.uid) {
            throw new Error('Odoo Authentication Failed')
        }
        return this.uid
    }

    async execute(model: string, method: string, args: any[] = [], kwargs: any = {}) {
        const uid = await this.authenticate()
        return this.rpc(
            'object',
            'execute_kw',
            this.db,
            uid,
            this.apiKey,
            model,
            method,
            args,
            kwargs
        )
    }

    async searchRead(model: string, domain: any[] = [], fields: string[] = [], limit = 10) {
        return this.execute(model, 'search_read', [domain], { fields, limit })
    }
}

export async function getOdooClient(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const { data: integration } = await db
        .from('integrations')
        .select('*')
        .eq('type', 'odoo')
        .single()

    if (!integration || !integration.is_active || !integration.config) {
        throw new Error('Odoo integration not configured or inactive')
    }

    const config = integration.config // In real app, decrypt here if encrypted

    // Support both old and new field names
    return new OdooClient({
        url: config.odoo_url || config.url,
        db: config.odoo_db || config.db,
        username: config.odoo_user || config.username,
        api_key: config.odoo_password || config.api_key // decrypt(config.api_key)
    })
}
