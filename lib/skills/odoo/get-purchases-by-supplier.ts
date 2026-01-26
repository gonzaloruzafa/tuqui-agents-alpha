/**
 * Skill: get_purchases_by_supplier
 *
 * Get purchases grouped by supplier.
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, combineDomains, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

export const GetPurchasesBySupplierInputSchema = z.object({
  period: PeriodSchema.optional(),
  limit: z.number().int().min(1).max(100).default(10),
  state: z.enum(['all', 'confirmed', 'draft']).default('confirmed'),
});

export interface SupplierPurchases {
  supplierId: number;
  supplierName: string;
  orderCount: number;
  totalAmount: number;
}

export interface PurchasesBySupplierOutput {
  suppliers: SupplierPurchases[];
  grandTotal: number;
  totalOrders: number;
  period: z.infer<typeof PeriodSchema>;
}

export const getPurchasesBySupplier: Skill<
  typeof GetPurchasesBySupplierInputSchema,
  PurchasesBySupplierOutput
> = {
  name: 'get_purchases_by_supplier',
  description: 'Get purchases grouped by supplier. Use for "a quién le compramos más", "principal proveedor", "top suppliers", "purchases by vendor", "supplier spending".',
  tool: 'odoo',
  tags: ['purchases', 'suppliers', 'reporting'],
  inputSchema: GetPurchasesBySupplierInputSchema,

  async execute(input, context): Promise<SkillResult<PurchasesBySupplierOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      const domain = combineDomains(
        dateRange('date_order', period.start, period.end)
      );

      if (input.state !== 'all') {
        if (input.state === 'confirmed') {
          domain.push(['state', 'in', ['purchase', 'done']]);
        } else {
          domain.push(['state', '=', input.state]);
        }
      }

      const grouped = await odoo.readGroup(
        'purchase.order',
        domain,
        ['partner_id', 'amount_total:sum'],
        ['partner_id'],
        { limit: input.limit, orderBy: 'amount_total desc' }
      );

      const suppliers: SupplierPurchases[] = grouped
        .filter((g) => g.partner_id && Array.isArray(g.partner_id))
        .map((g) => ({
          supplierId: (g.partner_id as [number, string])[0],
          supplierName: (g.partner_id as [number, string])[1],
          orderCount: g.partner_id_count || 1,
          totalAmount: g.amount_total || 0,
        }));

      return success({
        suppliers,
        grandTotal: suppliers.reduce((sum, s) => sum + s.totalAmount, 0),
        totalOrders: suppliers.reduce((sum, s) => sum + s.orderCount, 0),
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
