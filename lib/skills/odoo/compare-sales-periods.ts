/**
 * Skill: compare_sales_periods
 *
 * Compares sales between two periods (e.g., today vs yesterday, this month vs last month).
 * Answers "¿Cómo vamos comparado con...?" type questions.
 *
 * @example
 * User: "Ventas hoy vs ayer"
 * User: "Comparar este mes con el mes pasado"
 * User: "¿Cómo vienen las ventas respecto al año pasado?"
 */

import { z } from 'zod'
import type { Skill, SkillContext, SkillResult, Period } from '../types'
import { PeriodSchema, DocumentStateSchema, success, authError } from '../types'
import { createOdooClient, dateRange, stateFilter, combineDomains, getDefaultPeriod, getPreviousMonthPeriod, type OdooDomain } from './_client'
import { errorToResult } from '../errors'

// ============================================
// INPUT SCHEMA
// ============================================

export const CompareSalesPeriodsInputSchema = z.object({
  /** Current period to analyze (defaults to this month) */
  currentPeriod: PeriodSchema.optional(),
  /** Previous period to compare against (defaults to last month) */
  previousPeriod: PeriodSchema.optional(),
  /** Filter by order state */
  state: DocumentStateSchema.default('confirmed'),
  /** Include breakdown by product */
  includeProducts: z.boolean().default(false),
  /** Include breakdown by customer */
  includeCustomers: z.boolean().default(false),
  /** Limit for breakdowns */
  limit: z.number().min(1).max(20).default(5),
})

export type CompareSalesPeriodsInput = z.infer<typeof CompareSalesPeriodsInputSchema>

// ============================================
// OUTPUT TYPES
// ============================================

export interface PeriodSummary {
  /** Total sales amount */
  totalSales: number
  /** Number of orders */
  orderCount: number
  /** Number of unique customers */
  customerCount: number
  /** Average order value */
  avgOrderValue: number
  /** Period description */
  periodLabel: string
}

export interface ComparisonItem {
  /** Item ID (product or customer) */
  id: number
  /** Item name */
  name: string
  /** Sales in current period */
  currentSales: number
  /** Sales in previous period */
  previousSales: number
  /** Absolute change */
  change: number
  /** Percentage change */
  changePercent: number | null
}

export interface CompareSalesPeriodsOutput {
  /** Current period summary */
  current: PeriodSummary
  /** Previous period summary */
  previous: PeriodSummary
  /** Absolute change in sales */
  salesChange: number
  /** Percentage change in sales */
  salesChangePercent: number | null
  /** Change in order count */
  orderCountChange: number
  /** Change in average order value */
  avgOrderValueChange: number
  /** Trend direction */
  trend: 'up' | 'down' | 'stable'
  /** Product comparison (if requested) */
  productComparison?: ComparisonItem[]
  /** Customer comparison (if requested) */
  customerComparison?: ComparisonItem[]
}

// ============================================
// HELPERS
// ============================================

function formatPeriodLabel(period: Period): string {
  if (period.label) {
    return period.label
  }
  return `${period.start} a ${period.end}`
}

function calculateChangePercent(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? 100 : null
  return Math.round(((current - previous) / previous) * 100 * 10) / 10
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const compareSalesPeriods: Skill<
  typeof CompareSalesPeriodsInputSchema,
  CompareSalesPeriodsOutput
> = {
  name: 'compare_sales_periods',

  description: `Compare sales between two periods.
Use for: "compare sales", "today vs yesterday", "this month vs last month",
"comparar ventas", "hoy vs ayer", "cómo vamos respecto a", "evolución de ventas",
"esta semana vs la pasada", "¿subieron las ventas?", "¿bajaron las ventas?",
"cómo venimos", "qué tal ventas". Defaults to this month vs last month if no period specified.
Returns totals, changes, and percentage variations.`,

  tool: 'odoo',

  inputSchema: CompareSalesPeriodsInputSchema,

  tags: ['sales', 'comparison', 'trends', 'reporting', 'analytics'],

  priority: 12, // Good priority for comparison queries

  async execute(
    input: CompareSalesPeriodsInput,
    context: SkillContext
  ): Promise<SkillResult<CompareSalesPeriodsOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo')
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo)
      
      // Use defaults if periods not provided
      const currentPeriod = input.currentPeriod || getDefaultPeriod()
      const previousPeriod = input.previousPeriod || getPreviousMonthPeriod()

      // Helper to get period summary
      async function getPeriodSummary(period: Period): Promise<PeriodSummary> {
        const dateDomain = dateRange('date_order', period.start, period.end)
        const stateDomain = stateFilter(input.state, 'sale.order')
        const domain: OdooDomain = combineDomains(dateDomain, stateDomain)

        // Get totals
        const totals = await odoo.readGroup('sale.order', domain, ['amount_total', 'partner_id'], [], {
          limit: 1,
        })

        const totalSales = totals[0]?.amount_total || 0

        // Get order count and unique customers
        const orders = await odoo.searchRead('sale.order', domain, {
          fields: ['id', 'partner_id'],
          limit: 10000,
        })

        const orderCount = orders.length
        const uniqueCustomers = new Set(
          orders.map((o: any) => (Array.isArray(o.partner_id) ? o.partner_id[0] : o.partner_id))
        )

        return {
          totalSales,
          orderCount,
          customerCount: uniqueCustomers.size,
          avgOrderValue: orderCount > 0 ? Math.round(totalSales / orderCount) : 0,
          periodLabel: formatPeriodLabel(period),
        }
      }

      // Get both period summaries in parallel
      const [current, previous] = await Promise.all([
        getPeriodSummary(currentPeriod),
        getPeriodSummary(previousPeriod),
      ])

      // Calculate changes
      const salesChange = current.totalSales - previous.totalSales
      const salesChangePercent = calculateChangePercent(current.totalSales, previous.totalSales)
      const orderCountChange = current.orderCount - previous.orderCount
      const avgOrderValueChange = current.avgOrderValue - previous.avgOrderValue

      // Determine trend
      let trend: 'up' | 'down' | 'stable' = 'stable'
      if (salesChangePercent !== null) {
        if (salesChangePercent > 5) trend = 'up'
        else if (salesChangePercent < -5) trend = 'down'
      }

      // Product comparison if requested
      let productComparison: ComparisonItem[] | undefined
      if (input.includeProducts) {
        const currentDateDomain = dateRange('order_id.date_order', currentPeriod.start, currentPeriod.end)
        const previousDateDomain = dateRange('order_id.date_order', previousPeriod.start, previousPeriod.end)
        const stateDomain = stateFilter(input.state, 'sale.order')
        const stateOnOrder = stateDomain.map((f) => ['order_id.' + f[0], f[1], f[2]] as [string, string, any])

        const [currentProducts, previousProducts] = await Promise.all([
          odoo.readGroup(
            'sale.order.line',
            combineDomains(currentDateDomain, stateOnOrder),
            ['product_id', 'price_subtotal'],
            ['product_id'],
            { orderBy: 'price_subtotal desc', limit: input.limit }
          ),
          odoo.readGroup(
            'sale.order.line',
            combineDomains(previousDateDomain, stateOnOrder),
            ['product_id', 'price_subtotal'],
            ['product_id'],
            { orderBy: 'price_subtotal desc', limit: input.limit }
          ),
        ])

        // Build comparison map
        const previousMap = new Map<number, number>()
        previousProducts.forEach((p: any) => {
          const id = Array.isArray(p.product_id) ? p.product_id[0] : p.product_id
          previousMap.set(id, p.price_subtotal || 0)
        })

        productComparison = currentProducts.map((p: any) => {
          const id = Array.isArray(p.product_id) ? p.product_id[0] : p.product_id
          const name = Array.isArray(p.product_id) ? p.product_id[1] : 'Producto'
          const currentSales = p.price_subtotal || 0
          const previousSales = previousMap.get(id) || 0
          const change = currentSales - previousSales

          return {
            id,
            name,
            currentSales,
            previousSales,
            change,
            changePercent: calculateChangePercent(currentSales, previousSales),
          }
        })
      }

      // Customer comparison if requested
      let customerComparison: ComparisonItem[] | undefined
      if (input.includeCustomers) {
        const currentDateDomain = dateRange('date_order', currentPeriod.start, currentPeriod.end)
        const previousDateDomain = dateRange('date_order', previousPeriod.start, previousPeriod.end)
        const stateDomain = stateFilter(input.state, 'sale.order')

        const [currentCustomers, previousCustomers] = await Promise.all([
          odoo.readGroup(
            'sale.order',
            combineDomains(currentDateDomain, stateDomain),
            ['partner_id', 'amount_total'],
            ['partner_id'],
            { orderBy: 'amount_total desc', limit: input.limit }
          ),
          odoo.readGroup(
            'sale.order',
            combineDomains(previousDateDomain, stateDomain),
            ['partner_id', 'amount_total'],
            ['partner_id'],
            { orderBy: 'amount_total desc', limit: input.limit }
          ),
        ])

        // Build comparison map
        const previousMap = new Map<number, number>()
        previousCustomers.forEach((c: any) => {
          const id = Array.isArray(c.partner_id) ? c.partner_id[0] : c.partner_id
          previousMap.set(id, c.amount_total || 0)
        })

        customerComparison = currentCustomers.map((c: any) => {
          const id = Array.isArray(c.partner_id) ? c.partner_id[0] : c.partner_id
          const name = Array.isArray(c.partner_id) ? c.partner_id[1] : 'Cliente'
          const currentSales = c.amount_total || 0
          const previousSales = previousMap.get(id) || 0
          const change = currentSales - previousSales

          return {
            id,
            name,
            currentSales,
            previousSales,
            change,
            changePercent: calculateChangePercent(currentSales, previousSales),
          }
        })
      }

      return success({
        current,
        previous,
        salesChange,
        salesChangePercent,
        orderCountChange,
        avgOrderValueChange,
        trend,
        productComparison,
        customerComparison,
      })
    } catch (error) {
      return errorToResult(error)
    }
  },
}
