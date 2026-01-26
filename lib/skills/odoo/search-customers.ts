/**
 * Skill: search_customers
 *
 * Search for customers by name, email, or VAT.
 *
 * Use cases:
 * - "Buscar cliente Distribuidora del Sur"
 * - "¿Tenemos un cliente llamado María?"
 * - "Cliente con CUIT 30-12345678-9"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient, type OdooDomain } from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const SearchCustomersInputSchema = z.object({
  /** Search query (name, email, VAT, reference) */
  query: z.string().min(1),

  /** Maximum number of results */
  limit: z.number().int().min(1).max(50).default(10),

  /** Only active customers */
  activeOnly: z.boolean().default(true),

  /** Only customers (not suppliers) */
  customersOnly: z.boolean().default(true),
});

// ============================================
// OUTPUT TYPE
// ============================================

export interface CustomerResult {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  vat: string | null;
  city: string | null;
  isCompany: boolean;
  active: boolean;
}

export interface SearchCustomersOutput {
  customers: CustomerResult[];
  total: number;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const searchCustomers: Skill<
  typeof SearchCustomersInputSchema,
  SearchCustomersOutput
> = {
  name: 'search_customers',
  description: 'Search for customers by name, email, VAT, or reference. Use when user wants to "find a customer", "search client", "look up customer".',
  tool: 'odoo',
  tags: ['customers', 'search', 'crm'],
  inputSchema: SearchCustomersInputSchema,

  async execute(input, context): Promise<SkillResult<SearchCustomersOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);

      // Build search domain
      const domain: OdooDomain = [
        '|',
        '|',
        '|',
        ['name', 'ilike', input.query],
        ['email', 'ilike', input.query],
        ['vat', 'ilike', input.query],
        ['ref', 'ilike', input.query],
      ];

      if (input.customersOnly) {
        domain.push(['customer_rank', '>', 0]);
      }

      if (input.activeOnly) {
        domain.push(['active', '=', true]);
      }

      // Search
      const customers = await odoo.searchRead<{
        id: number;
        name: string;
        email: string | false;
        phone: string | false;
        vat: string | false;
        city: string | false;
        is_company: boolean;
        active: boolean;
      }>(
        'res.partner',
        domain,
        {
          fields: ['name', 'email', 'phone', 'vat', 'city', 'is_company', 'active'],
          limit: input.limit,
        }
      );

      // Transform results
      const results: CustomerResult[] = customers.map((c) => ({
        id: c.id,
        name: c.name,
        email: c.email || null,
        phone: c.phone || null,
        vat: c.vat || null,
        city: c.city || null,
        isCompany: c.is_company,
        active: c.active,
      }));

      return success({
        customers: results,
        total: results.length,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
