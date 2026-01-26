/**
 * Skill: get_vendor_bills
 *
 * Get vendor bills (supplier invoices).
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, combineDomains, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

export const GetVendorBillsInputSchema = z.object({
  period: PeriodSchema.optional(),
  state: z.enum(['all', 'posted', 'draft']).default('posted'),
  supplierId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(50),
});

export interface VendorBillsOutput {
  totalAmount: number;
  billCount: number;
  period: z.infer<typeof PeriodSchema>;
}

export const getVendorBills: Skill<
  typeof GetVendorBillsInputSchema,
  VendorBillsOutput
> = {
  name: 'get_vendor_bills',
  description: 'Get vendor bills (supplier invoices). Use for "vendor bills", "supplier invoices", "what we owe suppliers".',
  tool: 'odoo',
  tags: ['purchases', 'bills', 'accounting'],
  inputSchema: GetVendorBillsInputSchema,

  async execute(input, context): Promise<SkillResult<VendorBillsOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      const domain = combineDomains(
        dateRange('invoice_date', period.start, period.end),
        [['move_type', '=', 'in_invoice']]
      );

      if (input.state !== 'all') {
        domain.push(['state', '=', input.state]);
      }

      if (input.supplierId) {
        domain.push(['partner_id', '=', input.supplierId]);
      }

      const bills = await odoo.searchRead<{
        amount_total: number;
      }>(
        'account.move',
        domain,
        { fields: ['amount_total'], limit: input.limit }
      );

      const totalAmount = bills.reduce((sum, b) => sum + b.amount_total, 0);

      return success({
        totalAmount,
        billCount: bills.length,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
