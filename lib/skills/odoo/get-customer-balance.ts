/**
 * Skill: get_customer_balance
 *
 * Get customer account balance (receivables).
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient, type OdooDomain } from './_client';
import { errorToResult } from '../errors';

export const GetCustomerBalanceInputSchema = z.object({
  customerId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(20),
  onlyWithBalance: z.boolean().default(true),
});

export interface CustomerBalance {
  customerId: number;
  customerName: string;
  balance: number;
}

export interface CustomerBalanceOutput {
  customers: CustomerBalance[];
  totalBalance: number;
}

export const getCustomerBalance: Skill<
  typeof GetCustomerBalanceInputSchema,
  CustomerBalanceOutput
> = {
  name: 'get_customer_balance',
  description: 'Get customer account balance (receivables). Use for "saldo de cliente", "cuánto nos debe", "customer balance", "accounts receivable", "who owes us", "quién nos debe más".',
  tool: 'odoo',
  tags: ['accounting', 'receivables', 'customers'],
  inputSchema: GetCustomerBalanceInputSchema,

  async execute(input, context): Promise<SkillResult<CustomerBalanceOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      const domain: OdooDomain = [
        ['account_id.account_type', '=', 'asset_receivable'],
      ];

      if (input.customerId) {
        domain.push(['partner_id', '=', input.customerId]);
      }

      const grouped = await odoo.readGroup(
        'account.move.line',
        domain,
        ['partner_id', 'balance:sum'],
        ['partner_id'],
        { limit: input.limit, orderBy: 'balance desc' }
      );

      let customers: CustomerBalance[] = grouped
        .filter((g) => g.partner_id && Array.isArray(g.partner_id))
        .map((g) => ({
          customerId: (g.partner_id as [number, string])[0],
          customerName: (g.partner_id as [number, string])[1],
          balance: g.balance || 0,
        }));

      if (input.onlyWithBalance) {
        customers = customers.filter((c) => c.balance > 0);
      }

      return success({
        customers,
        totalBalance: customers.reduce((sum, c) => sum + c.balance, 0),
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
