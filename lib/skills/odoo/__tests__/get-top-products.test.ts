/**
 * Tests for get_top_products skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTopProducts, GetTopProductsInputSchema } from '../get-top-products';
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

describe('Skill: get_top_products', () => {
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
      const result = GetTopProductsInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
      }
    });

    it('accepts sortBy parameter', () => {
      const result = GetTopProductsInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
        sortBy: 'quantity',
      });
      expect(result.success).toBe(true);
    });

    it('accepts sortBy amount', () => {
      const result = GetTopProductsInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
        sortBy: 'amount',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('Authentication', () => {
    it('returns AUTH_ERROR when credentials missing', async () => {
      const result = await getTopProducts.execute(
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

      const result = await getTopProducts.execute(
        { period: { start: '2025-01-01', end: '2025-01-31' } },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.products).toEqual([]);
      }
    });

    it('returns products sorted by sales amount', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { product_id: [1, '[SKU001] Producto Top'], price_subtotal: 80000, product_uom_qty: 100 },
        { product_id: [2, '[SKU002] Producto Medio'], price_subtotal: 40000, product_uom_qty: 200 },
        { product_id: [3, '[SKU003] Producto Bajo'], price_subtotal: 20000, product_uom_qty: 50 },
      ]);

      const result = await getTopProducts.execute(
        { period: { start: '2025-01-01', end: '2025-01-31' }, limit: 3 },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.products).toHaveLength(3);
        expect(result.data.products[0].productId).toBe(1);
      }
    });

    it('handles API errors gracefully', async () => {
      mockOdooClient.readGroup.mockRejectedValue(new Error('Timeout'));

      const result = await getTopProducts.execute(
        { period: { start: '2025-01-01', end: '2025-01-31' } },
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(['API_ERROR', 'TIMEOUT']).toContain(result.error.code);
      }
    });
  });

  describe('Metadata', () => {
    it('has correct name', () => {
      expect(getTopProducts.name).toBe('get_top_products');
    });

    it('has tags', () => {
      expect(getTopProducts.tags).toContain('sales');
    });
  });
});
