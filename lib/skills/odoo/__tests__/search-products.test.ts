/**
 * Tests for search_products skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { searchProducts, SearchProductsInputSchema } from '../search-products';
import type { SkillContext } from '../../types';
import * as clientModule from '../_client';

vi.mock('../_client', () => ({
  createOdooClient: vi.fn(),
  dateRange: () => [],
  stateFilter: () => [],
  combineDomains: (...domains: any[]) => domains.flat().filter(Boolean),
}));

describe('Skill: search_products', () => {
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
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  describe('Input Validation', () => {
    it('requires query parameter', () => {
      const result = SearchProductsInputSchema.safeParse({});
      expect(result.success).toBe(false);
    });

    it('accepts valid query', () => {
      const result = SearchProductsInputSchema.safeParse({
        query: 'producto',
      });
      expect(result.success).toBe(true);
    });

    it('accepts query with limit', () => {
      const result = SearchProductsInputSchema.safeParse({
        query: 'producto',
        limit: 5,
      });
      expect(result.success).toBe(true);
    });

    it('rejects empty query', () => {
      const result = SearchProductsInputSchema.safeParse({
        query: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('Authentication', () => {
    it('returns AUTH_ERROR when credentials missing', async () => {
      const result = await searchProducts.execute(
        { query: 'test' },
        { ...mockContext, credentials: {} }
      );
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });
  });

  describe('Execution', () => {
    it('returns empty list when no products match', async () => {
      mockOdooClient.searchRead.mockResolvedValue([]);

      const result = await searchProducts.execute({ query: 'nonexistent' }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.products).toEqual([]);
      }
    });

    it('returns matching products', async () => {
      mockOdooClient.searchRead.mockResolvedValue([
        {
          id: 1,
          name: 'Producto Test A',
          default_code: 'SKU001',
          barcode: false,
          type: 'product',
          list_price: 100,
          standard_price: 80,
          qty_available: 50,
          virtual_available: 50,
          uom_id: [1, 'Unidades'],
        },
        {
          id: 2,
          name: 'Producto Test B',
          default_code: 'SKU002',
          barcode: false,
          type: 'product',
          list_price: 200,
          standard_price: 150,
          qty_available: 25,
          virtual_available: 25,
          uom_id: [1, 'Unidades'],
        },
      ]);

      const result = await searchProducts.execute({ query: 'Producto Test' }, mockContext);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.products).toHaveLength(2);
        expect(result.data.products[0].name).toBe('Producto Test A');
      }
    });

    it('searches by name and default_code', async () => {
      mockOdooClient.searchRead.mockResolvedValue([]);

      await searchProducts.execute({ query: 'SKU001' }, mockContext);

      expect(mockOdooClient.searchRead).toHaveBeenCalled();
      const callArgs = mockOdooClient.searchRead.mock.calls[0];
      expect(callArgs[0]).toBe('product.product');
    });

    it('respects limit parameter', async () => {
      mockOdooClient.searchRead.mockResolvedValue([]);

      await searchProducts.execute({ query: 'test', limit: 5 }, mockContext);

      const callArgs = mockOdooClient.searchRead.mock.calls[0];
      expect(callArgs[2].limit).toBe(5);
    });

    it('handles API errors gracefully', async () => {
      mockOdooClient.searchRead.mockRejectedValue(new Error('Database error'));

      const result = await searchProducts.execute({ query: 'test' }, mockContext);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
      }
    });
  });

  describe('Metadata', () => {
    it('has correct name', () => {
      expect(searchProducts.name).toBe('search_products');
    });

    it('has description', () => {
      expect(searchProducts.description).toBeDefined();
    });

    it('has tags including products', () => {
      expect(searchProducts.tags).toContain('products');
    });
  });
});
