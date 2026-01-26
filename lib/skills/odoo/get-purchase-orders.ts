/**
 * Skill: get_purchase_orders
 *
 * Get purchase orders for a period.
 *
 * Use cases:
 * - "¿Cuánto compramos este mes?"
 * - "Órdenes de compra de enero"
 * - "Compras pendientes"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema, DocumentStateSchema } from '../types';
import { createOdooClient, dateRange, combineDomains, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetPurchaseOrdersInputSchema = z.object({
  /** Time period for analysis */
  period: PeriodSchema.optional(),

  /** Filter by order state */
  state: z.enum(['all', 'confirmed', 'draft', 'sent', 'done', 'cancel']).default('confirmed'),

  /** Group results by */
  groupBy: z.enum(['none', 'vendor', 'category']).default('none'),

  /** Maximum number of results */
  limit: z.number().int().min(1).max(100).default(50),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface PurchaseOrderSummary {
  orderCount: number;
  totalAmount: number;
  groupName?: string;
}

export interface PurchaseOrdersOutput {
  totalAmount: number;
  orderCount: number;
  groups?: Record<string, PurchaseOrderSummary>;
  period: z.infer<typeof PeriodSchema>;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getPurchaseOrders: Skill<
  typeof GetPurchaseOrdersInputSchema,
  PurchaseOrdersOutput
> = {
  name: 'get_purchase_orders',
  description: 'Get purchase orders for a period. Use when user asks about "purchases", "buying", "purchase orders", "what we bought".',
  tool: 'odoo',
  tags: ['purchases', 'vendors', 'reporting'],
  inputSchema: GetPurchaseOrdersInputSchema,

  async execute(input, context): Promise<SkillResult<PurchaseOrdersOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      // Build domain
      const domain = combineDomains(
        dateRange('date_order', period.start, period.end)
      );

      // State filter
      if (input.state !== 'all') {
        if (input.state === 'confirmed') {
          domain.push(['state', 'in', ['purchase', 'done']]);
        } else {
          domain.push(['state', '=', input.state]);
        }
      }

      if (input.groupBy === 'none') {
        // Simple total
        const grouped = await odoo.readGroup(
          'purchase.order',
          domain,
          ['amount_total:sum'],
          [],
          { limit: 1 }
        );

        const totalAmount = grouped[0]?.amount_total || 0;
        const orderCount = grouped[0]?.id_count || 0;

        return success({
          totalAmount,
          orderCount,
          period,
        });
      } else {
        // Group by vendor or category
        const groupField = input.groupBy === 'vendor' ? 'partner_id' : 'product_id.categ_id';

        const grouped = await odoo.readGroup(
          'purchase.order',
          domain,
          [groupField, 'amount_total:sum'],
          [groupField],
          {
            limit: input.limit,
            orderBy: 'amount_total desc',
          }
        );

        const groups: Record<string, PurchaseOrderSummary> = {};
        let totalAmount = 0;
        let orderCount = 0;

        for (const g of grouped) {
          const groupName = input.groupBy === 'vendor'
            ? (g.partner_id && Array.isArray(g.partner_id) ? g.partner_id[1] : 'Unknown')
            : 'Category';

          groups[groupName] = {
            orderCount: g.id_count || 1,
            totalAmount: g.amount_total || 0,
            groupName,
          };

          totalAmount += g.amount_total || 0;
          orderCount += g.id_count || 1;
        }

        return success({
          totalAmount,
          orderCount,
          groups,
          period,
        });
      }
    } catch (error) {
      return errorToResult(error);
    }
  },
};
