/**
 * Tests for compare_sales_periods skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { compareSalesPeriods, CompareSalesPeriodsInputSchema } from '../compare-sales-periods';
import type { SkillContext } from '../../types';
import * as clientModule from '../_client';

// Mock the Odoo client module
vi.mock('../_client', () => ({
  createOdooClient: vi.fn(),
  dateRange: (field: string, start: string, end: string) => [
    [field, '>=', start],
    [field, '<=', end],
  ],
  stateFilter: (state: string) => {
    if (state === 'confirmed') return [['state', 'in', ['sale', 'done']]];
    if (state === 'draft') return [['state', '=', 'draft']];
    return [];
  },
  combineDomains: (...domains: any[]) => domains.flat().filter(Boolean),
}));

describe('Skill: compare_sales_periods', () => {
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

  const validInput = {
    currentPeriod: {
      start: '2025-01-08',
      end: '2025-01-15',
      label: 'Esta semana',
    },
    previousPeriod: {
      start: '2025-01-01',
      end: '2025-01-07',
      label: 'Semana pasada',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  // ============================================
  // INPUT VALIDATION TESTS
  // ============================================

  describe('Input Validation', () => {
    it('accepts valid periods', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse(validInput);
      expect(result.success).toBe(true);
    });

    it('requires currentPeriod', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse({
        previousPeriod: validInput.previousPeriod,
      });
      expect(result.success).toBe(false);
    });

    it('requires previousPeriod', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse({
        currentPeriod: validInput.currentPeriod,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date in currentPeriod', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse({
        ...validInput,
        currentPeriod: { start: '15/01/2025', end: '2025-01-15' },
      });
      expect(result.success).toBe(false);
    });

    it('accepts optional state filter', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse({
        ...validInput,
        state: 'all',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional includeProducts flag', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse({
        ...validInput,
        includeProducts: true,
        limit: 5,
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional includeCustomers flag', () => {
      const result = CompareSalesPeriodsInputSchema.safeParse({
        ...validInput,
        includeCustomers: true,
      });
      expect(result.success).toBe(true);
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

      const result = await compareSalesPeriods.execute(validInput, noCredsContext);

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
    it('returns comparison with zero sales when no orders exist', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);
      mockOdooClient.searchRead.mockResolvedValue([]);

      const result = await compareSalesPeriods.execute(validInput, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current.totalSales).toBe(0);
        expect(result.data.previous.totalSales).toBe(0);
        expect(result.data.salesChange).toBe(0);
        expect(result.data.trend).toBe('stable');
      }
    });

    it('calculates positive trend when current > previous', async () => {
      // Mock current period - higher sales
      mockOdooClient.readGroup.mockResolvedValueOnce([{ amount_total: 100000 }]);
      mockOdooClient.searchRead.mockResolvedValueOnce([
        { id: 1, partner_id: [1, 'Cliente'] },
        { id: 2, partner_id: [2, 'Cliente 2'] },
      ]);

      // Mock previous period - lower sales
      mockOdooClient.readGroup.mockResolvedValueOnce([{ amount_total: 50000 }]);
      mockOdooClient.searchRead.mockResolvedValueOnce([
        { id: 3, partner_id: [1, 'Cliente'] },
      ]);

      const result = await compareSalesPeriods.execute(validInput, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current.totalSales).toBe(100000);
        expect(result.data.previous.totalSales).toBe(50000);
        expect(result.data.salesChange).toBe(50000);
        expect(result.data.salesChangePercent).toBe(100); // 100% increase
        expect(result.data.trend).toBe('up');
      }
    });

    it('calculates negative trend when current < previous', async () => {
      // Mock current period - lower sales
      mockOdooClient.readGroup.mockResolvedValueOnce([{ amount_total: 40000 }]);
      mockOdooClient.searchRead.mockResolvedValueOnce([{ id: 1, partner_id: [1, 'Cliente'] }]);

      // Mock previous period - higher sales
      mockOdooClient.readGroup.mockResolvedValueOnce([{ amount_total: 100000 }]);
      mockOdooClient.searchRead.mockResolvedValueOnce([
        { id: 2, partner_id: [1, 'Cliente'] },
        { id: 3, partner_id: [2, 'Cliente 2'] },
      ]);

      const result = await compareSalesPeriods.execute(validInput, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.current.totalSales).toBe(40000);
        expect(result.data.previous.totalSales).toBe(100000);
        expect(result.data.salesChange).toBe(-60000);
        expect(result.data.salesChangePercent).toBe(-60);
        expect(result.data.trend).toBe('down');
      }
    });

    it('shows stable trend for small differences', async () => {
      // Mock current period
      mockOdooClient.readGroup.mockResolvedValueOnce([{ amount_total: 100000 }]);
      mockOdooClient.searchRead.mockResolvedValueOnce([{ id: 1, partner_id: [1, 'Cliente'] }]);

      // Mock previous period - similar sales (within 5%)
      mockOdooClient.readGroup.mockResolvedValueOnce([{ amount_total: 98000 }]);
      mockOdooClient.searchRead.mockResolvedValueOnce([{ id: 2, partner_id: [1, 'Cliente'] }]);

      const result = await compareSalesPeriods.execute(validInput, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.trend).toBe('stable');
      }
    });

    it('handles API errors gracefully', async () => {
      mockOdooClient.readGroup.mockRejectedValue(new Error('Network error'));

      const result = await compareSalesPeriods.execute(validInput, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
      }
    });
  });

  // ============================================
  // SKILL METADATA TESTS
  // ============================================

  describe('Skill Metadata', () => {
    it('has correct name', () => {
      expect(compareSalesPeriods.name).toBe('compare_sales_periods');
    });

    it('has description', () => {
      expect(compareSalesPeriods.description).toBeDefined();
      expect(compareSalesPeriods.description.length).toBeGreaterThan(10);
    });

    it('has input schema', () => {
      expect(compareSalesPeriods.inputSchema).toBe(CompareSalesPeriodsInputSchema);
    });

    it('has tags including sales and analytics', () => {
      expect(compareSalesPeriods.tags).toContain('sales');
    });
  });
});
