/**
 * Skill: get_pending_sale_orders
 *
 * Get pending (confirmed but not delivered) sale orders.
 *
 * Use cases:
 * - "¿Cuántas órdenes de venta tenemos pendientes?"
 * - "Pedidos sin entregar"
 * - "Órdenes de venta confirmadas"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetPendingSaleOrdersInputSchema = z.object({
  /** Time period for analysis (optional, defaults to all time) */
  period: PeriodSchema.optional(),

  /** Filter by pending type */
  pendingType: z.enum(['delivery', 'invoice', 'all']).default('delivery'),

  /** Maximum number of orders to return details */
  limit: z.number().int().min(1).max(100).default(20),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface PendingOrderSummary {
  id: number;
  name: string;
  partner: string;
  date: string;
  amount: number;
  status: string;
}

export interface PendingSaleOrdersOutput {
  totalCount: number;
  totalAmount: number;
  orders: PendingOrderSummary[];
  period: z.infer<typeof PeriodSchema> | null;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getPendingSaleOrders: Skill<
  typeof GetPendingSaleOrdersInputSchema,
  PendingSaleOrdersOutput
> = {
  name: 'get_pending_sale_orders',
  description: `Órdenes de venta pendientes - pedidos confirmados sin entregar o facturar. 
HERRAMIENTA PRINCIPAL para "cuántas órdenes pendientes", "pedidos sin entregar", "ventas pendientes".
SIEMPRE ejecutar con AMBAS (entrega Y facturación) - NO preguntar cuál tipo. Devuelve lista de órdenes.`,
  tool: 'odoo',
  tags: ['sales', 'orders', 'pending', 'delivery'],
  inputSchema: GetPendingSaleOrdersInputSchema,

  async execute(input, context): Promise<SkillResult<PendingSaleOrdersOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || null; // No default period - show all pending

      // Build domain for confirmed orders
      // state='sale' means confirmed but in process
      // state='done' means fully delivered
      let domain: [string, string, any][] = [];

      if (input.pendingType === 'delivery') {
        // Orders confirmed but not fully delivered
        // delivery_status can be: 'no', 'partial', 'full', 'pending'
        domain = [
          ['state', '=', 'sale'],
          ['delivery_status', 'in', ['partial', 'pending']],
        ];
      } else if (input.pendingType === 'invoice') {
        // Orders not fully invoiced
        domain = [
          ['state', '=', 'sale'],
          ['invoice_status', 'in', ['to invoice', 'no']],
        ];
      } else {
        // All confirmed orders (not done or cancelled)
        domain = [
          ['state', '=', 'sale'],
        ];
      }

      // Add period filter if specified
      if (period) {
        const periodDomain = dateRange('date_order', period.start, period.end);
        domain = [...domain, ...periodDomain] as [string, string, any][];
      }

      // Get count first
      const totalCount = await odoo.searchCount('sale.order', domain);

      // Get total amount
      const totals = await odoo.readGroup(
        'sale.order',
        domain,
        ['amount_total'],
        [],
        { limit: 1 }
      );
      const totalAmount = totals[0]?.amount_total || 0;

      // Get order details (limited)
      const orders = await odoo.searchRead<{
        id: number;
        name: string;
        partner_id: [number, string];
        date_order: string;
        amount_total: number;
        state: string;
        delivery_status: string;
        invoice_status: string;
      }>(
        'sale.order',
        domain,
        { 
          fields: ['name', 'partner_id', 'date_order', 'amount_total', 'state', 'delivery_status', 'invoice_status'],
          limit: input.limit, 
          order: 'date_order desc' 
        }
      );

      const orderSummaries: PendingOrderSummary[] = orders.map((o) => ({
        id: o.id,
        name: o.name,
        partner: Array.isArray(o.partner_id) ? o.partner_id[1] : 'Cliente',
        date: o.date_order,
        amount: o.amount_total,
        status: o.delivery_status || o.state,
      }));

      return success({
        totalCount,
        totalAmount,
        orders: orderSummaries,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
