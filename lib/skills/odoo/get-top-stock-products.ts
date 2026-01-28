/**
 * Skill: get_top_stock_products
 *
 * Get products with the highest stock quantity.
 */

import { z } from 'zod';
import type { Skill, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient } from './_client';
import { errorToResult } from '../errors';

export const GetTopStockProductsInputSchema = z.object({
  limit: z.number().int().min(1).max(50).default(10),
  warehouseId: z.number().int().optional().describe('Filtrar por depósito específico'),
  stockableOnly: z.boolean().default(true).describe('Solo productos almacenables'),
});

export interface TopStockProduct {
  productId: number;
  productName: string;
  internalRef: string | null;
  qtyOnHand: number;
  qtyAvailable: number;
  uom: string;
  category: string | null;
}

export interface TopStockProductsOutput {
  products: TopStockProduct[];
  totalProducts: number;
}

export const getTopStockProducts: Skill<
  typeof GetTopStockProductsInputSchema,
  TopStockProductsOutput
> = {
  name: 'get_top_stock_products',
  description: `Productos con más stock - lista ordenada por cantidad disponible.
Use for: "productos con más stock", "qué tenemos más", "mayor inventario", "top stock".
Devuelve los productos ordenados de mayor a menor cantidad en stock.`,
  tool: 'odoo',
  tags: ['inventory', 'stock', 'products', 'reporting'],
  inputSchema: GetTopStockProductsInputSchema,

  async execute(input, context): Promise<SkillResult<TopStockProductsOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Build domain
      const domain: any[] = [['qty_available', '>', 0]];
      
      if (input.stockableOnly) {
        domain.push(['type', '=', 'product']);
      }

      // Search products with stock, ordered by qty_available desc
      const products = await odoo.searchRead(
        'product.product',
        domain,
        { 
          fields: ['id', 'name', 'default_code', 'qty_available', 'free_qty', 'uom_id', 'categ_id'],
          limit: input.limit, 
          order: 'qty_available desc' 
        }
      );

      const result: TopStockProduct[] = products.map((p: any) => ({
        productId: p.id,
        productName: p.name || 'Sin nombre',
        internalRef: p.default_code || null,
        qtyOnHand: p.qty_available || 0,
        qtyAvailable: p.free_qty || p.qty_available || 0,
        uom: Array.isArray(p.uom_id) ? p.uom_id[1] : 'Unidad',
        category: Array.isArray(p.categ_id) ? p.categ_id[1] : null,
      }));

      return success({
        products: result,
        totalProducts: result.length,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
