/**
 * Skill: get_accounts_receivable
 *
 * Retrieves accounts receivable (what customers owe us).
 * Answers "¿Cuánto nos deben los clientes?" type questions.
 *
 * @example
 * User: "¿Cuánto nos deben los clientes?"
 * User: "Cuentas por cobrar"
 * User: "Deuda total de clientes"
 */

import { z } from 'zod'
import type { Skill, SkillContext, SkillResult, Period } from '../types'
import { PeriodSchema, success, authError } from '../types'
import { createOdooClient, dateRange, combineDomains, type OdooDomain } from './_client'
import { errorToResult } from '../errors'

// ============================================
// INPUT SCHEMA
// ============================================

export const GetAccountsReceivableInputSchema = z.object({
  /** Only include invoices due within this period (optional) */
  duePeriod: PeriodSchema.optional(),
  /** Include only overdue invoices */
  overdueOnly: z.boolean().default(false),
  /** Group by customer */
  groupByCustomer: z.boolean().default(false),
  /** Maximum results when grouped */
  limit: z.number().min(1).max(100).default(20),
})

export type GetAccountsReceivableInput = z.infer<typeof GetAccountsReceivableInputSchema>

// ============================================
// OUTPUT TYPES
// ============================================

export interface CustomerReceivable {
  /** Customer ID */
  customerId: number
  /** Customer name */
  customerName: string
  /** Amount owed */
  amountOwed: number
  /** Number of unpaid invoices */
  invoiceCount: number
}

export interface GetAccountsReceivableOutput {
  /** Total amount receivable */
  totalReceivable: number
  /** Total overdue amount */
  totalOverdue: number
  /** Number of unpaid invoices */
  invoiceCount: number
  /** Number of customers with debt */
  customerCount: number
  /** Breakdown by customer (if requested) */
  byCustomer?: CustomerReceivable[]
  /** Currency */
  currency: string
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getAccountsReceivable: Skill<
  typeof GetAccountsReceivableInputSchema,
  GetAccountsReceivableOutput
> = {
  name: 'get_accounts_receivable',

  description: `Get accounts receivable (customer debts).
Use when user asks: "accounts receivable", "what do customers owe",
"cuánto nos deben", "cuentas por cobrar", "deuda de clientes", "a cobrar".
Can filter by due date and group by customer.`,

  tool: 'odoo',

  inputSchema: GetAccountsReceivableInputSchema,

  tags: ['accounting', 'receivable', 'customers', 'debt', 'collections'],

  priority: 15, // High priority for common financial questions

  async execute(
    input: GetAccountsReceivableInput,
    context: SkillContext
  ): Promise<SkillResult<GetAccountsReceivableOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo')
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo)

      // Base domain: posted invoices with remaining amount
      let domain: OdooDomain = [
        ['state', '=', 'posted'],
        ['move_type', '=', 'out_invoice'], // Customer invoices only
        ['amount_residual', '>', 0], // Has remaining balance
      ]

      // Filter by due date if period specified
      if (input.duePeriod) {
        const dueDateFilters = dateRange('invoice_date_due', input.duePeriod.start, input.duePeriod.end)
        domain = [...domain, ...dueDateFilters]
      }

      // Filter overdue only
      const today = new Date().toISOString().split('T')[0]
      if (input.overdueOnly) {
        domain = [...domain, ['invoice_date_due', '<', today]]
      }

      // Get total receivable
      const totalResult = await odoo.readGroup(
        'account.move',
        domain,
        ['amount_residual', 'partner_id'],
        [],
        { limit: 1 }
      )

      const totalReceivable = totalResult[0]?.amount_residual || 0

      // Get overdue total (base domain + overdue filter)
      const overdueDomain: OdooDomain = [
        ['state', '=', 'posted'],
        ['move_type', '=', 'out_invoice'],
        ['amount_residual', '>', 0],
        ['invoice_date_due', '<', today],
      ]

      const overdueResult = await odoo.readGroup('account.move', overdueDomain, ['amount_residual'], [], {
        limit: 1,
      })

      const totalOverdue = overdueResult[0]?.amount_residual || 0

      // Count invoices and customers
      const invoices = await odoo.searchRead('account.move', domain, {
        fields: ['id', 'partner_id'],
        limit: 10000,
      })

      const invoiceCount = invoices.length
      const uniqueCustomers = new Set(
        invoices.map((inv: any) => (Array.isArray(inv.partner_id) ? inv.partner_id[0] : inv.partner_id))
      )
      const customerCount = uniqueCustomers.size

      // Group by customer if requested
      let byCustomer: CustomerReceivable[] | undefined
      if (input.groupByCustomer) {
        const groupedResult = await odoo.readGroup(
          'account.move',
          domain,
          ['partner_id', 'amount_residual'],
          ['partner_id'],
          { orderBy: 'amount_residual desc', limit: input.limit }
        )

        byCustomer = groupedResult.map((g: any) => ({
          customerId: Array.isArray(g.partner_id) ? g.partner_id[0] : g.partner_id,
          customerName: Array.isArray(g.partner_id) ? g.partner_id[1] : 'Desconocido',
          amountOwed: g.amount_residual || 0,
          invoiceCount: g.partner_id_count || 1,
        }))
      }

      return success({
        totalReceivable,
        totalOverdue,
        invoiceCount,
        customerCount,
        byCustomer,
        currency: 'ARS',
      })
    } catch (error) {
      return errorToResult(error)
    }
  },
}
