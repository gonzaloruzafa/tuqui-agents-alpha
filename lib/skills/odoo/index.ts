/**
 * Odoo Skills Index
 *
 * Exports all Odoo-related skills for registration in the global registry.
 */

// Client and helpers
export * from './_client';

// Sales Skills
export { getSalesTotal, type GetSalesTotalInput, type GetSalesTotalOutput } from './get-sales-total';
export { getSalesByCustomer, type GetSalesByCustomerInput, type GetSalesByCustomerOutput } from './get-sales-by-customer';
export { getSalesByProduct } from './get-sales-by-product';
export { getSalesBySeller } from './get-sales-by-seller';
export { getTopProducts } from './get-top-products';
export { getTopCustomers } from './get-top-customers';
export { getProductSalesHistory } from './get-product-sales-history';
export { getPendingSaleOrders } from './get-pending-sale-orders';

// Invoice/Debt Skills
export { getDebtByCustomer, type GetDebtByCustomerInput, type GetDebtByCustomerOutput } from './get-debt-by-customer';
export { getInvoicesByCustomer } from './get-invoices-by-customer';
export { getOverdueInvoices } from './get-overdue-invoices';

// Stock Skills
export { getProductStock, type GetProductStockInput, type GetProductStockOutput } from './get-product-stock';
export { getLowStockProducts } from './get-low-stock-products';
export { getStockValuation } from './get-stock-valuation';

// Payment Skills
export { getPaymentsReceived, type GetPaymentsReceivedInput, type GetPaymentsReceivedOutput } from './get-payments-received';

// Purchase Skills
export { getPurchaseOrders } from './get-purchase-orders';
export { getPurchasesBySupplier } from './get-purchases-by-supplier';
export { getVendorBills } from './get-vendor-bills';

// Search Skills
export { searchCustomers } from './search-customers';
export { searchProducts } from './search-products';

// Accounting Skills
export { getCustomerBalance } from './get-customer-balance';

// Treasury Skills
export { getCashBalance, type GetCashBalanceInput, type GetCashBalanceOutput } from './get-cash-balance';
export { getAccountsReceivable, type GetAccountsReceivableInput, type GetAccountsReceivableOutput } from './get-accounts-receivable';

// Comparison Skills
export { compareSalesPeriods, type CompareSalesPeriodsInput, type CompareSalesPeriodsOutput } from './compare-sales-periods';

// Skill array for registration
import { getSalesTotal } from './get-sales-total';
import { getSalesByCustomer } from './get-sales-by-customer';
import { getSalesByProduct } from './get-sales-by-product';
import { getSalesBySeller } from './get-sales-by-seller';
import { getTopProducts } from './get-top-products';
import { getTopCustomers } from './get-top-customers';
import { getProductSalesHistory } from './get-product-sales-history';
import { getDebtByCustomer } from './get-debt-by-customer';
import { getInvoicesByCustomer } from './get-invoices-by-customer';
import { getOverdueInvoices } from './get-overdue-invoices';
import { getProductStock } from './get-product-stock';
import { getLowStockProducts } from './get-low-stock-products';
import { getStockValuation } from './get-stock-valuation';
import { getPaymentsReceived } from './get-payments-received';
import { getPurchaseOrders } from './get-purchase-orders';
import { getPurchasesBySupplier } from './get-purchases-by-supplier';
import { getVendorBills } from './get-vendor-bills';
import { searchCustomers } from './search-customers';
import { searchProducts } from './search-products';
import { getCustomerBalance } from './get-customer-balance';
import { getCashBalance } from './get-cash-balance';
import { getAccountsReceivable } from './get-accounts-receivable';
import { compareSalesPeriods } from './compare-sales-periods';
import { getPendingSaleOrders } from './get-pending-sale-orders';

export const odooSkills = [
  // Sales (9)
  getSalesTotal,
  getSalesByCustomer,
  getSalesByProduct,
  getSalesBySeller,
  getTopProducts,
  getTopCustomers,
  getProductSalesHistory,
  compareSalesPeriods,
  getPendingSaleOrders, // NEW
  // Invoices/Debt (3)
  getDebtByCustomer,
  getInvoicesByCustomer,
  getOverdueInvoices,
  // Stock (3)
  getProductStock,
  getLowStockProducts,
  getStockValuation,
  // Payments (1)
  getPaymentsReceived,
  // Purchases (3)
  getPurchaseOrders,
  getPurchasesBySupplier,
  getVendorBills,
  // Search (2)
  searchCustomers,
  searchProducts,
  // Accounting/Treasury (3)
  getCustomerBalance,
  getCashBalance, // NEW
  getAccountsReceivable, // NEW
];
