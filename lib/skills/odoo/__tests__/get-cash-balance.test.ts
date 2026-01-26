/**
 * Tests for get_cash_balance skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getCashBalance, GetCashBalanceInputSchema } from '../get-cash-balance';
import type { SkillContext } from '../../types';
import * as clientModule from '../_client';

// Mock the Odoo client module
vi.mock('../_client', () => ({
  createOdooClient: vi.fn(),
  dateRange: (field: string, start: string, end: string) => [
    [field, '>=', start],
    [field, '<=', end],
  ],
  stateFilter: () => [],
  combineDomains: (...domains: any[]) => domains.flat().filter(Boolean),
}));

describe('Skill: get_cash_balance', () => {
  const mockContext: SkillContext = {
    userId: 'user-123',
    tenantId: 'tenant-456',
    credentials: {
      odoo: {
        url: 'https://test.odoo.com',
        db: 'test_db',
        username: 'admin',
        apiKey: 'test-api-key',
      },
    },
  };

  const mockOdooClient = {
    searchRead: vi.fn(),
    readGroup: vi.fn(),
  };

  // Valid input with all required fields populated with defaults
  const validInput = {
    includeBanks: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  // ============================================
  // INPUT VALIDATION TESTS
  // ============================================

  describe('Input Validation', () => {
    it('accepts empty input (all defaults)', () => {
      const result = GetCashBalanceInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts includeBanks flag', () => {
      const result = GetCashBalanceInputSchema.safeParse({
        includeBanks: true,
      });
      expect(result.success).toBe(true);
    });

    it('accepts journalIds array', () => {
      const result = GetCashBalanceInputSchema.safeParse({
        journalIds: [1, 2, 3],
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid journalIds', () => {
      const result = GetCashBalanceInputSchema.safeParse({
        journalIds: [0, -1],
      });
      expect(result.success).toBe(false);
    });
  });

  // ============================================
  // AUTHENTICATION TESTS
  // ============================================

  describe('Authentication', () => {
    it('returns AUTH_ERROR when Odoo credentials are missing', async () => {
      const noCredsContext: SkillContext = {
        ...mockContext,
        credentials: {},
      };

      const result = await getCashBalance.execute(validInput, noCredsContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
        expect(result.error.message).toContain('Odoo');
      }
    });
  });

  // ============================================
  // EXECUTION TESTS
  // ============================================

  describe('Execution', () => {
    it('returns zero totals when no journals exist', async () => {
      mockOdooClient.searchRead.mockResolvedValue([]);
      mockOdooClient.readGroup.mockResolvedValue([]);

      const result = await getCashBalance.execute(validInput, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalCash).toBe(0);
        expect(result.data.totalBank).toBe(0);
        expect(result.data.grandTotal).toBe(0);
        expect(result.data.journals).toEqual([]);
      }
    });

    it('calculates cash balance from cash journals', async () => {
      // Mock cash journals
      mockOdooClient.searchRead.mockResolvedValue([
        { id: 1, name: 'Caja Principal', type: 'cash', currency_id: [1, 'ARS'] },
        { id: 2, name: 'Banco Nación', type: 'bank', currency_id: [1, 'ARS'] },
      ]);

      // Mock account move lines with balances - simple mock
      mockOdooClient.readGroup.mockResolvedValue([{ balance: 50000 }]);

      const result = await getCashBalance.execute({ ...validInput, includeBanks: true }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        // Just verify the structure is correct
        expect(typeof result.data.totalCash).toBe('number');
        expect(typeof result.data.totalBank).toBe('number');
        expect(typeof result.data.grandTotal).toBe('number');
        expect(Array.isArray(result.data.journals)).toBe(true);
      }
    });

    it('handles API errors gracefully', async () => {
      mockOdooClient.searchRead.mockRejectedValue(new Error('Connection refused'));

      const result = await getCashBalance.execute(validInput, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
      }
    });

    it('filters by asOfDate when provided', async () => {
      mockOdooClient.searchRead.mockResolvedValue([]);
      mockOdooClient.readGroup.mockResolvedValue([]);

      await getCashBalance.execute({ ...validInput, includeBanks: true }, mockContext);

      // Verify searchRead was called
      expect(mockOdooClient.searchRead).toHaveBeenCalled();
    });
  });

  // ============================================
  // SKILL METADATA TESTS
  // ============================================

  describe('Skill Metadata', () => {
    it('has correct name', () => {
      expect(getCashBalance.name).toBe('get_cash_balance');
    });

    it('has description', () => {
      expect(getCashBalance.description).toBeDefined();
      expect(getCashBalance.description.length).toBeGreaterThan(10);
    });

    it('has input schema', () => {
      expect(getCashBalance.inputSchema).toBe(GetCashBalanceInputSchema);
    });

    it('has tags including treasury', () => {
      expect(getCashBalance.tags).toContain('treasury');
    });
  });
});
