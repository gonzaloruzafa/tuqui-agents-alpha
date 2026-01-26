/**
 * Skill: get_product_sales_history
 *
 * Get sales history for a specific product.
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, combineDomains } from './_client';
import { errorToResult } from '../errors';

export const GetProductSalesHistoryInputSchema = z.object({
  productId: z.number().int().positive(),
  period: PeriodSchema,
  groupBy: z.enum(['none', 'month', 'customer']).default('none'),
});

export interface ProductSalesHistoryOutput {
  productId: number;
  totalQuantity: number;
  totalRevenue: number;
  orderCount: number;
  period: z.infer<typeof PeriodSchema>;
  groups?: Record<string, { quantity: number; revenue: number }>;
}

export const getProductSalesHistory: Skill<
  typeof GetProductSalesHistoryInputSchema,
  ProductSalesHistoryOutput
> = {
  name: 'get_product_sales_history',
  description: 'Get sales history for a specific product. Use for "product sales history", "how much did we sell of X".',
  tool: 'odoo',
  tags: ['sales', 'products', 'history'],
  inputSchema: GetProductSalesHistoryInputSchema,

  async execute(input, context): Promise<SkillResult<ProductSalesHistoryOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      const domain = combineDomains(
        dateRange('date_order', input.period.start, input.period.end),
        [
          ['product_id', '=', input.productId],
          ['state', 'in', ['sale', 'done']],
        ]
      );

      if (input.groupBy === 'none') {
        const lines = await odoo.searchRead<{
          product_uom_qty: number;
          price_total: number;
        }>(
          'sale.order.line',
          domain,
          { fields: ['product_uom_qty', 'price_total'] }
        );

        const totalQuantity = lines.reduce((sum, l) => sum + l.product_uom_qty, 0);
        const totalRevenue = lines.reduce((sum, l) => sum + l.price_total, 0);

        return success({
          productId: input.productId,
          totalQuantity,
          totalRevenue,
          orderCount: lines.length,
          period: input.period,
        });
      }

      // Grouped version
      const groupField = input.groupBy === 'month' ? 'date_order:month' : 'partner_id';
      const grouped = await odoo.readGroup(
        'sale.order.line',
        domain,
        [groupField, 'product_uom_qty:sum', 'price_total:sum'],
        [groupField],
        {}
      );

      const groups: Record<string, { quantity: number; revenue: number }> = {};
      let totalQuantity = 0;
      let totalRevenue = 0;

      for (const g of grouped) {
        const key = input.groupBy === 'month'
          ? g.date_order
          : (g.partner_id && Array.isArray(g.partner_id) ? g.partner_id[1] : 'Unknown');

        groups[key] = {
          quantity: g.product_uom_qty || 0,
          revenue: g.price_total || 0,
        };
        totalQuantity += g.product_uom_qty || 0;
        totalRevenue += g.price_total || 0;
      }

      return success({
        productId: input.productId,
        totalQuantity,
        totalRevenue,
        orderCount: grouped.length,
        period: input.period,
        groups,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
