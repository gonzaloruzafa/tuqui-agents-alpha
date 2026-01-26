/**
 * Skill: get_sales_by_product
 *
 * Get sales grouped by product for a given period.
 *
 * Use cases:
 * - "¿Qué productos se vendieron más este mes?"
 * - "Top 10 productos vendidos"
 * - "Ventas por producto en enero"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema, DocumentStateSchema } from '../types';
import { createOdooClient, dateRange, stateFilter, combineDomains, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetSalesByProductInputSchema = z.object({
  /** Time period for analysis */
  period: PeriodSchema.optional(),

  /** Maximum number of products to return (default: 10) */
  limit: z.number().int().min(1).max(100).default(10),

  /** Filter by order state */
  state: DocumentStateSchema.default('confirmed'),

  /** Category filter (optional) */
  categoryId: z.number().int().positive().optional(),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface ProductSales {
  productId: number;
  productName: string;
  productCode: string | null;
  quantitySold: number;
  totalAmount: number;
  orderCount: number;
  avgPrice: number;
}

export interface SalesByProductOutput {
  products: ProductSales[];
  grandTotal: number;
  totalQuantity: number;
  totalOrders: number;
  productCount: number;
  period: z.infer<typeof PeriodSchema>;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getSalesByProduct: Skill<
  typeof GetSalesByProductInputSchema,
  SalesByProductOutput
> = {
  name: 'get_sales_by_product',
  description: 'Get sales grouped by product. Use when user asks "top products", "best-selling products", "product sales", "what sold most".',
  tool: 'odoo',
  tags: ['sales', 'products', 'reporting'],
  inputSchema: GetSalesByProductInputSchema,

  async execute(input, context): Promise<SkillResult<SalesByProductOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      // Build domain
      const domain = combineDomains(
        dateRange('date_order', period.start, period.end),
        stateFilter(input.state, 'sale.order')
      );

      if (input.categoryId) {
        domain.push(['product_id.categ_id', '=', input.categoryId]);
      }

      // Get sales grouped by product (from order lines)
      const grouped = await odoo.readGroup(
        'sale.order.line',
        domain,
        ['product_id', 'product_uom_qty:sum', 'price_total:sum', 'order_id:count_distinct'],
        ['product_id'],
        {
          limit: input.limit * 2, // Fetch more to handle filtering
          orderBy: 'price_total desc',
        }
      );

      // Transform results
      const products: ProductSales[] = grouped
        .filter((g) => g.product_id && Array.isArray(g.product_id))
        .map((g) => {
          const [productId, productName] = g.product_id;
          const totalAmount = g.price_total || 0;
          const quantitySold = g.product_uom_qty || 0;
          const orderCount = (g as any).order_id_count || (g as any).order_id || 1;

          return {
            productId,
            productName,
            productCode: null, // Would need additional query to get code
            quantitySold,
            totalAmount,
            orderCount,
            avgPrice: quantitySold > 0 ? totalAmount / quantitySold : 0,
          };
        })
        .slice(0, input.limit);

      // Calculate totals
      const grandTotal = products.reduce((sum, p) => sum + p.totalAmount, 0);
      const totalQuantity = products.reduce((sum, p) => sum + p.quantitySold, 0);
      const totalOrders = products.reduce((sum, p) => sum + p.orderCount, 0);

      return success({
        products,
        grandTotal,
        totalQuantity,
        totalOrders,
        productCount: products.length,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
