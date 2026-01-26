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

// Invoice/Debt Skills
export { getDebtByCustomer, type GetDebtByCustomerInput, type GetDebtByCustomerOutput } from './get-debt-by-customer';
export { getInvoicesByCustomer } from './get-invoices-by-customer';
export { getOverdueInvoices } from './get-overdue-invoices';

// Stock Skills
export { getProductStock, type GetProductStockInput, type GetProductStockOutput } from './get-product-stock';
export { getLowStockProducts } from './get-low-stock-products';

// Payment Skills
export { getPaymentsReceived, type GetPaymentsReceivedInput, type GetPaymentsReceivedOutput } from './get-payments-received';

// Purchase Skills
export { getPurchaseOrders } from './get-purchase-orders';

// Search Skills
export { searchCustomers } from './search-customers';
export { searchProducts } from './search-products';

// Skill array for registration
import { getSalesTotal } from './get-sales-total';
import { getSalesByCustomer } from './get-sales-by-customer';
import { getSalesByProduct } from './get-sales-by-product';
import { getDebtByCustomer } from './get-debt-by-customer';
import { getInvoicesByCustomer } from './get-invoices-by-customer';
import { getOverdueInvoices } from './get-overdue-invoices';
import { getProductStock } from './get-product-stock';
import { getLowStockProducts } from './get-low-stock-products';
import { getPaymentsReceived } from './get-payments-received';
import { getPurchaseOrders } from './get-purchase-orders';
import { searchCustomers } from './search-customers';
import { searchProducts } from './search-products';

export const odooSkills = [
  // Sales (3)
  getSalesTotal,
  getSalesByCustomer,
  getSalesByProduct,
  // Invoices/Debt (3)
  getDebtByCustomer,
  getInvoicesByCustomer,
  getOverdueInvoices,
  // Stock (2)
  getProductStock,
  getLowStockProducts,
  // Payments (1)
  getPaymentsReceived,
  // Purchases (1)
  getPurchaseOrders,
  // Search (2)
  searchCustomers,
  searchProducts,
];
