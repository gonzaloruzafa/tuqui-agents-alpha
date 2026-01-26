/**
 * Skill: get_overdue_invoices
 *
 * Get overdue customer invoices.
 *
 * Use cases:
 * - "¿Qué facturas están vencidas?"
 * - "Clientes con deuda vencida"
 * - "Facturas atrasadas"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient, combineDomains } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetOverdueInvoicesInputSchema = z.object({
  /** Maximum number of invoices to return */
  limit: z.number().int().min(1).max(100).default(20),

  /** Minimum days overdue (filter out recently overdue) */
  minDaysOverdue: z.number().int().min(0).default(0),

  /** Group by customer */
  groupByCustomer: z.boolean().default(false),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface OverdueInvoice {
  invoiceId: number;
  invoiceNumber: string;
  customerId: number;
  customerName: string;
  amountTotal: number;
  amountResidual: number;
  invoiceDate: string;
  dueDate: string;
  daysOverdue: number;
}

export interface CustomerOverdue {
  customerId: number;
  customerName: string;
  invoiceCount: number;
  totalOverdue: number;
  oldestDaysOverdue: number;
}

export interface OverdueInvoicesOutput {
  invoices?: OverdueInvoice[];
  customers?: CustomerOverdue[];
  totalOverdue: number;
  totalInvoices: number;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getOverdueInvoices: Skill<
  typeof GetOverdueInvoicesInputSchema,
  OverdueInvoicesOutput
> = {
  name: 'get_overdue_invoices',
  description: 'Get overdue customer invoices. Use for "facturas vencidas", "pagos atrasados", "overdue invoices", "late payments", "unpaid invoices", "deudores morosos", "debt collection".',
  tool: 'odoo',
  tags: ['invoices', 'debt', 'collections', 'accounting'],
  inputSchema: GetOverdueInvoicesInputSchema,

  async execute(input, context): Promise<SkillResult<OverdueInvoicesOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Get today's date in YYYY-MM-DD format
      const today = new Date().toISOString().split('T')[0];

      // Build domain for overdue invoices
      const domain = combineDomains([
        ['move_type', '=', 'out_invoice'], // Customer invoices only
        ['state', '=', 'posted'], // Posted invoices
        ['payment_state', 'in', ['not_paid', 'partial']], // Not fully paid
        ['invoice_date_due', '<', today], // Due date passed
      ]);

      if (!input.groupByCustomer) {
        // Get individual invoices
        const invoices = await odoo.searchRead<{
          id: number;
          name: string;
          partner_id: [number, string];
          amount_total: number;
          amount_residual: number;
          invoice_date: string;
          invoice_date_due: string;
        }>(
          'account.move',
          domain,
          {
            fields: [
              'name',
              'partner_id',
              'amount_total',
              'amount_residual',
              'invoice_date',
              'invoice_date_due',
            ],
            limit: input.limit,
            order: 'invoice_date_due asc',
          }
        );

        // Calculate days overdue
        const results: OverdueInvoice[] = invoices
          .map((inv) => {
            const dueDate = new Date(inv.invoice_date_due);
            const todayDate = new Date(today);
            const daysOverdue = Math.floor(
              (todayDate.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24)
            );

            return {
              invoiceId: inv.id,
              invoiceNumber: inv.name,
              customerId: inv.partner_id[0],
              customerName: inv.partner_id[1],
              amountTotal: inv.amount_total,
              amountResidual: inv.amount_residual,
              invoiceDate: inv.invoice_date,
              dueDate: inv.invoice_date_due,
              daysOverdue,
            };
          })
          .filter((inv) => inv.daysOverdue >= input.minDaysOverdue);

        const totalOverdue = results.reduce((sum, inv) => sum + inv.amountResidual, 0);

        return success({
          invoices: results,
          totalOverdue,
          totalInvoices: results.length,
        });
      } else {
        // Group by customer
        const grouped = await odoo.readGroup(
          'account.move',
          domain,
          ['partner_id', 'amount_residual:sum'],
          ['partner_id'],
          {
            limit: input.limit,
            orderBy: 'amount_residual desc',
          }
        );

        const customers: CustomerOverdue[] = grouped
          .filter((g) => g.partner_id && Array.isArray(g.partner_id))
          .map((g) => ({
            customerId: (g.partner_id as [number, string])[0],
            customerName: (g.partner_id as [number, string])[1],
            invoiceCount: g.partner_id_count || 1,
            totalOverdue: g.amount_residual || 0,
            oldestDaysOverdue: 0, // Would need additional query
          }));

        const totalOverdue = customers.reduce((sum, c) => sum + c.totalOverdue, 0);
        const totalInvoices = customers.reduce((sum, c) => sum + c.invoiceCount, 0);

        return success({
          customers,
          totalOverdue,
          totalInvoices,
        });
      }
    } catch (error) {
      return errorToResult(error);
    }
  },
};
