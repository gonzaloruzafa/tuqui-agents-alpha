/**
 * Skill: get_invoices_by_customer
 *
 * Get invoices grouped by customer.
 *
 * Use cases:
 * - "¿Cuánto facturé a cada cliente?"
 * - "Top clientes por facturación"
 * - "Facturas por cliente este mes"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, combineDomains, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetInvoicesByCustomerInputSchema = z.object({
  /** Time period for analysis */
  period: PeriodSchema.optional(),

  /** Maximum number of customers to return */
  limit: z.number().int().min(1).max(100).default(10),

  /** Filter by invoice state */
  state: z.enum(['all', 'posted', 'draft']).default('posted'),

  /** Only customer invoices (out_invoice) vs vendor bills */
  invoiceType: z.enum(['out_invoice', 'in_invoice', 'all']).default('out_invoice'),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface CustomerInvoices {
  customerId: number;
  customerName: string;
  invoiceCount: number;
  totalAmount: number;
  avgInvoiceAmount: number;
}

export interface InvoicesByCustomerOutput {
  customers: CustomerInvoices[];
  grandTotal: number;
  totalInvoices: number;
  customerCount: number;
  period: z.infer<typeof PeriodSchema>;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getInvoicesByCustomer: Skill<
  typeof GetInvoicesByCustomerInputSchema,
  InvoicesByCustomerOutput
> = {
  name: 'get_invoices_by_customer',
  description: 'Get invoices grouped by customer. Use when user asks about "invoicing by customer", "billed amount by client", "top invoiced customers".',
  tool: 'odoo',
  tags: ['invoices', 'customers', 'accounting'],
  inputSchema: GetInvoicesByCustomerInputSchema,

  async execute(input, context): Promise<SkillResult<InvoicesByCustomerOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      // Build domain
      const domain = combineDomains(
        dateRange('invoice_date', period.start, period.end)
      );

      // State filter
      if (input.state !== 'all') {
        domain.push(['state', '=', input.state]);
      }

      // Invoice type filter
      if (input.invoiceType !== 'all') {
        domain.push(['move_type', '=', input.invoiceType]);
      }

      // Group by partner
      const grouped = await odoo.readGroup(
        'account.move',
        domain,
        ['partner_id', 'amount_total:sum'],
        ['partner_id'],
        {
          limit: input.limit,
          orderBy: 'amount_total desc',
        }
      );

      // Transform results
      const customers: CustomerInvoices[] = grouped
        .filter((g) => g.partner_id && Array.isArray(g.partner_id))
        .map((g) => {
          const [customerId, customerName] = g.partner_id as [number, string];
          const totalAmount = g.amount_total || 0;
          const invoiceCount = g.partner_id_count || 1;

          return {
            customerId,
            customerName,
            invoiceCount,
            totalAmount,
            avgInvoiceAmount: totalAmount / invoiceCount,
          };
        });

      // Calculate totals
      const grandTotal = customers.reduce((sum, c) => sum + c.totalAmount, 0);
      const totalInvoices = customers.reduce((sum, c) => sum + c.invoiceCount, 0);

      return success({
        customers,
        grandTotal,
        totalInvoices,
        customerCount: customers.length,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
