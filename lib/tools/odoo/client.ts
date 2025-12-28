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

    async searchRead(model: string, domain: any[] = [], fields: string[] = [], limit = 10, order?: string) {
        return this.execute(model, 'search_read', [domain], { fields, limit, order })
    }

    /**
     * Aggregation query with GROUP BY - executes server-side for performance
     * @param model - Odoo model name
     * @param domain - Filter domain
     * @param fields - Fields to aggregate, e.g. ['amount_total:sum', 'id:count']
     * @param groupBy - Fields to group by, e.g. ['partner_id', 'date_order:month']
     * @param options - Additional options (limit, orderBy, lazy)
     */
    async readGroup(
        model: string,
        domain: any[] = [],
        fields: string[] = [],
        groupBy: string[] = [],
        options: { limit?: number; orderBy?: string; lazy?: boolean } = {}
    ): Promise<any[]> {
        return this.execute(model, 'read_group', [domain], {
            fields,
            groupby: groupBy,
            limit: options.limit || 80,
            orderby: options.orderBy,
            lazy: options.lazy ?? true
        })
    }

    /**
     * Count records matching domain - faster than searchRead for counts
     */
    async searchCount(model: string, domain: any[] = []): Promise<number> {
        return this.execute(model, 'search_count', [domain])
    }

    /**
     * Get field definitions for a model - useful for dynamic queries
     */
    async fieldsGet(model: string, attributes: string[] = ['string', 'type', 'relation']): Promise<Record<string, any>> {
        return this.execute(model, 'fields_get', [], { attributes })
    }

    /**
     * Discover all available models in Odoo
     * Returns list of models with name and description
     */
    async discoverModels(): Promise<Array<{ model: string; name: string }>> {
        const models = await this.execute('ir.model', 'search_read', [[]], {
            fields: ['model', 'name'],
            order: 'model',
            limit: 500
        })
        return models.map((m: any) => ({ model: m.model, name: m.name }))
    }

    /**
     * Discover useful fields for a model
     * Returns simplified field info with inferred types
     */
    async discoverFields(model: string): Promise<{
        dateFields: string[]
        amountFields: string[]
        relationFields: Array<{ name: string; relation: string }>
        stateField?: string
        allFields: string[]
    }> {
        const fields = await this.fieldsGet(model, ['string', 'type', 'relation', 'store'])
        
        const dateFields: string[] = []
        const amountFields: string[] = []
        const relationFields: Array<{ name: string; relation: string }> = []
        const allFields: string[] = []
        let stateField: string | undefined
        
        for (const [name, meta] of Object.entries(fields) as [string, any][]) {
            // Skip internal fields
            if (name.startsWith('__') || name === 'id') continue
            if (!meta.store) continue // Only stored fields
            
            allFields.push(name)
            
            // Detect date fields
            if (['date', 'datetime'].includes(meta.type)) {
                dateFields.push(name)
            }
            
            // Detect amount/money fields by type + name heuristic
            if (['float', 'monetary'].includes(meta.type)) {
                if (/amount|total|price|cost|residual|balance|credit|debit/i.test(name)) {
                    amountFields.push(name)
                }
            }
            
            // Detect relations
            if (['many2one', 'one2many', 'many2many'].includes(meta.type) && meta.relation) {
                relationFields.push({ name, relation: meta.relation })
            }
            
            // Detect state field
            if (name === 'state' && meta.type === 'selection') {
                stateField = 'state'
            }
        }
        
        return { dateFields, amountFields, relationFields, stateField, allFields }
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
