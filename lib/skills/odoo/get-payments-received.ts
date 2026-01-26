/**
 * Skill: get_payments_received
 *
 * Retrieves payments received (customer collections) for a period.
 * Replaces the LLM-generated query for "collections", "payments received", etc.
 *
 * @example
 * User: "¿Cuánto cobramos este mes?"
 * User: "Pagos recibidos de clientes"
 * User: "Cobros del día"
 */

import { z } from 'zod';
import type { Skill, SkillContext, SkillResult, Period } from '../types';
import { PeriodSchema, success, authError } from '../types';
import {
  createOdooClient,
  dateRange,
  combineDomains,
  getDefaultPeriod,
  type OdooDomain,
  type DomainFilter,
} from './_client';
import { errorToResult } from '../errors';

// ============================================
// INPUT SCHEMA
// ============================================

export const GetPaymentsReceivedInputSchema = z.object({
  /** Date period to query */
  period: PeriodSchema.optional(),
  /** Group by payment method/journal */
  groupByJournal: z.boolean().default(false),
  /** Group by customer */
  groupByCustomer: z.boolean().default(false),
  /** Filter by specific journal IDs */
  journalIds: z.array(z.number().positive()).optional(),
  /** Maximum results when grouped */
  limit: z.number().min(1).max(100).default(20),
});

export type GetPaymentsReceivedInput = z.infer<typeof GetPaymentsReceivedInputSchema>;

// ============================================
// OUTPUT TYPES
// ============================================

export interface PaymentByGroup {
  /** Group ID (journal or customer) */
  groupId: number;
  /** Group name */
  groupName: string;
  /** Total amount */
  amount: number;
  /** Number of payments */
  count: number;
}

export interface GetPaymentsReceivedOutput {
  /** Total amount received */
  totalAmount: number;
  /** Number of payments */
  paymentCount: number;
  /** Breakdown by journal (if requested) */
  byJournal?: PaymentByGroup[];
  /** Breakdown by customer (if requested) */
  byCustomer?: PaymentByGroup[];
  /** Query period */
  period: Period;
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getPaymentsReceived: Skill<
  typeof GetPaymentsReceivedInputSchema,
  GetPaymentsReceivedOutput
> = {
  name: 'get_payments_received',

  description: `Get payments received (collections) for a period.
Use when user asks: "collections", "payments received", "cash inflow",
"cobros", "cuánto cobramos", "pagos recibidos", "ingresos".
Can group by payment method or customer.`,

  tool: 'odoo',

  inputSchema: GetPaymentsReceivedInputSchema,

  tags: ['payments', 'collections', 'cash-flow', 'customers'],

  priority: 10,

  async execute(
    input: GetPaymentsReceivedInput,
    context: SkillContext
  ): Promise<SkillResult<GetPaymentsReceivedOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo);
      const period = input.period || getDefaultPeriod();

      // Build domain for inbound payments (collections)
      const baseDomain: DomainFilter[] = [
        ['payment_type', '=', 'inbound'],
        ['state', '=', 'posted'],
      ];

      let domain: OdooDomain = combineDomains(
        baseDomain,
        dateRange('date', period.start, period.end)
      );

      // Filter by journal IDs if specified
      if (input.journalIds?.length) {
        domain = [...domain, ['journal_id', 'in', input.journalIds]];
      }

      // Prepare promises for parallel execution
      const promises: Promise<any>[] = [];

      // Always get totals
      promises.push(
        odoo.readGroup('account.payment', domain, ['amount:sum'], [], { limit: 1 })
      );

      // Optional: group by journal
      if (input.groupByJournal) {
        promises.push(
          odoo.readGroup(
            'account.payment',
            domain,
            ['journal_id', 'amount:sum'],
            ['journal_id'],
            { limit: input.limit, orderBy: 'amount desc' }
          )
        );
      }

      // Optional: group by customer
      if (input.groupByCustomer) {
        promises.push(
          odoo.readGroup(
            'account.payment',
            domain,
            ['partner_id', 'amount:sum'],
            ['partner_id'],
            { limit: input.limit, orderBy: 'amount desc' }
          )
        );
      }

      // Execute all queries in parallel
      const results = await Promise.all(promises);

      // Parse results
      const totals = results[0];
      let resultIndex = 1;

      const totalAmount = totals[0]?.amount || 0;
      const paymentCount = totals[0]?.__count || 0;

      let byJournal: PaymentByGroup[] | undefined;
      if (input.groupByJournal) {
        const journalData = results[resultIndex++];
        byJournal = journalData
          .filter((g: any) => g.journal_id)
          .map((g: any) => ({
            groupId: g.journal_id[0],
            groupName: g.journal_id[1],
            amount: g.amount || 0,
            count: g.journal_id_count || g.__count || 1,
          }));
      }

      let byCustomer: PaymentByGroup[] | undefined;
      if (input.groupByCustomer) {
        const customerData = results[resultIndex++];
        byCustomer = customerData
          .filter((g: any) => g.partner_id)
          .map((g: any) => ({
            groupId: g.partner_id[0],
            groupName: g.partner_id[1],
            amount: g.amount || 0,
            count: g.partner_id_count || g.__count || 1,
          }));
      }

      return success({
        totalAmount,
        paymentCount,
        byJournal,
        byCustomer,
        period,
      });
    } catch (error) {
      return errorToResult(error);
    }
  },
};
