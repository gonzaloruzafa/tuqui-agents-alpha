/**
 * Skill: get_top_products
 *
 * Get top-selling products by revenue or quantity.
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, combineDomains, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

export const GetTopProductsInputSchema = z.object({
  period: PeriodSchema.optional(),
  limit: z.number().int().min(1).max(50).default(10),
  orderBy: z.enum(['revenue', 'quantity']).default('revenue'),
});

export interface TopProduct {
  productId: number;
  productName: string;
  quantitySold: number;
  revenue: number;
}

export interface TopProductsOutput {
  products: TopProduct[];
  totalRevenue: number;
  totalQuantity: number;
  period: z.infer<typeof PeriodSchema>;
}

export const getTopProducts: Skill<
  typeof GetTopProductsInputSchema,
  TopProductsOutput
> = {
  name: 'get_top_products',
  description: 'Get top-selling products by revenue or quantity. Use for "productos más vendidos", "best sellers", "top products", "what sells most", "qué vendemos más". Defaults to top 10 by revenue.',
  tool: 'odoo',
  tags: ['sales', 'products', 'reporting'],
  inputSchema: GetTopProductsInputSchema,

  async execute(input, context): Promise<SkillResult<TopProductsOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      const domain = combineDomains(
        dateRange('date_order', period.start, period.end),
        [['state', 'in', ['sale', 'done']]]
      );

      const orderByField = input.orderBy === 'revenue' ? 'price_total' : 'product_uom_qty';

      const grouped = await odoo.readGroup(
        'sale.order.line',
        domain,
        ['product_id', 'product_uom_qty:sum', 'price_total:sum'],
        ['product_id'],
        { limit: input.limit, orderBy: `${orderByField} desc` }
      );

      const products: TopProduct[] = grouped
        .filter((g) => g.product_id && Array.isArray(g.product_id))
        .map((g) => ({
          productId: (g.product_id as [number, string])[0],
          productName: (g.product_id as [number, string])[1],
          quantitySold: g.product_uom_qty || 0,
          revenue: g.price_total || 0,
        }));

      return success({
        products,
        totalRevenue: products.reduce((sum, p) => sum + p.revenue, 0),
        totalQuantity: products.reduce((sum, p) => sum + p.quantitySold, 0),
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
