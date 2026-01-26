/**
 * Skill: search_products
 *
 * Search for products by name, code, or barcode.
 *
 * Use cases:
 * - "Buscar producto Notebook"
 * - "Producto con código PROD-001"
 * - "¿Tenemos stock de Mouse Logitech?"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient, type OdooDomain } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const SearchProductsInputSchema = z.object({
  /** Search query (name, code, barcode) */
  query: z.string().min(1),

  /** Maximum number of results */
  limit: z.number().int().min(1).max(50).default(10),

  /** Include stock information */
  includeStock: z.boolean().default(true),

  /** Only saleable products */
  saleableOnly: z.boolean().default(false),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface ProductResult {
  id: number;
  name: string;
  code: string | null;
  barcode: string | null;
  type: string;
  listPrice: number;
  standardPrice: number;
  qtyAvailable?: number;
  virtualAvailable?: number;
  uom: string;
}

export interface SearchProductsOutput {
  products: ProductResult[];
  total: number;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const searchProducts: Skill<
  typeof SearchProductsInputSchema,
  SearchProductsOutput
> = {
  name: 'search_products',
  description: 'Search for products by name, code, or barcode. Use when user wants to "find a product", "search item", "look up product".',
  tool: 'odoo',
  tags: ['products', 'search', 'inventory'],
  inputSchema: SearchProductsInputSchema,

  async execute(input, context): Promise<SkillResult<SearchProductsOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Build search domain
      const domain: OdooDomain = [
        '|',
        '|',
        ['name', 'ilike', input.query],
        ['default_code', 'ilike', input.query],
        ['barcode', 'ilike', input.query],
      ];

      if (input.saleableOnly) {
        domain.push(['sale_ok', '=', true]);
      }

      // Define fields
      const fields = [
        'name',
        'default_code',
        'barcode',
        'type',
        'list_price',
        'standard_price',
        'uom_id',
      ];

      if (input.includeStock) {
        fields.push('qty_available', 'virtual_available');
      }

      // Search
      const products = await odoo.searchRead<{
        id: number;
        name: string;
        default_code: string | false;
        barcode: string | false;
        type: string;
        list_price: number;
        standard_price: number;
        qty_available?: number;
        virtual_available?: number;
        uom_id: [number, string];
      }>(
        'product.product',
        domain,
        {
          fields,
          limit: input.limit,
        }
      );

      // Transform results
      const results: ProductResult[] = products.map((p) => ({
        id: p.id,
        name: p.name,
        code: p.default_code || null,
        barcode: p.barcode || null,
        type: p.type,
        listPrice: p.list_price,
        standardPrice: p.standard_price,
        qtyAvailable: p.qty_available,
        virtualAvailable: p.virtual_available,
        uom: p.uom_id[1],
      }));

      return success({
        products: results,
        total: results.length,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
