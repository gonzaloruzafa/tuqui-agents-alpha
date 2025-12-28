/**
 * Odoo Query Builder - Intelligent query construction and execution
 * Supports multiple sub-queries, aggregations, and caching
 */

import { OdooClient } from './client'

// ============================================
// TYPES
// ============================================

export interface OdooSubQuery {
    id: string                      // Unique ID for reference
    model: string                   // Odoo model name
    operation: 'search' | 'count' | 'aggregate' | 'fields' | 'discover'
    domain?: any[]                  // Direct domain (takes precedence)
    filters?: string                // Natural language filters (parsed to domain)
    fields?: string[]               // Fields to retrieve
    groupBy?: string[]              // For aggregations
    limit?: number                  // Max records (default 50)
    orderBy?: string                // Sort order
    compare?: 'mom' | 'yoy'         // Month-over-month or year-over-year comparison
}

export interface QueryResult {
    queryId: string
    success: boolean
    data?: any[]
    count?: number
    total?: number
    grouped?: Record<string, { count: number; total: number }>
    comparison?: {
        current: any
        previous: any
        variation: { value: number; percent: number; trend: string }
    }
    error?: string
    cached?: boolean
    executionMs?: number
}

export interface ChartData {
    type: 'bar' | 'pie' | 'line' | 'table'
    title: string
    labels: string[]
    datasets: Array<{
        label: string
        data: number[]
        backgroundColor?: string[]
    }>
}

// ============================================
// CACHE (Memory with 5min TTL)
// ============================================

interface CacheEntry {
    data: any
    timestamp: number
}

const queryCache = new Map<string, CacheEntry>()
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes

function getCacheKey(tenantId: string, query: OdooSubQuery): string {
    return `${tenantId}:${query.model}:${query.operation}:${JSON.stringify(query.domain || query.filters)}:${query.groupBy?.join(',') || ''}:${query.limit || 50}`
}

function getFromCache(key: string): any | null {
    const entry = queryCache.get(key)
    if (!entry) return null
    
    if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
        queryCache.delete(key)
        return null
    }
    
    return entry.data
}

function setCache(key: string, data: any): void {
    // Limit cache size to prevent memory issues
    if (queryCache.size > 100) {
        const oldestKey = queryCache.keys().next().value
        if (oldestKey) queryCache.delete(oldestKey)
    }
    queryCache.set(key, { data, timestamp: Date.now() })
}

export function clearCache(): void {
    queryCache.clear()
}

// ============================================
// MODEL CONFIGURATIONS
// ============================================

export const MODEL_CONFIG: Record<string, {
    dateField: string
    amountField?: string
    stateField?: string
    defaultFields: string[]
    states?: Record<string, string>
}> = {
    'sale.order': {
        dateField: 'date_order',
        amountField: 'amount_total',
        stateField: 'state',
        defaultFields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'user_id'],
        states: {
            'confirmad': 'sale', 'confirm': 'sale', 'venta': 'sale',
            'borrador': 'draft', 'draft': 'draft',
            'cancelad': 'cancel', 'cancel': 'cancel',
            'hecho': 'done', 'done': 'done'
        }
    },
    'account.move': {
        dateField: 'invoice_date',
        amountField: 'amount_residual',
        stateField: 'state',
        defaultFields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'amount_residual', 'state', 'payment_state', 'move_type'],
        states: {
            'publicad': 'posted', 'posted': 'posted', 'confirmad': 'posted',
            'borrador': 'draft', 'draft': 'draft',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'res.partner': {
        dateField: 'create_date',
        defaultFields: ['name', 'email', 'phone', 'city', 'country_id', 'customer_rank', 'supplier_rank'],
    },
    'product.template': {
        dateField: 'create_date',
        amountField: 'list_price',
        defaultFields: ['name', 'list_price', 'default_code', 'qty_available', 'categ_id', 'active'],
    },
    'purchase.order': {
        dateField: 'date_order',
        amountField: 'amount_total',
        stateField: 'state',
        defaultFields: ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
        states: {
            'confirmad': 'purchase', 'borrador': 'draft', 'cancelad': 'cancel'
        }
    },
    'crm.lead': {
        dateField: 'create_date',
        amountField: 'expected_revenue',
        stateField: 'stage_id',
        defaultFields: ['name', 'partner_id', 'user_id', 'stage_id', 'expected_revenue', 'probability', 'create_date', 'date_deadline'],
    },
    'res.users': {
        dateField: 'login_date',
        defaultFields: ['name', 'login', 'login_date', 'active', 'partner_id'],
    },
    'mail.activity': {
        dateField: 'date_deadline',
        defaultFields: ['summary', 'activity_type_id', 'user_id', 'date_deadline', 'state', 'res_model', 'res_id'],
    },
    'sale.order.line': {
        dateField: 'create_date',
        amountField: 'price_subtotal',
        stateField: 'state',
        defaultFields: ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'order_id', 'state'],
        states: {
            'confirmad': 'sale', 'venta': 'sale', 'sale': 'sale',
            'hecho': 'done', 'done': 'done',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'account.payment': {
        dateField: 'date',
        amountField: 'amount',
        stateField: 'state',
        defaultFields: ['name', 'partner_id', 'date', 'amount', 'payment_type', 'state', 'journal_id'],
        states: {
            'publicad': 'posted', 'posted': 'posted', 'confirmad': 'posted',
            'borrador': 'draft', 'draft': 'draft',
            'cancelad': 'cancelled', 'cancel': 'cancelled'
        }
    },
    'stock.picking': {
        dateField: 'scheduled_date',
        stateField: 'state',
        defaultFields: ['name', 'partner_id', 'scheduled_date', 'date_done', 'state', 'picking_type_id', 'origin'],
        states: {
            'asignad': 'assigned', 'assigned': 'assigned', 'disponible': 'assigned',
            'hecho': 'done', 'done': 'done', 'entregad': 'done',
            'esperando': 'waiting', 'waiting': 'waiting',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
}

// ============================================
// DOMAIN BUILDER
// ============================================

/**
 * Parse natural language filters into Odoo domain
 */
export function buildDomain(filters: string, model: string): any[] {
    const domain: any[] = []
    const config = MODEL_CONFIG[model] || { dateField: 'create_date', defaultFields: [] }
    const dateField = config.dateField
    
    // ---- DATE PATTERNS ----
    const now = new Date()
    const currentYear = now.getFullYear()
    const currentMonth = now.getMonth() + 1
    
    // Specific months
    const monthPatterns = [
        { regex: /enero|january/i, month: 1 },
        { regex: /febrero|february/i, month: 2 },
        { regex: /marzo|march/i, month: 3 },
        { regex: /abril|april/i, month: 4 },
        { regex: /mayo|may(?!or)/i, month: 5 }, // "may" but not "mayor"
        { regex: /junio|june/i, month: 6 },
        { regex: /julio|july/i, month: 7 },
        { regex: /agosto|august/i, month: 8 },
        { regex: /septiembre|september/i, month: 9 },
        { regex: /octubre|october/i, month: 10 },
        { regex: /noviembre|november/i, month: 11 },
        { regex: /diciembre|december/i, month: 12 },
    ]
    
    let dateMatched = false
    
    for (const { regex, month } of monthPatterns) {
        if (regex.test(filters)) {
            const year = month > currentMonth ? currentYear - 1 : currentYear
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`
            const endDay = new Date(year, month, 0).getDate()
            const endDate = `${year}-${String(month).padStart(2, '0')}-${endDay}`
            domain.push([dateField, '>=', startDate])
            domain.push([dateField, '<=', endDate])
            dateMatched = true
            break
        }
    }
    
    // "Este mes" / "this month"
    if (!dateMatched && /este mes|this month|mes actual/i.test(filters)) {
        const month = String(currentMonth).padStart(2, '0')
        const startDate = `${currentYear}-${month}-01`
        const endDay = new Date(currentYear, currentMonth, 0).getDate()
        const endDate = `${currentYear}-${month}-${endDay}`
        domain.push([dateField, '>=', startDate])
        domain.push([dateField, '<=', endDate])
        dateMatched = true
    }
    
    // "Mes pasado" / "last month"
    if (!dateMatched && /mes pasado|mes anterior|last month/i.test(filters)) {
        const lastMonth = currentMonth === 1 ? 12 : currentMonth - 1
        const year = currentMonth === 1 ? currentYear - 1 : currentYear
        const month = String(lastMonth).padStart(2, '0')
        const startDate = `${year}-${month}-01`
        const endDay = new Date(year, lastMonth, 0).getDate()
        const endDate = `${year}-${month}-${endDay}`
        domain.push([dateField, '>=', startDate])
        domain.push([dateField, '<=', endDate])
        dateMatched = true
    }
    
    // "Últimos X días" / "last X days"
    const lastDaysMatch = filters.match(/(?:ultimos?|últimos?|last)\s*(\d+)\s*(?:dias?|days)/i)
    if (!dateMatched && lastDaysMatch) {
        const days = parseInt(lastDaysMatch[1])
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)
        domain.push([dateField, '>=', startDate.toISOString().split('T')[0]])
        dateMatched = true
    }
    
    // "Este año" / "this year"
    if (!dateMatched && /este año|this year|año actual/i.test(filters)) {
        domain.push([dateField, '>=', `${currentYear}-01-01`])
        domain.push([dateField, '<=', `${currentYear}-12-31`])
        dateMatched = true
    }
    
    // ---- STATE FILTERS ----
    const stateMap = config.states || {}
    for (const [keyword, stateValue] of Object.entries(stateMap)) {
        if (new RegExp(keyword, 'i').test(filters)) {
            domain.push([config.stateField || 'state', '=', stateValue])
            break
        }
    }
    
    // For account.move, add payment_state filters
    if (model === 'account.move') {
        if (/pagad[oa]s?|paid/i.test(filters)) {
            domain.push(['payment_state', '=', 'paid'])
        } else if (/por cobrar|pendiente|not paid|impag/i.test(filters)) {
            domain.push(['payment_state', '=', 'not_paid'])
        }
        
        // Default to posted invoices
        if (!domain.some(d => d[0] === 'state')) {
            domain.push(['state', '=', 'posted'])
        }
        
        // Invoice type
        if (/factura.*cliente|customer.*invoice|out_invoice|por cobrar|receivable|venta/i.test(filters)) {
            domain.push(['move_type', '=', 'out_invoice'])
        } else if (/factura.*proveedor|vendor.*invoice|in_invoice|por pagar|payable|compra/i.test(filters)) {
            domain.push(['move_type', '=', 'in_invoice'])
        } else if (/nota.*credito|credit.*note|refund/i.test(filters)) {
            domain.push(['move_type', 'in', ['out_refund', 'in_refund']])
        }
    }
    
    // ---- PARTNER FILTERS ----
    if (/cliente|customer/i.test(filters) && model === 'res.partner') {
        domain.push(['customer_rank', '>', 0])
    }
    if (/proveedor|vendor|supplier/i.test(filters) && model === 'res.partner') {
        domain.push(['supplier_rank', '>', 0])
    }
    
    // ---- USER ACTIVITY FILTERS ----
    if (model === 'res.users') {
        if (/inactiv|sin conectar|no conecta|mucho.*que.*no/i.test(filters)) {
            const thirtyDaysAgo = new Date()
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
            domain.push(['login_date', '<', thirtyDaysAgo.toISOString().split('T')[0]])
            domain.push(['active', '=', true])
        }
        if (/activ[oa]s?(?!.*inactiv)/i.test(filters)) {
            domain.push(['active', '=', true])
        }
    }
    
    // ---- CRM FILTERS ----
    if (model === 'crm.lead') {
        if (/oportunidad|opportunity/i.test(filters)) {
            domain.push(['type', '=', 'opportunity'])
        } else if (/lead/i.test(filters)) {
            domain.push(['type', '=', 'lead'])
        }
        if (/ganad[oa]s?|won/i.test(filters)) {
            domain.push(['probability', '=', 100])
        } else if (/perdid[oa]s?|lost/i.test(filters)) {
            domain.push(['probability', '=', 0])
            domain.push(['active', '=', false])
        }
    }
    
    // ---- PAYMENT FILTERS ----
    if (model === 'account.payment') {
        // Payment type: inbound (cobros) vs outbound (pagos)
        if (/inbound|cobro|cobr[oa]mos?|recibid[oa]|recibimos|cobranz/i.test(filters)) {
            domain.push(['payment_type', '=', 'inbound'])
        } else if (/outbound|pago|pag[oa]mos?|realiz[oa]d[oa]/i.test(filters)) {
            domain.push(['payment_type', '=', 'outbound'])
        }
        
        // Default to paid payments (not 'posted' - account.payment uses 'paid' state)
        if (!domain.some(d => d[0] === 'state')) {
            domain.push(['state', '=', 'paid'])
        }
    }
    
    // ---- SALE ORDER LINE FILTERS ----
    if (model === 'sale.order.line') {
        // Default to confirmed orders
        if (!domain.some(d => d[0] === 'state')) {
            domain.push(['state', 'in', ['sale', 'done']])
        }
    }
    
    // ---- TODAY FILTER ----
    if (/hoy|today/i.test(filters)) {
        const today = new Date().toISOString().split('T')[0]
        domain.push([dateField, '>=', today])
        domain.push([dateField, '<=', today])
    }
    
    return domain
}

// ============================================
// QUERY EXECUTOR
// ============================================

/**
 * Execute a single sub-query
 */
async function executeSingleQuery(
    client: OdooClient,
    tenantId: string,
    query: OdooSubQuery
): Promise<QueryResult> {
    const startTime = Date.now()
    const cacheKey = getCacheKey(tenantId, query)
    
    // Check cache
    const cached = getFromCache(cacheKey)
    if (cached) {
        return {
            queryId: query.id,
            success: true,
            ...cached,
            cached: true,
            executionMs: Date.now() - startTime
        }
    }
    
    try {
        const config = MODEL_CONFIG[query.model] || { dateField: 'create_date', defaultFields: [] }
        const domain = query.domain || (query.filters ? buildDomain(query.filters, query.model) : [])
        const fields = query.fields || config.defaultFields
        const limit = Math.min(query.limit || 50, 500) // Max 500 records
        
        let result: Partial<QueryResult> = {}
        
        switch (query.operation) {
            case 'search':
                const searchData = await client.searchRead(query.model, domain, fields, limit, query.orderBy)
                result = { data: searchData, count: searchData.length }
                break
                
            case 'count':
                const count = await client.searchCount(query.model, domain)
                result = { count }
                break
                
            case 'aggregate':
                if (query.groupBy && query.groupBy.length > 0) {
                    // For aggregations, check if model has an amount field
                    const amountField = config.amountField
                    const hasAmountField = !!amountField
                    
                    // Build aggregate fields - only add :sum if we have an amount field
                    const aggregateFields = hasAmountField 
                        ? [...query.groupBy, `${amountField}:sum`]
                        : [...query.groupBy]
                    
                    // Use readGroup for server-side aggregation
                    const groupData = await client.readGroup(
                        query.model,
                        domain,
                        aggregateFields,
                        query.groupBy,
                        { 
                            limit, 
                            orderBy: hasAmountField ? `${amountField} desc` : `${query.groupBy[0]}_count desc`
                        }
                    )
                    
                    // Transform to grouped format
                    const grouped: Record<string, { count: number; total: number }> = {}
                    
                    for (const g of groupData) {
                        const groupKey: string = query.groupBy![0]
                        const keyValue: any = g[groupKey]
                        const name: string = Array.isArray(keyValue) ? keyValue[1] : (keyValue || 'Sin asignar')
                        const count = g[`${groupKey}_count`] || g['__count'] || 1
                        grouped[name] = {
                            count,
                            total: hasAmountField ? (g[amountField] || 0) : count
                        }
                    }
                    
                    // Sort by total (or count if no amount) descending
                    const sortedGrouped: Record<string, { count: number; total: number }> = {}
                    Object.entries(grouped)
                        .sort((a, b) => b[1].total - a[1].total)
                        .forEach(([key, value]) => {
                            sortedGrouped[key] = value
                        })
                    
                    result = { 
                        grouped: sortedGrouped, 
                        count: groupData.length,
                        total: Object.values(grouped).reduce((sum, g) => sum + g.total, 0)
                    }
                } else {
                    // Simple aggregation without grouping
                    const aggData = await client.searchRead(query.model, domain, [config.amountField || 'id'], limit)
                    const total = aggData.reduce((sum: number, r: any) => sum + (r[config.amountField!] || 0), 0)
                    result = { count: aggData.length, total }
                }
                break
                
            case 'fields':
                const fieldsData = await client.fieldsGet(query.model)
                result = { data: [fieldsData] }
                break
                
            case 'discover':
                // Discover fields for a model - useful when agent doesn't know the schema
                const discovered = await client.discoverFields(query.model)
                result = { 
                    data: [{
                        model: query.model,
                        dateFields: discovered.dateFields,
                        amountFields: discovered.amountFields,
                        relationFields: discovered.relationFields.slice(0, 10), // Limit to top 10
                        stateField: discovered.stateField,
                        sampleFields: discovered.allFields.slice(0, 20) // Sample of first 20 fields
                    }]
                }
                break
        }
        
        // Cache the result
        setCache(cacheKey, result)
        
        return {
            queryId: query.id,
            success: true,
            ...result,
            cached: false,
            executionMs: Date.now() - startTime
        }
        
    } catch (error: any) {
        return {
            queryId: query.id,
            success: false,
            error: error.message,
            executionMs: Date.now() - startTime
        }
    }
}

/**
 * Execute multiple sub-queries in parallel (max 5)
 */
export async function executeQueries(
    client: OdooClient,
    tenantId: string,
    queries: OdooSubQuery[]
): Promise<QueryResult[]> {
    // Limit to 5 queries
    const limitedQueries = queries.slice(0, 5)
    
    // Execute in parallel
    const results = await Promise.all(
        limitedQueries.map(q => executeSingleQuery(client, tenantId, q))
    )
    
    return results
}

// ============================================
// CHART DATA GENERATOR
// ============================================

/**
 * Generate chart data from query results
 */
export function generateChartData(
    result: QueryResult,
    chartType: 'bar' | 'pie' | 'line' | 'table' = 'bar',
    title: string = 'Datos'
): ChartData | null {
    if (!result.success) return null
    
    // For grouped data
    if (result.grouped) {
        const entries = Object.entries(result.grouped).slice(0, 10) // Top 10
        return {
            type: chartType,
            title,
            labels: entries.map(([name]) => name),
            datasets: [{
                label: 'Total',
                data: entries.map(([, { total }]) => total),
                backgroundColor: [
                    '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
                    '#EC4899', '#06B6D4', '#84CC16', '#F97316', '#6366F1'
                ]
            }]
        }
    }
    
    // For regular data with date field
    if (result.data && result.data.length > 0) {
        const sample = result.data[0]
        const hasDate = sample.date_order || sample.invoice_date || sample.create_date
        
        if (hasDate && chartType === 'line') {
            // Time series chart
            const dateField = sample.date_order ? 'date_order' : 
                             sample.invoice_date ? 'invoice_date' : 'create_date'
            const amountField = sample.amount_total !== undefined ? 'amount_total' : 
                               sample.amount_residual !== undefined ? 'amount_residual' : null
            
            if (amountField) {
                const sorted = [...result.data].sort((a, b) => 
                    new Date(a[dateField]).getTime() - new Date(b[dateField]).getTime()
                )
                return {
                    type: 'line',
                    title,
                    labels: sorted.map(r => r[dateField]?.split('T')[0] || ''),
                    datasets: [{
                        label: 'Monto',
                        data: sorted.map(r => r[amountField] || 0)
                    }]
                }
            }
        }
    }
    
    return null
}
