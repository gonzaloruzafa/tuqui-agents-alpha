/**
 * Skill: get_new_customers
 *
 * Get customers created in a specific period.
 */

import { z } from 'zod';
import type { Skill, SkillResult } from '../types';
import { success, authError, PeriodSchema } from '../types';
import { createOdooClient, dateRange, getDefaultPeriod } from './_client';
import { errorToResult } from '../errors';

export const GetNewCustomersInputSchema = z.object({
  period: PeriodSchema.optional(),
  limit: z.number().int().min(1).max(100).default(50),
  includeDetails: z.boolean().default(false).describe('Incluir email, teléfono, etc.'),
});

export interface NewCustomer {
  customerId: number;
  customerName: string;
  createDate: string;
  email?: string;
  phone?: string;
  city?: string;
}

export interface NewCustomersOutput {
  customers: NewCustomer[];
  totalCount: number;
  period: z.infer<typeof PeriodSchema>;
}

export const getNewCustomers: Skill<
  typeof GetNewCustomersInputSchema,
  NewCustomersOutput
> = {
  name: 'get_new_customers',
  description: `Clientes nuevos creados en un período - cuántos clientes nuevos tuvimos.
Use for: "clientes nuevos", "nuevos clientes este mes", "cuántos clientes ganamos".
USA MES ACTUAL si no hay período. Cuenta clientes tipo cliente (no proveedores).`,
  tool: 'odoo',
  tags: ['customers', 'crm', 'growth', 'reporting'],
  inputSchema: GetNewCustomersInputSchema,

  async execute(input, context): Promise<SkillResult<NewCustomersOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      // Build domain: customers created in period
      const domain: any[] = [
        ...dateRange('create_date', period.start, period.end),
        ['customer_rank', '>', 0], // Only customers
      ];

      // Fields to fetch
      const fields = ['id', 'name', 'create_date'];
      if (input.includeDetails) {
        fields.push('email', 'phone', 'city');
      }

      // Search customers
      const customers = await odoo.searchRead(
        'res.partner',
        domain,
        { fields, limit: input.limit, order: 'create_date desc' }
      );

      // Also get total count
      const totalCount = await odoo.searchCount('res.partner', domain);

      const result: NewCustomer[] = customers.map((c: any) => ({
        customerId: c.id,
        customerName: c.name || 'Sin nombre',
        createDate: c.create_date ? c.create_date.split(' ')[0] : '',
        ...(input.includeDetails && {
          email: c.email || undefined,
          phone: c.phone || undefined,
          city: c.city || undefined,
        }),
      }));

      return success({
        customers: result,
        totalCount,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
