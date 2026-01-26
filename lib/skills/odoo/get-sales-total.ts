/**
 * Skill: get_sales_total
 *
 * Retrieves total sales summary for a period.
 * Replaces the LLM-generated query for "total sales", "how much did we sell", etc.
 *
 * @example
 * User: "¿Cuánto vendimos este mes?"
 * User: "Total de ventas Q1 2025"
 * User: "Facturación del año"
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

export const GetSalesTotalInputSchema = z.object({
  /** Date period to query (defaults to current month if not provided) */
  period: PeriodSchema.optional(),
  /** Filter by order state */
  state: DocumentStateSchema.default('confirmed'),
  /** Include tax breakdown */
  includeTaxes: z.boolean().default(false),
});

export type GetSalesTotalInput = z.infer<typeof GetSalesTotalInputSchema>;

// ============================================
// OUTPUT TYPES
// ============================================

export interface TaxBreakdown {
  /** Tax name */
  name: string;
  /** Tax amount */
  amount: number;
}

export interface GetSalesTotalOutput {
  /** Total amount with taxes */
  totalWithTax: number;
  /** Total amount without taxes */
  totalWithoutTax: number;
  /** Tax amount (total - untaxed) */
  taxAmount: number;
  /** Number of orders */
  orderCount: number;
  /** Number of unique customers */
  customerCount: number;
  /** Average order value */
  avgOrderValue: number;
  /** Query period */
  period: Period;
  /** Tax breakdown if requested */
  taxBreakdown?: TaxBreakdown[];
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getSalesTotal: Skill<
  typeof GetSalesTotalInputSchema,
  GetSalesTotalOutput
> = {
  name: 'get_sales_total',

  description: `Get total sales summary for a period.
Use when user asks: "total sales", "how much did we sell", "revenue",
"total ventas", "cuánto vendimos", "facturación total".
Returns total with/without taxes, order count, and average order value.`,

  tool: 'odoo',

  inputSchema: GetSalesTotalInputSchema,

  tags: ['sales', 'totals', 'aggregation', 'reporting'],

  priority: 15, // Higher priority than by-customer for simple totals

  async execute(
    input: GetSalesTotalInput,
    context: SkillContext
  ): Promise<SkillResult<GetSalesTotalOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Use default period (current month) if not provided
      const period = input.period || getDefaultPeriod();

      // Build domain
      const domain: OdooDomain = combineDomains(
        dateRange('date_order', period.start, period.end),
        stateFilter(input.state, 'sale.order')
      );

      // Execute aggregation - get totals and distinct partners
      const [totals, partnerCount] = await Promise.all([
        odoo.readGroup(
          'sale.order',
          domain,
          ['amount_total:sum', 'amount_untaxed:sum'],
          [],
          { limit: 1 }
        ),
        odoo.readGroup(
          'sale.order',
          domain,
          ['partner_id'],
          ['partner_id'],
          { limit: 1000 }
        ),
      ]);

      const totalWithTax = totals[0]?.amount_total || 0;
      const totalWithoutTax = totals[0]?.amount_untaxed || 0;
      const orderCount = totals[0]?.__count || 0;
      const customerCount = partnerCount.filter((p) => p.partner_id).length;

      return success({
        totalWithTax,
        totalWithoutTax,
        taxAmount: totalWithTax - totalWithoutTax,
        orderCount,
        customerCount,
        avgOrderValue: orderCount > 0 ? totalWithTax / orderCount : 0,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
