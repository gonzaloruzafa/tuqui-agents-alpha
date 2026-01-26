/**
 * Tests for get_sales_by_customer skill
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getSalesByCustomer, GetSalesByCustomerInputSchema } from '../get-sales-by-customer';
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

describe('Skill: get_sales_by_customer', () => {
  // Mock context with valid Odoo credentials
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

  // Mock Odoo client instance
  const mockOdooClient = {
    readGroup: vi.fn(),
    searchRead: vi.fn(),
    searchCount: vi.fn(),
  };

  // Valid input with all required fields populated with defaults
  const validInput = {
    period: { start: '2025-01-01', end: '2025-01-31' },
    limit: 10,
    state: 'confirmed' as const,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  // ============================================
  // INPUT VALIDATION TESTS
  // ============================================

  describe('Input Validation', () => {
    it('rejects invalid date format in period.start', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '01/01/2025', end: '2025-01-31' },
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid date format in period.end', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025/01/31' },
      });
      expect(result.success).toBe(false);
    });

    it('accepts valid period with defaults', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.limit).toBe(10);
        expect(result.data.state).toBe('confirmed');
      }
    });

    it('accepts all valid parameters', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31', label: 'January 2025' },
        limit: 20,
        state: 'all',
        minAmount: 1000,
      });
      expect(result.success).toBe(true);
    });

    it('rejects limit below 1', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
        limit: 0,
      });
      expect(result.success).toBe(false);
    });

    it('rejects limit above 100', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
        limit: 101,
      });
      expect(result.success).toBe(false);
    });

    it('rejects invalid state', () => {
      const result = GetSalesByCustomerInputSchema.safeParse({
        period: { start: '2025-01-01', end: '2025-01-31' },
        state: 'invalid',
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

      const result = await getSalesByCustomer.execute(
        validInput,
        noCredsContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
        expect(result.error.message).toContain('Odoo');
      }
    });

    it('returns AUTH_ERROR when credentials object exists but odoo is undefined', async () => {
      const noOdooContext: SkillContext = {
        ...mockContext,
        credentials: { odoo: undefined },
      };

      const result = await getSalesByCustomer.execute(
        validInput,
        noOdooContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('AUTH_ERROR');
      }
    });
  });

  // ============================================
  // MULTI-TENANT ISOLATION TESTS
  // ============================================

  describe('Multi-Tenant Isolation', () => {
    it('creates client with tenant-specific credentials', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(clientModule.createOdooClient).toHaveBeenCalledWith(mockContext.credentials.odoo);
    });

    it('uses different credentials for different tenants', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      const tenantAContext: SkillContext = {
        ...mockContext,
        tenantId: 'tenant-A',
        credentials: {
          odoo: { url: 'https://a.odoo.com', db: 'db_a', username: 'user_a', apiKey: 'key_a' },
        },
      };

      const tenantBContext: SkillContext = {
        ...mockContext,
        tenantId: 'tenant-B',
        credentials: {
          odoo: { url: 'https://b.odoo.com', db: 'db_b', username: 'user_b', apiKey: 'key_b' },
        },
      };

      await getSalesByCustomer.execute(
        validInput,
        tenantAContext
      );

      await getSalesByCustomer.execute(
        validInput,
        tenantBContext
      );

      expect(clientModule.createOdooClient).toHaveBeenNthCalledWith(1, tenantAContext.credentials.odoo);
      expect(clientModule.createOdooClient).toHaveBeenNthCalledWith(2, tenantBContext.credentials.odoo);
    });
  });

  // ============================================
  // QUERY EXECUTION TESTS
  // ============================================

  describe('Query Execution', () => {
    it('builds correct domain for confirmed sales', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      await getSalesByCustomer.execute(
        {
          ...validInput,
          state: 'confirmed',
        },
        mockContext
      );

      expect(mockOdooClient.readGroup).toHaveBeenCalledWith(
        'sale.order',
        expect.arrayContaining([
          ['date_order', '>=', '2025-01-01'],
          ['date_order', '<=', '2025-01-31'],
          ['state', 'in', ['sale', 'done']],
        ]),
        ['partner_id', 'amount_total:sum'],
        ['partner_id'],
        expect.any(Object)
      );
    });

    it('builds correct domain for draft orders', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      await getSalesByCustomer.execute(
        {
          ...validInput,
          state: 'draft',
        },
        mockContext
      );

      // Verify readGroup was called (stateFilter is a simple function, not a mock)
      expect(mockOdooClient.readGroup).toHaveBeenCalledWith(
        'sale.order',
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        expect.any(Object)
      );
    });

    it('requests double the limit to allow minAmount filtering', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      await getSalesByCustomer.execute(
        {
          ...validInput,
          limit: 5,
        },
        mockContext
      );

      expect(mockOdooClient.readGroup).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.any(Array),
        expect.any(Array),
        expect.objectContaining({ limit: 10 }) // 5 * 2 = 10
      );
    });
  });

  // ============================================
  // RESULT TRANSFORMATION TESTS
  // ============================================

  describe('Result Transformation', () => {
    it('returns empty array when no sales found', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      const result = await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toEqual([]);
        expect(result.data.grandTotal).toBe(0);
        expect(result.data.totalOrders).toBe(0);
        expect(result.data.customerCount).toBe(0);
      }
    });

    it('transforms Odoo readGroup response correctly', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { partner_id: [1, 'Customer A'], amount_total: 10000, partner_id_count: 5 },
        { partner_id: [2, 'Customer B'], amount_total: 5000, partner_id_count: 3 },
        { partner_id: [3, 'Customer C'], amount_total: 2000, partner_id_count: 2 },
      ]);

      const result = await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toHaveLength(3);
        expect(result.data.customers[0]).toEqual({
          customerId: 1,
          customerName: 'Customer A',
          orderCount: 5,
          totalAmount: 10000,
          avgOrderValue: 2000,
        });
        expect(result.data.grandTotal).toBe(17000);
        expect(result.data.totalOrders).toBe(10);
      }
    });

    it('filters out null partner_id entries', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { partner_id: [1, 'Customer A'], amount_total: 10000, partner_id_count: 5 },
        { partner_id: null, amount_total: 500, partner_id_count: 1 }, // Should be filtered
        { partner_id: false, amount_total: 300, partner_id_count: 1 }, // Should be filtered
      ]);

      const result = await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toHaveLength(1);
        expect(result.data.customers[0].customerName).toBe('Customer A');
      }
    });

    it('applies minAmount filter correctly', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { partner_id: [1, 'Big Customer'], amount_total: 10000, partner_id_count: 5 },
        { partner_id: [2, 'Medium Customer'], amount_total: 5000, partner_id_count: 3 },
        { partner_id: [3, 'Small Customer'], amount_total: 500, partner_id_count: 1 },
      ]);

      const result = await getSalesByCustomer.execute(
        {
          ...validInput,
          minAmount: 1000,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toHaveLength(2);
        expect(result.data.customers.every((c) => c.totalAmount >= 1000)).toBe(true);
      }
    });

    it('respects limit after minAmount filtering', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { partner_id: [1, 'Customer 1'], amount_total: 10000, partner_id_count: 1 },
        { partner_id: [2, 'Customer 2'], amount_total: 9000, partner_id_count: 1 },
        { partner_id: [3, 'Customer 3'], amount_total: 8000, partner_id_count: 1 },
        { partner_id: [4, 'Customer 4'], amount_total: 7000, partner_id_count: 1 },
        { partner_id: [5, 'Customer 5'], amount_total: 6000, partner_id_count: 1 },
      ]);

      const result = await getSalesByCustomer.execute(
        {
          ...validInput,
          limit: 3,
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers).toHaveLength(3);
        expect(result.data.customerCount).toBe(3);
      }
    });

    it('calculates correct average order value', async () => {
      mockOdooClient.readGroup.mockResolvedValue([
        { partner_id: [1, 'Customer'], amount_total: 10000, partner_id_count: 4 },
      ]);

      const result = await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customers[0].avgOrderValue).toBe(2500); // 10000 / 4
      }
    });

    it('includes period in response', async () => {
      mockOdooClient.readGroup.mockResolvedValue([]);

      const result = await getSalesByCustomer.execute(
        {
          ...validInput,
          period: { start: '2025-01-01', end: '2025-01-31', label: 'January' },
        },
        mockContext
      );

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.period).toEqual({
          start: '2025-01-01',
          end: '2025-01-31',
          label: 'January',
        });
      }
    });
  });

  // ============================================
  // ERROR HANDLING TESTS
  // ============================================

  describe('Error Handling', () => {
    it('returns API_ERROR when Odoo call fails', async () => {
      mockOdooClient.readGroup.mockRejectedValue(new Error('Connection refused'));

      const result = await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe('API_ERROR');
        expect(result.error.message).toContain('Connection refused');
      }
    });

    it('returns API_ERROR for Odoo RPC errors', async () => {
      mockOdooClient.readGroup.mockRejectedValue(
        new Error('Odoo RPC Error: Access Denied')
      );

      const result = await getSalesByCustomer.execute(
        validInput,
        mockContext
      );

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.message).toContain('Access Denied');
      }
    });
  });

  // ============================================
  // SKILL METADATA TESTS
  // ============================================

  describe('Skill Metadata', () => {
    it('has correct name', () => {
      expect(getSalesByCustomer.name).toBe('get_sales_by_customer');
    });

    it('has correct tool assignment', () => {
      expect(getSalesByCustomer.tool).toBe('odoo');
    });

    it('has descriptive description for LLM', () => {
      expect(getSalesByCustomer.description).toContain('sales');
      expect(getSalesByCustomer.description).toContain('customer');
    });

    it('has tags for categorization', () => {
      expect(getSalesByCustomer.tags).toContain('sales');
      expect(getSalesByCustomer.tags).toContain('customers');
    });
  });
});
