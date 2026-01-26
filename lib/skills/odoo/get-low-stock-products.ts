/**
 * Skill: get_low_stock_products
 *
 * Get products with low stock levels.
 *
 * Use cases:
 * - "¿Qué productos tienen poco stock?"
 * - "Productos para reabastecer"
 * - "Stock bajo"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient, type OdooDomain } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetLowStockProductsInputSchema = z.object({
  /** Stock threshold (products below this qty) */
  threshold: z.number().min(0).default(10),

  /** Maximum number of products to return */
  limit: z.number().int().min(1).max(100).default(20),

  /** Only stockable products */
  stockableOnly: z.boolean().default(true),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface LowStockProduct {
  productId: number;
  productName: string;
  productCode: string | null;
  qtyAvailable: number;
  virtualAvailable: number;
  reorderingRule: boolean;
}

export interface LowStockProductsOutput {
  products: LowStockProduct[];
  total: number;
  threshold: number;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getLowStockProducts: Skill<
  typeof GetLowStockProductsInputSchema,
  LowStockProductsOutput
> = {
  name: 'get_low_stock_products',
  description: 'Get products with low stock levels. Use for "poco stock", "stock bajo", "low stock", "products to reorder", "stock alerts", "inventory warnings", "qué productos hay que reponer". Returns products where qty_available <= reorder point.',
  tool: 'odoo',
  tags: ['inventory', 'stock', 'purchasing'],
  inputSchema: GetLowStockProductsInputSchema,

  async execute(input, context): Promise<SkillResult<LowStockProductsOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Build domain
      const domain: OdooDomain = [
        ['qty_available', '<', input.threshold],
      ];

      if (input.stockableOnly) {
        domain.push(['type', '=', 'product']);
      }

      // Search for low stock products
      const products = await odoo.searchRead<{
        id: number;
        name: string;
        default_code: string | false;
        qty_available: number;
        virtual_available: number;
      }>(
        'product.product',
        domain,
        {
          fields: [
            'name',
            'default_code',
            'qty_available',
            'virtual_available',
          ],
          limit: input.limit,
          order: 'qty_available asc',
        }
      );

      // Transform results
      const results: LowStockProduct[] = products.map((p) => ({
        productId: p.id,
        productName: p.name,
        productCode: p.default_code || null,
        qtyAvailable: p.qty_available,
        virtualAvailable: p.virtual_available,
        reorderingRule: false, // Would need additional query to check orderpoint rules
      }));

      return success({
        products: results,
        total: results.length,
        threshold: input.threshold,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
