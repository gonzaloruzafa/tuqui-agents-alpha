/**
 * Tests for get_stock_valuation skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getStockValuation, GetStockValuationInputSchema } from '../get-stock-valuation';
import type { SkillContext } from '../../types';
import * as clientModule from '../_client';

vi.mock('../_client', () => ({
  createOdooClient: vi.fn(),
  dateRange: () => [],
  stateFilter: () => [],
  combineDomains: (...domains: any[]) => domains.flat().filter(Boolean),
}));

describe('Skill: get_stock_valuation', () => {
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

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  describe('Input Validation', () => {
    it('accepts empty input with defaults', () => {
      const result = GetStockValuationInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });

    it('accepts warehouse_id parameter', () => {
      const result = GetStockValuationInputSchema.safeParse({
        warehouse_id: 1,
      });
      expect(result.success).toBe(true);
    });

    it('accepts category_id parameter', () => {
      const result = GetStockValuationInputSchema.safeParse({
        category_id: 5,
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('returns AUTH_ERROR when credentials missing', async () => {
      const result = await getStockValuation.execute(
        {},
        { ...mockContext, credentials: {} }
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });
  });

  describe('Execution', () => {
    it('returns zero valuation when no stock exists', async () => {
      mockOdooClient.searchRead.mockResolvedValue([]);
      mockOdooClient.readGroup.mockResolvedValue([]);

      const result = await getStockValuation.execute({}, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.totalValue).toBe(0);
        expect(result.data.productCount).toBe(0);
      }
    });

    it('calculates total stock valuation', async () => {
      mockOdooClient.searchRead.mockResolvedValue([
        { id: 1, name: 'Producto A', qty_available: 100, standard_price: 50 },
        { id: 2, name: 'Producto B', qty_available: 200, standard_price: 25 },
      ]);

      const result = await getStockValuation.execute({}, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        // 100*50 + 200*25 = 5000 + 5000 = 10000
        expect(result.data.totalValue).toBe(10000);
        expect(result.data.productCount).toBe(2);
        expect(result.data.totalQuantity).toBe(300);
      }
    });

    it('handles API errors gracefully', async () => {
      mockOdooClient.searchRead.mockRejectedValue(new Error('Server error'));

      const result = await getStockValuation.execute({}, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
      }
    });
  });

  describe('Metadata', () => {
    it('has correct name', () => {
      expect(getStockValuation.name).toBe('get_stock_valuation');
    });

    it('has tags including stock', () => {
      expect(getStockValuation.tags).toContain('stock');
    });
  });
});
