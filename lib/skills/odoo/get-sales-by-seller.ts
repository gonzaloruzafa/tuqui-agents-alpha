/**
 * Skill: get_sales_by_seller
 *
 * Get sales grouped by salesperson.
 *
 * Use cases:
 * - "¿Quién vendió más este mes?"
 * - "Ventas por vendedor"
 * - "Comisiones del mes"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema, DocumentStateSchema } from '../types';
import { createOdooClient, dateRange, stateFilter, combineDomains } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetSalesBySellerInputSchema = z.object({
  /** Time period for analysis */
  period: PeriodSchema,

  /** Maximum number of sellers to return */
  limit: z.number().int().min(1).max(100).default(10),

  /** Filter by order state */
  state: DocumentStateSchema.default('confirmed'),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface SellerSales {
  sellerId: number;
  sellerName: string;
  orderCount: number;
  totalAmount: number;
  avgOrderValue: number;
}

export interface SalesBySellerOutput {
  sellers: SellerSales[];
  grandTotal: number;
  totalOrders: number;
  sellerCount: number;
  period: z.infer<typeof PeriodSchema>;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getSalesBySeller: Skill<
  typeof GetSalesBySellerInputSchema,
  SalesBySellerOutput
> = {
  name: 'get_sales_by_seller',
  description: 'Get sales grouped by salesperson. Use when user asks "top sellers", "who sold most", "sales by salesperson", "commissions".',
  tool: 'odoo',
  tags: ['sales', 'sellers', 'commissions', 'reporting'],
  inputSchema: GetSalesBySellerInputSchema,

  async execute(input, context): Promise<SkillResult<SalesBySellerOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Build domain
      const domain = combineDomains(
        dateRange('date_order', input.period.start, input.period.end),
        stateFilter(input.state, 'sale.order')
      );

      // Group by user (salesperson)
      const grouped = await odoo.readGroup(
        'sale.order',
        domain,
        ['user_id', 'amount_total:sum'],
        ['user_id'],
        {
          limit: input.limit,
          orderBy: 'amount_total desc',
        }
      );

      // Transform results
      const sellers: SellerSales[] = grouped
        .filter((g) => g.user_id && Array.isArray(g.user_id))
        .map((g) => {
          const [sellerId, sellerName] = g.user_id as [number, string];
          const totalAmount = g.amount_total || 0;
          const orderCount = g.user_id_count || 1;

          return {
            sellerId,
            sellerName,
            orderCount,
            totalAmount,
            avgOrderValue: totalAmount / orderCount,
          };
        });

      // Calculate totals
      const grandTotal = sellers.reduce((sum, s) => sum + s.totalAmount, 0);
      const totalOrders = sellers.reduce((sum, s) => sum + s.orderCount, 0);

      return success({
        sellers,
        grandTotal,
        totalOrders,
        sellerCount: sellers.length,
        period: input.period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
