/**
 * Skill: get_ar_aging
 *
 * Get accounts receivable aging analysis - average age of outstanding invoices.
 */

import { z } from 'zod';
import type { Skill, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient } from './_client';
import { errorToResult } from '../errors';

export const GetArAgingInputSchema = z.object({
  groupByCustomer: z.boolean().default(false).describe('Desglosar por cliente'),
  limit: z.number().int().min(1).max(100).default(20),
});

export interface AgingBucket {
  range: string;
  count: number;
  amount: number;
}

export interface CustomerAging {
  customerId: number;
  customerName: string;
  totalAmount: number;
  avgAgeDays: number;
  invoiceCount: number;
}

export interface ArAgingOutput {
  /** Average age of all receivables in days */
  avgAgeDays: number;
  /** Total outstanding amount */
  totalAmount: number;
  /** Number of open invoices */
  invoiceCount: number;
  /** Aging buckets */
  buckets: AgingBucket[];
  /** By customer breakdown (if requested) */
  byCustomer?: CustomerAging[];
}

export const getArAging: Skill<
  typeof GetArAgingInputSchema,
  ArAgingOutput
> = {
  name: 'get_ar_aging',
  description: `Análisis de antigüedad de cuentas por cobrar - cuántos días en promedio tardan en pagar.
Use for: "antigüedad de cobranzas", "días promedio de cobro", "aging de cuentas por cobrar", "cuánto tardan en pagar".
Analiza facturas abiertas y calcula la antigüedad promedio.`,
  tool: 'odoo',
  tags: ['collections', 'aging', 'receivables', 'reporting'],
  inputSchema: GetArAgingInputSchema,

  async execute(input, context): Promise<SkillResult<ArAgingOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const today = new Date();

      // Get open customer invoices
      const domain: any[] = [
        ['move_type', 'in', ['out_invoice', 'out_refund']],
        ['state', '=', 'posted'],
        ['payment_state', 'in', ['not_paid', 'partial']],
        ['amount_residual', '>', 0],
      ];

      const invoices = await odoo.searchRead(
        'account.move',
        domain,
        { 
          fields: ['id', 'partner_id', 'invoice_date', 'invoice_date_due', 'amount_residual'],
          limit: 500, 
          order: 'invoice_date asc' 
        }
      );

      if (invoices.length === 0) {
        return success({
          avgAgeDays: 0,
          totalAmount: 0,
          invoiceCount: 0,
          buckets: [],
          byCustomer: input.groupByCustomer ? [] : undefined,
        });
      }

      // Calculate aging for each invoice
      let totalAgeDays = 0;
      let totalAmount = 0;
      const bucketCounts = { '0-30': { count: 0, amount: 0 }, '31-60': { count: 0, amount: 0 }, '61-90': { count: 0, amount: 0 }, '90+': { count: 0, amount: 0 } };
      const customerMap = new Map<number, { name: string; amount: number; ageDays: number; count: number }>();

      for (const inv of invoices) {
        const invoiceDate = new Date(inv.invoice_date || inv.invoice_date_due);
        const ageDays = Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24));
        const amount = inv.amount_residual || 0;

        totalAgeDays += ageDays * amount; // Weighted by amount
        totalAmount += amount;

        // Bucket assignment
        if (ageDays <= 30) {
          bucketCounts['0-30'].count++;
          bucketCounts['0-30'].amount += amount;
        } else if (ageDays <= 60) {
          bucketCounts['31-60'].count++;
          bucketCounts['31-60'].amount += amount;
        } else if (ageDays <= 90) {
          bucketCounts['61-90'].count++;
          bucketCounts['61-90'].amount += amount;
        } else {
          bucketCounts['90+'].count++;
          bucketCounts['90+'].amount += amount;
        }

        // Customer grouping
        if (input.groupByCustomer && inv.partner_id) {
          const customerId = Array.isArray(inv.partner_id) ? inv.partner_id[0] : inv.partner_id;
          const customerName = Array.isArray(inv.partner_id) ? inv.partner_id[1] : 'Desconocido';
          
          const existing = customerMap.get(customerId);
          if (existing) {
            existing.amount += amount;
            existing.ageDays += ageDays * amount;
            existing.count++;
          } else {
            customerMap.set(customerId, { name: customerName, amount, ageDays: ageDays * amount, count: 1 });
          }
        }
      }

      const avgAgeDays = totalAmount > 0 ? Math.round(totalAgeDays / totalAmount) : 0;

      const buckets: AgingBucket[] = [
        { range: '0-30 días', count: bucketCounts['0-30'].count, amount: bucketCounts['0-30'].amount },
        { range: '31-60 días', count: bucketCounts['31-60'].count, amount: bucketCounts['31-60'].amount },
        { range: '61-90 días', count: bucketCounts['61-90'].count, amount: bucketCounts['61-90'].amount },
        { range: '+90 días', count: bucketCounts['90+'].count, amount: bucketCounts['90+'].amount },
      ];

      let byCustomer: CustomerAging[] | undefined;
      if (input.groupByCustomer) {
        byCustomer = Array.from(customerMap.entries())
          .map(([customerId, data]) => ({
            customerId,
            customerName: data.name,
            totalAmount: data.amount,
            avgAgeDays: data.amount > 0 ? Math.round(data.ageDays / data.amount) : 0,
            invoiceCount: data.count,
          }))
          .sort((a, b) => b.totalAmount - a.totalAmount)
          .slice(0, input.limit);
      }

      return success({
        avgAgeDays,
        totalAmount,
        invoiceCount: invoices.length,
        buckets,
        byCustomer,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
