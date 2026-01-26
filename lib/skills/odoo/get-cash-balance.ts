/**
 * Skill: get_cash_balance
 *
 * Retrieves current cash balance from cash journals.
 * Answers "¿Cuánta plata en caja?" type questions.
 *
 * @example
 * User: "¿Cuánta plata en caja?"
 * User: "Saldo de caja"
 * User: "Efectivo disponible"
 */

import { z } from 'zod'
import type { Skill, SkillContext, SkillResult } from '../types'
import { success, authError } from '../types'
import { createOdooClient, type OdooDomain } from './_client'
import { errorToResult } from '../errors'

// ============================================
// INPUT SCHEMA
// ============================================

export const GetCashBalanceInputSchema = z.object({
  /** Include bank accounts (not just cash) */
  includeBanks: z.boolean().default(false),
  /** Filter by specific journal IDs */
  journalIds: z.array(z.number().positive()).optional(),
})

export type GetCashBalanceInput = z.infer<typeof GetCashBalanceInputSchema>

// ============================================
// OUTPUT TYPES
// ============================================

export interface JournalBalance {
  /** Journal ID */
  journalId: number
  /** Journal name (e.g., "Caja Principal", "Banco Nación") */
  journalName: string
  /** Journal type: cash or bank */
  journalType: 'cash' | 'bank'
  /** Current balance */
  balance: number
  /** Currency */
  currency: string
}

export interface GetCashBalanceOutput {
  /** Total cash balance (only cash journals) */
  totalCash: number
  /** Total bank balance (only bank journals) */
  totalBank: number
  /** Combined total (cash + bank) */
  grandTotal: number
  /** Breakdown by journal */
  journals: JournalBalance[]
  /** Default currency */
  currency: string
}

// ============================================
// SKILL IMPLEMENTATION
// ============================================

export const getCashBalance: Skill<typeof GetCashBalanceInputSchema, GetCashBalanceOutput> = {
  name: 'get_cash_balance',

  description: `Get current cash and bank balances.
Use when user asks: "cash balance", "money in register", "available cash",
"cuánta plata en caja", "saldo de caja", "efectivo disponible", "saldo bancos".
Returns balance per journal (cash registers and bank accounts).`,

  tool: 'odoo',

  inputSchema: GetCashBalanceInputSchema,

  tags: ['cash', 'balance', 'treasury', 'banks', 'liquidity'],

  priority: 15, // High priority for common treasury questions

  async execute(
    input: GetCashBalanceInput,
    context: SkillContext
  ): Promise<SkillResult<GetCashBalanceOutput>> {
    if (!context.credentials.odoo) {
      return authError('Odoo')
    }

    try {
      const odoo = createOdooClient(context.credentials.odoo)

      // Build domain for journals
      const journalTypes: string[] = ['cash']
      if (input.includeBanks) {
        journalTypes.push('bank')
      }

      let domain: OdooDomain = [['type', 'in', journalTypes]]

      // Add specific journal filter if provided
      if (input.journalIds && input.journalIds.length > 0) {
        domain = [...domain, ['id', 'in', input.journalIds]]
      }

      // Get journals with their current balance
      const journals = await odoo.searchRead('account.journal', domain, {
        fields: ['id', 'name', 'type', 'default_account_id', 'currency_id', 'company_id'],
      })

      // For each journal, get the account balance
      const journalBalances: JournalBalance[] = []
      let totalCash = 0
      let totalBank = 0
      let defaultCurrency = 'ARS'

      for (const journal of journals) {
        // Get the default account for this journal
        const accountId = Array.isArray(journal.default_account_id)
          ? journal.default_account_id[0]
          : journal.default_account_id

        if (!accountId) continue

        // Get balance from account.move.line
        const balanceResult = await odoo.readGroup(
          'account.move.line',
          [
            ['account_id', '=', accountId],
            ['parent_state', '=', 'posted'],
          ],
          ['balance'],
          [],
          { limit: 1 }
        )

        const balance = balanceResult[0]?.balance || 0
        const journalType = journal.type === 'cash' ? 'cash' : 'bank'
        const currency = Array.isArray(journal.currency_id)
          ? journal.currency_id[1]
          : defaultCurrency

        if (journalType === 'cash') {
          totalCash += balance
        } else {
          totalBank += balance
        }

        journalBalances.push({
          journalId: journal.id,
          journalName: journal.name,
          journalType,
          balance,
          currency,
        })

        // Use first currency as default
        if (!defaultCurrency && currency) {
          defaultCurrency = currency
        }
      }

      return success({
        totalCash,
        totalBank,
        grandTotal: totalCash + totalBank,
        journals: journalBalances.sort((a, b) => b.balance - a.balance),
        currency: defaultCurrency,
      })
    } catch (error) {
      return errorToResult(error)
    }
  },
}
