/**
 * Skill: get_sales_by_customer
 *
 * Retrieves sales grouped by customer for a given period.
 * Replaces the LLM-generated query for "top customers", "sales by client", etc.
 *
 * @example
 * User: "¿Quiénes fueron mis mejores clientes este mes?"
 * User: "Top 5 clientes por ventas"
 * User: "Ventas agrupadas por cliente Q1 2025"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult, Period } from '../types';
import { PeriodSchema, DocumentStateSchema, success, authError } from '../types';
import {
  createOdooClient,
  dateRange,
  stateFilter,
  combineDomains,
  getDefaultPeriod,
  type OdooDomain,
} from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetSalesByCustomerInputSchema = z.object({
  /** Date period to query */
  period: PeriodSchema.optional(),
  /** Maximum number of customers to return */
  limit: z.number().min(1).max(100).default(10),
  /** Filter by order state */
  state: DocumentStateSchema.default('confirmed'),
  /** Minimum total amount to include (filters small customers) */
  minAmount: z.number().min(0).optional(),
});

export type GetSalesByCustomerInput = z.infer<typeof GetSalesByCustomerInputSchema>;

// ============================================
// OUTPUT TYPES
// ============================================

export interface CustomerSales {
  /** Odoo partner ID */
  customerId: number;
  /** Customer display name */
  customerName: string;
  /** Number of orders */
  orderCount: number;
  /** Total sales amount (with taxes) */
  totalAmount: number;
  /** Average order value */
  avgOrderValue: number;
}

export interface GetSalesByCustomerOutput {
  /** List of customers with their sales */
  customers: CustomerSales[];
  /** Sum of all customer totals */
  grandTotal: number;
  /** Sum of all order counts */
  totalOrders: number;
  /** Number of unique customers */
  customerCount: number;
  /** Query period */
  period: Period;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getSalesByCustomer: Skill<
  typeof GetSalesByCustomerInputSchema,
  GetSalesByCustomerOutput
> = {
  name: 'get_sales_by_customer',

  description: `Get sales grouped by customer for a period.
Use when user asks: "top customers", "best clients", "who bought most",
"sales by customer", "customer ranking", "mejores clientes", "ventas por cliente".
Returns customer list with order count and total amount, sorted by total descending.`,

  tool: 'odoo',

  inputSchema: GetSalesByCustomerInputSchema,

  tags: ['sales', 'customers', 'aggregation', 'reporting'],

  priority: 10,

  async execute(
    input: GetSalesByCustomerInput,
    context: SkillContext
  ): Promise<SkillResult<GetSalesByCustomerOutput>> {
    // 1. Validate credentials
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      // 2. Build deterministic domain
      const domain: OdooDomain = combineDomains(
        dateRange('date_order', period.start, period.end),
        stateFilter(input.state, 'sale.order')
      );

      // 3. Execute aggregation query
      const grouped = await odoo.readGroup(
        'sale.order',
        domain,
        ['partner_id', 'amount_total:sum'],
        ['partner_id'],
        {
          limit: input.limit * 2, // Fetch extra to filter by minAmount
          orderBy: 'amount_total desc',
        }
      );

      // 4. Transform results
      let customers: CustomerSales[] = grouped
        .filter((g) => g.partner_id) // Filter null partners
        .map((g) => ({
          customerId: g.partner_id[0],
          customerName: g.partner_id[1],
          orderCount: g.partner_id_count || g.__count || 1,
          totalAmount: g.amount_total || 0,
          avgOrderValue: 0, // Calculated below
        }));

      // 5. Filter by minimum amount if specified
      if (input.minAmount && input.minAmount > 0) {
        customers = customers.filter((c) => c.totalAmount >= input.minAmount!);
      }

      // 6. Apply final limit and calculate averages
      customers = customers.slice(0, input.limit).map((c) => ({
        ...c,
        avgOrderValue: c.orderCount > 0 ? c.totalAmount / c.orderCount : 0,
      }));

      // 7. Calculate totals
      const grandTotal = customers.reduce((sum, c) => sum + c.totalAmount, 0);
      const totalOrders = customers.reduce((sum, c) => sum + c.orderCount, 0);

      return success({
        customers,
        grandTotal,
        totalOrders,
        customerCount: customers.length,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
