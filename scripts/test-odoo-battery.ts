/**
 * Batería de Tests para Tuqui Odoo
 * 
 * Ejecuta 100 consultas típicas y reporta errores
 * 
 * Run: npx tsx scripts/test-odoo-battery.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { getOdooClient } from '../lib/tools/odoo/client'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

interface TestCase {
    id: number
    category: string
    description: string
    model: string
    domain: any[]
    fields: string[]
    limit?: number
    expectError?: boolean
}

// Batería de 100 tests
const testCases: TestCase[] = [
    // ========== FACTURAS (account.move) ==========
    // Básicos
    { id: 1, category: 'Facturas', description: 'Todas las facturas', model: 'account.move', domain: [], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 2, category: 'Facturas', description: 'Facturas publicadas', model: 'account.move', domain: [['state', '=', 'posted']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 3, category: 'Facturas', description: 'Facturas de cliente (out_invoice)', model: 'account.move', domain: [['move_type', '=', 'out_invoice']], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 4, category: 'Facturas', description: 'Facturas de proveedor (in_invoice)', model: 'account.move', domain: [['move_type', '=', 'in_invoice']], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 5, category: 'Facturas', description: 'Facturas por cobrar (amount_residual > 0)', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0]], fields: ['name', 'partner_id', 'amount_total', 'amount_residual'], limit: 10 },
    { id: 6, category: 'Facturas', description: 'Facturas payment_state not_paid', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['payment_state', '=', 'not_paid']], fields: ['name', 'partner_id', 'amount_residual'], limit: 10 },
    { id: 7, category: 'Facturas', description: 'Facturas payment_state paid', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['payment_state', '=', 'paid']], fields: ['name', 'partner_id'], limit: 10 },
    { id: 8, category: 'Facturas', description: 'Facturas con invoice_date', model: 'account.move', domain: [['invoice_date', '>=', '2025-01-01']], fields: ['name', 'invoice_date', 'amount_total'], limit: 10 },
    { id: 9, category: 'Facturas', description: 'Facturas diciembre 2024', model: 'account.move', domain: [['invoice_date', '>=', '2024-12-01'], ['invoice_date', '<=', '2024-12-31']], fields: ['name', 'invoice_date'], limit: 10 },
    { id: 10, category: 'Facturas', description: 'Notas de crédito', model: 'account.move', domain: [['move_type', 'in', ['out_refund', 'in_refund']]], fields: ['name', 'amount_total'], limit: 10 },
    
    // Campos específicos de facturas
    { id: 11, category: 'Facturas', description: 'Campo amount_residual', model: 'account.move', domain: [['state', '=', 'posted']], fields: ['name', 'amount_residual'], limit: 5 },
    { id: 12, category: 'Facturas', description: 'Campo invoice_date_due', model: 'account.move', domain: [['state', '=', 'posted']], fields: ['name', 'invoice_date_due'], limit: 5 },
    { id: 13, category: 'Facturas', description: 'Campo currency_id', model: 'account.move', domain: [], fields: ['name', 'currency_id'], limit: 5 },
    { id: 14, category: 'Facturas', description: 'Campo ref (referencia)', model: 'account.move', domain: [], fields: ['name', 'ref'], limit: 5 },
    { id: 15, category: 'Facturas', description: 'Campo invoice_origin', model: 'account.move', domain: [], fields: ['name', 'invoice_origin'], limit: 5 },
    
    // ========== VENTAS (sale.order) ==========
    { id: 16, category: 'Ventas', description: 'Todas las ventas', model: 'sale.order', domain: [], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 17, category: 'Ventas', description: 'Ventas confirmadas (state=sale)', model: 'sale.order', domain: [['state', '=', 'sale']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 18, category: 'Ventas', description: 'Ventas en borrador', model: 'sale.order', domain: [['state', '=', 'draft']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 19, category: 'Ventas', description: 'Ventas con date_order', model: 'sale.order', domain: [['date_order', '>=', '2025-01-01']], fields: ['name', 'date_order'], limit: 10 },
    { id: 20, category: 'Ventas', description: 'Ventas diciembre', model: 'sale.order', domain: [['date_order', '>=', '2024-12-01'], ['date_order', '<=', '2024-12-31']], fields: ['name', 'date_order'], limit: 10 },
    
    // Campos específicos de ventas
    { id: 21, category: 'Ventas', description: 'Campo client_order_ref', model: 'sale.order', domain: [], fields: ['name', 'client_order_ref'], limit: 5 },
    { id: 22, category: 'Ventas', description: 'Campo pricelist_id', model: 'sale.order', domain: [], fields: ['name', 'pricelist_id'], limit: 5 },
    { id: 23, category: 'Ventas', description: 'Campo user_id (vendedor)', model: 'sale.order', domain: [], fields: ['name', 'user_id'], limit: 5 },
    { id: 24, category: 'Ventas', description: 'Campo team_id (equipo)', model: 'sale.order', domain: [], fields: ['name', 'team_id'], limit: 5 },
    { id: 25, category: 'Ventas', description: 'Campo amount_untaxed', model: 'sale.order', domain: [], fields: ['name', 'amount_untaxed', 'amount_tax'], limit: 5 },
    
    // ========== CLIENTES (res.partner) ==========
    { id: 26, category: 'Clientes', description: 'Todos los partners', model: 'res.partner', domain: [], fields: ['name', 'email'], limit: 10 },
    { id: 27, category: 'Clientes', description: 'Solo clientes (customer_rank > 0)', model: 'res.partner', domain: [['customer_rank', '>', 0]], fields: ['name', 'customer_rank'], limit: 10 },
    { id: 28, category: 'Clientes', description: 'Solo proveedores (supplier_rank > 0)', model: 'res.partner', domain: [['supplier_rank', '>', 0]], fields: ['name', 'supplier_rank'], limit: 10 },
    { id: 29, category: 'Clientes', description: 'Partners empresas (is_company=true)', model: 'res.partner', domain: [['is_company', '=', true]], fields: ['name', 'is_company'], limit: 10 },
    { id: 30, category: 'Clientes', description: 'Partners personas (is_company=false)', model: 'res.partner', domain: [['is_company', '=', false]], fields: ['name', 'is_company'], limit: 10 },
    
    // Campos específicos de partners
    { id: 31, category: 'Clientes', description: 'Campo vat (CUIT)', model: 'res.partner', domain: [], fields: ['name', 'vat'], limit: 5 },
    { id: 32, category: 'Clientes', description: 'Campo phone', model: 'res.partner', domain: [], fields: ['name', 'phone', 'mobile'], limit: 5 },
    { id: 33, category: 'Clientes', description: 'Campo city, country', model: 'res.partner', domain: [], fields: ['name', 'city', 'country_id'], limit: 5 },
    { id: 34, category: 'Clientes', description: 'Campo credit_limit', model: 'res.partner', domain: [], fields: ['name', 'credit_limit'], limit: 5 },
    { id: 35, category: 'Clientes', description: 'Campo total_invoiced', model: 'res.partner', domain: [], fields: ['name', 'total_invoiced'], limit: 5 },
    
    // ========== PRODUCTOS (product.template) ==========
    { id: 36, category: 'Productos', description: 'Todos los productos', model: 'product.template', domain: [], fields: ['name', 'list_price'], limit: 10 },
    { id: 37, category: 'Productos', description: 'Productos activos', model: 'product.template', domain: [['active', '=', true]], fields: ['name', 'list_price'], limit: 10 },
    { id: 38, category: 'Productos', description: 'Productos vendibles', model: 'product.template', domain: [['sale_ok', '=', true]], fields: ['name', 'list_price'], limit: 10 },
    { id: 39, category: 'Productos', description: 'Productos comprables', model: 'product.template', domain: [['purchase_ok', '=', true]], fields: ['name', 'list_price'], limit: 10 },
    { id: 40, category: 'Productos', description: 'Productos con stock', model: 'product.template', domain: [['type', '=', 'product']], fields: ['name', 'qty_available'], limit: 10 },
    
    // Campos específicos de productos
    { id: 41, category: 'Productos', description: 'Campo default_code (SKU)', model: 'product.template', domain: [], fields: ['name', 'default_code'], limit: 5 },
    { id: 42, category: 'Productos', description: 'Campo categ_id', model: 'product.template', domain: [], fields: ['name', 'categ_id'], limit: 5 },
    { id: 43, category: 'Productos', description: 'Campo standard_price (costo)', model: 'product.template', domain: [], fields: ['name', 'standard_price', 'list_price'], limit: 5 },
    { id: 44, category: 'Productos', description: 'Campo type (consu/service/product)', model: 'product.template', domain: [], fields: ['name', 'type'], limit: 5 },
    { id: 45, category: 'Productos', description: 'Campo virtual_available', model: 'product.template', domain: [], fields: ['name', 'qty_available', 'virtual_available'], limit: 5 },
    
    // ========== COMPRAS (purchase.order) ==========
    { id: 46, category: 'Compras', description: 'Todas las compras', model: 'purchase.order', domain: [], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 47, category: 'Compras', description: 'Compras confirmadas', model: 'purchase.order', domain: [['state', '=', 'purchase']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 48, category: 'Compras', description: 'Compras en borrador', model: 'purchase.order', domain: [['state', '=', 'draft']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 49, category: 'Compras', description: 'Compras con date_order', model: 'purchase.order', domain: [['date_order', '>=', '2025-01-01']], fields: ['name', 'date_order'], limit: 10 },
    { id: 50, category: 'Compras', description: 'Compras por proveedor', model: 'purchase.order', domain: [], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    
    // ========== STOCK (stock.picking, stock.quant) ==========
    { id: 51, category: 'Stock', description: 'Movimientos de stock', model: 'stock.picking', domain: [], fields: ['name', 'partner_id', 'state'], limit: 10 },
    { id: 52, category: 'Stock', description: 'Entregas pendientes', model: 'stock.picking', domain: [['state', 'in', ['assigned', 'waiting']]], fields: ['name', 'scheduled_date'], limit: 10 },
    { id: 53, category: 'Stock', description: 'Entregas completadas', model: 'stock.picking', domain: [['state', '=', 'done']], fields: ['name', 'date_done'], limit: 10 },
    { id: 54, category: 'Stock', description: 'Stock quants', model: 'stock.quant', domain: [], fields: ['product_id', 'location_id', 'quantity'], limit: 10 },
    { id: 55, category: 'Stock', description: 'Stock por ubicación', model: 'stock.quant', domain: [['quantity', '>', 0]], fields: ['product_id', 'quantity'], limit: 10 },
    
    // ========== CONTABILIDAD ==========
    { id: 56, category: 'Contabilidad', description: 'Asientos contables', model: 'account.move.line', domain: [], fields: ['name', 'debit', 'credit'], limit: 10 },
    { id: 57, category: 'Contabilidad', description: 'Cuentas contables', model: 'account.account', domain: [], fields: ['name', 'code'], limit: 10 },
    { id: 58, category: 'Contabilidad', description: 'Pagos', model: 'account.payment', domain: [], fields: ['name', 'amount', 'state'], limit: 10 },
    { id: 59, category: 'Contabilidad', description: 'Pagos confirmados', model: 'account.payment', domain: [['state', '=', 'posted']], fields: ['name', 'amount'], limit: 10 },
    { id: 60, category: 'Contabilidad', description: 'Diarios', model: 'account.journal', domain: [], fields: ['name', 'type'], limit: 10 },
    
    // ========== ERRORES ESPERADOS (campos incorrectos) ==========
    { id: 61, category: 'Error', description: 'account.move con date_order (error)', model: 'account.move', domain: [['date_order', '>=', '2025-01-01']], fields: ['name'], limit: 5, expectError: true },
    { id: 62, category: 'Error', description: 'sale.order con invoice_date (error)', model: 'sale.order', domain: [['invoice_date', '>=', '2025-01-01']], fields: ['name'], limit: 5, expectError: true },
    { id: 63, category: 'Error', description: 'res.partner con partner_id (error)', model: 'res.partner', domain: [['partner_id', '!=', false]], fields: ['name'], limit: 5, expectError: true },
    { id: 64, category: 'Error', description: 'res.partner con amount_total (error)', model: 'res.partner', domain: [], fields: ['name', 'amount_total'], limit: 5, expectError: true },
    { id: 65, category: 'Error', description: 'product con partner_id (error)', model: 'product.template', domain: [['partner_id', '!=', false]], fields: ['name'], limit: 5, expectError: true },
    
    // ========== CONSULTAS COMPLEJAS ==========
    { id: 66, category: 'Complejo', description: 'Facturas > $100000', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['amount_total', '>', 100000]], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 67, category: 'Complejo', description: 'Clientes con email', model: 'res.partner', domain: [['email', '!=', false], ['is_company', '=', true]], fields: ['name', 'email'], limit: 10 },
    { id: 68, category: 'Complejo', description: 'Productos sin stock', model: 'product.template', domain: [['type', '=', 'product'], ['qty_available', '<=', 0]], fields: ['name', 'qty_available'], limit: 10 },
    { id: 69, category: 'Complejo', description: 'Ventas último mes', model: 'sale.order', domain: [['state', '=', 'sale'], ['date_order', '>=', '2024-11-01']], fields: ['name', 'amount_total'], limit: 20 },
    { id: 70, category: 'Complejo', description: 'Facturas vencidas', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0], ['invoice_date_due', '<', new Date().toISOString().split('T')[0]]], fields: ['name', 'partner_id', 'amount_residual', 'invoice_date_due'], limit: 20 },
    
    // ========== AGREGACIONES ==========
    { id: 71, category: 'Agregación', description: 'Total facturas cliente', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted']], fields: ['amount_total'], limit: 500 },
    { id: 72, category: 'Agregación', description: 'Total ventas', model: 'sale.order', domain: [['state', '=', 'sale']], fields: ['amount_total'], limit: 500 },
    { id: 73, category: 'Agregación', description: 'Count clientes', model: 'res.partner', domain: [['customer_rank', '>', 0]], fields: ['id'], limit: 1000 },
    { id: 74, category: 'Agregación', description: 'Count productos activos', model: 'product.template', domain: [['active', '=', true]], fields: ['id'], limit: 1000 },
    { id: 75, category: 'Agregación', description: 'Sum amount_residual', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0]], fields: ['amount_residual'], limit: 1000 },
    
    // ========== BÚSQUEDAS POR NOMBRE ==========
    { id: 76, category: 'Búsqueda', description: 'Cliente por nombre (ilike)', model: 'res.partner', domain: [['name', 'ilike', 'adhoc']], fields: ['name', 'email'], limit: 10 },
    { id: 77, category: 'Búsqueda', description: 'Producto por código', model: 'product.template', domain: [['default_code', '!=', false]], fields: ['name', 'default_code'], limit: 10 },
    { id: 78, category: 'Búsqueda', description: 'Factura por número', model: 'account.move', domain: [['name', 'ilike', 'FAC']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 79, category: 'Búsqueda', description: 'Venta por referencia', model: 'sale.order', domain: [['name', 'ilike', 'SO']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 80, category: 'Búsqueda', description: 'Partner por VAT/CUIT', model: 'res.partner', domain: [['vat', '!=', false]], fields: ['name', 'vat'], limit: 10 },
    
    // ========== RELACIONES ==========
    { id: 81, category: 'Relación', description: 'Facturas de un cliente específico', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['partner_id', '!=', false]], fields: ['name', 'partner_id', 'amount_total'], limit: 10 },
    { id: 82, category: 'Relación', description: 'Ventas con líneas', model: 'sale.order.line', domain: [], fields: ['order_id', 'product_id', 'price_total'], limit: 10 },
    { id: 83, category: 'Relación', description: 'Líneas de factura', model: 'account.move.line', domain: [['move_id', '!=', false]], fields: ['move_id', 'product_id', 'price_total'], limit: 10 },
    { id: 84, category: 'Relación', description: 'Productos con categoría', model: 'product.template', domain: [], fields: ['name', 'categ_id'], limit: 10 },
    { id: 85, category: 'Relación', description: 'Partners con país', model: 'res.partner', domain: [['country_id', '!=', false]], fields: ['name', 'country_id'], limit: 10 },
    
    // ========== CASOS EDGE ==========
    { id: 86, category: 'Edge', description: 'Facturas con amount=0', model: 'account.move', domain: [['amount_total', '=', 0]], fields: ['name', 'amount_total'], limit: 10 },
    { id: 87, category: 'Edge', description: 'Partners sin email', model: 'res.partner', domain: [['email', '=', false]], fields: ['name'], limit: 10 },
    { id: 88, category: 'Edge', description: 'Productos precio 0', model: 'product.template', domain: [['list_price', '=', 0]], fields: ['name', 'list_price'], limit: 10 },
    { id: 89, category: 'Edge', description: 'Ventas canceladas', model: 'sale.order', domain: [['state', '=', 'cancel']], fields: ['name', 'amount_total'], limit: 10 },
    { id: 90, category: 'Edge', description: 'Facturas draft', model: 'account.move', domain: [['state', '=', 'draft']], fields: ['name', 'amount_total'], limit: 10 },
    
    // ========== CAMPOS CALCULADOS ==========
    { id: 91, category: 'Calculado', description: 'Partner credit (crédito)', model: 'res.partner', domain: [], fields: ['name', 'credit'], limit: 10 },
    { id: 92, category: 'Calculado', description: 'Partner debit (débito)', model: 'res.partner', domain: [], fields: ['name', 'debit'], limit: 10 },
    { id: 93, category: 'Calculado', description: 'Producto margen', model: 'product.template', domain: [], fields: ['name', 'list_price', 'standard_price'], limit: 10 },
    { id: 94, category: 'Calculado', description: 'Venta amount_tax', model: 'sale.order', domain: [], fields: ['name', 'amount_untaxed', 'amount_tax', 'amount_total'], limit: 10 },
    { id: 95, category: 'Calculado', description: 'Factura amount taxes', model: 'account.move', domain: [['move_type', '=', 'out_invoice']], fields: ['name', 'amount_untaxed', 'amount_tax'], limit: 10 },
    
    // ========== ORDENAMIENTO (implicit) ==========
    { id: 96, category: 'Orden', description: 'Facturas recientes', model: 'account.move', domain: [['state', '=', 'posted']], fields: ['name', 'invoice_date', 'amount_total'], limit: 20 },
    { id: 97, category: 'Orden', description: 'Clientes por nombre', model: 'res.partner', domain: [['customer_rank', '>', 0]], fields: ['name'], limit: 20 },
    { id: 98, category: 'Orden', description: 'Productos por precio', model: 'product.template', domain: [], fields: ['name', 'list_price'], limit: 20 },
    { id: 99, category: 'Orden', description: 'Ventas mayores', model: 'sale.order', domain: [['state', '=', 'sale']], fields: ['name', 'amount_total'], limit: 20 },
    { id: 100, category: 'Orden', description: 'Deuda por cliente (manual)', model: 'account.move', domain: [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0]], fields: ['partner_id', 'amount_residual'], limit: 500 },
]

interface TestResult {
    id: number
    category: string
    description: string
    success: boolean
    error?: string
    count?: number
    sample?: any
    duration: number
}

async function runTests() {
    console.log('🧪 Iniciando batería de tests Odoo...\n')
    console.log(`📊 Total de tests: ${testCases.length}\n`)
    
    const results: TestResult[] = []
    const odoo = await getOdooClient(TENANT_ID)
    
    for (const test of testCases) {
        const start = Date.now()
        try {
            const data = await odoo.searchRead(
                test.model, 
                test.domain, 
                test.fields, 
                test.limit || 10
            )
            
            const duration = Date.now() - start
            
            if (test.expectError) {
                // Esperábamos error pero no hubo
                results.push({
                    id: test.id,
                    category: test.category,
                    description: test.description,
                    success: false,
                    error: 'Se esperaba error pero la consulta funcionó',
                    count: data.length,
                    duration
                })
                console.log(`❌ Test ${test.id}: ${test.description} - DEBIÓ FALLAR`)
            } else {
                results.push({
                    id: test.id,
                    category: test.category,
                    description: test.description,
                    success: true,
                    count: data.length,
                    sample: data[0],
                    duration
                })
                console.log(`✅ Test ${test.id}: ${test.description} (${data.length} resultados, ${duration}ms)`)
            }
        } catch (error: any) {
            const duration = Date.now() - start
            
            if (test.expectError) {
                // Esperábamos error y lo hubo
                results.push({
                    id: test.id,
                    category: test.category,
                    description: test.description,
                    success: true,
                    error: `Error esperado: ${error.message}`,
                    duration
                })
                console.log(`✅ Test ${test.id}: ${test.description} - Error esperado correctamente`)
            } else {
                results.push({
                    id: test.id,
                    category: test.category,
                    description: test.description,
                    success: false,
                    error: error.message,
                    duration
                })
                console.log(`❌ Test ${test.id}: ${test.description}`)
                console.log(`   Error: ${error.message}`)
            }
        }
    }
    
    // Resumen
    console.log('\n' + '='.repeat(60))
    console.log('📊 RESUMEN DE RESULTADOS')
    console.log('='.repeat(60))
    
    const passed = results.filter(r => r.success).length
    const failed = results.filter(r => !r.success).length
    
    console.log(`\n✅ Pasaron: ${passed}`)
    console.log(`❌ Fallaron: ${failed}`)
    console.log(`📈 Tasa de éxito: ${((passed / results.length) * 100).toFixed(1)}%`)
    
    // Errores por categoría
    const errorsByCategory: Record<string, TestResult[]> = {}
    for (const r of results.filter(r => !r.success)) {
        if (!errorsByCategory[r.category]) {
            errorsByCategory[r.category] = []
        }
        errorsByCategory[r.category].push(r)
    }
    
    if (failed > 0) {
        console.log('\n❌ ERRORES POR CATEGORÍA:')
        for (const [cat, errs] of Object.entries(errorsByCategory)) {
            console.log(`\n  ${cat}:`)
            for (const e of errs) {
                console.log(`    - Test ${e.id}: ${e.description}`)
                console.log(`      Error: ${e.error}`)
            }
        }
    }
    
    // Campos que fallan
    const fieldErrors = results.filter(r => !r.success && r.error?.includes('Invalid field'))
    if (fieldErrors.length > 0) {
        console.log('\n⚠️ CAMPOS INVÁLIDOS DETECTADOS:')
        for (const e of fieldErrors) {
            console.log(`  - ${e.description}: ${e.error}`)
        }
    }
    
    // Tests más lentos
    const slowTests = results.filter(r => r.duration > 1000).sort((a, b) => b.duration - a.duration)
    if (slowTests.length > 0) {
        console.log('\n🐢 TESTS LENTOS (>1s):')
        for (const t of slowTests.slice(0, 5)) {
            console.log(`  - Test ${t.id}: ${t.description} (${t.duration}ms)`)
        }
    }
    
    return results
}

// Run
runTests().then(results => {
    console.log('\n✨ Tests completados')
    process.exit(results.some(r => !r.success && !r.error?.includes('esperado')) ? 1 : 0)
}).catch(err => {
    console.error('Error fatal:', err)
    process.exit(1)
})
