/**
 * Tests for get_top_customers skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTopCustomers, GetTopCustomersInputSchema } from '../get-top-customers';
import type { SkillContext } from '../../types';
import * as clientModule from '../_client';

vi.mock('../_client', () => ({
  createOdooClient: vi.fn(),
  dateRange: (field: string, start: string, end: string) => [
    [field, '>=', start],
    [field, '<=', end],
  ],
  stateFilter: (state: string) => {
    if (state === 'confirmed') return [['state', 'in', ['sale', 'done']]];
    return [];
  },
  combineDomains: (...domains: any[]) => domains.flat().filter(Boolean),
}));

describe('Skill: get_top_customers', () => {
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
    readGroup: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  describe('Input Validation', () => {
    it('accepts valid period with defaults', () => {
      const result = GetTopCustomersInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('accepts custom limit', () => {
      const result = GetTopCustomersInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
        limit: 5,
      });
      expect(result.success).toBe(true);
    });

    it('rejects invalid dates', () => {
      const result = GetTopCustomersInputSchema.safeParse({
        period: { start: 'invalid', end: '2025-01-31' },
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('returns AUTH_ERROR when credentials missing', async () => {
      const result = await getTopCustomers.execute(
        { period: { start: '2025-01-01', end: '2025-01-31' } },
        { ...mockContext, credentials: {} }
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });
  });

  describe('Execution', () => {
    it('returns empty list when no sales exist', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      const result = await getTopCustomers.execute(
        { period: { start: '2025-01-01', end: '2025-01-31' } },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toEqual([]);
        expect(result.data.totalRevenue).toBe(0);
      }
    });

    it('returns customers sorted by total sales', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { partner_id: [1, 'Cliente Top'], amount_total: 50000, __count: 10 },
        { partner_id: [2, 'Cliente Medio'], amount_total: 25000, __count: 5 },
        { partner_id: [3, 'Cliente Bajo'], amount_total: 10000, __count: 2 },
      ]);

      const result = await getTopCustomers.execute(
        { period: { start: '2025-01-01', end: '2025-01-31' }, limit: 3 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toHaveLength(3);
        expect(result.data.customers[0].customerName).toBe('Cliente Top');
        expect(result.data.totalRevenue).toBe(85000);
      }
    });
  });

  describe('Metadata', () => {
    it('has correct name', () => {
      expect(getTopCustomers.name).toBe('get_top_customers');
    });

    it('has tags', () => {
      expect(getTopCustomers.tags).toContain('sales');
    });
  });
});
