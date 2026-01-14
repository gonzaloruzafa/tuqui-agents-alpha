/**
 * Odoo Query Builder - Intelligent query construction and execution
 * Supports multiple sub-queries, aggregations, and caching
 */

import { OdooClient } from './client'
import { suggestFieldCorrection } from './semantic-layer'
import { DateService } from '@/lib/date/service'

// ============================================
// TYPES
// ============================================

export interface OdooSubQuery {
    id: string                      // Unique ID for reference
    model: string                   // Odoo model name
    operation: 'search' | 'count' | 'aggregate' | 'fields' | 'discover' | 'inspect' | 'distinct'
    domain?: any[]                  // Direct domain (takes precedence)
    dateRange?: { start: string; end: string; label?: string } // Explicit date range from tool args
    filters?: string                // Natural language filters (parsed to domain)
    fields?: string[]               // Fields to retrieve
    groupBy?: string[]              // For aggregations (also used for 'distinct' to specify which field)
    limit?: number                  // Max records (default 50)
    orderBy?: string                // Sort order
    compare?: 'mom' | 'yoy'
    _retried?: boolean         // Month-over-month or year-over-year comparison
}

export interface QueryResult {
    queryId: string
    success: boolean
    data?: any[]
    count?: number
    total?: number
    grouped?: Record<string, { count: number; total: number }>
    shownGroups?: number  // For groupBy with limit: how many groups we're showing vs count (total)
    comparison?: {
        current: any
        previous: any
        variation: { value: number; percent: number; trend: string }
    }
    error?: string
    cached?: boolean
    executionMs?: number
    // State Discovery Guard - warns when query lacks state filter on stateful models
    stateWarning?: {
        message: string
        field: string
        distribution: Record<string, number>  // e.g., { draft: 500, sale: 80, cancel: 20 }
        totalRecords: number
        suggestion: string
    }
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
    const datePart = query.dateRange ? `${query.dateRange.start}-${query.dateRange.end}` : ''
    return `${tenantId}:${query.model}:${query.operation}:${JSON.stringify(query.domain || query.filters)}:${datePart}:${query.groupBy?.join(',') || ''}:${query.limit || 50}`
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
// STATE DISCOVERY GUARD
// Detects queries without state filter and auto-discovers state distribution
// ============================================

// Helper: Get models that have autoFilterStates (derived from MODEL_CONFIG)
function getStatefulModels(): string[] {
    // Esta función se llama después de que MODEL_CONFIG está definido
    return Object.entries(MODEL_CONFIG)
        .filter(([_, config]) => config.autoFilterStates && config.autoFilterStates.length > 0)
        .map(([model]) => model)
}

function hasStateFilter(domain: any[], stateField: string = 'state'): boolean {
    if (!Array.isArray(domain)) return false
    return domain.some(d => Array.isArray(d) && d[0] === stateField)
}

async function getStateDistribution(
    client: OdooClient,
    model: string,
    domain: any[],
    stateField: string = 'state'
): Promise<{ distribution: Record<string, number>; totalRecords: number }> {
    try {
        const stateData = await client.readGroup(
            model,
            domain,
            [stateField],
            [stateField],
            { limit: 20 }
        )
        
        const distribution: Record<string, number> = {}
        let totalRecords = 0
        
        for (const item of stateData) {
            const stateValue = item[stateField] || 'unknown'
            const count = item[`${stateField}_count`] || item['__count'] || 0
            distribution[stateValue] = count
            totalRecords += count
        }
        
        return { distribution, totalRecords }
    } catch (error) {
        console.warn('[StateGuard] Failed to get state distribution:', error)
        return { distribution: {}, totalRecords: 0 }
    }
}

function buildStateWarning(
    model: string,
    stateField: string,
    distribution: Record<string, number>,
    totalRecords: number
): QueryResult['stateWarning'] {
    const states = Object.keys(distribution)
    const stateList = Object.entries(distribution)
        .map(([state, count]) => `${state}: ${count}`)
        .join(', ')
    
    // Generate context-aware suggestion
    let suggestion = ''
    if (model.includes('sale.order')) {
        suggestion = `Para ventas CONFIRMADAS usá filters: "state: sale". Para cotizaciones/borradores usá "state: draft". Distribución actual: ${stateList}`
    } else if (model.includes('account.move')) {
        suggestion = `Para facturas PUBLICADAS usá filters: "state: posted". Para borradores "state: draft". Distribución actual: ${stateList}`
    } else if (model.includes('purchase.order')) {
        suggestion = `Para compras CONFIRMADAS usá filters: "state: purchase". Distribución actual: ${stateList}`
    } else {
        suggestion = `Especificá el estado deseado. Distribución actual: ${stateList}`
    }
    
    return {
        message: `⚠️ ATENCIÓN: Esta consulta incluye TODOS los estados (${states.join(', ')}). El total puede incluir borradores, cancelados, etc.`,
        field: stateField,
        distribution,
        totalRecords,
        suggestion
    }
}

// ============================================
// MODEL CONFIGURATIONS
// ============================================

export const MODEL_CONFIG: Record<string, {
    dateField: string
    amountField?: string
    stateField?: string
    autoFilterStates?: string[]  // Estados a filtrar automáticamente (declarativo)
    defaultFields: string[]
    states?: Record<string, string>
}> = {
    'sale.order': {
        dateField: 'date_order',
        amountField: 'amount_total',
        stateField: 'state',
        autoFilterStates: ['sale', 'sent', 'done'],  // Ventas confirmadas + enviadas
        defaultFields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'user_id', 'company_id'],
        states: {
            // presupuesto/cotización = draft
            'presupuest': 'draft', 'cotiza': 'draft', 'borrador': 'draft', 'draft': 'draft',
            // ventas confirmadas = sale
            'confirmad': 'sale', 'confirm': 'sale',
            // canceladas
            'cancelad': 'cancel', 'cancel': 'cancel',
            'hecho': 'done', 'done': 'done'
        }
    },
    'account.move': {
        dateField: 'invoice_date',
        amountField: 'amount_residual',
        stateField: 'state',
        autoFilterStates: ['posted'],  // Solo facturas publicadas
        defaultFields: ['name', 'partner_id', 'invoice_date', 'amount_total', 'amount_residual', 'state', 'payment_state', 'move_type', 'company_id'],
        states: {
            'publicad': 'posted', 'posted': 'posted', 'confirmad': 'posted',
            'borrador': 'draft', 'draft': 'draft',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'res.partner': {
        dateField: 'create_date',
        defaultFields: ['name', 'email', 'phone', 'city', 'country_id', 'customer_rank', 'supplier_rank', 'company_id'],
    },
    'product.template': {
        dateField: 'create_date',
        amountField: 'list_price',
        defaultFields: ['name', 'list_price', 'default_code', 'qty_available', 'categ_id', 'active', 'company_id'],
    },
    'purchase.order': {
        dateField: 'date_order',
        amountField: 'amount_total',
        stateField: 'state',
        autoFilterStates: ['purchase', 'done'],  // Compras confirmadas
        defaultFields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'company_id'],
        states: {
            'confirmad': 'purchase', 'borrador': 'draft', 'cancelad': 'cancel'
        }
    },
    'crm.lead': {
        dateField: 'create_date',
        amountField: 'expected_revenue',
        stateField: 'stage_id',
        defaultFields: ['name', 'partner_id', 'user_id', 'stage_id', 'expected_revenue', 'probability', 'create_date', 'date_deadline', 'company_id'],
    },
    'res.users': {
        dateField: 'login_date',
        defaultFields: ['name', 'login', 'login_date', 'active', 'partner_id', 'company_id', 'company_ids'],
    },
    'mail.activity': {
        dateField: 'date_deadline',
        defaultFields: ['summary', 'activity_type_id', 'user_id', 'date_deadline', 'state', 'res_model', 'res_id', 'company_id'],
    },
    'sale.order.line': {
        dateField: 'create_date',
        amountField: 'price_subtotal',
        stateField: 'state',
        autoFilterStates: ['sale', 'sent', 'done'],  // Líneas de ventas confirmadas
        defaultFields: ['product_id', 'product_uom_qty', 'price_unit', 'price_subtotal', 'order_id', 'state', 'company_id'],
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
        autoFilterStates: ['posted'],  // Solo pagos publicados
        defaultFields: ['name', 'partner_id', 'date', 'amount', 'payment_type', 'state', 'journal_id', 'company_id'],
        states: {
            'publicad': 'posted', 'posted': 'posted', 'confirmad': 'posted',
            'borrador': 'draft', 'draft': 'draft',
            'cancelad': 'cancelled', 'cancel': 'cancelled'
        }
    },
    'stock.picking': {
        dateField: 'scheduled_date',
        stateField: 'state',
        defaultFields: ['name', 'partner_id', 'scheduled_date', 'date_done', 'state', 'picking_type_id', 'origin', 'company_id'],
        states: {
            'asignad': 'assigned', 'assigned': 'assigned', 'disponible': 'assigned',
            'hecho': 'done', 'done': 'done', 'entregad': 'done',
            'esperando': 'waiting', 'waiting': 'waiting',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'purchase.order.line': {
        dateField: 'create_date',
        amountField: 'price_subtotal',
        stateField: 'state',
        autoFilterStates: ['purchase', 'done'],  // Líneas de compras confirmadas
        defaultFields: ['product_id', 'product_qty', 'price_unit', 'price_subtotal', 'order_id', 'state', 'company_id'],
        states: {
            'confirmad': 'purchase', 'compra': 'purchase', 'purchase': 'purchase',
            'hecho': 'done', 'done': 'done',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    // ============================================
    // REPORT MODELS - Used for accurate aggregations
    // These are the models Odoo's pivot tables use
    // ============================================
    'sale.report': {
        dateField: 'date',
        amountField: 'price_total',
        stateField: 'state',
        autoFilterStates: ['sale', 'done'],  // Solo ventas confirmadas (no sent en report)
        defaultFields: ['partner_id', 'product_id', 'user_id', 'date', 'price_total', 'product_uom_qty', 'state', 'company_id'],
        states: {
            'confirmad': 'sale', 'venta': 'sale', 'sale': 'sale',
            'hecho': 'done', 'done': 'done',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'purchase.report': {
        dateField: 'date_order',
        amountField: 'price_total',
        stateField: 'state',
        autoFilterStates: ['purchase', 'done'],  // Solo compras confirmadas
        defaultFields: ['partner_id', 'product_id', 'date_order', 'price_total', 'qty_ordered', 'state', 'company_id'],
        states: {
            'confirmad': 'purchase', 'compra': 'purchase', 'purchase': 'purchase',
            'hecho': 'done', 'done': 'done',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'account.invoice.report': {
        dateField: 'invoice_date',
        amountField: 'price_subtotal',
        stateField: 'state',
        autoFilterStates: ['posted'],  // Solo facturas publicadas
        defaultFields: ['partner_id', 'product_id', 'invoice_date', 'move_type', 'price_subtotal', 'state', 'payment_state', 'company_id'],
        states: {
            'publicad': 'posted', 'posted': 'posted', 'confirmad': 'posted',
            'borrador': 'draft', 'draft': 'draft',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'stock.quant': {
        dateField: 'in_date',
        amountField: 'quantity',
        defaultFields: ['product_id', 'location_id', 'quantity', 'available_quantity', 'in_date', 'company_id'],
    },
    // ============================================
    // ADDITIONAL MODELS - Stock, HR, Projects
    // ============================================
    'stock.move': {
        dateField: 'date',
        amountField: 'product_qty',
        stateField: 'state',
        defaultFields: ['product_id', 'product_qty', 'location_id', 'location_dest_id', 'date', 'state', 'origin', 'company_id'],
        states: {
            'borrador': 'draft', 'draft': 'draft',
            'esperando': 'waiting', 'waiting': 'waiting',
            'confirmad': 'confirmed', 'confirmed': 'confirmed',
            'asignad': 'assigned', 'assigned': 'assigned', 'disponible': 'assigned',
            'hecho': 'done', 'done': 'done',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'stock.move.line': {
        dateField: 'date',
        amountField: 'qty_done',
        stateField: 'state',
        defaultFields: ['product_id', 'qty_done', 'location_id', 'location_dest_id', 'lot_id', 'date', 'state', 'company_id'],
    },
    'account.move.line': {
        dateField: 'date',
        amountField: 'balance',
        defaultFields: ['account_id', 'partner_id', 'name', 'debit', 'credit', 'balance', 'date', 'move_id', 'company_id'],
    },
    'account.analytic.line': {
        dateField: 'date',
        amountField: 'amount',
        defaultFields: ['name', 'account_id', 'partner_id', 'amount', 'unit_amount', 'date', 'project_id', 'task_id', 'employee_id', 'company_id'],
    },
    // HR Models
    'hr.employee': {
        dateField: 'create_date',
        defaultFields: ['name', 'job_title', 'department_id', 'work_email', 'work_phone', 'company_id'],
    },
    'hr.leave': {
        dateField: 'date_from',
        stateField: 'state',
        defaultFields: ['employee_id', 'holiday_status_id', 'date_from', 'date_to', 'number_of_days', 'state', 'company_id'],
        states: {
            'borrador': 'draft', 'draft': 'draft',
            'confirmad': 'confirm', 'confirm': 'confirm',
            'aprobad': 'validate', 'validate': 'validate', 'validado': 'validate',
            'rechazad': 'refuse', 'refuse': 'refuse',
            'cancelad': 'cancel', 'cancel': 'cancel'
        }
    },
    'hr.leave.report': {
        dateField: 'date_from',
        stateField: 'state',
        defaultFields: ['employee_id', 'department_id', 'holiday_status_id', 'date_from', 'date_to', 'number_of_days', 'state', 'company_id'],
    },
    'hr.attendance': {
        dateField: 'check_in',
        defaultFields: ['employee_id', 'check_in', 'check_out', 'worked_hours', 'company_id'],
    },
    // Project Models
    'project.project': {
        dateField: 'date_start',
        defaultFields: ['name', 'user_id', 'partner_id', 'date_start', 'date', 'task_count', 'company_id'],
    },
    'project.task': {
        dateField: 'create_date',
        amountField: 'total_hours_spent',
        stateField: 'state',
        defaultFields: ['name', 'project_id', 'user_ids', 'stage_id', 'date_deadline', 'state', 'priority', 'total_hours_spent', 'company_id'],
        states: {
            'nuevo': '01_in_progress', 'en_progreso': '01_in_progress', 'in_progress': '01_in_progress',
            'hecho': '1_done', 'done': '1_done', 'completad': '1_done',
            'cancelad': '1_canceled', 'canceled': '1_canceled'
        }
    },
}

// ============================================
// DOMAIN BUILDER
// ============================================

/**
 * Parse natural language filters into Odoo domain
 * If dateRange is provided, it takes precedence over textual parsing.
 */
export function buildDomain(filters: string, model: string, dateRange?: { start: string; end: string; label?: string }): any[] {
    const domain: any[] = []
    const config = MODEL_CONFIG[model] || { dateField: 'create_date', defaultFields: [] }
    const dateField = config.dateField

    // ---- DATE PATTERNS ----
    const now = DateService.now()
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

    // Explicit date range from tool (preferred path)
    if (dateRange?.start && dateRange?.end) {
        domain.push([dateField, '>=', dateRange.start])
        domain.push([dateField, '<=', dateRange.end])
        dateMatched = true
    }

    // Try to detect year in filters (e.g., "2024", "del 2023")
    const yearMatch = filters.match(/\b(202[0-9])\b/)
    const specifiedYear = yearMatch ? parseInt(yearMatch[1]) : null

    // ---- WEEK OF MONTH FILTER ---- (only if no explicit dateRange matched)
    // "primera semana de diciembre", "second week of january", etc.
    const weekOfMonthMatch = !dateMatched && filters.match(
        /(?:primer[ao]?|first|1ra?|segund[ao]?|second|2da?|tercer[ao]?|third|3ra?|cuart[ao]?|fourth|4ta?|[uú]ltim[ao]?|last)\s*semana/i
    )
    
    if (weekOfMonthMatch) {
        // Determine which week (1-4 or last)
        let weekNum = 1
        const weekText = weekOfMonthMatch[0].toLowerCase()
        if (/segund|second|2/.test(weekText)) weekNum = 2
        else if (/tercer|third|3/.test(weekText)) weekNum = 3
        else if (/cuart|fourth|4/.test(weekText)) weekNum = 4
        else if (/[uú]ltim|last/.test(weekText)) weekNum = -1  // Last week
        
        // Find which month is mentioned
        let targetMonth: number | null = null
        for (const { regex, month } of monthPatterns) {
            if (regex.test(filters)) {
                targetMonth = month
                break
            }
        }
        
        if (targetMonth !== null) {
            const year = specifiedYear || (targetMonth > currentMonth ? currentYear - 1 : currentYear)
            
            let startDay: number, endDay: number
            if (weekNum === -1) {
                // Last week: last 7 days of the month
                const lastDayOfMonth = new Date(year, targetMonth, 0).getDate()
                startDay = lastDayOfMonth - 6
                endDay = lastDayOfMonth
            } else {
                // Week 1-4: days 1-7, 8-14, 15-21, 22-28
                startDay = (weekNum - 1) * 7 + 1
                endDay = Math.min(weekNum * 7, new Date(year, targetMonth, 0).getDate())
            }
            
            const monthStr = String(targetMonth).padStart(2, '0')
            const startDate = `${year}-${monthStr}-${String(startDay).padStart(2, '0')}`
            const endDate = `${year}-${monthStr}-${String(endDay).padStart(2, '0')}`
            
            domain.push([dateField, '>=', startDate])
            domain.push([dateField, '<=', endDate])
            dateMatched = true
        }
    }

    // ---- "DESDE [MES]" FILTER - Must be BEFORE month filter to catch "desde julio" before "julio" ----
    // "Desde [mes] del año pasado" / "since [month] last year"
    // Example: "desde julio del año pasado" -> from July last year to now
    // Fix: support "desde el 1 de julio" -> ignore "el 1 de" to just get month
    const desdeMesMatch = !dateMatched && filters.match(
        /desde\s+(?:el\s+\d+\s+de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i
    )
    if (desdeMesMatch) {
        const monthName = desdeMesMatch[1].toLowerCase()
        const monthMap: Record<string, number> = {
            enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
            julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12
        }
        const month = monthMap[monthName]
        if (month) {
            // If "año pasado" or "pasado" is mentioned, use last year
            // Otherwise, if the month is in the future, use last year
            const isLastYear = /año\s*pasado|del\s*pasado|\bpasado\b/i.test(filters)
            const year = isLastYear ? currentYear - 1 : 
                         (specifiedYear || (month > currentMonth ? currentYear - 1 : currentYear))
            const startDate = `${year}-${String(month).padStart(2, '0')}-01`
            const today = DateService.now().toISOString().split('T')[0]
            
            domain.push([dateField, '>=', startDate])
            domain.push([dateField, '<=', today])
            dateMatched = true
            console.log(`[QueryBuilder] Parsed "desde ${monthName}": ${startDate} to ${today}`)
        }
    }

    // ---- MONTH FILTER (only if week filter and "desde" didn't match and no explicit dateRange) ----
    if (!dateMatched) {
        for (const { regex, month } of monthPatterns) {
            if (regex.test(filters)) {
                const year = specifiedYear || (month > currentMonth ? currentYear - 1 : currentYear)
                const startDate = `${year}-${String(month).padStart(2, '0')}-01`
                const endDay = new Date(year, month, 0).getDate()
                const endDate = `${year}-${String(month).padStart(2, '0')}-${endDay}`
                domain.push([dateField, '>=', startDate])
                domain.push([dateField, '<=', endDate])
                dateMatched = true
                break
            }
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
        const startDate = DateService.now()
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

    // "Año pasado" / "last year" (solo el año completo, sin "desde")
    if (!dateMatched && /^(?!.*desde).*(año pasado|last year|año anterior)/i.test(filters)) {
        const lastYear = currentYear - 1
        domain.push([dateField, '>=', `${lastYear}-01-01`])
        domain.push([dateField, '<=', `${lastYear}-12-31`])
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

    // For account.move, add payment_state and move_type filters
    // NOTE: NO DEFAULT STATE - LLM should use 'distinct' to discover actual states first
    if (model === 'account.move') {
        if (/pagad[oa]s?|paid/i.test(filters)) {
            domain.push(['payment_state', '=', 'paid'])
        } else if (/por cobrar|pendiente|not paid|impag/i.test(filters)) {
            domain.push(['payment_state', '=', 'not_paid'])
        }

        // Invoice type (these are semantic, not state-related)
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
            const thirtyDaysAgo = DateService.now()
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
        // NOTE: No default state filter - LLM should use 'distinct' to discover states first
    }

    // NOTE: Default state filters REMOVED for sale.order, sale.order.line, purchase.order, stock.picking
    // The LLM should use operation: 'distinct' with groupBy: ['state'] to discover actual states
    // and then decide which states to include based on the user's question context

    // ---- STRUCTURED FILTERS (field: value or field = value) ----
    // Improved regex to handle quoted values or values with spaces
    // Supports: field: value, field: "value with spaces", field = value
    const structuredMatch = filters.match(/(\w+)\s*[:=]\s*(?:'([^']+)'|"([^"]+)"|([^ \n]+(?: [^ \n]+)*))/g)

    if (structuredMatch) {
        for (const match of structuredMatch) {
            const parts = match.split(/[:=]/)
            const field = parts[0].trim()
            let value = parts.slice(1).join(':').trim()

            // Remove quotes if present
            value = value.replace(/^['"]|['"]$/g, '')

            if (field && value) {
                // If value is a number, use '='
                if (!isNaN(Number(value)) && !value.includes('-')) {
                    domain.push([field, '=', Number(value)])
                } else if (value.toLowerCase() === 'false') {
                    domain.push([field, '=', false])
                } else if (value.toLowerCase() === 'true') {
                    domain.push([field, '=', true])
                } else {
                    // For strings, use 'ilike' (case-insensitive search in names/IDs)
                    domain.push([field, 'ilike', value])
                }
            }
        }
    }

    // ---- TODAY FILTER (moved here to allow combinations) ----
    if (/hoy|today/i.test(filters)) {
        const today = DateService.isoDate()
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
    
    // ============================================
    // AUTO-CORRECTION: Use correct model for groupBy
    // ============================================
    // When grouping by product_id on sale.order, we MUST use sale.order.line
    // because sale.order doesn't have product_id (products are in the lines)
    if (query.model === 'sale.order' && query.groupBy?.includes('product_id')) {
        console.log('[QueryBuilder] Auto-correcting: sale.order with product_id groupBy → sale.order.line')
        query.model = 'sale.order.line'
    }
    // Same for purchase.order → purchase.order.line
    if (query.model === 'purchase.order' && query.groupBy?.includes('product_id')) {
        console.log('[QueryBuilder] Auto-correcting: purchase.order with product_id groupBy → purchase.order.line')
        query.model = 'purchase.order.line'
    }
    
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
        // Fix: Sanitize model name to ensure config lookup works and use it for buildDomain
        const modelKey = query.model ? query.model.trim() : query.model
        query.model = modelKey // Update model in query object to ensure Odoo client receives clean string

        const config = MODEL_CONFIG[modelKey] || { dateField: 'create_date', defaultFields: [] }

        // Build domain: use explicit domain, or build from filters/dateRange
        // IMPORTANT: Apply dateRange even if filters is empty
        let domain = query.domain || []
        
        // Check if user explicitly mentioned state in filters (before building domain)
        const filtersHasState = query.filters && /state\s*[:=]/i.test(query.filters)
        
        // Fix: Treat empty array as no domain, so we can build it from filters
        if ((!query.domain || query.domain.length === 0) && (query.filters || query.dateRange)) {
            domain = buildDomain(query.filters || '', modelKey, query.dateRange)
        }
        
        // ============================================
        // AUTO-APPLY DEFAULT STATE FILTERS (DECLARATIVO)
        // Usa config.autoFilterStates si está definido
        // "Ventas" siempre significa confirmadas, salvo que pida "presupuestos"
        // ============================================
        const stateField = config.stateField || 'state'
        const hasExplicitStateFilter = hasStateFilter(domain, stateField) || filtersHasState
        
        // DEBUG: Log para verificar en producción
        console.error(`[QueryBuilder:DEBUG] Model=${query.model}, hasExplicitState=${hasExplicitStateFilter}, autoFilterStates=${JSON.stringify(config.autoFilterStates)}`)
        
        if (!hasExplicitStateFilter && config.autoFilterStates && config.autoFilterStates.length > 0) {
            // Usar la configuración declarativa del modelo
            if (config.autoFilterStates.length === 1) {
                domain.push([stateField, '=', config.autoFilterStates[0]])
            } else {
                domain.push([stateField, 'in', config.autoFilterStates])
            }
            console.error(`[QueryBuilder:DEBUG] APPLIED Auto-filter ${query.model}: ${stateField} IN [${config.autoFilterStates.join(', ')}]`)
        } else {
            console.error(`[QueryBuilder:DEBUG] SKIPPED Auto-filter for ${query.model}. Reason: hasExplicit=${hasExplicitStateFilter}, autoFilterStates=${!!config.autoFilterStates}`)
        }
        
        const fields = query.fields || config.defaultFields
        const limit = Math.min(query.limit || 50, 500) // Max 500 records
        
        // Debug logging
        console.log(`[QueryBuilder] Model: ${query.model}, Operation: ${query.operation}`)
        console.log(`[QueryBuilder] Filters: ${query.filters || 'none'}`)
        console.log(`[QueryBuilder] DateRange:`, query.dateRange || 'none')
        console.log(`[QueryBuilder] Domain:`, JSON.stringify(domain))

        let result: Partial<QueryResult> = {}

        switch (query.operation) {
            case 'search':
                const searchData = await client.searchRead(query.model, domain, fields, limit, query.orderBy)
                
                // ============================================
                // AUTO-UPGRADE: Si hay muchos registros y tenemos amountField,
                // calcular el total REAL server-side
                // ============================================
                const realCount = await client.searchCount(query.model, domain)
                const amountFieldSearch = config.amountField
                
                if (amountFieldSearch && realCount > searchData.length) {
                    // Hay más registros de los que devolvimos - calcular total real
                    console.log(`[QueryBuilder] AUTO-UPGRADE: ${realCount} registros totales, calculando suma server-side`)
                    try {
                        const totalResult = await client.readGroup(
                            query.model,
                            domain,
                            [amountFieldSearch],
                            [],  // No groupBy = sum all
                            { limit: 1 }
                        )
                        const realTotal = totalResult[0]?.[amountFieldSearch] || 0
                        result = { 
                            data: searchData, 
                            count: realCount,  // REAL count
                            total: realTotal   // REAL total
                        }
                        console.log(`[QueryBuilder] AUTO-UPGRADE: Total real = ${realTotal}`)
                    } catch (e) {
                        // Fallback si readGroup falla
                        result = { data: searchData, count: searchData.length }
                    }
                } else {
                    // Pocos registros o no hay amountField - calcular client-side
                    const clientTotal = amountFieldSearch 
                        ? searchData.reduce((sum: number, r: any) => sum + (r[amountFieldSearch] || 0), 0)
                        : undefined
                    result = { 
                        data: searchData, 
                        count: realCount,
                        total: clientTotal
                    }
                }
                break

            case 'count':
                const count = await client.searchCount(query.model, domain)
                result = { count }
                
                // State Discovery Guard for count (usa modelos con autoFilterStates)
                const statefulModels = getStatefulModels()
                if (statefulModels.includes(query.model) && config.stateField && !hasStateFilter(domain, config.stateField)) {
                    const { distribution, totalRecords } = await getStateDistribution(client, query.model, domain, config.stateField)
                    console.log(`[StateGuard] Distribution for ${query.model}:`, distribution, `Total: ${totalRecords}`)
                    
                    if (Object.keys(distribution).length > 0) {
                        result.stateWarning = buildStateWarning(query.model, config.stateField, distribution, totalRecords)
                    }
                }
                break

            case 'aggregate':
                if (query.groupBy && query.groupBy.length > 0) {
                    // For aggregations, check if model has an amount field
                    const amountField = config.amountField
                    const hasAmountField = !!amountField

                    // SANITIZE groupBy: Odoo only supports :quarter and :year for dates, NOT :day or :month
                    const sanitizedGroupBy = query.groupBy.map(gb => {
                        if (gb.includes(':day') || gb.includes(':month')) {
                            const baseField = gb.split(':')[0]
                            console.log(`[QueryBuilder] Removing unsupported date grouping "${gb}" - will aggregate without date grouping`)
                            return null // Remove unsupported date groupings
                        }
                        return gb
                    }).filter(Boolean) as string[]
                    
                    // If all groupBy fields were removed, fall through to simple aggregation
                    if (sanitizedGroupBy.length === 0) {
                        console.log(`[QueryBuilder] All groupBy fields were invalid, falling back to simple aggregation`)
                        const aggData = await client.searchRead(query.model, domain, [config.amountField || 'id'], limit)
                        const total = aggData.reduce((sum: number, r: any) => sum + (r[config.amountField!] || 0), 0)
                        result = { count: aggData.length, total }
                    } else {
                        // Build aggregate fields - only add :sum if we have an amount field
                        const aggregateFields = hasAmountField
                            ? [...sanitizedGroupBy, `${amountField}:sum`]
                            : [...sanitizedGroupBy]

                        console.log(`[QueryBuilder] Calling readGroup with groupBy: ${JSON.stringify(sanitizedGroupBy)}`)
                        
                        // Use readGroup for server-side aggregation
                        let groupData: any[] = []
                        let totalGroups = 0
                        let realTotal = 0
                        
                        try {
                            // STEP 1: Get the REAL total (all matching records, no grouping)
                            // This ensures the total is accurate regardless of limit
                            const allSum = await client.readGroup(
                                query.model,
                                domain,
                                hasAmountField ? [amountField] : [],
                                [],  // No groupBy = sum all
                                { limit: 1 }
                            )
                            realTotal = hasAmountField ? (allSum[0]?.[amountField] || 0) : 0
                            console.log(`[QueryBuilder] Real total (all records): ${realTotal}`)
                            
                            // STEP 2: Get total number of unique groups (no limit)
                            const countGroupsResult = await client.readGroup(
                                query.model,
                                domain,
                                [],  // No aggregate fields needed, just counting groups
                                sanitizedGroupBy,
                                { limit: 10000 }  // High limit to count all groups
                            )
                            totalGroups = countGroupsResult.length
                            console.log(`[QueryBuilder] Total unique groups: ${totalGroups}`)
                            
                            // STEP 3: Get TOP N groups ordered by amount (with limit)
                            groupData = await client.readGroup(
                                query.model,
                                domain,
                                aggregateFields,
                                sanitizedGroupBy,
                                {
                                    limit: limit || 50,
                                    orderBy: hasAmountField ? `${amountField} desc` : `${sanitizedGroupBy[0]}_count desc`
                                }
                            )
                            console.log(`[QueryBuilder] Top ${groupData.length} groups fetched`)
                        } catch (readGroupError: any) {
                            console.error(`[QueryBuilder] readGroup FAILED: ${readGroupError.message}`)
                            // Fallback: return empty result instead of crashing
                            result = { grouped: {}, count: 0, total: 0 }
                            break
                        }
                        console.log(`[QueryBuilder] readGroup returned ${groupData.length} groups of ${totalGroups} total`)

                        // Transform to grouped format
                        const grouped: Record<string, { count: number; total: number; id?: number }> = {}

                        for (const g of groupData) {
                            const groupKey: string = sanitizedGroupBy[0]
                            const keyValue: any = g[groupKey]
                            const name: string = Array.isArray(keyValue) ? keyValue[1] : (keyValue || 'Sin asignar')
                            const id: number | undefined = Array.isArray(keyValue) ? keyValue[0] : (typeof keyValue === 'number' ? keyValue : undefined)
                            const count = g[`${groupKey}_count`] || g['__count'] || 1
                            grouped[name] = {
                                count,
                                total: hasAmountField ? (g[amountField] || 0) : count,
                                id
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
                            count: totalGroups,  // REAL total of unique groups
                            total: realTotal,    // REAL total amount (all records)
                            shownGroups: groupData.length  // How many groups we're showing
                        }
                    }
                } else {
                    // Simple aggregation without grouping
                    // FIX: Don't use limit for aggregate - we need the REAL count and total
                    // Use searchCount for accurate count, and readGroup for server-side sum
                    const amountField = config.amountField || 'amount_total'
                    
                    // Get real count (no limit)
                    const realCount = await client.searchCount(query.model, domain)
                    
                    // Get total sum using readGroup (server-side aggregation, no limit issues)
                    let total = 0
                    if (realCount > 0) {
                        try {
                            const aggResult = await client.readGroup(
                                query.model,
                                domain,
                                [amountField],  // Field to aggregate
                                [],             // No groupBy = sum all
                                { limit: 1 }
                            )
                            total = aggResult[0]?.[amountField] || 0
                        } catch (e) {
                            // Fallback: if readGroup fails, do client-side sum (with warning)
                            console.log(`[QueryBuilder] readGroup failed for sum, using fallback`)
                            const aggData = await client.searchRead(query.model, domain, [amountField], Math.min(realCount, 1000))
                            total = aggData.reduce((sum: number, r: any) => sum + (r[amountField] || 0), 0)
                        }
                    }
                    
                    result = { count: realCount, total }
                }
                
                // State Discovery Guard for aggregate (usa modelos con autoFilterStates)
                const statefulModelsAgg = getStatefulModels()
                console.log(`[StateGuard] Checking model ${query.model}, stateField: ${config.stateField}, hasStateFilter: ${hasStateFilter(domain, config.stateField || 'state')}`)
                if (statefulModelsAgg.includes(query.model) && config.stateField && !hasStateFilter(domain, config.stateField)) {
                    const { distribution, totalRecords } = await getStateDistribution(client, query.model, domain, config.stateField)
                    console.log(`[StateGuard] Distribution for ${query.model}:`, distribution, `Total: ${totalRecords}`)
                    
                    // Show warning if multiple states OR if we got results (even with 1 state)
                    // This ensures the LLM knows what states are being included
                    if (Object.keys(distribution).length > 0) {
                        result.stateWarning = buildStateWarning(query.model, config.stateField, distribution, totalRecords)
                    }
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

            case 'inspect':
                // Inspect model fields with business-relevant info (no technical fields)
                const allFields = await client.fieldsGet(query.model, ['string', 'type', 'relation', 'store', 'required', 'selection'])
                const technicalFields = ['__last_update', 'create_uid', 'create_date', 'write_uid', 'write_date', 'display_name', 'id']
                const technicalRelations = ['ir.', 'mail.', 'bus.', 'base.']
                
                const businessFields: Record<string, any> = {}
                for (const [fieldName, meta] of Object.entries(allFields) as [string, any][]) {
                    // Skip technical fields
                    if (technicalFields.includes(fieldName)) continue
                    if (fieldName.startsWith('_')) continue
                    if (meta.relation && technicalRelations.some(r => meta.relation.startsWith(r))) continue
                    if (!meta.store) continue // Only stored fields
                    
                    businessFields[fieldName] = {
                        label: meta.string,
                        type: meta.type,
                        required: meta.required || false,
                        ...(meta.relation && { relation: meta.relation }),
                        ...(meta.selection && { values: meta.selection.map((s: any) => s[0]) })
                    }
                }
                
                result = {
                    data: [{
                        model: query.model,
                        fields: businessFields,
                        fieldCount: Object.keys(businessFields).length
                    }]
                }
                break

            case 'distinct':
                // Get distinct values for a field with counts - useful to discover real states/values
                if (!query.groupBy || query.groupBy.length === 0) {
                    result = { error: 'distinct operation requires groupBy with at least one field' }
                    break
                }
                
                const distinctField = query.groupBy[0]
                const distinctDomain = query.domain || []
                
                // Use read_group to get distinct values with counts
                const distinctData = await client.readGroup(
                    query.model,
                    distinctDomain,
                    [distinctField],
                    [distinctField],
                    { limit: 100 }
                )
                
                // Transform to {value: count} format
                const valueDistribution: Record<string, number> = {}
                for (const row of distinctData) {
                    const value = row[distinctField]
                    const displayValue = Array.isArray(value) ? value[1] : (value ?? 'null')
                    const count = row[`${distinctField}_count`] || row['__count'] || 1
                    valueDistribution[String(displayValue)] = count
                }
                
                result = {
                    data: [{
                        model: query.model,
                        field: distinctField,
                        values: valueDistribution,
                        totalRecords: Object.values(valueDistribution).reduce((a, b) => a + b, 0)
                    }]
                }
                break
        }

        console.log(`[QueryBuilder] After switch - result count: ${result.count}, total: ${result.total}`)

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
        const errorMsg = error.message || ''
        
        // Self-correction: Try to fix field name errors (only once)
        const fieldErrorMatch = errorMsg.match(/(?:Invalid field|does not exist|unknown field)[:\s]*['"]?(\w+)['"]?/i)
        
        if (fieldErrorMatch && !query._retried) {
            const badField = fieldErrorMatch[1]
            const suggestion = suggestFieldCorrection(query.model, badField)
            
            if (suggestion) {
                console.log(`[QueryBuilder] Self-correcting: "${badField}" → "${suggestion}" for ${query.model}`)
                
                const correctedQuery: OdooSubQuery = {
                    ...query,
                    _retried: true,
                    filters: query.filters?.replace(new RegExp(badField, 'gi'), suggestion),
                    fields: query.fields?.map(f => f === badField ? suggestion : f),
                    groupBy: query.groupBy?.map(f => f === badField ? suggestion : f),
                }
                
                return executeSingleQuery(client, tenantId, correctedQuery)
            }
        }
        
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
