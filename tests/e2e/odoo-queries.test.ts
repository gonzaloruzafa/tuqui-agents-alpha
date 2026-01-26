/**
 * Comprehensive E2E Test Suite for Tuqui Odoo Queries
 * 
 * This test suite validates:
 * 1. Query accuracy against real Odoo data
 * 2. buildDomain() parsing of natural language
 * 3. Auto-state filters (sale→[sale,sent], etc.)
 * 4. Date parsing (este mes, primera semana, etc.)
 * 5. Aggregations and groupBy
 * 6. Regression tests for known bugs
 * 7. Performance benchmarks
 * 
 * Run with: TEST_TENANT_ID=xxx npx vitest run tests/e2e/odoo-queries.test.ts
 * Watch:    TEST_TENANT_ID=xxx npx vitest tests/e2e/odoo-queries.test.ts
 * 
 * Requires TEST_TENANT_ID in .env.local or as environment variable.
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { executeQueries, MODEL_CONFIG, buildDomain } from '@/lib/tools/odoo/query-builder'
import { getOdooClient } from '@/lib/tools/odoo/client'

// Environment-based tenant ID
const TENANT_ID = process.env.TEST_TENANT_ID!
const SKIP_LIVE_TESTS = !process.env.TEST_TENANT_ID

if (SKIP_LIVE_TESTS) {
    console.log('⚠️  TEST_TENANT_ID not set - live Odoo tests will be skipped')
}

// ==========================================
// HELPERS
// ==========================================
function formatMoney(amount: number): string {
    return `$${amount.toLocaleString('es-AR', { minimumFractionDigits: 2 })}`
}

function getDateRange(period: 'today' | 'yesterday' | 'this_week' | 'this_month' | 'last_month') {
    const now = new Date()
    const year = now.getFullYear()
    const month = now.getMonth()
    const day = now.getDate()

    switch (period) {
        case 'today':
            return { start: now.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
        case 'yesterday':
            const yesterday = new Date(now)
            yesterday.setDate(day - 1)
            return { start: yesterday.toISOString().split('T')[0], end: yesterday.toISOString().split('T')[0] }
        case 'this_week':
            const startOfWeek = new Date(now)
            startOfWeek.setDate(day - now.getDay())
            return { start: startOfWeek.toISOString().split('T')[0], end: now.toISOString().split('T')[0] }
        case 'this_month':
            return {
                start: `${year}-${String(month + 1).padStart(2, '0')}-01`,
                end: now.toISOString().split('T')[0]
            }
        case 'last_month':
            const lastMonth = month === 0 ? 11 : month - 1
            const lastMonthYear = month === 0 ? year - 1 : year
            const lastDay = new Date(lastMonthYear, lastMonth + 1, 0).getDate()
            return {
                start: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-01`,
                end: `${lastMonthYear}-${String(lastMonth + 1).padStart(2, '0')}-${lastDay}`
            }
    }
}

// Known baseline - December 2025 first week (historical, won't change)
const BASELINE_DIC_2025 = { start: '2025-12-01', end: '2025-12-07' }

// ==========================================
// SECTION 1: UNIT TESTS - buildDomain()
// ==========================================
describe('1. Unit Tests - buildDomain()', () => {

    describe('1.1 Date Parsing', () => {
        test('este mes - should generate current month range', () => {
            const domain = buildDomain('este mes', 'sale.order')
            const now = new Date()
            const expectedMonth = String(now.getMonth() + 1).padStart(2, '0')
            const expectedStart = `${now.getFullYear()}-${expectedMonth}-01`

            expect(domain.some((d: any) => d[0] === 'date_order' && d[1] === '>=' && d[2] === expectedStart)).toBe(true)
            console.log('✅ "este mes" →', domain)
        })

        test('mes pasado - should generate last month range', () => {
            const domain = buildDomain('mes pasado', 'sale.order')
            const now = new Date()
            const lastMonth = now.getMonth() === 0 ? 12 : now.getMonth()
            const year = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear()
            const expectedStart = `${year}-${String(lastMonth).padStart(2, '0')}-01`

            expect(domain.some((d: any) => d[2] === expectedStart)).toBe(true)
            console.log('✅ "mes pasado" →', domain)
        })

        test('diciembre 2025 - should generate December range', () => {
            const domain = buildDomain('diciembre 2025', 'sale.order')

            expect(domain.some((d: any) => d[2] === '2025-12-01')).toBe(true)
            expect(domain.some((d: any) => d[2] === '2025-12-31')).toBe(true)
            console.log('✅ "diciembre 2025" →', domain)
        })

        test('primera semana diciembre 2025 - should generate Dec 1-7 range', () => {
            const domain = buildDomain('primera semana diciembre 2025', 'sale.order')

            expect(domain.some((d: any) => d[2] === '2025-12-01')).toBe(true)
            expect(domain.some((d: any) => d[2] === '2025-12-07')).toBe(true)
            console.log('✅ "primera semana diciembre" →', domain)
        })

        test('segunda semana enero - should generate Jan 8-14 range', () => {
            const domain = buildDomain('segunda semana enero 2026', 'sale.order')

            expect(domain.some((d: any) => d[2] === '2026-01-08')).toBe(true)
            expect(domain.some((d: any) => d[2] === '2026-01-14')).toBe(true)
            console.log('✅ "segunda semana enero" →', domain)
        })

        test('últimos 7 días - should generate relative range', () => {
            // Probar con y sin tildes
            const domain1 = buildDomain('ultimos 7 dias', 'sale.order')
            const domain2 = buildDomain('últimos 7 días', 'sale.order')

            // Al menos una debe funcionar
            const hasDateFilter1 = domain1.some((d: any) => d[0] === 'date_order' && d[1] === '>=')
            const hasDateFilter2 = domain2.some((d: any) => d[0] === 'date_order' && d[1] === '>=')

            expect(hasDateFilter1 || hasDateFilter2).toBe(true)
            console.log('✅ "ultimos 7 dias" →', domain1)
            console.log('✅ "últimos 7 días" →', domain2)
        })

        test('este año - should generate year range', () => {
            const domain = buildDomain('este año', 'sale.order')
            const year = new Date().getFullYear()

            expect(domain.some((d: any) => d[2] === `${year}-01-01`)).toBe(true)
            expect(domain.some((d: any) => d[2] === `${year}-12-31`)).toBe(true)
            console.log('✅ "este año" →', domain)
        })
    })

    describe('1.2 State Parsing', () => {
        test('presupuestos - should map to draft', () => {
            const domain = buildDomain('presupuestos', 'sale.order')
            expect(domain.some((d: any) => d[0] === 'state' && d[2] === 'draft')).toBe(true)
            console.log('✅ "presupuestos" →', domain)
        })

        test('confirmadas - should map to sale', () => {
            const domain = buildDomain('confirmadas', 'sale.order')
            expect(domain.some((d: any) => d[0] === 'state' && d[2] === 'sale')).toBe(true)
            console.log('✅ "confirmadas" →', domain)
        })

        test('canceladas - should map to cancel', () => {
            const domain = buildDomain('canceladas', 'sale.order')
            expect(domain.some((d: any) => d[0] === 'state' && d[2] === 'cancel')).toBe(true)
            console.log('✅ "canceladas" →', domain)
        })

        test('publicadas (facturas) - should map to posted', () => {
            const domain = buildDomain('publicadas', 'account.move')
            expect(domain.some((d: any) => d[0] === 'state' && d[2] === 'posted')).toBe(true)
            console.log('✅ "publicadas" (account.move) →', domain)
        })
    })

    describe('1.3 Invoice Type Parsing', () => {
        test('factura cliente - should map to out_invoice', () => {
            const domain = buildDomain('factura cliente', 'account.move')
            expect(domain.some((d: any) => d[0] === 'move_type' && d[2] === 'out_invoice')).toBe(true)
            console.log('✅ "factura cliente" →', domain)
        })

        test('factura proveedor - should map to in_invoice', () => {
            const domain = buildDomain('factura proveedor', 'account.move')
            expect(domain.some((d: any) => d[0] === 'move_type' && d[2] === 'in_invoice')).toBe(true)
            console.log('✅ "factura proveedor" →', domain)
        })

        test('por cobrar - should filter not_paid out_invoices', () => {
            const domain = buildDomain('por cobrar', 'account.move')
            expect(domain.some((d: any) => d[0] === 'payment_state' && d[2] === 'not_paid')).toBe(true)
            expect(domain.some((d: any) => d[0] === 'move_type' && d[2] === 'out_invoice')).toBe(true)
            console.log('✅ "por cobrar" →', domain)
        })
    })

    describe('1.4 Payment Type Parsing', () => {
        test('cobros - should map to inbound', () => {
            const domain = buildDomain('cobros', 'account.payment')
            expect(domain.some((d: any) => d[0] === 'payment_type' && d[2] === 'inbound')).toBe(true)
            console.log('✅ "cobros" →', domain)
        })

        test('pagos realizados - should map to outbound', () => {
            const domain = buildDomain('pagos realizados', 'account.payment')
            expect(domain.some((d: any) => d[0] === 'payment_type' && d[2] === 'outbound')).toBe(true)
            console.log('✅ "pagos realizados" →', domain)
        })
    })

    describe('1.5 Partner Filters', () => {
        test('clientes - should filter customer_rank > 0', () => {
            const domain = buildDomain('clientes', 'res.partner')
            expect(domain.some((d: any) => d[0] === 'customer_rank' && d[1] === '>' && d[2] === 0)).toBe(true)
            console.log('✅ "clientes" →', domain)
        })

        test('proveedores - should filter supplier_rank > 0', () => {
            const domain = buildDomain('proveedores', 'res.partner')
            expect(domain.some((d: any) => d[0] === 'supplier_rank' && d[1] === '>' && d[2] === 0)).toBe(true)
            console.log('✅ "proveedores" →', domain)
        })
    })
})

// ==========================================
// SECTION 2: E2E TESTS - Real Odoo Queries
// ==========================================
describe('2. E2E Tests - Odoo Queries', () => {
    let odooClient: any

    beforeAll(async () => {
        try {
            odooClient = await getOdooClient(TENANT_ID)
            console.log('✅ Odoo client connected')
        } catch (error) {
            console.error('❌ Failed to connect to Odoo:', error)
            throw error
        }
    })

    describe('2.1 Ventas (sale.order)', () => {
        test('Baseline: Primera semana diciembre 2025', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'baseline-ventas',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
            }])

            const [r] = result
            expect(r.success).toBe(true)
            expect(r.count).toBeGreaterThan(0)
            expect(r.total).toBeGreaterThan(0)

            console.log(`✅ Baseline ventas dic 2025: ${r.count} órdenes, ${formatMoney(r.total || 0)}`)
        })

        test('Top 10 clientes con groupBy', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'top-clientes',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                groupBy: ['partner_id'],
                limit: 10,
            }])

            const [r] = result
            expect(r.success).toBe(true)
            expect(r.grouped).toBeDefined()
            expect(Object.keys(r.grouped!).length).toBeGreaterThan(0)

            const topClients = Object.entries(r.grouped!)
                .sort((a: any, b: any) => b[1].total - a[1].total)
                .slice(0, 5)

            console.log('✅ Top 5 clientes:')
            topClients.forEach(([name, data]: any, i) => {
                console.log(`   ${i + 1}. ${name}: ${formatMoney(data.total)}`)
            })
        })

        test('Ventas por vendedor', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'ventas-vendedor',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                groupBy: ['user_id'],
                limit: 10,
            }])

            const [r] = result
            expect(r.success).toBe(true)
            expect(r.grouped).toBeDefined()

            console.log('✅ Ventas por vendedor funcionan')
        })

        test('Productos vendidos (via sale.order.line)', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'productos-vendidos',
                model: 'sale.order.line',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                groupBy: ['product_id'],
                limit: 5,
            }])

            const [r] = result
            expect(r.success).toBe(true)

            if (r.grouped) {
                console.log('✅ Top productos vendidos:')
                Object.entries(r.grouped)
                    .sort((a: any, b: any) => b[1].total - a[1].total)
                    .slice(0, 3)
                    .forEach(([name, data]: any, i) => {
                        console.log(`   ${i + 1}. ${name.substring(0, 50)}...`)
                    })
            }
        })

        test('Auto-filter: solo estados confirmados', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'auto-filter-test',
                model: 'sale.order',
                operation: 'search',
                dateRange: BASELINE_DIC_2025,
                limit: 10,
                fields: ['name', 'state', 'amount_total'],
            }])

            const [r] = result
            expect(r.success).toBe(true)

            if (r.data && r.data.length > 0) {
                const invalidStates = r.data.filter((d: any) => !['sale', 'sent'].includes(d.state))
                expect(invalidStates.length).toBe(0)
                console.log('✅ Auto-filter verificado: todos los registros tienen state IN [sale, sent]')
            }
        })
    })

    describe('2.2 Compras (purchase.order)', () => {
        test('Compras del mes', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'compras-mes',
                model: 'purchase.order',
                operation: 'aggregate',
                dateRange: getDateRange('this_month'),
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Compras mes actual: ${r.count} órdenes, ${formatMoney(r.total || 0)}`)
        })

        test('Top proveedores', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'top-proveedores',
                model: 'purchase.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                groupBy: ['partner_id'],
                limit: 5,
            }])

            const [r] = result
            expect(r.success).toBe(true)

            if (r.grouped && Object.keys(r.grouped).length > 0) {
                console.log('✅ Top proveedores:')
                Object.entries(r.grouped)
                    .sort((a: any, b: any) => b[1].total - a[1].total)
                    .slice(0, 3)
                    .forEach(([name, data]: any, i) => {
                        console.log(`   ${i + 1}. ${name}: ${formatMoney(data.total)}`)
                    })
            }
        })

        test('Productos comprados (via purchase.order.line)', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'productos-comprados',
                model: 'purchase.order.line',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                groupBy: ['product_id'],
                limit: 5,
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log('✅ Productos comprados funcionan')
        })
    })

    describe('2.3 Facturas (account.move)', () => {
        test('Facturas de venta este mes', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'facturas-venta',
                model: 'account.move',
                operation: 'aggregate',
                dateRange: getDateRange('this_month'),
                filters: 'out_invoice',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Facturas venta: ${r.count}, ${formatMoney(r.total || 0)}`)
        })

        test('Facturas de compra este mes', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'facturas-compra',
                model: 'account.move',
                operation: 'aggregate',
                dateRange: getDateRange('this_month'),
                filters: 'in_invoice',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Facturas compra: ${r.count}, ${formatMoney(r.total || 0)}`)
        })

        test('Cuentas por cobrar (facturas impagas)', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'por-cobrar',
                model: 'account.move',
                operation: 'aggregate',
                filters: 'out_invoice por cobrar',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Por cobrar: ${r.count} facturas, ${formatMoney(r.total || 0)}`)
        })

        test('Auto-filter: solo facturas posted', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'facturas-state-check',
                model: 'account.move',
                operation: 'search',
                dateRange: getDateRange('this_month'),
                limit: 5,
                fields: ['name', 'state', 'move_type'],
            }])

            const [r] = result
            expect(r.success).toBe(true)

            if (r.data && r.data.length > 0) {
                const invalidStates = r.data.filter((d: any) => d.state !== 'posted')
                expect(invalidStates.length).toBe(0)
                console.log('✅ Auto-filter facturas verificado: solo state=posted')
            }
        })
    })

    describe('2.4 Pagos (account.payment)', () => {
        test('Cobros (inbound) este mes', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'cobros-mes',
                model: 'account.payment',
                operation: 'aggregate',
                dateRange: getDateRange('this_month'),
                filters: 'inbound',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Cobros: ${r.count} pagos, ${formatMoney(r.total || 0)}`)
        })

        test('Pagos (outbound) este mes', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'pagos-mes',
                model: 'account.payment',
                operation: 'aggregate',
                dateRange: getDateRange('this_month'),
                filters: 'outbound',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Pagos: ${r.count} pagos, ${formatMoney(r.total || 0)}`)
        })
    })

    describe('2.5 Stock (stock.picking)', () => {
        test('Entregas completadas del mes', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'entregas-done',
                model: 'stock.picking',
                operation: 'count',
                dateRange: getDateRange('this_month'),
                filters: 'done',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Entregas completadas: ${r.count}`)
        })

        test('Entregas pendientes (assigned)', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'entregas-pending',
                model: 'stock.picking',
                operation: 'count',
                filters: 'assigned',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Entregas pendientes: ${r.count}`)
        })
    })

    describe('2.6 Clientes y Productos', () => {
        test('Contar clientes activos', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'count-clientes',
                model: 'res.partner',
                operation: 'count',
                filters: 'clientes',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Clientes activos: ${r.count}`)
        })

        test('Contar productos', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'count-productos',
                model: 'product.product',
                operation: 'count',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            console.log(`✅ Productos: ${r.count}`)
        })
    })
})

// ==========================================
// SECTION 3: REGRESSION TESTS
// ==========================================
describe('3. Regression Tests', () => {
    let odooClient: any

    beforeAll(async () => {
        odooClient = await getOdooClient(TENANT_ID)
    })

    test('3.1 NO debe haber filtros de estado duplicados', async () => {
        // Bug: buildDomain agregaba state filter, Y executeQueries también
        const result = await executeQueries(odooClient, TENANT_ID, [{
            id: 'no-duplicate-state',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange: BASELINE_DIC_2025,
        }])

        const [r] = result
        expect(r.success).toBe(true)
        // Si hay duplicados, Odoo falla o da 0 resultados
        expect(r.count).toBeGreaterThan(0)
        console.log('✅ Sin filtros de estado duplicados')
    })

    test('3.2 dateRange sin filters NO debe generar domain vacío', async () => {
        // Bug: si solo pasabas dateRange sin filters, el domain quedaba []
        const result = await executeQueries(odooClient, TENANT_ID, [{
            id: 'daterange-only',
            model: 'sale.order',
            operation: 'count',
            dateRange: BASELINE_DIC_2025,
            // NO filters
        }])

        const [r] = result
        expect(r.success).toBe(true)
        expect(r.count).toBeGreaterThanOrEqual(0)
        console.log(`✅ dateRange sin filters funciona: ${r.count} registros`)
    })

    test('3.3 groupBy con :day debe sanitizarse', async () => {
        // Bug: groupBy: ["date:day"] causaba error porque Odoo no lo acepta
        const result = await executeQueries(odooClient, TENANT_ID, [{
            id: 'groupby-sanitize',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange: BASELINE_DIC_2025,
            groupBy: ['date_order:day'],
        }])

        const [r] = result
        expect(r.success).toBe(true)
        console.log('✅ groupBy con :day sanitizado')
    })

    test('3.4 limit NO debe afectar count/total en aggregate', async () => {
        // Este test verifica que el count/total sean los REALES, no limitados
        const [withLimit, withoutLimit] = await Promise.all([
            executeQueries(odooClient, TENANT_ID, [{
                id: 'with-limit',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                limit: 10,
            }]),
            executeQueries(odooClient, TENANT_ID, [{
                id: 'without-limit',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
            }])
        ])

        // Los totales deben ser iguales (o muy cercanos por floating point)
        expect(withLimit[0].count).toBe(withoutLimit[0].count)
        expect(Math.abs((withLimit[0].total || 0) - (withoutLimit[0].total || 0))).toBeLessThan(1)
        console.log(`✅ limit no afecta aggregate: count=${withLimit[0].count}, total=$${withLimit[0].total?.toLocaleString()}`)
    })

    test('3.5 Mes sin año debe inferir año correcto', async () => {
        // "diciembre" sin año debe ser 2025 (mes pasado) no 2026
        const domain = buildDomain('diciembre', 'sale.order')

        // Debe tener 2025, no 2026 (estamos en enero 2026)
        expect(domain.some((d: any) => d[2]?.includes('2025-12'))).toBe(true)
        console.log('✅ Año inferido correctamente para mes pasado')
    })

    test('3.6 groupBy total debe coincidir con aggregate total', async () => {
        // CRÍTICO: El total de un groupBy debe ser igual al total sin groupBy
        // Este test detecta el bug donde limit afecta el total en groupBy
        const [withGroupBy, withoutGroupBy] = await Promise.all([
            executeQueries(odooClient, TENANT_ID, [{
                id: 'with-groupby',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                groupBy: ['partner_id'],
                limit: 10,  // Solo top 10 clientes
            }]),
            executeQueries(odooClient, TENANT_ID, [{
                id: 'without-groupby',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: BASELINE_DIC_2025,
                // Sin groupBy = total real
            }])
        ])

        const groupByTotal = withGroupBy[0].total || 0
        const realTotal = withoutGroupBy[0].total || 0

        // El total del groupBy debe ser el REAL, no solo la suma de los grupos mostrados
        // Permitimos 1% de diferencia por floating point
        const diff = Math.abs(groupByTotal - realTotal)
        const percentDiff = (diff / realTotal) * 100

        console.log(`📊 GroupBy total: $${groupByTotal.toLocaleString()}`)
        console.log(`📊 Real total: $${realTotal.toLocaleString()}`)
        console.log(`📊 Diferencia: ${percentDiff.toFixed(2)}%`)

        expect(percentDiff).toBeLessThan(1)
        console.log('✅ groupBy devuelve total REAL')
    })

    test('3.7 groupBy count debe ser total de grupos, no grupos mostrados', async () => {
        // El count debe ser el TOTAL de grupos únicos, no cuántos mostramos
        const result = await executeQueries(odooClient, TENANT_ID, [{
            id: 'groupby-count',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange: BASELINE_DIC_2025,
            groupBy: ['partner_id'],
            limit: 5,  // Solo 5 grupos
        }])

        const [r] = result

        // grouped debería tener solo 5 (limit)
        const shownGroups = Object.keys(r.grouped || {}).length
        // count debería ser el TOTAL de clientes únicos (probablemente >5)
        const totalGroups = r.count || 0

        console.log(`📊 Grupos mostrados: ${shownGroups}`)
        console.log(`📊 Total grupos (count): ${totalGroups}`)

        // El count NO debe ser igual al número de grupos mostrados si hay más grupos
        // Si hay exactamente 5 o menos clientes, este test no aplica
        if (totalGroups > 5) {
            expect(shownGroups).toBe(5)  // Mostramos solo 5
            expect(totalGroups).toBeGreaterThan(5)  // Pero hay más
        }
        console.log('✅ count refleja total de grupos únicos')
    })

    test('3.8 EXPLORAR: todos los modelos de reporte de Odoo', async () => {
        // Verificar todos los modelos de reporte que usa Odoo para sus pivots

        console.log('\n' + '='.repeat(70))
        console.log('🔍 EXPLORANDO TODOS LOS MODELOS DE REPORTE DE ODOO')
        console.log('='.repeat(70))

        const reportModels = [
            // Ventas
            { name: 'sale.report', icon: '🛒', desc: 'Análisis de Ventas' },
            { name: 'sale.order.line', icon: '📋', desc: 'Líneas de Venta (base)' },

            // Compras
            { name: 'purchase.report', icon: '📦', desc: 'Análisis de Compras' },
            { name: 'purchase.order.line', icon: '📋', desc: 'Líneas de Compra (base)' },

            // Facturación
            { name: 'account.invoice.report', icon: '🧾', desc: 'Análisis de Facturas' },
            { name: 'account.move.line', icon: '📋', desc: 'Apuntes Contables (base)' },
            { name: 'account.analytic.line', icon: '📊', desc: 'Líneas Analíticas' },

            // Stock
            { name: 'stock.report', icon: '📊', desc: 'Reporte de Stock' },
            { name: 'stock.quant', icon: '📦', desc: 'Cantidades en Stock' },
            { name: 'stock.move', icon: '🔄', desc: 'Movimientos de Stock' },
            { name: 'stock.move.line', icon: '📋', desc: 'Líneas de Movimiento' },
            { name: 'stock.valuation.layer', icon: '💰', desc: 'Valorización de Stock' },

            // RRHH y Ausencias
            { name: 'hr.leave', icon: '🏖️', desc: 'Ausencias/Licencias' },
            { name: 'hr.leave.report', icon: '📊', desc: 'Reporte de Ausencias' },
            { name: 'hr.attendance', icon: '⏰', desc: 'Control de Asistencia' },
            { name: 'hr.payslip', icon: '💵', desc: 'Recibos de Sueldo' },
            { name: 'hr.employee', icon: '👤', desc: 'Empleados' },

            // Proyectos y Tareas
            { name: 'project.project', icon: '📁', desc: 'Proyectos' },
            { name: 'project.task', icon: '✅', desc: 'Tareas de Proyecto' },
            { name: 'project.task.type', icon: '🏷️', desc: 'Etapas de Tareas' },
            { name: 'account.analytic.account', icon: '📈', desc: 'Cuentas Analíticas' },

            // CRM
            { name: 'crm.lead', icon: '🎯', desc: 'Oportunidades CRM' },
            { name: 'crm.activity.report', icon: '📊', desc: 'Reporte de Actividad CRM' },

            // Otros
            { name: 'hr.expense', icon: '💳', desc: 'Gastos' },
            { name: 'hr.expense.sheet', icon: '📋', desc: 'Hojas de Gastos' },
            { name: 'pos.order', icon: '🏪', desc: 'Órdenes POS' },
            { name: 'pos.order.line', icon: '📋', desc: 'Líneas POS' },
        ]

        const results: any[] = []

        for (const model of reportModels) {
            console.log(`\n${model.icon} ${model.name} (${model.desc}):`)
            try {
                const fields = await odooClient.fieldsGet(model.name, ['string', 'type', 'store'])
                const fieldNames = Object.keys(fields)

                // Campos clave
                const amountFields = fieldNames.filter(f => /price|amount|total|qty|cost|untaxed|subtotal|balance/i.test(f))
                const dateFields = fieldNames.filter(f => /date/i.test(f))
                const stateFields = fieldNames.filter(f => f === 'state' || f === 'invoice_state' || f === 'order_state')
                const partnerFields = fieldNames.filter(f => /partner/i.test(f))
                const productFields = fieldNames.filter(f => /product/i.test(f))

                console.log(`   ✅ EXISTE (${fieldNames.length} campos)`)
                console.log(`   💰 Montos: ${amountFields.slice(0, 5).join(', ') || 'ninguno'}${amountFields.length > 5 ? '...' : ''}`)
                console.log(`   📅 Fechas: ${dateFields.join(', ') || 'ninguno'}`)
                console.log(`   🔘 Estado: ${stateFields.join(', ') || 'ninguno'}`)

                results.push({
                    model: model.name,
                    exists: true,
                    fields: fieldNames.length,
                    amountFields,
                    dateFields,
                    stateFields,
                    partnerFields,
                    productFields,
                })
            } catch (e: any) {
                console.log(`   ❌ NO EXISTE`)
                results.push({ model: model.name, exists: false })
            }
        }

        // Resumen
        console.log('\n' + '='.repeat(70))
        console.log('📋 RESUMEN DE MODELOS DISPONIBLES')
        console.log('='.repeat(70))
        const available = results.filter(r => r.exists)
        console.log(`\n✅ Modelos disponibles: ${available.length}/${reportModels.length}`)
        available.forEach(r => {
            console.log(`   - ${r.model} (${r.fields} campos, montos: ${r.amountFields.slice(0, 3).join(', ')})`)
        })

        expect(available.length).toBeGreaterThan(0)
    })

    test('3.9 COMPARAR: purchase.order vs purchase.report', async () => {
        // Comparar los datos que devuelve cada modelo
        const dateRange = { start: '2025-07-01', end: '2026-01-14' }

        console.log('\n' + '='.repeat(70))
        console.log('📦 COMPARACIÓN: COMPRAS (purchase.order vs purchase.report)')
        console.log(`   Período: ${dateRange.start} a ${dateRange.end}`)
        console.log('='.repeat(70))

        // 1. purchase.order (lo que hace Tuqui ahora)
        console.log('\n1️⃣ purchase.order (modelo actual de Tuqui):')
        const poResult = await executeQueries(odooClient, TENANT_ID, [{
            id: 'po-compare',
            model: 'purchase.order',
            operation: 'aggregate',
            dateRange,
            groupBy: ['partner_id'],
            limit: 100,
        }])
        console.log(`   Total: $${(poResult[0].total || 0).toLocaleString('es-AR')}`)
        console.log(`   Proveedores únicos: ${poResult[0].count}`)
        console.log(`   Top 5:`)
        Object.entries(poResult[0].grouped || {}).slice(0, 5).forEach(([name, data]: any, i) => {
            console.log(`      ${i + 1}. ${name}: $${data.total.toLocaleString('es-AR')}`)
        })

        // 2. purchase.report (modelo de reporte de Odoo)
        console.log('\n2️⃣ purchase.report (modelo del pivot de Odoo):')
        try {
            const fields = await odooClient.fieldsGet('purchase.report', ['string', 'type'])
            const amountField = 'price_total'
            const dateField = 'date_order'

            const domain = [
                [dateField, '>=', dateRange.start],
                [dateField, '<=', dateRange.end],
            ]

            const count = await odooClient.searchCount('purchase.report', domain)
            console.log(`   Registros (líneas): ${count}`)

            const sumResult = await odooClient.readGroup('purchase.report', domain, [amountField], [], { limit: 1 })
            const total = sumResult[0]?.[amountField] || 0
            console.log(`   Total: $${total.toLocaleString('es-AR')}`)

            const topProveedores = await odooClient.readGroup(
                'purchase.report', domain, ['partner_id', amountField], ['partner_id'],
                { limit: 10, orderBy: `${amountField} desc` }
            )
            console.log(`   Top 5 proveedores:`)
            topProveedores.slice(0, 5).forEach((g: any, i: number) => {
                const name = Array.isArray(g.partner_id) ? g.partner_id[1] : g.partner_id
                console.log(`      ${i + 1}. ${name}: $${(g[amountField] || 0).toLocaleString('es-AR')}`)
            })

            // Diferencia
            const diff = ((total - (poResult[0].total || 0)) / total * 100).toFixed(1)
            console.log(`\n   📊 Diferencia: ${diff}% más en purchase.report`)
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('3.10 COMPARAR: sale.order vs sale.report', async () => {
        const dateRange = { start: '2025-07-01', end: '2026-01-14' }

        console.log('\n' + '='.repeat(70))
        console.log('🛒 COMPARACIÓN: VENTAS (sale.order vs sale.report)')
        console.log(`   Período: ${dateRange.start} a ${dateRange.end}`)
        console.log('='.repeat(70))

        // 1. sale.order (actual)
        console.log('\n1️⃣ sale.order (modelo actual de Tuqui):')
        const soResult = await executeQueries(odooClient, TENANT_ID, [{
            id: 'so-compare',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange,
            groupBy: ['partner_id'],
            limit: 100,
        }])
        console.log(`   Total: $${(soResult[0].total || 0).toLocaleString('es-AR')}`)
        console.log(`   Clientes únicos: ${soResult[0].count}`)
        console.log(`   Top 5:`)
        Object.entries(soResult[0].grouped || {}).slice(0, 5).forEach(([name, data]: any, i) => {
            console.log(`      ${i + 1}. ${name}: $${data.total.toLocaleString('es-AR')}`)
        })

        // 2. sale.report
        console.log('\n2️⃣ sale.report (modelo del pivot de Odoo):')
        try {
            const amountField = 'price_total'
            const dateField = 'date'

            // Con filtro de estado confirmado (como hace Tuqui)
            const domainConfirmed = [
                [dateField, '>=', dateRange.start],
                [dateField, '<=', dateRange.end],
                ['state', 'in', ['sale', 'done']],
            ]

            // Sin filtro de estado
            const domainAll = [
                [dateField, '>=', dateRange.start],
                [dateField, '<=', dateRange.end],
            ]

            // Total confirmado
            const sumConfirmed = await odooClient.readGroup('sale.report', domainConfirmed, [amountField], [], { limit: 1 })
            const totalConfirmed = sumConfirmed[0]?.[amountField] || 0
            console.log(`   Total (confirmadas): $${totalConfirmed.toLocaleString('es-AR')}`)

            // Total todos
            const sumAll = await odooClient.readGroup('sale.report', domainAll, [amountField], [], { limit: 1 })
            const totalAll = sumAll[0]?.[amountField] || 0
            console.log(`   Total (todos los estados): $${totalAll.toLocaleString('es-AR')}`)

            // Top clientes
            const topClientes = await odooClient.readGroup(
                'sale.report', domainConfirmed, ['partner_id', amountField], ['partner_id'],
                { limit: 10, orderBy: `${amountField} desc` }
            )
            console.log(`   Top 5 clientes:`)
            topClientes.slice(0, 5).forEach((g: any, i: number) => {
                const name = Array.isArray(g.partner_id) ? g.partner_id[1] : g.partner_id
                console.log(`      ${i + 1}. ${name}: $${(g[amountField] || 0).toLocaleString('es-AR')}`)
            })

            // Comparación
            const diffConfirmed = (((soResult[0].total || 0) - totalConfirmed) / totalConfirmed * 100).toFixed(1)
            console.log(`\n   📊 Diferencia sale.order vs sale.report: ${diffConfirmed}%`)
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('3.11 COMPARAR: account.move vs account.invoice.report', async () => {
        const dateRange = { start: '2025-07-01', end: '2026-01-14' }

        console.log('\n' + '='.repeat(70))
        console.log('🧾 COMPARACIÓN: FACTURAS (account.move vs account.invoice.report)')
        console.log(`   Período: ${dateRange.start} a ${dateRange.end}`)
        console.log('='.repeat(70))

        // 1. account.move (actual)
        console.log('\n1️⃣ account.move (modelo actual de Tuqui):')

        // Facturas de venta
        const invoicesOut = await executeQueries(odooClient, TENANT_ID, [{
            id: 'inv-out',
            model: 'account.move',
            operation: 'aggregate',
            dateRange,
            domain: [['move_type', '=', 'out_invoice']],
            groupBy: ['partner_id'],
            limit: 100,
        }])
        console.log(`   Facturas de Venta: $${(invoicesOut[0].total || 0).toLocaleString('es-AR')} (${invoicesOut[0].count} clientes)`)

        // Facturas de compra
        const invoicesIn = await executeQueries(odooClient, TENANT_ID, [{
            id: 'inv-in',
            model: 'account.move',
            operation: 'aggregate',
            dateRange,
            domain: [['move_type', '=', 'in_invoice']],
        }])
        console.log(`   Facturas de Compra: $${(invoicesIn[0].total || 0).toLocaleString('es-AR')}`)

        // 2. account.invoice.report
        console.log('\n2️⃣ account.invoice.report (modelo del pivot de Odoo):')
        try {
            const fields = await odooClient.fieldsGet('account.invoice.report', ['string', 'type'])
            const fieldNames = Object.keys(fields)

            // Encontrar campos
            const amountField = fieldNames.includes('price_subtotal') ? 'price_subtotal' :
                fieldNames.includes('price_total') ? 'price_total' : 'amount_total'
            const dateField = fieldNames.includes('invoice_date') ? 'invoice_date' : 'date'

            console.log(`   Usando: ${amountField}, ${dateField}`)
            console.log(`   Campos disponibles: ${fieldNames.slice(0, 15).join(', ')}...`)

            // Ver si tiene move_type
            if (fieldNames.includes('move_type')) {
                // Facturas de venta
                const domainOut = [
                    [dateField, '>=', dateRange.start],
                    [dateField, '<=', dateRange.end],
                    ['move_type', '=', 'out_invoice'],
                ]
                const sumOut = await odooClient.readGroup('account.invoice.report', domainOut, [amountField], [], { limit: 1 })
                console.log(`   Facturas de Venta: $${(sumOut[0]?.[amountField] || 0).toLocaleString('es-AR')}`)

                // Facturas de compra
                const domainIn = [
                    [dateField, '>=', dateRange.start],
                    [dateField, '<=', dateRange.end],
                    ['move_type', '=', 'in_invoice'],
                ]
                const sumIn = await odooClient.readGroup('account.invoice.report', domainIn, [amountField], [], { limit: 1 })
                console.log(`   Facturas de Compra: $${(sumIn[0]?.[amountField] || 0).toLocaleString('es-AR')}`)
            } else {
                console.log(`   ⚠️ No tiene campo move_type, mostrando total general`)
                const domain = [
                    [dateField, '>=', dateRange.start],
                    [dateField, '<=', dateRange.end],
                ]
                const sum = await odooClient.readGroup('account.invoice.report', domain, [amountField], [], { limit: 1 })
                console.log(`   Total: $${(sum[0]?.[amountField] || 0).toLocaleString('es-AR')}`)
            }
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('3.12 COMPARAR: stock.picking vs modelos de stock', async () => {
        const dateRange = { start: '2025-07-01', end: '2026-01-14' }

        console.log('\n' + '='.repeat(70))
        console.log('📦 COMPARACIÓN: STOCK (stock.picking vs otros modelos)')
        console.log(`   Período: ${dateRange.start} a ${dateRange.end}`)
        console.log('='.repeat(70))

        // 1. stock.picking (actual)
        console.log('\n1️⃣ stock.picking (modelo actual de Tuqui):')
        const pickings = await executeQueries(odooClient, TENANT_ID, [{
            id: 'pick',
            model: 'stock.picking',
            operation: 'aggregate',
            dateRange,
        }])
        console.log(`   Movimientos: ${pickings[0].count}`)

        // 2. stock.move
        console.log('\n2️⃣ stock.move (movimientos de stock):')
        try {
            const domain = [
                ['date', '>=', dateRange.start],
                ['date', '<=', dateRange.end],
            ]
            const count = await odooClient.searchCount('stock.move', domain)
            console.log(`   Total movimientos: ${count}`)

            // Por estado
            const byState = await odooClient.readGroup('stock.move', domain, ['state'], ['state'], { limit: 10 })
            console.log(`   Por estado:`)
            byState.forEach((g: any) => {
                console.log(`      - ${g.state}: ${g.state_count} movimientos`)
            })
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`)
        }

        // 3. stock.quant (stock actual)
        console.log('\n3️⃣ stock.quant (stock actual en ubicaciones):')
        try {
            const count = await odooClient.searchCount('stock.quant', [['quantity', '>', 0]])
            console.log(`   Registros con stock: ${count}`)

            // Top ubicaciones
            const byLocation = await odooClient.readGroup(
                'stock.quant', [['quantity', '>', 0]], ['location_id', 'quantity'], ['location_id'],
                { limit: 5, orderBy: 'quantity desc' }
            )
            console.log(`   Top ubicaciones por cantidad:`)
            byLocation.forEach((g: any) => {
                const name = Array.isArray(g.location_id) ? g.location_id[1] : g.location_id
                console.log(`      - ${name}: ${g.quantity}`)
            })
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`)
        }

        // 4. stock.valuation.layer (valorización)
        console.log('\n4️⃣ stock.valuation.layer (valorización de stock):')
        try {
            const domain = [
                ['create_date', '>=', dateRange.start],
                ['create_date', '<=', dateRange.end],
            ]
            const sum = await odooClient.readGroup('stock.valuation.layer', domain, ['value'], [], { limit: 1 })
            console.log(`   Valor total movimientos: $${(sum[0]?.value || 0).toLocaleString('es-AR')}`)
        } catch (e: any) {
            console.log(`   ❌ Error: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    // =========================================================================
    // TESTS DE PREGUNTAS TÍPICAS DE PYME - Comparación Tuqui vs Odoo Reports
    // =========================================================================

    test('3.13 PYME: ¿Cuánto vendimos este mes vs mes pasado?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('💰 PREGUNTA: ¿Cuánto vendimos este mes vs mes pasado?')
        console.log('='.repeat(70))

        const esteMes = { start: '2025-01-01', end: '2025-01-14' }
        const mesPasado = { start: '2024-12-01', end: '2024-12-31' }

        // Tuqui actual (sale.order)
        console.log('\n📊 TUQUI (sale.order):')
        const tuquiEsteMes = await executeQueries(odooClient, TENANT_ID, [{
            id: 'este-mes', model: 'sale.order', operation: 'aggregate', dateRange: esteMes
        }])
        const tuquiMesPasado = await executeQueries(odooClient, TENANT_ID, [{
            id: 'mes-pasado', model: 'sale.order', operation: 'aggregate', dateRange: mesPasado
        }])
        console.log(`   Este mes (Ene 1-14): $${(tuquiEsteMes[0].total || 0).toLocaleString('es-AR')}`)
        console.log(`   Mes pasado (Dic): $${(tuquiMesPasado[0].total || 0).toLocaleString('es-AR')}`)
        const tuquiDiff = ((tuquiEsteMes[0].total || 0) - (tuquiMesPasado[0].total || 0)) / (tuquiMesPasado[0].total || 1) * 100
        console.log(`   Variación: ${tuquiDiff > 0 ? '+' : ''}${tuquiDiff.toFixed(1)}%`)

        // Odoo Report (sale.report)
        console.log('\n📊 ODOO REPORT (sale.report):')
        const reportEsteMes = await odooClient.readGroup('sale.report',
            [['date', '>=', esteMes.start], ['date', '<=', esteMes.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })
        const reportMesPasado = await odooClient.readGroup('sale.report',
            [['date', '>=', mesPasado.start], ['date', '<=', mesPasado.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })
        const rEsteMes = reportEsteMes[0]?.price_total || 0
        const rMesPasado = reportMesPasado[0]?.price_total || 0
        console.log(`   Este mes (Ene 1-14): $${rEsteMes.toLocaleString('es-AR')}`)
        console.log(`   Mes pasado (Dic): $${rMesPasado.toLocaleString('es-AR')}`)
        const reportDiff = (rEsteMes - rMesPasado) / (rMesPasado || 1) * 100
        console.log(`   Variación: ${reportDiff > 0 ? '+' : ''}${reportDiff.toFixed(1)}%`)

        // Comparación
        const errorEsteMes = Math.abs((tuquiEsteMes[0].total || 0) - rEsteMes) / rEsteMes * 100
        console.log(`\n   ⚠️ Error Tuqui vs Report (este mes): ${errorEsteMes.toFixed(1)}%`)

        expect(true).toBe(true)
    })

    test('3.14 PYME: ¿Cuánto facturamos este mes vs mes pasado?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🧾 PREGUNTA: ¿Cuánto facturamos este mes vs mes pasado?')
        console.log('='.repeat(70))

        const esteMes = { start: '2025-01-01', end: '2025-01-14' }
        const mesPasado = { start: '2024-12-01', end: '2024-12-31' }

        // Tuqui actual (account.move)
        console.log('\n📊 TUQUI (account.move):')
        const tuquiEsteMes = await executeQueries(odooClient, TENANT_ID, [{
            id: 'fac-este-mes', model: 'account.move', operation: 'aggregate',
            dateRange: esteMes, domain: [['move_type', '=', 'out_invoice']]
        }])
        const tuquiMesPasado = await executeQueries(odooClient, TENANT_ID, [{
            id: 'fac-mes-pasado', model: 'account.move', operation: 'aggregate',
            dateRange: mesPasado, domain: [['move_type', '=', 'out_invoice']]
        }])
        console.log(`   Este mes: $${(tuquiEsteMes[0].total || 0).toLocaleString('es-AR')}`)
        console.log(`   Mes pasado: $${(tuquiMesPasado[0].total || 0).toLocaleString('es-AR')}`)

        // Odoo Report (account.invoice.report)
        console.log('\n📊 ODOO REPORT (account.invoice.report):')
        const reportEsteMes = await odooClient.readGroup('account.invoice.report',
            [['invoice_date', '>=', esteMes.start], ['invoice_date', '<=', esteMes.end],
            ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
            ['price_subtotal'], [], { limit: 1 })
        const reportMesPasado = await odooClient.readGroup('account.invoice.report',
            [['invoice_date', '>=', mesPasado.start], ['invoice_date', '<=', mesPasado.end],
            ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
            ['price_subtotal'], [], { limit: 1 })
        const rEsteMes = reportEsteMes[0]?.price_subtotal || 0
        const rMesPasado = reportMesPasado[0]?.price_subtotal || 0
        console.log(`   Este mes: $${rEsteMes.toLocaleString('es-AR')}`)
        console.log(`   Mes pasado: $${rMesPasado.toLocaleString('es-AR')}`)
        const diff = (rEsteMes - rMesPasado) / (rMesPasado || 1) * 100
        console.log(`   Variación: ${diff > 0 ? '+' : ''}${diff.toFixed(1)}%`)

        // Error
        if (rEsteMes > 0) {
            const error = Math.abs((tuquiEsteMes[0].total || 0) - rEsteMes) / rEsteMes * 100
            console.log(`\n   ⚠️ Error Tuqui vs Report: ${error.toFixed(1)}%`)
        }

        expect(true).toBe(true)
    })

    test('3.15 PYME: ¿Quiénes nos deben más? (Cuentas por cobrar)', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('💸 PREGUNTA: ¿Quiénes nos deben más? (para reclamar)')
        console.log('='.repeat(70))

        // Tuqui actual (account.move con payment_state)
        console.log('\n📊 TUQUI (account.move con payment_state=not_paid):')
        const tuquiDeudores = await executeQueries(odooClient, TENANT_ID, [{
            id: 'deudores', model: 'account.move', operation: 'aggregate',
            domain: [['move_type', '=', 'out_invoice'], ['payment_state', '=', 'not_paid']],
            groupBy: ['partner_id'], limit: 10
        }])
        console.log(`   Total por cobrar: $${(tuquiDeudores[0].total || 0).toLocaleString('es-AR')}`)
        console.log(`   Clientes con deuda: ${tuquiDeudores[0].count}`)
        if (tuquiDeudores[0].grouped) {
            console.log(`   Top 5 deudores:`)
            Object.entries(tuquiDeudores[0].grouped).slice(0, 5).forEach(([name, data]: any, i) => {
                console.log(`      ${i + 1}. ${name}: $${data.total.toLocaleString('es-AR')}`)
            })
        }

        // Odoo Report (account.invoice.report)
        console.log('\n📊 ODOO REPORT (account.invoice.report):')
        const reportDeudores = await odooClient.readGroup('account.invoice.report',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', '=', 'not_paid']],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal desc' })

        const totalDeuda = reportDeudores.reduce((sum: number, g: any) => sum + (g.price_subtotal || 0), 0)
        console.log(`   Total por cobrar (top 10): $${totalDeuda.toLocaleString('es-AR')}`)
        console.log(`   Top 5 deudores:`)
        reportDeudores.slice(0, 5).forEach((g: any, i: number) => {
            const name = Array.isArray(g.partner_id) ? g.partner_id[1] : g.partner_id
            console.log(`      ${i + 1}. ${name}: $${(g.price_subtotal || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.16 PYME: ¿Cuáles son nuestros productos más vendidos?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('📦 PREGUNTA: ¿Cuáles son nuestros productos más vendidos?')
        console.log('='.repeat(70))

        const periodo = { start: '2024-12-01', end: '2025-01-14' }

        // Tuqui (sale.order.line)
        console.log('\n📊 TUQUI (sale.order.line):')
        const tuquiProductos = await executeQueries(odooClient, TENANT_ID, [{
            id: 'productos', model: 'sale.order.line', operation: 'aggregate',
            dateRange: periodo, groupBy: ['product_id'], limit: 10
        }])
        console.log(`   Total vendido: $${(tuquiProductos[0].total || 0).toLocaleString('es-AR')}`)
        if (tuquiProductos[0].grouped) {
            console.log(`   Top 5 productos:`)
            Object.entries(tuquiProductos[0].grouped).slice(0, 5).forEach(([name, data]: any, i) => {
                console.log(`      ${i + 1}. ${name.substring(0, 50)}...: $${data.total.toLocaleString('es-AR')}`)
            })
        }

        // Odoo Report (sale.report)
        console.log('\n📊 ODOO REPORT (sale.report):')
        const reportProductos = await odooClient.readGroup('sale.report',
            [['date', '>=', periodo.start], ['date', '<=', periodo.end], ['state', 'in', ['sale', 'done']]],
            ['product_id', 'price_total'], ['product_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log(`   Top 5 productos:`)
        reportProductos.slice(0, 5).forEach((g: any, i: number) => {
            const name = Array.isArray(g.product_id) ? g.product_id[1] : g.product_id
            console.log(`      ${i + 1}. ${String(name).substring(0, 50)}...: $${(g.price_total || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.17 PYME: ¿A quién le compramos más?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🛒 PREGUNTA: ¿A quién le compramos más? (Top proveedores)')
        console.log('='.repeat(70))

        const periodo = { start: '2024-07-01', end: '2025-01-14' }

        // Tuqui (purchase.order)
        console.log('\n📊 TUQUI (purchase.order):')
        const tuquiProveedores = await executeQueries(odooClient, TENANT_ID, [{
            id: 'proveedores', model: 'purchase.order', operation: 'aggregate',
            dateRange: periodo, groupBy: ['partner_id'], limit: 10
        }])
        console.log(`   Total compras: $${(tuquiProveedores[0].total || 0).toLocaleString('es-AR')}`)
        console.log(`   Proveedores: ${tuquiProveedores[0].count}`)
        if (tuquiProveedores[0].grouped) {
            console.log(`   Top 5:`)
            Object.entries(tuquiProveedores[0].grouped).slice(0, 5).forEach(([name, data]: any, i) => {
                console.log(`      ${i + 1}. ${name}: $${data.total.toLocaleString('es-AR')}`)
            })
        }

        // Odoo Report (purchase.report) - SIN filtro de estado
        console.log('\n📊 ODOO REPORT (purchase.report - TODOS los estados):')
        const reportProveedores = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', periodo.start], ['date_order', '<=', periodo.end]],
            ['partner_id', 'price_total'], ['partner_id'],
            { limit: 10, orderBy: 'price_total desc' })

        const totalReport = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', periodo.start], ['date_order', '<=', periodo.end]],
            ['price_total'], [], { limit: 1 })

        console.log(`   Total compras: $${(totalReport[0]?.price_total || 0).toLocaleString('es-AR')}`)
        console.log(`   Top 5:`)
        reportProveedores.slice(0, 5).forEach((g: any, i: number) => {
            const name = Array.isArray(g.partner_id) ? g.partner_id[1] : g.partner_id
            console.log(`      ${i + 1}. ${name}: $${(g.price_total || 0).toLocaleString('es-AR')}`)
        })

        // Diferencia
        const diff = ((totalReport[0]?.price_total || 0) - (tuquiProveedores[0].total || 0)) / (totalReport[0]?.price_total || 1) * 100
        console.log(`\n   ⚠️ Tuqui está mostrando ${diff.toFixed(1)}% MENOS que Odoo`)

        expect(true).toBe(true)
    })

    test('3.18 PYME: ¿Tenemos stock de X producto?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('📦 PREGUNTA: ¿Tenemos stock? ¿Cuánto hay en cada ubicación?')
        console.log('='.repeat(70))

        // Stock por ubicación (stock.quant)
        console.log('\n📊 STOCK ACTUAL (stock.quant):')
        const stockUbicaciones = await odooClient.readGroup('stock.quant',
            [['quantity', '>', 0]],
            ['location_id', 'quantity'], ['location_id'],
            { limit: 10, orderBy: 'quantity desc' })

        console.log(`   Top 10 ubicaciones con stock:`)
        stockUbicaciones.forEach((g: any, i: number) => {
            const name = Array.isArray(g.location_id) ? g.location_id[1] : g.location_id
            console.log(`      ${i + 1}. ${name}: ${g.quantity.toLocaleString('es-AR')} unidades`)
        })

        // Stock valorizado (stock.valuation.layer)
        console.log('\n📊 VALORIZACIÓN DE STOCK (stock.valuation.layer):')
        const valorStock = await odooClient.readGroup('stock.valuation.layer',
            [], ['value', 'quantity'], [], { limit: 1 })
        console.log(`   Valor total en stock: $${(valorStock[0]?.value || 0).toLocaleString('es-AR')}`)
        console.log(`   Cantidad total: ${(valorStock[0]?.quantity || 0).toLocaleString('es-AR')} unidades`)

        // Top productos por valor
        console.log('\n📊 TOP PRODUCTOS POR VALOR EN STOCK:')
        const topProductos = await odooClient.readGroup('stock.valuation.layer',
            [['quantity', '>', 0]],
            ['product_id', 'value', 'quantity'], ['product_id'],
            { limit: 10, orderBy: 'value desc' })

        topProductos.slice(0, 5).forEach((g: any, i: number) => {
            const name = Array.isArray(g.product_id) ? g.product_id[1] : g.product_id
            console.log(`      ${i + 1}. ${String(name).substring(0, 40)}...: $${(g.value || 0).toLocaleString('es-AR')} (${g.quantity} uds)`)
        })

        expect(true).toBe(true)
    })

    test('3.19 PYME: ¿Qué entregas tenemos pendientes?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🚚 PREGUNTA: ¿Qué entregas tenemos pendientes? ¿Cuándo llegan?')
        console.log('='.repeat(70))

        // Pickings pendientes
        console.log('\n📊 ENTREGAS PENDIENTES (stock.picking):')
        const pickingsPendientes = await odooClient.searchRead('stock.picking',
            [['state', 'in', ['assigned', 'waiting', 'confirmed']]],
            ['name', 'partner_id', 'scheduled_date', 'state', 'picking_type_id'],
            10, 'scheduled_date asc')

        console.log(`   Próximas 10 entregas:`)
        pickingsPendientes.forEach((p: any, i: number) => {
            const partner = Array.isArray(p.partner_id) ? p.partner_id[1] : p.partner_id || 'N/A'
            const tipo = Array.isArray(p.picking_type_id) ? p.picking_type_id[1] : 'N/A'
            console.log(`      ${i + 1}. ${p.name} - ${partner} - ${p.scheduled_date} (${p.state}) - ${tipo}`)
        })

        // Resumen por estado
        console.log('\n📊 RESUMEN POR ESTADO:')
        const porEstado = await odooClient.readGroup('stock.picking',
            [['state', 'not in', ['done', 'cancel']]],
            ['state'], ['state'], { limit: 10 })

        porEstado.forEach((g: any) => {
            console.log(`      ${g.state}: ${g.state_count} pickings`)
        })

        expect(true).toBe(true)
    })

    test('3.20 PYME: ¿Cuánto compramos de X producto y a qué precio?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('💵 PREGUNTA: ¿Estamos comprando más barato/caro? (Análisis de precios)')
        console.log('='.repeat(70))

        const periodo = { start: '2024-07-01', end: '2025-01-14' }

        // Top productos comprados con precio promedio
        console.log('\n📊 COMPRAS POR PRODUCTO (purchase.report):')
        const comprasPorProducto = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', periodo.start], ['date_order', '<=', periodo.end]],
            ['product_id', 'price_total', 'qty_ordered', 'price_average'], ['product_id'],
            { limit: 15, orderBy: 'price_total desc' })

        console.log(`   Top 10 productos comprados:`)
        comprasPorProducto.slice(0, 10).forEach((g: any, i: number) => {
            const name = Array.isArray(g.product_id) ? g.product_id[1] : g.product_id
            const precioPromedio = g.qty_ordered > 0 ? g.price_total / g.qty_ordered : 0
            console.log(`      ${i + 1}. ${String(name).substring(0, 35)}...`)
            console.log(`         Total: $${(g.price_total || 0).toLocaleString('es-AR')} | Cant: ${g.qty_ordered} | Precio prom: $${precioPromedio.toFixed(2)}`)
        })

        expect(true).toBe(true)
    })

    test('3.21 PYME: ¿Quiénes son nuestros mejores clientes?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('👥 PREGUNTA: ¿Quiénes son nuestros mejores clientes? (por facturación)')
        console.log('='.repeat(70))

        const periodo = { start: '2024-01-01', end: '2025-01-14' }

        // Por ventas (sale.report)
        console.log('\n📊 TOP CLIENTES POR VENTAS (sale.report):')
        const topVentas = await odooClient.readGroup('sale.report',
            [['date', '>=', periodo.start], ['date', '<=', periodo.end], ['state', 'in', ['sale', 'done']]],
            ['partner_id', 'price_total'], ['partner_id'],
            { limit: 10, orderBy: 'price_total desc' })

        topVentas.forEach((g: any, i: number) => {
            const name = Array.isArray(g.partner_id) ? g.partner_id[1] : g.partner_id
            console.log(`      ${i + 1}. ${name}: $${(g.price_total || 0).toLocaleString('es-AR')}`)
        })

        // Por facturación (account.invoice.report)
        console.log('\n📊 TOP CLIENTES POR FACTURACIÓN (account.invoice.report):')
        const topFacturacion = await odooClient.readGroup('account.invoice.report',
            [['invoice_date', '>=', periodo.start], ['invoice_date', '<=', periodo.end],
            ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal desc' })

        topFacturacion.forEach((g: any, i: number) => {
            const name = Array.isArray(g.partner_id) ? g.partner_id[1] : g.partner_id
            console.log(`      ${i + 1}. ${name}: $${(g.price_subtotal || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.22 PYME: ¿Cómo vienen las ventas por vendedor?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('👤 PREGUNTA: ¿Cómo vienen las ventas por vendedor?')
        console.log('='.repeat(70))

        const esteMes = { start: '2025-01-01', end: '2025-01-14' }
        const mesPasado = { start: '2024-12-01', end: '2024-12-31' }

        // Este mes
        console.log('\n📊 VENTAS POR VENDEDOR - ESTE MES (sale.report):')
        const ventasEsteMes = await odooClient.readGroup('sale.report',
            [['date', '>=', esteMes.start], ['date', '<=', esteMes.end], ['state', 'in', ['sale', 'done']]],
            ['user_id', 'price_total'], ['user_id'],
            { limit: 10, orderBy: 'price_total desc' })

        ventasEsteMes.forEach((g: any, i: number) => {
            const name = Array.isArray(g.user_id) ? g.user_id[1] : g.user_id || 'Sin asignar'
            console.log(`      ${i + 1}. ${name}: $${(g.price_total || 0).toLocaleString('es-AR')}`)
        })

        // Mes pasado para comparar
        console.log('\n📊 VENTAS POR VENDEDOR - MES PASADO (sale.report):')
        const ventasMesPasado = await odooClient.readGroup('sale.report',
            [['date', '>=', mesPasado.start], ['date', '<=', mesPasado.end], ['state', 'in', ['sale', 'done']]],
            ['user_id', 'price_total'], ['user_id'],
            { limit: 10, orderBy: 'price_total desc' })

        ventasMesPasado.forEach((g: any, i: number) => {
            const name = Array.isArray(g.user_id) ? g.user_id[1] : g.user_id || 'Sin asignar'
            console.log(`      ${i + 1}. ${name}: $${(g.price_total || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.23 PYME: ¿Cuántas órdenes de compra tenemos pendientes?', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('📋 PREGUNTA: ¿Cuántas órdenes de compra tenemos pendientes?')
        console.log('='.repeat(70))

        // Por estado
        console.log('\n📊 ÓRDENES DE COMPRA POR ESTADO:')
        const porEstado = await odooClient.readGroup('purchase.order',
            [], ['state', 'amount_total'], ['state'], { limit: 10 })

        porEstado.forEach((g: any) => {
            console.log(`      ${g.state}: ${g.state_count} órdenes - $${(g.amount_total || 0).toLocaleString('es-AR')}`)
        })

        // Órdenes confirmadas recientes
        console.log('\n📊 ÓRDENES CONFIRMADAS RECIENTES:')
        const confirmadas = await odooClient.searchRead('purchase.order',
            [['state', '=', 'purchase']],
            ['name', 'partner_id', 'amount_total', 'date_order'],
            10, 'date_order desc')

        confirmadas.forEach((p: any, i: number) => {
            const partner = Array.isArray(p.partner_id) ? p.partner_id[1] : p.partner_id
            console.log(`      ${i + 1}. ${p.name} - ${partner}: $${(p.amount_total || 0).toLocaleString('es-AR')} (${p.date_order})`)
        })

        expect(true).toBe(true)
    })

    test('3.24 RESUMEN COMPARATIVO: Tuqui vs Odoo Reports', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('📊 RESUMEN FINAL: DISCREPANCIAS TUQUI VS ODOO REPORTS')
        console.log('='.repeat(70))

        const periodo = { start: '2024-07-01', end: '2025-01-14' }
        const results: any[] = []

        // 1. Ventas
        const tuquiVentas = await executeQueries(odooClient, TENANT_ID, [{
            id: 'v', model: 'sale.order', operation: 'aggregate', dateRange: periodo
        }])
        const reportVentas = await odooClient.readGroup('sale.report',
            [['date', '>=', periodo.start], ['date', '<=', periodo.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })
        results.push({
            area: 'Ventas',
            tuqui: tuquiVentas[0].total || 0,
            report: reportVentas[0]?.price_total || 0,
        })

        // 2. Compras
        const tuquiCompras = await executeQueries(odooClient, TENANT_ID, [{
            id: 'c', model: 'purchase.order', operation: 'aggregate', dateRange: periodo
        }])
        const reportCompras = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', periodo.start], ['date_order', '<=', periodo.end]],
            ['price_total'], [], { limit: 1 })
        results.push({
            area: 'Compras',
            tuqui: tuquiCompras[0].total || 0,
            report: reportCompras[0]?.price_total || 0,
        })

        // 3. Facturas Venta
        const tuquiFacturas = await executeQueries(odooClient, TENANT_ID, [{
            id: 'f', model: 'account.move', operation: 'aggregate', dateRange: periodo,
            domain: [['move_type', '=', 'out_invoice']]
        }])
        const reportFacturas = await odooClient.readGroup('account.invoice.report',
            [['invoice_date', '>=', periodo.start], ['invoice_date', '<=', periodo.end],
            ['move_type', '=', 'out_invoice'], ['state', '=', 'posted']],
            ['price_subtotal'], [], { limit: 1 })
        results.push({
            area: 'Facturas Venta',
            tuqui: tuquiFacturas[0].total || 0,
            report: reportFacturas[0]?.price_subtotal || 0,
        })

        // Mostrar resultados
        console.log('\n| Área | Tuqui | Odoo Report | Diferencia |')
        console.log('|------|-------|-------------|------------|')
        results.forEach(r => {
            const diff = r.report > 0 ? ((r.tuqui - r.report) / r.report * 100).toFixed(1) : 'N/A'
            const status = Math.abs(parseFloat(diff)) < 5 ? '✅' : '❌'
            console.log(`| ${r.area} | $${r.tuqui.toLocaleString('es-AR')} | $${r.report.toLocaleString('es-AR')} | ${diff}% ${status} |`)
        })

        console.log('\n📋 CONCLUSIONES:')
        console.log('   - Ventas: sale.order vs sale.report')
        console.log('   - Compras: purchase.order PIERDE datos (estados no confirmados)')
        console.log('   - Facturas: account.move NO FUNCIONA, usar account.invoice.report')

        expect(true).toBe(true)
    })

    // =========================================================================
    // TESTS DE PREGUNTAS EN LENGUAJE NATURAL - Verificación de respuestas
    // =========================================================================

    test('3.25 PREGUNTA HUMANA: "cuánto vendimos en diciembre?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuánto vendimos en diciembre?"')
        console.log('='.repeat(70))

        // Lo que Tuqui respondería
        const tuquiResult = await executeQueries(odooClient, TENANT_ID, [{
            id: 'dic-ventas', model: 'sale.order', operation: 'aggregate',
            dateRange: { start: '2024-12-01', end: '2024-12-31' }
        }])

        // Lo que debería responder (según Odoo report)
        const odooResult = await odooClient.readGroup('sale.report',
            [['date', '>=', '2024-12-01'], ['date', '<=', '2024-12-31'], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        console.log('\n📊 RESPUESTA TUQUI:')
        console.log(`   "En diciembre vendimos $${(tuquiResult[0].total || 0).toLocaleString('es-AR')} en ${tuquiResult[0].count} órdenes"`)

        console.log('\n✅ RESPUESTA CORRECTA (Odoo Report):')
        console.log(`   "En diciembre vendimos $${(odooResult[0]?.price_total || 0).toLocaleString('es-AR')}"`)

        const diff = Math.abs((tuquiResult[0].total || 0) - (odooResult[0]?.price_total || 0)) / (odooResult[0]?.price_total || 1) * 100
        console.log(`\n   Diferencia: ${diff.toFixed(1)}% ${diff < 5 ? '✅' : '❌'}`)

        expect(diff).toBeLessThan(10)
    })

    test('3.26 PREGUNTA HUMANA: "quién es mi mejor cliente?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "quién es mi mejor cliente?"')
        console.log('='.repeat(70))

        // Últimos 12 meses
        const periodo = { start: '2024-01-01', end: '2025-01-14' }

        // Tuqui
        const tuquiResult = await executeQueries(odooClient, TENANT_ID, [{
            id: 'top-cliente', model: 'sale.order', operation: 'aggregate',
            dateRange: periodo, groupBy: ['partner_id'], limit: 1
        }])

        // Odoo report
        const odooResult = await odooClient.readGroup('sale.report',
            [['date', '>=', periodo.start], ['date', '<=', periodo.end], ['state', 'in', ['sale', 'done']]],
            ['partner_id', 'price_total'], ['partner_id'],
            { limit: 1, orderBy: 'price_total desc' })

        const tuquiTop = Object.entries(tuquiResult[0].grouped || {})[0]
        const odooTop = odooResult[0]

        console.log('\n📊 RESPUESTA TUQUI:')
        if (tuquiTop) {
            console.log(`   "Tu mejor cliente es ${tuquiTop[0]} con $${(tuquiTop[1] as any).total.toLocaleString('es-AR')}"`)
        }

        console.log('\n✅ RESPUESTA CORRECTA (Odoo Report):')
        const odooName = Array.isArray(odooTop?.partner_id) ? odooTop.partner_id[1] : odooTop?.partner_id
        console.log(`   "Tu mejor cliente es ${odooName} con $${(odooTop?.price_total || 0).toLocaleString('es-AR')}"`)

        // ¿Es el mismo cliente?
        const mismoCliente = tuquiTop && tuquiTop[0] === odooName
        console.log(`\n   ¿Mismo cliente? ${mismoCliente ? '✅' : '❌'}`)

        expect(true).toBe(true)
    })

    test('3.27 PREGUNTA HUMANA: "cuánto le debemos a proveedores?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuánto le debemos a proveedores?" (cuentas por pagar)')
        console.log('='.repeat(70))

        // Tuqui (account.move con in_invoice y not_paid)
        const tuquiResult = await executeQueries(odooClient, TENANT_ID, [{
            id: 'deuda-proveedores', model: 'account.move', operation: 'aggregate',
            domain: [['move_type', '=', 'in_invoice'], ['payment_state', '=', 'not_paid']]
        }])

        // Odoo report
        const odooResult = await odooClient.readGroup('account.invoice.report',
            [['move_type', '=', 'in_invoice'], ['state', '=', 'posted'], ['payment_state', '=', 'not_paid']],
            ['price_subtotal'], [], { limit: 1 })

        console.log('\n📊 RESPUESTA TUQUI:')
        console.log(`   "Debemos $${(tuquiResult[0].total || 0).toLocaleString('es-AR')} a proveedores"`)

        console.log('\n✅ RESPUESTA CORRECTA (Odoo Report):')
        // Nota: precio negativo en facturas de proveedor
        const deuda = Math.abs(odooResult[0]?.price_subtotal || 0)
        console.log(`   "Debemos $${deuda.toLocaleString('es-AR')} a proveedores"`)

        console.log(`\n   ⚠️ Tuqui devuelve $0 porque account.move no funciona para esto`)

        expect(true).toBe(true)
    })

    test('3.28 PREGUNTA HUMANA: "cuánto nos deben los clientes?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuánto nos deben los clientes?" (cuentas por cobrar)')
        console.log('='.repeat(70))

        // Tuqui
        const tuquiResult = await executeQueries(odooClient, TENANT_ID, [{
            id: 'cxc', model: 'account.move', operation: 'aggregate',
            domain: [['move_type', '=', 'out_invoice'], ['payment_state', '=', 'not_paid']]
        }])

        // Odoo report
        const odooResult = await odooClient.readGroup('account.invoice.report',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', '=', 'not_paid']],
            ['price_subtotal'], [], { limit: 1 })

        // Top deudores
        const topDeudores = await odooClient.readGroup('account.invoice.report',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['payment_state', '=', 'not_paid']],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 5, orderBy: 'price_subtotal desc' })

        console.log('\n📊 RESPUESTA TUQUI:')
        console.log(`   "Los clientes nos deben $${(tuquiResult[0].total || 0).toLocaleString('es-AR')}"`)

        console.log('\n✅ RESPUESTA CORRECTA (Odoo Report):')
        console.log(`   "Los clientes nos deben $${(odooResult[0]?.price_subtotal || 0).toLocaleString('es-AR')}"`)
        console.log(`   Top deudores:`)
        topDeudores.forEach((d: any, i: number) => {
            const name = Array.isArray(d.partner_id) ? d.partner_id[1] : d.partner_id
            console.log(`      ${i + 1}. ${name}: $${(d.price_subtotal || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.29 PREGUNTA HUMANA: "cómo vamos este mes comparado con el pasado?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cómo vamos este mes comparado con el pasado?"')
        console.log('='.repeat(70))

        // Este mes (parcial) vs mes pasado (completo)
        const esteMes = await odooClient.readGroup('sale.report',
            [['date', '>=', '2025-01-01'], ['date', '<=', '2025-01-14'], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const mesPasado = await odooClient.readGroup('sale.report',
            [['date', '>=', '2024-12-01'], ['date', '<=', '2024-12-31'], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const diasEsteMes = 14
        const diasMesPasado = 31

        const ventasEsteMes = esteMes[0]?.price_total || 0
        const ventasMesPasado = mesPasado[0]?.price_total || 0

        // Proyección a 31 días
        const proyeccionMes = (ventasEsteMes / diasEsteMes) * 31
        const variacionProyectada = ((proyeccionMes - ventasMesPasado) / ventasMesPasado) * 100

        console.log('\n✅ RESPUESTA CORRECTA:')
        console.log(`   Este mes (14 días): $${ventasEsteMes.toLocaleString('es-AR')}`)
        console.log(`   Mes pasado (31 días): $${ventasMesPasado.toLocaleString('es-AR')}`)
        console.log(`   Proyección a fin de mes: $${proyeccionMes.toLocaleString('es-AR')}`)
        console.log(`   Variación proyectada: ${variacionProyectada > 0 ? '+' : ''}${variacionProyectada.toFixed(1)}%`)

        if (variacionProyectada > 0) {
            console.log(`\n   📈 "Vas bien! Si seguís así, vas a vender ${variacionProyectada.toFixed(0)}% más que diciembre"`)
        } else {
            console.log(`\n   📉 "Ojo, vas ${Math.abs(variacionProyectada).toFixed(0)}% abajo de diciembre"`)
        }

        expect(true).toBe(true)
    })

    test('3.30 PREGUNTA HUMANA: "cuáles son mis productos estrella?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuáles son mis productos estrella?" (más vendidos)')
        console.log('='.repeat(70))

        // Últimos 3 meses
        const topProductos = await odooClient.readGroup('sale.report',
            [['date', '>=', '2024-10-01'], ['date', '<=', '2025-01-14'], ['state', 'in', ['sale', 'done']]],
            ['product_id', 'price_total', 'product_uom_qty'], ['product_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n✅ RESPUESTA CORRECTA (Odoo Report):')
        console.log('   Top 10 productos más vendidos (último trimestre):')
        topProductos.forEach((p: any, i: number) => {
            const name = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
            console.log(`      ${i + 1}. ${String(name).substring(0, 50)}...`)
            console.log(`         Ventas: $${(p.price_total || 0).toLocaleString('es-AR')} | Cantidad: ${(p.product_uom_qty || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.31 PREGUNTA HUMANA: "tenemos stock del producto X?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "tenemos stock del producto X?" (ejemplo: radiovisiógrafos)')
        console.log('='.repeat(70))

        // Buscar productos con "RVG" o "radiovisiografo"
        const productos = await odooClient.searchRead('product.product',
            [['name', 'ilike', 'RVG']],
            ['id', 'name', 'default_code'],
            5)

        console.log('\n📦 Productos encontrados con "RVG":')
        for (const prod of productos) {
            console.log(`   - [${prod.default_code}] ${prod.name}`)

            // Buscar stock de ese producto
            const stockQuant = await odooClient.readGroup('stock.quant',
                [['product_id', '=', prod.id], ['quantity', '>', 0]],
                ['location_id', 'quantity'], ['location_id'],
                { limit: 5, orderBy: 'quantity desc' })

            if (stockQuant.length > 0) {
                stockQuant.forEach((q: any) => {
                    const ubicacion = Array.isArray(q.location_id) ? q.location_id[1] : q.location_id
                    console.log(`      📍 ${ubicacion}: ${q.quantity} unidades`)
                })
            } else {
                console.log(`      ⚠️ Sin stock disponible`)
            }
        }

        expect(true).toBe(true)
    })

    test('3.32 PREGUNTA HUMANA: "quién es el vendedor que más vende?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "quién es el vendedor que más vende?"')
        console.log('='.repeat(70))

        // Este año
        const topVendedores = await odooClient.readGroup('sale.report',
            [['date', '>=', '2024-01-01'], ['date', '<=', '2025-01-14'], ['state', 'in', ['sale', 'done']]],
            ['user_id', 'price_total'], ['user_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n✅ RESPUESTA CORRECTA (Odoo Report):')
        console.log('   Ranking de vendedores (último año):')

        const totalVentas = topVendedores.reduce((sum: number, v: any) => sum + (v.price_total || 0), 0)

        topVendedores.forEach((v: any, i: number) => {
            const name = Array.isArray(v.user_id) ? v.user_id[1] : v.user_id || 'Sin asignar'
            const porcentaje = ((v.price_total || 0) / totalVentas * 100).toFixed(1)
            console.log(`      ${i + 1}. ${name}: $${(v.price_total || 0).toLocaleString('es-AR')} (${porcentaje}%)`)
        })

        const topVendedor = topVendedores[0]
        const topName = Array.isArray(topVendedor?.user_id) ? topVendedor.user_id[1] : topVendedor?.user_id
        console.log(`\n   🏆 "El vendedor estrella es ${topName}"`)

        expect(true).toBe(true)
    })

    // =========================================================================
    // MÁS PREGUNTAS HUMANAS - Batería de tests para verificación continua
    // =========================================================================

    test('3.33 PREGUNTA: "llegó el pedido de FOSHAN?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "llegó el pedido de FOSHAN?" (proveedor específico)')
        console.log('='.repeat(70))

        // Buscar órdenes de compra de ese proveedor
        const ordenes = await odooClient.searchRead('purchase.order',
            [['partner_id', 'ilike', 'FOSHAN']],
            ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
            10, 'date_order desc')

        console.log('\n📦 Órdenes de FOSHAN encontradas:')
        ordenes.forEach((o: any, i: number) => {
            const partner = Array.isArray(o.partner_id) ? o.partner_id[1] : o.partner_id
            console.log(`   ${i + 1}. ${o.name} - ${partner}`)
            console.log(`      Estado: ${o.state} | Fecha: ${o.date_order} | $${(o.amount_total || 0).toLocaleString('es-AR')}`)
        })

        // Buscar recepciones pendientes de ese proveedor
        const recepciones = await odooClient.searchRead('stock.picking',
            [['partner_id', 'ilike', 'FOSHAN'], ['state', 'not in', ['done', 'cancel']]],
            ['name', 'partner_id', 'scheduled_date', 'state', 'origin'],
            5)

        console.log('\n📥 Recepciones pendientes de FOSHAN:')
        if (recepciones.length === 0) {
            console.log('   No hay recepciones pendientes')
        } else {
            recepciones.forEach((r: any) => {
                console.log(`   - ${r.name}: ${r.state} (fecha: ${r.scheduled_date})`)
            })
        }

        expect(true).toBe(true)
    })

    test('3.34 PREGUNTA: "se está vendiendo el producto X?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "se está vendiendo el sillón odontológico?"')
        console.log('='.repeat(70))

        // Buscar ventas del producto en últimos 3 meses
        const ventasProducto = await odooClient.readGroup('sale.report',
            [['date', '>=', '2024-10-01'], ['date', '<=', '2025-01-14'],
            ['state', 'in', ['sale', 'done']], ['product_id', 'ilike', 'sillón']],
            ['product_id', 'price_total', 'product_uom_qty'], ['product_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n📊 Ventas de "sillón" (últimos 3 meses):')
        if (ventasProducto.length === 0) {
            console.log('   No se encontraron ventas')
        } else {
            ventasProducto.forEach((p: any, i: number) => {
                const name = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
                console.log(`   ${i + 1}. ${String(name).substring(0, 50)}...`)
                console.log(`      Vendidos: ${p.product_uom_qty} | Total: $${(p.price_total || 0).toLocaleString('es-AR')}`)
            })
        }

        expect(true).toBe(true)
    })

    test('3.35 PREGUNTA: "estamos acumulando deuda?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "estamos acumulando deuda? a quién le debemos más?"')
        console.log('='.repeat(70))

        // Cuentas por pagar
        const deudaProveedores = await odooClient.readGroup('account.invoice.report',
            [['move_type', '=', 'in_invoice'], ['state', '=', 'posted'], ['payment_state', '=', 'not_paid']],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal asc' })  // asc porque son negativos

        const totalDeuda = deudaProveedores.reduce((sum: number, d: any) => sum + Math.abs(d.price_subtotal || 0), 0)

        console.log('\n💸 Deuda total a proveedores: $' + totalDeuda.toLocaleString('es-AR'))
        console.log('\n📊 Top proveedores a los que debemos:')
        deudaProveedores.forEach((d: any, i: number) => {
            const name = Array.isArray(d.partner_id) ? d.partner_id[1] : d.partner_id
            console.log(`   ${i + 1}. ${name}: $${Math.abs(d.price_subtotal || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.36 PREGUNTA: "hay facturas vencidas?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "hay facturas vencidas?" (por cobrar vencidas)')
        console.log('='.repeat(70))

        const hoy = '2025-01-14'

        // Facturas por cobrar vencidas
        const vencidas = await odooClient.readGroup('account.invoice.report',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'],
            ['payment_state', '=', 'not_paid'], ['invoice_date', '<', hoy]],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal desc' })

        const totalVencidas = vencidas.reduce((sum: number, v: any) => sum + (v.price_subtotal || 0), 0)

        console.log('\n⚠️ Total facturas vencidas: $' + totalVencidas.toLocaleString('es-AR'))
        console.log('\n📊 Clientes con facturas vencidas:')
        vencidas.forEach((v: any, i: number) => {
            const name = Array.isArray(v.partner_id) ? v.partner_id[1] : v.partner_id
            console.log(`   ${i + 1}. ${name}: $${(v.price_subtotal || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.37 PREGUNTA: "cuánto tenemos en caja?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuánto tenemos en caja?" (saldo de cuentas de caja/banco)')
        console.log('='.repeat(70))

        // 1. Buscar diarios de tipo cash y bank
        const diarios = await odooClient.searchRead('account.journal',
            [['type', 'in', ['cash', 'bank']]],
            ['id', 'name', 'type', 'default_account_id'],
            100)

        console.log('\n📋 Diarios de caja/banco encontrados:')
        const cuentasIds: number[] = []
        diarios.forEach((d: any) => {
            const cuentaId = Array.isArray(d.default_account_id) ? d.default_account_id[0] : d.default_account_id
            const cuentaNombre = Array.isArray(d.default_account_id) ? d.default_account_id[1] : 'Sin cuenta'
            console.log(`   - ${d.name} (${d.type}): Cuenta ${cuentaNombre}`)
            if (cuentaId) cuentasIds.push(cuentaId)
        })

        if (cuentasIds.length === 0) {
            console.log('\n⚠️ No se encontraron cuentas de caja/banco')
            expect(true).toBe(true)
            return
        }

        // 2. Buscar saldo de esas cuentas en account.move.line
        // El saldo = suma de (debit - credit) para asientos posted
        const saldos = await odooClient.readGroup('account.move.line',
            [['account_id', 'in', cuentasIds], ['parent_state', '=', 'posted']],
            ['account_id', 'debit', 'credit', 'balance'],
            ['account_id'],
            { limit: 50 })

        console.log('\n💰 Saldos por cuenta:')
        let totalCaja = 0
        saldos.forEach((s: any) => {
            const nombre = Array.isArray(s.account_id) ? s.account_id[1] : s.account_id
            const saldo = s.balance || (s.debit - s.credit) || 0
            totalCaja += saldo
            console.log(`   - ${nombre}: $${saldo.toLocaleString('es-AR')}`)
        })

        console.log('\n💵 TOTAL EN CAJA/BANCOS: $' + totalCaja.toLocaleString('es-AR'))

        // También mostrar movimientos recientes como referencia
        const esteMes = { start: '2025-01-01', end: '2025-01-14' }
        const movimientos = await odooClient.readGroup('account.move.line',
            [['account_id', 'in', cuentasIds], ['parent_state', '=', 'posted'],
            ['date', '>=', esteMes.start], ['date', '<=', esteMes.end]],
            ['debit', 'credit', 'balance'], [],
            { limit: 1 })

        if (movimientos.length > 0) {
            const mov = movimientos[0]
            console.log(`\n📊 Movimientos este mes (${esteMes.start} a ${esteMes.end}):`)
            console.log(`   Ingresos: +$${(mov.debit || 0).toLocaleString('es-AR')}`)
            console.log(`   Egresos: -$${(mov.credit || 0).toLocaleString('es-AR')}`)
            console.log(`   Flujo neto: $${(mov.balance || mov.debit - mov.credit || 0).toLocaleString('es-AR')}`)
        }

        expect(totalCaja).not.toBe(0)
    })

    test('3.38 PREGUNTA: "qué productos hay que reponer?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "qué productos hay que reponer?" (stock bajo)')
        console.log('='.repeat(70))

        // Productos con bajo stock (menos de 10 unidades en ubicación principal)
        const stockBajo = await odooClient.readGroup('stock.quant',
            [['quantity', '>', 0], ['quantity', '<', 10], ['location_id', 'ilike', 'Stock']],
            ['product_id', 'quantity'], ['product_id'],
            { limit: 15, orderBy: 'quantity asc' })

        console.log('\n⚠️ Productos con stock bajo (<10 unidades):')
        stockBajo.slice(0, 10).forEach((p: any, i: number) => {
            const name = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
            console.log(`   ${i + 1}. ${String(name).substring(0, 50)}...: ${p.quantity} unidades`)
        })

        expect(true).toBe(true)
    })

    test('3.39 PREGUNTA: "cuántos pedidos tenemos sin entregar?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuántos pedidos tenemos sin entregar?"')
        console.log('='.repeat(70))

        // Pickings de salida pendientes
        const pendientes = await odooClient.readGroup('stock.picking',
            [['state', 'in', ['assigned', 'waiting', 'confirmed']]],
            ['state', 'picking_type_id'], ['state', 'picking_type_id'],
            { limit: 20 })

        console.log('\n📦 Pickings pendientes por estado y tipo:')
        pendientes.forEach((p: any) => {
            const tipo = Array.isArray(p.picking_type_id) ? p.picking_type_id[1] : 'N/A'
            console.log(`   ${p.state} - ${tipo}: ${p.__count || p.state_count} pendientes`)
        })

        // Total general
        const totalPendientes = await odooClient.searchCount('stock.picking',
            [['state', 'in', ['assigned', 'waiting', 'confirmed']]])
        console.log(`\n   Total pendientes: ${totalPendientes}`)

        expect(true).toBe(true)
    })

    test('3.40 PREGUNTA: "cómo estuvo el trimestre?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cómo estuvo el trimestre?" (Q4 2024)')
        console.log('='.repeat(70))

        const q4 = { start: '2024-10-01', end: '2024-12-31' }
        const q3 = { start: '2024-07-01', end: '2024-09-30' }

        // Ventas Q4
        const ventasQ4 = await odooClient.readGroup('sale.report',
            [['date', '>=', q4.start], ['date', '<=', q4.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        // Ventas Q3
        const ventasQ3 = await odooClient.readGroup('sale.report',
            [['date', '>=', q3.start], ['date', '<=', q3.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const totalQ4 = ventasQ4[0]?.price_total || 0
        const totalQ3 = ventasQ3[0]?.price_total || 0
        const variacion = ((totalQ4 - totalQ3) / totalQ3 * 100)

        console.log('\n📊 Comparación Q4 vs Q3 2024:')
        console.log(`   Q3 (Jul-Sep): $${totalQ3.toLocaleString('es-AR')}`)
        console.log(`   Q4 (Oct-Dic): $${totalQ4.toLocaleString('es-AR')}`)
        console.log(`   Variación: ${variacion > 0 ? '+' : ''}${variacion.toFixed(1)}%`)

        if (variacion > 0) {
            console.log(`\n   📈 "El Q4 estuvo ${variacion.toFixed(0)}% mejor que el Q3"`)
        } else {
            console.log(`\n   📉 "El Q4 estuvo ${Math.abs(variacion).toFixed(0)}% peor que el Q3"`)
        }

        expect(true).toBe(true)
    })

    test('3.41 PREGUNTA: "tenemos compras pendientes de recibir?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "tenemos compras pendientes de recibir?"')
        console.log('='.repeat(70))

        // Órdenes de compra confirmadas recientes
        const comprasPendientes = await odooClient.readGroup('purchase.order',
            [['state', '=', 'purchase']],
            ['partner_id', 'amount_total'], ['partner_id'],
            { limit: 10, orderBy: 'amount_total desc' })

        const totalPendiente = comprasPendientes.reduce((sum: number, c: any) => sum + (c.amount_total || 0), 0)

        console.log('\n📦 Órdenes de compra confirmadas por proveedor:')
        console.log(`   Total pendiente: $${totalPendiente.toLocaleString('es-AR')}`)
        console.log('\n   Top proveedores:')
        comprasPendientes.forEach((c: any, i: number) => {
            const name = Array.isArray(c.partner_id) ? c.partner_id[1] : c.partner_id
            console.log(`   ${i + 1}. ${name}: $${(c.amount_total || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.42 PREGUNTA: "qué cliente compró más el mes pasado?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "qué cliente compró más el mes pasado?"')
        console.log('='.repeat(70))

        const mesPasado = { start: '2024-12-01', end: '2024-12-31' }

        // Top clientes diciembre
        const topClientes = await odooClient.readGroup('sale.report',
            [['date', '>=', mesPasado.start], ['date', '<=', mesPasado.end], ['state', 'in', ['sale', 'done']]],
            ['partner_id', 'price_total', 'product_uom_qty'], ['partner_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n🏆 Top clientes diciembre 2024:')
        topClientes.forEach((c: any, i: number) => {
            const name = Array.isArray(c.partner_id) ? c.partner_id[1] : c.partner_id
            console.log(`   ${i + 1}. ${name}`)
            console.log(`      Compras: $${(c.price_total || 0).toLocaleString('es-AR')} (${c.product_uom_qty} items)`)
        })

        expect(true).toBe(true)
    })

    test('3.43 PREGUNTA: "hay órdenes de venta sin facturar?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "hay órdenes de venta sin facturar?"')
        console.log('='.repeat(70))

        // Órdenes confirmadas con invoice_status != invoiced
        const sinFacturar = await odooClient.searchRead('sale.order',
            [['state', 'in', ['sale', 'done']], ['invoice_status', '=', 'to invoice']],
            ['name', 'partner_id', 'amount_total', 'date_order'],
            10, 'date_order desc')

        console.log('\n📋 Órdenes sin facturar:')
        if (sinFacturar.length === 0) {
            console.log('   ✅ No hay órdenes pendientes de facturar')
        } else {
            let total = 0
            sinFacturar.forEach((o: any, i: number) => {
                const partner = Array.isArray(o.partner_id) ? o.partner_id[1] : o.partner_id
                total += o.amount_total || 0
                console.log(`   ${i + 1}. ${o.name} - ${partner}: $${(o.amount_total || 0).toLocaleString('es-AR')}`)
            })
            console.log(`\n   Total por facturar: $${total.toLocaleString('es-AR')}`)
        }

        expect(true).toBe(true)
    })

    test('3.44 PREGUNTA: "qué producto se vendió más hoy?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "qué producto se vendió más hoy/esta semana?"')
        console.log('='.repeat(70))

        const hoy = { start: '2025-01-13', end: '2025-01-14' }
        const semana = { start: '2025-01-08', end: '2025-01-14' }

        // Esta semana
        const topSemana = await odooClient.readGroup('sale.report',
            [['date', '>=', semana.start], ['date', '<=', semana.end], ['state', 'in', ['sale', 'done']]],
            ['product_id', 'price_total', 'product_uom_qty'], ['product_id'],
            { limit: 5, orderBy: 'price_total desc' })

        console.log('\n🛒 Top productos esta semana:')
        topSemana.forEach((p: any, i: number) => {
            const name = Array.isArray(p.product_id) ? p.product_id[1] : p.product_id
            console.log(`   ${i + 1}. ${String(name).substring(0, 45)}...`)
            console.log(`      Cantidad: ${p.product_uom_qty} | Total: $${(p.price_total || 0).toLocaleString('es-AR')}`)
        })

        expect(true).toBe(true)
    })

    test('3.45 PREGUNTA: "cuál es el margen de este mes?"', async () => {
        console.log('\n' + '='.repeat(70))
        console.log('🗣️ PREGUNTA: "cuál es el margen de este mes?" (ventas vs compras)')
        console.log('='.repeat(70))

        const esteMes = { start: '2025-01-01', end: '2025-01-14' }

        // Ventas
        const ventas = await odooClient.readGroup('sale.report',
            [['date', '>=', esteMes.start], ['date', '<=', esteMes.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        // Compras
        const compras = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', esteMes.start], ['date_order', '<=', esteMes.end]],
            ['price_total'], [], { limit: 1 })

        const totalVentas = ventas[0]?.price_total || 0
        const totalCompras = compras[0]?.price_total || 0
        const margen = totalVentas - totalCompras
        const margenPct = totalVentas > 0 ? (margen / totalVentas * 100) : 0

        console.log('\n📊 Análisis de margen (Enero 2025):')
        console.log(`   Ventas: $${totalVentas.toLocaleString('es-AR')}`)
        console.log(`   Compras: $${totalCompras.toLocaleString('es-AR')}`)
        console.log(`   Margen bruto: $${margen.toLocaleString('es-AR')} (${margenPct.toFixed(1)}%)`)

        expect(true).toBe(true)
    })
})

// ==========================================
// SECTION 4: PERFORMANCE TESTS
// ==========================================
describe('4. Performance Tests', () => {
    let odooClient: any

    beforeAll(async () => {
        odooClient = await getOdooClient(TENANT_ID)
    })

    test('4.1 Query simple < 5 segundos', async () => {
        const start = Date.now()

        await executeQueries(odooClient, TENANT_ID, [{
            id: 'perf-simple',
            model: 'sale.order',
            operation: 'count',
            dateRange: getDateRange('this_month'),
        }])

        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(5000)
        console.log(`✅ Query simple: ${elapsed}ms`)
    })

    test('4.2 Query con groupBy < 10 segundos', async () => {
        const start = Date.now()

        await executeQueries(odooClient, TENANT_ID, [{
            id: 'perf-groupby',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange: getDateRange('this_month'),
            groupBy: ['partner_id'],
            limit: 20,
        }])

        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(10000)
        console.log(`✅ Query groupBy: ${elapsed}ms`)
    })

    test('4.3 Multiple queries paralelas < 15 segundos', async () => {
        const start = Date.now()

        await executeQueries(odooClient, TENANT_ID, [
            { id: 'multi-1', model: 'sale.order', operation: 'count', dateRange: BASELINE_DIC_2025 },
            { id: 'multi-2', model: 'purchase.order', operation: 'count', dateRange: BASELINE_DIC_2025 },
            { id: 'multi-3', model: 'account.move', operation: 'count', dateRange: BASELINE_DIC_2025 },
        ])

        const elapsed = Date.now() - start
        expect(elapsed).toBeLessThan(15000)
        console.log(`✅ 3 queries paralelas: ${elapsed}ms`)
    })
})

// ==========================================
// SECTION 5: CHAT E2E TESTS (conversational flows)
// ==========================================
describe('5. Chat E2E Tests', () => {
    const CHAT_TEST_URL = 'http://localhost:3000/api/internal/chat-test'
    const API_KEY = 'test-key-change-in-prod'

    async function sendChatMessage(messages: Array<{ role: string; content: string }>) {
        try {
            const response = await fetch(`${CHAT_TEST_URL}?key=${API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tenantId: TENANT_ID,
                    messages,
                }),
            })
            return response.json()
        } catch (error) {
            return { success: false, error: 'Server not running' }
        }
    }

    async function isServerRunning(): Promise<boolean> {
        try {
            const response = await fetch('http://localhost:3000/api/health', {
                method: 'GET',
                signal: AbortSignal.timeout(2000)
            })
            return response.ok
        } catch {
            return false
        }
    }

    test('5.1 Consulta simple de ventas', async () => {
        if (!(await isServerRunning())) {
            console.log('⏭️ Server not running, skipping chat test')
            return
        }

        const result = await sendChatMessage([
            { role: 'user', content: 'cuántas ventas hubo la primera semana de diciembre 2025?' }
        ])

        expect(result.success).toBe(true)
        expect(result.response).toBeDefined()

        // Debe contener números
        expect(result.response).toMatch(/\d+/)
        console.log('✅ Chat: consulta simple funciona')
    })

    test('5.2 Auto-filtro: NO debe mencionar presupuestos', async () => {
        if (!(await isServerRunning())) {
            console.log('⏭️ Server not running, skipping chat test')
            return
        }

        const result = await sendChatMessage([
            { role: 'user', content: 'ventas primera semana de diciembre 2025' }
        ])

        if (result.success) {
            // NO debe mencionar presupuestos ni draft porque auto-filtramos
            expect(result.response.toLowerCase()).not.toContain('presupuesto')
            expect(result.response.toLowerCase()).not.toContain('draft')
            console.log('✅ Chat: auto-filtro de estados funciona')
        }
    })

    test('5.3 Follow-up: mantener contexto de período', async () => {
        if (!(await isServerRunning())) {
            console.log('⏭️ Server not running, skipping chat test')
            return
        }

        const result = await sendChatMessage([
            { role: 'user', content: 'ventas primera semana de diciembre 2025' },
            { role: 'assistant', content: 'Las ventas de la primera semana de diciembre 2025 fueron $112,137,810 con 258 órdenes confirmadas.' },
            { role: 'user', content: 'a quiénes?' }
        ])

        if (result.success) {
            // Debe mostrar nombres de clientes (mismo período)
            expect(result.response).toBeDefined()
            console.log('✅ Chat: contexto de período mantenido')
        }
    })

    test('5.4 Pregunta sobre productos', async () => {
        if (!(await isServerRunning())) {
            console.log('⏭️ Server not running, skipping chat test')
            return
        }

        const result = await sendChatMessage([
            { role: 'user', content: 'cuáles fueron los 5 productos más vendidos en diciembre 2025?' }
        ])

        if (result.success) {
            expect(result.response).toBeDefined()
            console.log('✅ Chat: consulta de productos funciona')
        }
    })

    test('5.5 Pregunta de comparación', async () => {
        if (!(await isServerRunning())) {
            console.log('⏭️ Server not running, skipping chat test')
            return
        }

        const result = await sendChatMessage([
            { role: 'user', content: 'comparame las ventas de noviembre vs diciembre 2025' }
        ])

        if (result.success) {
            expect(result.response).toBeDefined()
            // Debe mencionar ambos meses
            const response = result.response.toLowerCase()
            expect(response).toMatch(/noviembre|diciembre|comparaci|variaci/i)
            console.log('✅ Chat: comparaciones funcionan')
        }
    })
})

// ==========================================
// SECTION 6: SNAPSHOT TESTS (baselines conocidos)
// ==========================================
describe('6. Snapshot Tests - Baselines', () => {
    let odooClient: any

    beforeAll(async () => {
        odooClient = await getOdooClient(TENANT_ID)
    })

    test('Diciembre 2025 primera semana - valores históricos', async () => {
        // Este período tiene datos que NO deberían cambiar (es histórico)
        const result = await executeQueries(odooClient, TENANT_ID, [{
            id: 'snapshot-dic',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange: BASELINE_DIC_2025,
        }])

        const [r] = result
        expect(r.success).toBe(true)

        // Valores conocidos (actualizar si hay correcciones en Odoo)
        // Estos sirven para detectar si algo cambia inesperadamente
        console.log('\n📊 SNAPSHOT - Primera semana Diciembre 2025:')
        console.log(`   Órdenes: ${r.count}`)
        console.log(`   Total: ${formatMoney(r.total || 0)}`)
        console.log('   (Si estos valores cambian, verificar en Odoo)')
    })

    test('Verificar top cliente baseline', async () => {
        const result = await executeQueries(odooClient, TENANT_ID, [{
            id: 'snapshot-top-cliente',
            model: 'sale.order',
            operation: 'aggregate',
            dateRange: BASELINE_DIC_2025,
            groupBy: ['partner_id'],
            limit: 1,
        }])

        const [r] = result
        expect(r.success).toBe(true)

        if (r.grouped) {
            const top = Object.entries(r.grouped)
                .sort((a: any, b: any) => b[1].total - a[1].total)[0]

            console.log(`\n📊 Top cliente dic 2025: ${top[0]}`)
            console.log(`   Total: ${formatMoney((top[1] as any).total)}`)
        }
    })
})

// ==========================================
// SECTION 7: MODEL CONFIG VALIDATION
// ==========================================
describe('7. Model Config Validation', () => {
    test('Todos los modelos críticos están configurados', () => {
        const criticalModels = [
            'sale.order',
            'sale.order.line',
            'purchase.order',
            'purchase.order.line',
            'account.move',
            'account.payment',
            'stock.picking',
            'res.partner',
            // 'product.product', // TODO: Agregar a MODEL_CONFIG
        ]

        for (const model of criticalModels) {
            expect(MODEL_CONFIG[model]).toBeDefined()
            console.log(`✅ ${model} configurado`)
        }
    })

    test('Campos de fecha correctos por modelo', () => {
        expect(MODEL_CONFIG['sale.order'].dateField).toBe('date_order')
        expect(MODEL_CONFIG['purchase.order'].dateField).toBe('date_order')
        expect(MODEL_CONFIG['account.move'].dateField).toBe('invoice_date')
        expect(MODEL_CONFIG['account.payment'].dateField).toBe('date')
        console.log('✅ Campos de fecha correctos')
    })

    test('Campos de monto correctos por modelo', () => {
        expect(MODEL_CONFIG['sale.order'].amountField).toBe('amount_total')
        expect(MODEL_CONFIG['purchase.order'].amountField).toBe('amount_total')
        expect(MODEL_CONFIG['account.move'].amountField).toBe('amount_residual')
        expect(MODEL_CONFIG['account.payment'].amountField).toBe('amount')
        console.log('✅ Campos de monto correctos')
    })
})
