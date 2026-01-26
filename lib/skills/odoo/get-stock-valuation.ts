/**
 * Skill: get_stock_valuation
 *
 * Get total stock valuation.
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient, type OdooDomain } from './_client';
import { errorToResult } from '../errors';

export const GetStockValuationInputSchema = z.object({
  categoryId: z.number().int().positive().optional(),
});

export interface StockValuationOutput {
  totalValue: number;
  productCount: number;
  totalQuantity: number;
}

export const getStockValuation: Skill<
  typeof GetStockValuationInputSchema,
  StockValuationOutput
> = {
  name: 'get_stock_valuation',
  description: 'Get total stock valuation. Use for "inventory value", "stock value", "asset value".',
  tool: 'odoo',
  tags: ['inventory', 'stock', 'valuation'],
  inputSchema: GetStockValuationInputSchema,

  async execute(input, context): Promise<SkillResult<StockValuationOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      const domain: OdooDomain = [['type', '=', 'product']];
      if (input.categoryId) {
        domain.push(['categ_id', '=', input.categoryId]);
      }

      const products = await odoo.searchRead<{
        qty_available: number;
        standard_price: number;
      }>(
        'product.product',
        domain,
        { fields: ['qty_available', 'standard_price'], limit: 10000 }
      );

      let totalValue = 0;
      let totalQuantity = 0;

      for (const p of products) {
        const value = p.qty_available * p.standard_price;
        totalValue += value;
        totalQuantity += p.qty_available;
      }

      return success({
        totalValue,
        productCount: products.length,
        totalQuantity,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
