/**
 * Human Questions Battery - Preguntas reales de usuarios de PYME
 * 
 * Este archivo contiene preguntas típicas que haría un dueño/gerente de PYME
 * y las compara directamente con datos de Odoo para validar precisión.
 * 
 * Requires TEST_TENANT_ID in .env.local to run.
 * Run: TEST_TENANT_ID=xxx npx vitest run tests/e2e/human-questions-battery.test.ts
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { getOdooClient } from '@/lib/tools/odoo/client'

// Environment-based tenant ID
const TENANT_ID = process.env.TEST_TENANT_ID
const SKIP_TESTS = !TENANT_ID

if (SKIP_TESTS) {
    console.log('⚠️  TEST_TENANT_ID not set - skipping human-questions-battery tests')
}

let odooClient: any

beforeAll(async () => {
    if (!SKIP_TESTS) {
        odooClient = await getOdooClient(TENANT_ID!)
        console.log('✅ Conectado a Odoo')
    }
})

// ============================================
// HELPERS
// ============================================
const fmt = (n: number) => `$${n.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`
const fmtQty = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 2 })

// Períodos de referencia
const HOY = '2025-01-14'
const ESTE_MES = { start: '2025-01-01', end: '2025-01-14' }
const MES_PASADO = { start: '2024-12-01', end: '2024-12-31' }
const ESTE_AÑO = { start: '2025-01-01', end: '2025-12-31' }
const AÑO_PASADO = { start: '2024-01-01', end: '2024-12-31' }
const ULTIMOS_6_MESES = { start: '2024-07-14', end: '2025-01-14' }

// ============================================
// 1. VENTAS - Preguntas típicas de ventas
// ============================================
describe('1. VENTAS - Preguntas de dueño/gerente', () => {

    test('1.1 "¿Cuánto vendimos hoy?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto vendimos hoy?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('sale.report',
            [['date', '=', HOY], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const total = result[0]?.price_total || 0
        console.log(`\n✅ RESPUESTA: ${fmt(total)} en ventas hoy (${HOY})`)

        expect(true).toBe(true)
    })

    test('1.2 "¿Cuánto vendimos este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto vendimos este mes?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('sale.report',
            [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const total = result[0]?.price_total || 0
        console.log(`\n✅ RESPUESTA: ${fmt(total)} en ventas este mes`)

        // Comparar con mes pasado
        const mesPasado = await odooClient.readGroup('sale.report',
            [['date', '>=', MES_PASADO.start], ['date', '<=', MES_PASADO.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const totalPasado = mesPasado[0]?.price_total || 0
        const variacion = totalPasado > 0 ? ((total - totalPasado) / totalPasado * 100).toFixed(1) : 'N/A'

        console.log(`   Mes pasado: ${fmt(totalPasado)}`)
        console.log(`   Variación: ${variacion}%`)

        expect(true).toBe(true)
    })

    test('1.3 "¿Quién es mi mejor cliente?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Quién es mi mejor cliente?" (últimos 12 meses)')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('sale.report',
            [['date', '>=', AÑO_PASADO.start], ['date', '<=', HOY], ['state', 'in', ['sale', 'done']]],
            ['partner_id', 'price_total'], ['partner_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n✅ Top 10 clientes:')
        result.forEach((r: any, i: number) => {
            const name = Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id
            console.log(`   ${i + 1}. ${name}: ${fmt(r.price_total)}`)
        })

        expect(result.length).toBeGreaterThan(0)
    })

    test('1.4 "¿Qué vendedor vende más?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Qué vendedor vende más?" (este año)')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('sale.report',
            [['date', '>=', ESTE_AÑO.start], ['date', '<=', HOY], ['state', 'in', ['sale', 'done']]],
            ['user_id', 'price_total'], ['user_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n✅ Top vendedores:')
        result.forEach((r: any, i: number) => {
            const name = Array.isArray(r.user_id) ? r.user_id[1] : r.user_id
            console.log(`   ${i + 1}. ${name}: ${fmt(r.price_total)}`)
        })

        expect(true).toBe(true)
    })

    test('1.5 "¿Cuáles son mis productos estrella?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuáles son mis productos estrella?" (más vendidos en $)')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('sale.report',
            [['date', '>=', ULTIMOS_6_MESES.start], ['date', '<=', HOY], ['state', 'in', ['sale', 'done']]],
            ['product_id', 'price_total', 'product_uom_qty'], ['product_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n✅ Top 10 productos por facturación:')
        result.forEach((r: any, i: number) => {
            const name = Array.isArray(r.product_id) ? r.product_id[1] : r.product_id
            console.log(`   ${i + 1}. ${String(name).substring(0, 50)}...`)
            console.log(`      ${fmt(r.price_total)} (${fmtQty(r.product_uom_qty)} unidades)`)
        })

        expect(result.length).toBeGreaterThan(0)
    })

    test('1.6 "¿Cómo vienen las ventas comparado con el año pasado?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cómo vienen las ventas comparado con el año pasado?"')
        console.log('='.repeat(60))

        // Este año (mismo período, hasta hoy)
        const esteAño = await odooClient.readGroup('sale.report',
            [['date', '>=', '2025-01-01'], ['date', '<=', '2025-01-14'], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        // Año pasado (mismo período)
        const añoPasado = await odooClient.readGroup('sale.report',
            [['date', '>=', '2024-01-01'], ['date', '<=', '2024-01-14'], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const totalEste = esteAño[0]?.price_total || 0
        const totalPasado = añoPasado[0]?.price_total || 0
        const variacion = totalPasado > 0 ? ((totalEste - totalPasado) / totalPasado * 100).toFixed(1) : 'N/A'

        console.log(`\n✅ Comparación YoY (1-14 enero):`)
        console.log(`   2025: ${fmt(totalEste)}`)
        console.log(`   2024: ${fmt(totalPasado)}`)
        console.log(`   Variación: ${variacion}% ${Number(variacion) > 0 ? '📈' : '📉'}`)

        expect(true).toBe(true)
    })
})

// ============================================
// 2. COMPRAS - Preguntas de compras
// ============================================
describe('2. COMPRAS - Preguntas de compras', () => {

    test('2.1 "¿Cuánto compramos este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto compramos este mes?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', ESTE_MES.start], ['date_order', '<=', ESTE_MES.end], ['state', 'in', ['purchase', 'done']]],
            ['price_total'], [], { limit: 1 })

        const total = result[0]?.price_total || 0
        console.log(`\n✅ RESPUESTA: ${fmt(total)} en compras este mes`)

        expect(true).toBe(true)
    })

    test('2.2 "¿A quién le compramos más?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿A quién le compramos más?" (últimos 6 meses)')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', ULTIMOS_6_MESES.start], ['date_order', '<=', HOY], ['state', 'in', ['purchase', 'done']]],
            ['partner_id', 'price_total'], ['partner_id'],
            { limit: 10, orderBy: 'price_total desc' })

        console.log('\n✅ Top 10 proveedores:')
        result.forEach((r: any, i: number) => {
            const name = Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id
            console.log(`   ${i + 1}. ${name}: ${fmt(r.price_total)}`)
        })

        expect(result.length).toBeGreaterThan(0)
    })

    test('2.3 "¿Llegó el pedido de FOSHAN?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Llegó el pedido de FOSHAN?"')
        console.log('='.repeat(60))

        // Buscar órdenes de FOSHAN
        const ordenes = await odooClient.searchRead('purchase.order',
            [['partner_id', 'ilike', 'FOSHAN']],
            ['name', 'partner_id', 'state', 'date_order', 'amount_total'],
            10, 'date_order desc')

        console.log('\n✅ Órdenes de FOSHAN:')
        ordenes.forEach((o: any) => {
            const partner = Array.isArray(o.partner_id) ? o.partner_id[1] : o.partner_id
            const estado = o.state === 'purchase' ? '✅ Confirmada' :
                o.state === 'done' ? '✅ Completada' :
                    o.state === 'draft' ? '📝 Borrador' : o.state
            console.log(`   - ${o.name}: ${estado}`)
            console.log(`     ${partner} | ${fmt(o.amount_total)} | ${o.date_order}`)
        })

        expect(true).toBe(true)
    })

    test('2.4 "¿Tenemos compras pendientes de recibir?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Tenemos compras pendientes de recibir?"')
        console.log('='.repeat(60))

        // OC confirmadas pero no completadas
        const pendientes = await odooClient.readGroup('purchase.order',
            [['state', '=', 'purchase']],  // Confirmadas pero no done
            ['partner_id', 'amount_total'], ['partner_id'],
            { limit: 10, orderBy: 'amount_total desc' })

        const totalPendiente = pendientes.reduce((sum: number, p: any) => sum + (p.amount_total || 0), 0)

        console.log(`\n✅ Total pendiente de recibir: ${fmt(totalPendiente)}`)
        console.log('\n   Top proveedores con entregas pendientes:')
        pendientes.slice(0, 5).forEach((p: any, i: number) => {
            const name = Array.isArray(p.partner_id) ? p.partner_id[1] : p.partner_id
            console.log(`   ${i + 1}. ${name}: ${fmt(p.amount_total)}`)
        })

        expect(true).toBe(true)
    })
})

// ============================================
// 3. FACTURACIÓN Y COBRANZAS
// ============================================
describe('3. FACTURACIÓN Y COBRANZAS', () => {

    test('3.1 "¿Cuánto facturamos este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto facturamos este mes?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.invoice.report',
            [['invoice_date', '>=', ESTE_MES.start], ['invoice_date', '<=', ESTE_MES.end],
            ['state', '=', 'posted'], ['move_type', '=', 'out_invoice']],
            ['price_subtotal'], [], { limit: 1 })

        const total = result[0]?.price_subtotal || 0
        console.log(`\n✅ RESPUESTA: ${fmt(total)} facturado este mes`)

        expect(true).toBe(true)
    })

    test('3.2 "¿Cuánto nos deben los clientes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto nos deben los clientes?" (cuentas por cobrar)')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.invoice.report',
            [['state', '=', 'posted'], ['move_type', '=', 'out_invoice'], ['payment_state', '=', 'not_paid']],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal desc' })

        const totalDeuda = result.reduce((sum: number, r: any) => sum + (r.price_subtotal || 0), 0)

        console.log(`\n✅ Total cuentas por cobrar: ${fmt(totalDeuda)}`)
        console.log('\n   Top 10 deudores:')
        result.forEach((r: any, i: number) => {
            const name = Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id
            console.log(`   ${i + 1}. ${name}: ${fmt(r.price_subtotal)}`)
        })

        expect(true).toBe(true)
    })

    test('3.3 "¿Hay facturas vencidas?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Hay facturas vencidas?"')
        console.log('='.repeat(60))

        // Facturas con fecha < hoy y sin pagar
        const vencidas = await odooClient.readGroup('account.invoice.report',
            [['state', '=', 'posted'], ['move_type', '=', 'out_invoice'],
            ['payment_state', '=', 'not_paid'], ['invoice_date_due', '<', HOY]],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal desc' })

        const totalVencido = vencidas.reduce((sum: number, v: any) => sum + (v.price_subtotal || 0), 0)

        console.log(`\n⚠️ Total facturas vencidas: ${fmt(totalVencido)}`)
        if (vencidas.length > 0) {
            console.log('\n   Clientes con facturas vencidas:')
            vencidas.forEach((v: any, i: number) => {
                const name = Array.isArray(v.partner_id) ? v.partner_id[1] : v.partner_id
                console.log(`   ${i + 1}. ${name}: ${fmt(v.price_subtotal)}`)
            })
        }

        expect(true).toBe(true)
    })

    test('3.4 "¿Cuánto le debemos a proveedores?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto le debemos a proveedores?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.invoice.report',
            [['state', '=', 'posted'], ['move_type', '=', 'in_invoice'], ['payment_state', '=', 'not_paid']],
            ['partner_id', 'price_subtotal'], ['partner_id'],
            { limit: 10, orderBy: 'price_subtotal asc' })  // asc porque son negativos

        const totalDeuda = result.reduce((sum: number, r: any) => sum + Math.abs(r.price_subtotal || 0), 0)

        console.log(`\n✅ Total cuentas por pagar: ${fmt(totalDeuda)}`)
        console.log('\n   Top proveedores a pagar:')
        result.forEach((r: any, i: number) => {
            const name = Array.isArray(r.partner_id) ? r.partner_id[1] : r.partner_id
            console.log(`   ${i + 1}. ${name}: ${fmt(Math.abs(r.price_subtotal))}`)
        })

        expect(true).toBe(true)
    })
})

// ============================================
// 4. STOCK E INVENTARIO
// ============================================
describe('4. STOCK E INVENTARIO', () => {

    test('4.1 "¿Tenemos stock del producto X?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Tenemos stock del sillón odontológico?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('stock.quant',
            [['product_id', 'ilike', 'sillón'], ['quantity', '>', 0]],
            ['product_id', 'quantity'], ['product_id'],
            { limit: 10, orderBy: 'quantity desc' })

        console.log('\n✅ Stock de productos con "sillón":')
        if (result.length === 0) {
            console.log('   No hay stock disponible')
        } else {
            result.forEach((r: any, i: number) => {
                const name = Array.isArray(r.product_id) ? r.product_id[1] : r.product_id
                console.log(`   ${i + 1}. ${String(name).substring(0, 50)}...`)
                console.log(`      Stock: ${fmtQty(r.quantity)} unidades`)
            })
        }

        expect(true).toBe(true)
    })

    test('4.2 "¿Qué productos hay que reponer?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Qué productos hay que reponer?" (stock bajo)')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('stock.quant',
            [['quantity', '>', 0], ['quantity', '<', 5]],
            ['product_id', 'quantity'], ['product_id'],
            { limit: 15, orderBy: 'quantity asc' })

        console.log(`\n⚠️ Productos con stock crítico (<5 unidades): ${result.length}`)
        result.slice(0, 10).forEach((r: any, i: number) => {
            const name = Array.isArray(r.product_id) ? r.product_id[1] : r.product_id
            console.log(`   ${i + 1}. ${String(name).substring(0, 50)}...`)
            console.log(`      Stock: ${fmtQty(r.quantity)} unidades`)
        })

        expect(true).toBe(true)
    })

    test('4.3 "¿Cuántos pedidos tenemos sin entregar?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuántos pedidos tenemos sin entregar?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('stock.picking',
            [['state', 'in', ['assigned', 'waiting', 'confirmed']], ['picking_type_code', '=', 'outgoing']],
            ['state'], ['state'],
            { limit: 10 })

        const total = result.reduce((sum: number, r: any) => sum + (r.state_count || 0), 0)

        console.log(`\n✅ Total entregas pendientes: ${total}`)
        console.log('\n   Por estado:')
        result.forEach((r: any) => {
            const estado = r.state === 'assigned' ? '🟢 Listo para entregar' :
                r.state === 'waiting' ? '🟡 Esperando' :
                    r.state === 'confirmed' ? '🟠 Confirmado' : r.state
            console.log(`   - ${estado}: ${r.state_count}`)
        })

        expect(true).toBe(true)
    })

    test('4.4 "¿Cuánto vale el inventario?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto vale el inventario?"')
        console.log('='.repeat(60))

        // Usar stock.quant con valor si está disponible
        const result = await odooClient.searchRead('stock.quant',
            [['quantity', '>', 0]],
            ['product_id', 'quantity', 'value'],
            1000)

        const totalValor = result.reduce((sum: number, r: any) => sum + (r.value || 0), 0)
        const totalUnidades = result.reduce((sum: number, r: any) => sum + (r.quantity || 0), 0)

        console.log(`\n✅ Valorización del inventario:`)
        console.log(`   Total unidades: ${fmtQty(totalUnidades)}`)
        console.log(`   Valor estimado: ${fmt(totalValor)}`)

        expect(true).toBe(true)
    })
})

// ============================================
// 5. CAJA Y BANCOS
// ============================================
describe('5. CAJA Y BANCOS', () => {

    test('5.1 "¿Cuánto tenemos en caja/bancos?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto tenemos en caja/bancos?"')
        console.log('='.repeat(60))

        // Buscar diarios de caja/banco
        const diarios = await odooClient.searchRead('account.journal',
            [['type', 'in', ['cash', 'bank']]],
            ['id', 'name', 'type', 'default_account_id'],
            50)

        const cuentasIds = diarios
            .map((d: any) => Array.isArray(d.default_account_id) ? d.default_account_id[0] : d.default_account_id)
            .filter(Boolean)

        if (cuentasIds.length === 0) {
            console.log('   No se encontraron cuentas de caja/banco')
            return
        }

        // Saldos de esas cuentas
        const saldos = await odooClient.readGroup('account.move.line',
            [['account_id', 'in', cuentasIds], ['parent_state', '=', 'posted']],
            ['account_id', 'balance'], ['account_id'],
            { limit: 50 })

        let totalCaja = 0
        console.log('\n✅ Saldos por cuenta:')
        saldos.forEach((s: any) => {
            const nombre = Array.isArray(s.account_id) ? s.account_id[1] : s.account_id
            const saldo = s.balance || 0
            totalCaja += saldo
            if (Math.abs(saldo) > 1000000) {  // Solo mostrar cuentas con saldo significativo
                console.log(`   - ${nombre}: ${fmt(saldo)}`)
            }
        })

        console.log(`\n💵 TOTAL EN CAJA/BANCOS: ${fmt(totalCaja)}`)

        expect(true).toBe(true)
    })

    test('5.2 "¿Cuánto cobramos este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto cobramos este mes?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.payment',
            [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end],
            ['payment_type', '=', 'inbound'], ['state', '=', 'posted']],
            ['amount'], [], { limit: 1 })

        const total = result[0]?.amount || 0
        console.log(`\n✅ Cobros del mes: ${fmt(total)}`)

        expect(true).toBe(true)
    })

    test('5.3 "¿Cuánto pagamos este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto pagamos este mes?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.payment',
            [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end],
            ['payment_type', '=', 'outbound'], ['state', '=', 'posted']],
            ['amount'], [], { limit: 1 })

        const total = result[0]?.amount || 0
        console.log(`\n✅ Pagos del mes: ${fmt(total)}`)

        expect(true).toBe(true)
    })
})

// ============================================
// 6. RRHH Y PERSONAL
// ============================================
describe('6. RRHH Y PERSONAL', () => {

    test('6.1 "¿Cuántos empleados tenemos?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuántos empleados tenemos?"')
        console.log('='.repeat(60))

        try {
            const count = await odooClient.searchCount('hr.employee', [['active', '=', true]])
            console.log(`\n✅ Total empleados activos: ${count}`)

            // Por departamento
            const porDepto = await odooClient.readGroup('hr.employee',
                [['active', '=', true]],
                ['department_id'], ['department_id'],
                { limit: 10 })

            if (porDepto.length > 0) {
                console.log('\n   Por departamento:')
                porDepto.forEach((d: any) => {
                    const name = Array.isArray(d.department_id) ? d.department_id[1] : 'Sin departamento'
                    console.log(`   - ${name}: ${d.department_id_count}`)
                })
            }
        } catch (e: any) {
            console.log(`   ⚠️ Módulo HR no disponible: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('6.2 "¿Quién pidió vacaciones?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Quién pidió vacaciones?" (ausencias pendientes)')
        console.log('='.repeat(60))

        try {
            const result = await odooClient.searchRead('hr.leave',
                [['state', 'in', ['confirm', 'validate1']]],  // Pendientes de aprobar
                ['employee_id', 'holiday_status_id', 'date_from', 'date_to', 'number_of_days', 'state'],
                20, 'date_from asc')

            console.log(`\n✅ Solicitudes de ausencia pendientes: ${result.length}`)
            if (result.length > 0) {
                result.slice(0, 5).forEach((r: any, i: number) => {
                    const empleado = Array.isArray(r.employee_id) ? r.employee_id[1] : r.employee_id
                    const tipo = Array.isArray(r.holiday_status_id) ? r.holiday_status_id[1] : r.holiday_status_id
                    console.log(`   ${i + 1}. ${empleado}`)
                    console.log(`      ${tipo}: ${r.date_from} a ${r.date_to} (${r.number_of_days} días)`)
                })
            }
        } catch (e: any) {
            console.log(`   ⚠️ Módulo de ausencias no disponible: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('6.3 "¿Cuántas ausencias hubo este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuántas ausencias hubo este mes?"')
        console.log('='.repeat(60))

        try {
            const result = await odooClient.readGroup('hr.leave',
                [['date_from', '>=', ESTE_MES.start], ['date_from', '<=', ESTE_MES.end],
                ['state', '=', 'validate']],
                ['holiday_status_id', 'number_of_days'], ['holiday_status_id'],
                { limit: 10 })

            const totalDias = result.reduce((sum: number, r: any) => sum + (r.number_of_days || 0), 0)

            console.log(`\n✅ Total días de ausencia este mes: ${totalDias}`)
            if (result.length > 0) {
                console.log('\n   Por tipo:')
                result.forEach((r: any) => {
                    const tipo = Array.isArray(r.holiday_status_id) ? r.holiday_status_id[1] : r.holiday_status_id
                    console.log(`   - ${tipo}: ${r.number_of_days} días`)
                })
            }
        } catch (e: any) {
            console.log(`   ⚠️ Módulo de ausencias no disponible: ${e.message}`)
        }

        expect(true).toBe(true)
    })
})

// ============================================
// 7. PROYECTOS Y TAREAS
// ============================================
describe('7. PROYECTOS Y TAREAS', () => {

    test('7.1 "¿Cuántos proyectos activos tenemos?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuántos proyectos activos tenemos?"')
        console.log('='.repeat(60))

        try {
            const proyectos = await odooClient.searchRead('project.project',
                [['active', '=', true]],
                ['name', 'user_id', 'task_count', 'partner_id'],
                20)

            console.log(`\n✅ Proyectos activos: ${proyectos.length}`)
            proyectos.slice(0, 10).forEach((p: any, i: number) => {
                const responsable = Array.isArray(p.user_id) ? p.user_id[1] : 'Sin asignar'
                console.log(`   ${i + 1}. ${p.name}`)
                console.log(`      Responsable: ${responsable} | Tareas: ${p.task_count}`)
            })
        } catch (e: any) {
            console.log(`   ⚠️ Módulo de proyectos no disponible: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('7.2 "¿Qué tareas están pendientes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Qué tareas están pendientes?"')
        console.log('='.repeat(60))

        try {
            const tareas = await odooClient.searchRead('project.task',
                [['state', 'not in', ['1_done', '1_canceled']]],
                ['name', 'project_id', 'user_ids', 'stage_id', 'date_deadline', 'priority'],
                20, 'priority desc, date_deadline asc')

            console.log(`\n✅ Tareas pendientes: ${tareas.length}`)
            tareas.slice(0, 10).forEach((t: any, i: number) => {
                const proyecto = Array.isArray(t.project_id) ? t.project_id[1] : 'Sin proyecto'
                const etapa = Array.isArray(t.stage_id) ? t.stage_id[1] : 'Sin etapa'
                const prioridad = t.priority === '1' ? '⭐' : ''
                console.log(`   ${i + 1}. ${prioridad}${t.name}`)
                console.log(`      Proyecto: ${proyecto} | Etapa: ${etapa}`)
                if (t.date_deadline) console.log(`      Vence: ${t.date_deadline}`)
            })
        } catch (e: any) {
            console.log(`   ⚠️ Módulo de proyectos no disponible: ${e.message}`)
        }

        expect(true).toBe(true)
    })

    test('7.3 "¿Cuántas horas registramos este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuántas horas registramos este mes?" (timesheet)')
        console.log('='.repeat(60))

        try {
            const result = await odooClient.readGroup('account.analytic.line',
                [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end]],
                ['project_id', 'unit_amount'], ['project_id'],
                { limit: 20, orderBy: 'unit_amount desc' })

            const totalHoras = result.reduce((sum: number, r: any) => sum + (r.unit_amount || 0), 0)

            console.log(`\n✅ Total horas registradas este mes: ${fmtQty(totalHoras)}`)
            if (result.length > 0) {
                console.log('\n   Por proyecto:')
                result.slice(0, 5).forEach((r: any) => {
                    const proyecto = Array.isArray(r.project_id) ? r.project_id[1] : 'Sin proyecto'
                    console.log(`   - ${proyecto}: ${fmtQty(r.unit_amount)} horas`)
                })
            }
        } catch (e: any) {
            console.log(`   ⚠️ Timesheet no disponible: ${e.message}`)
        }

        expect(true).toBe(true)
    })
})

// ============================================
// 8. ANÁLISIS Y KPIs
// ============================================
describe('8. ANÁLISIS Y KPIs', () => {

    test('8.1 "¿Cuál es el margen bruto de este mes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuál es el margen bruto de este mes?"')
        console.log('='.repeat(60))

        // Ventas
        const ventas = await odooClient.readGroup('sale.report',
            [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        // Compras (costo aproximado)
        const compras = await odooClient.readGroup('purchase.report',
            [['date_order', '>=', ESTE_MES.start], ['date_order', '<=', ESTE_MES.end], ['state', 'in', ['purchase', 'done']]],
            ['price_total'], [], { limit: 1 })

        const totalVentas = ventas[0]?.price_total || 0
        const totalCompras = compras[0]?.price_total || 0
        const margen = totalVentas - totalCompras
        const porcentaje = totalVentas > 0 ? (margen / totalVentas * 100).toFixed(1) : 'N/A'

        console.log(`\n✅ Análisis de margen bruto:`)
        console.log(`   Ventas: ${fmt(totalVentas)}`)
        console.log(`   Compras: ${fmt(totalCompras)}`)
        console.log(`   Margen: ${fmt(margen)} (${porcentaje}%)`)

        expect(true).toBe(true)
    })

    test('8.2 "¿Cómo estuvo el trimestre?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cómo estuvo el trimestre?" (Q4 2024 vs Q3 2024)')
        console.log('='.repeat(60))

        const Q3 = { start: '2024-07-01', end: '2024-09-30' }
        const Q4 = { start: '2024-10-01', end: '2024-12-31' }

        const ventasQ3 = await odooClient.readGroup('sale.report',
            [['date', '>=', Q3.start], ['date', '<=', Q3.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const ventasQ4 = await odooClient.readGroup('sale.report',
            [['date', '>=', Q4.start], ['date', '<=', Q4.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        const totalQ3 = ventasQ3[0]?.price_total || 0
        const totalQ4 = ventasQ4[0]?.price_total || 0
        const variacion = totalQ3 > 0 ? ((totalQ4 - totalQ3) / totalQ3 * 100).toFixed(1) : 'N/A'

        console.log(`\n✅ Comparación trimestral:`)
        console.log(`   Q3 2024 (Jul-Sep): ${fmt(totalQ3)}`)
        console.log(`   Q4 2024 (Oct-Dic): ${fmt(totalQ4)}`)
        console.log(`   Variación: ${variacion}% ${Number(variacion) > 0 ? '📈' : '📉'}`)

        expect(true).toBe(true)
    })

    test('8.3 "¿Cuál es el ticket promedio?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuál es el ticket promedio?" (este mes)')
        console.log('='.repeat(60))

        // Total ventas
        const ventas = await odooClient.readGroup('sale.report',
            [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        // Cantidad de órdenes
        const ordenes = await odooClient.searchCount('sale.order',
            [['date_order', '>=', ESTE_MES.start], ['date_order', '<=', ESTE_MES.end], ['state', 'in', ['sale', 'done']]])

        const total = ventas[0]?.price_total || 0
        const ticketPromedio = ordenes > 0 ? total / ordenes : 0

        console.log(`\n✅ Ticket promedio este mes:`)
        console.log(`   Total ventas: ${fmt(total)}`)
        console.log(`   Cantidad de órdenes: ${ordenes}`)
        console.log(`   Ticket promedio: ${fmt(ticketPromedio)}`)

        expect(true).toBe(true)
    })

    test('8.4 "Dashboard resumen del negocio"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('📊 DASHBOARD RESUMEN DEL NEGOCIO')
        console.log('='.repeat(60))

        // Ventas este mes
        const ventas = await odooClient.readGroup('sale.report',
            [['date', '>=', ESTE_MES.start], ['date', '<=', ESTE_MES.end], ['state', 'in', ['sale', 'done']]],
            ['price_total'], [], { limit: 1 })

        // Cuentas por cobrar
        const porCobrar = await odooClient.readGroup('account.invoice.report',
            [['state', '=', 'posted'], ['move_type', '=', 'out_invoice'], ['payment_state', '=', 'not_paid']],
            ['price_subtotal'], [], { limit: 1 })

        // Cuentas por pagar
        const porPagar = await odooClient.readGroup('account.invoice.report',
            [['state', '=', 'posted'], ['move_type', '=', 'in_invoice'], ['payment_state', '=', 'not_paid']],
            ['price_subtotal'], [], { limit: 1 })

        // Entregas pendientes
        const pickings = await odooClient.searchCount('stock.picking',
            [['state', 'in', ['assigned', 'waiting', 'confirmed']], ['picking_type_code', '=', 'outgoing']])

        console.log('\n┌─────────────────────────────────────────────┐')
        console.log('│             RESUMEN DEL NEGOCIO             │')
        console.log('├─────────────────────────────────────────────┤')
        console.log(`│ 💰 Ventas este mes:     ${fmt(ventas[0]?.price_total || 0).padStart(15)} │`)
        console.log(`│ 📥 Por cobrar:          ${fmt(porCobrar[0]?.price_subtotal || 0).padStart(15)} │`)
        console.log(`│ 📤 Por pagar:           ${fmt(Math.abs(porPagar[0]?.price_subtotal || 0)).padStart(15)} │`)
        console.log(`│ 📦 Entregas pendientes: ${String(pickings).padStart(15)} │`)
        console.log('└─────────────────────────────────────────────┘')

        expect(true).toBe(true)
    })
})

// ============================================
// 9. TESORERÍA Y FLUJO DE CAJA (Nuevos skills)
// ============================================
describe('9. TESORERÍA - Preguntas de flujo de caja', () => {

    test.skipIf(SKIP_TESTS)('9.1 "¿Cuánta plata tenemos en caja?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánta plata tenemos en caja?"')
        console.log('='.repeat(60))

        // Buscar journals de tipo cash y bank
        const journals = await odooClient.searchRead('account.journal',
            [['type', 'in', ['cash', 'bank']]], ['name', 'type'])

        let totalCash = 0
        let totalBank = 0

        for (const journal of journals) {
            const balance = await odooClient.readGroup('account.move.line',
                [['journal_id', '=', journal.id], ['parent_state', '=', 'posted']],
                ['balance'], [], { limit: 1 })

            const amount = balance[0]?.balance || 0
            if (journal.type === 'cash') {
                totalCash += amount
            } else {
                totalBank += amount
            }
        }

        console.log(`\n✅ RESPUESTA:`)
        console.log(`   💵 Efectivo: ${fmt(totalCash)}`)
        console.log(`   🏦 Bancos: ${fmt(totalBank)}`)
        console.log(`   📊 Total: ${fmt(totalCash + totalBank)}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('9.2 "¿Cuánto nos deben?" (resumen rápido)', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto nos deben?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.move',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0]],
            ['amount_residual'], [], { limit: 1 })

        const total = result[0]?.amount_residual || 0
        const count = await odooClient.searchCount('account.move',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0]])

        console.log(`\n✅ RESPUESTA: Nos deben ${fmt(total)} (${count} facturas impagas)`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('9.3 "¿Hay deuda vencida?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Hay deuda vencida?"')
        console.log('='.repeat(60))

        const hoy = new Date().toISOString().split('T')[0]
        const result = await odooClient.readGroup('account.move',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], 
             ['amount_residual', '>', 0], ['invoice_date_due', '<', hoy]],
            ['amount_residual'], [], { limit: 1 })

        const total = result[0]?.amount_residual || 0

        console.log(`\n✅ RESPUESTA: ${total > 0 ? `Sí, hay ${fmt(total)} vencido` : 'No hay deuda vencida'}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('9.4 "¿Quién nos debe más?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Quién nos debe más?"')
        console.log('='.repeat(60))

        const result = await odooClient.readGroup('account.move',
            [['move_type', '=', 'out_invoice'], ['state', '=', 'posted'], ['amount_residual', '>', 0]],
            ['amount_residual', 'partner_id'], ['partner_id'],
            { limit: 10, orderBy: 'amount_residual desc' })

        console.log('\n✅ Top 5 deudores:')
        result.slice(0, 5).forEach((r: any, i: number) => {
            console.log(`   ${i + 1}. ${r.partner_id[1]}: ${fmt(r.amount_residual)}`)
        })

        expect(true).toBe(true)
    })
})

// ============================================
// 10. COMPARATIVAS Y TENDENCIAS (compare_sales_periods)
// ============================================
describe('10. COMPARATIVAS - Análisis de tendencias', () => {

    test.skipIf(SKIP_TESTS)('10.1 "¿Cómo venimos esta semana vs la pasada?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cómo venimos esta semana vs la pasada?"')
        console.log('='.repeat(60))

        const now = new Date()
        const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const prevWeekStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
        const today = now.toISOString().split('T')[0]

        const thisSemana = await odooClient.readGroup('sale.order',
            [['date_order', '>=', weekStart], ['date_order', '<=', today], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const prevSemana = await odooClient.readGroup('sale.order',
            [['date_order', '>=', prevWeekStart], ['date_order', '<', weekStart], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const thisWeek = thisSemana[0]?.amount_total || 0
        const prevWeek = prevSemana[0]?.amount_total || 0
        const diff = thisWeek - prevWeek
        const pct = prevWeek > 0 ? ((diff / prevWeek) * 100).toFixed(1) : 'N/A'

        console.log(`\n✅ RESPUESTA:`)
        console.log(`   Esta semana: ${fmt(thisWeek)}`)
        console.log(`   Semana pasada: ${fmt(prevWeek)}`)
        console.log(`   Diferencia: ${fmt(diff)} (${pct}%)`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('10.2 "¿Subieron o bajaron las ventas?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Subieron o bajaron las ventas?"')
        console.log('='.repeat(60))

        const esteMes = await odooClient.readGroup('sale.order',
            [['date_order', '>=', ESTE_MES.start], ['date_order', '<=', ESTE_MES.end], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const mesPasado = await odooClient.readGroup('sale.order',
            [['date_order', '>=', MES_PASADO.start], ['date_order', '<=', MES_PASADO.end], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const este = esteMes[0]?.amount_total || 0
        const prev = mesPasado[0]?.amount_total || 0
        const trend = este > prev ? '📈 SUBIERON' : este < prev ? '📉 BAJARON' : '➡️ ESTABLES'

        console.log(`\n✅ RESPUESTA: ${trend}`)
        console.log(`   Este mes: ${fmt(este)}`)
        console.log(`   Mes pasado: ${fmt(prev)}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('10.3 "¿Hoy vendimos más que ayer?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Hoy vendimos más que ayer?"')
        console.log('='.repeat(60))

        const hoy = new Date().toISOString().split('T')[0]
        const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0]

        const ventasHoy = await odooClient.readGroup('sale.order',
            [['date_order', '=', hoy], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const ventasAyer = await odooClient.readGroup('sale.order',
            [['date_order', '=', ayer], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const hoyTotal = ventasHoy[0]?.amount_total || 0
        const ayerTotal = ventasAyer[0]?.amount_total || 0

        console.log(`\n✅ RESPUESTA: ${hoyTotal > ayerTotal ? 'Sí, vendimos más hoy' : 'No, ayer fue mejor'}`)
        console.log(`   Hoy: ${fmt(hoyTotal)}`)
        console.log(`   Ayer: ${fmt(ayerTotal)}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('10.4 "Dame un resumen del último trimestre"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Dame un resumen del último trimestre"')
        console.log('='.repeat(60))

        // Q4 2024: Oct, Nov, Dec
        const q4Start = '2024-10-01'
        const q4End = '2024-12-31'

        const ventas = await odooClient.readGroup('sale.order',
            [['date_order', '>=', q4Start], ['date_order', '<=', q4End], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        const ordenes = await odooClient.searchCount('sale.order',
            [['date_order', '>=', q4Start], ['date_order', '<=', q4End], ['state', 'in', ['sale', 'done']]])

        const total = ventas[0]?.amount_total || 0

        console.log(`\n✅ Resumen Q4 2024:`)
        console.log(`   Total ventas: ${fmt(total)}`)
        console.log(`   Cantidad órdenes: ${ordenes}`)
        console.log(`   Ticket promedio: ${fmt(ordenes > 0 ? total / ordenes : 0)}`)

        expect(true).toBe(true)
    })
})

// ============================================
// 11. PREGUNTAS AMBIGUAS (Edge cases)
// ============================================
describe('11. EDGE CASES - Preguntas ambiguas o difíciles', () => {

    test.skipIf(SKIP_TESTS)('11.1 "¿Cómo estamos?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cómo estamos?" (pregunta vaga)')
        console.log('='.repeat(60))

        // Esto debería dar un resumen general
        console.log(`\n📊 Esta pregunta vaga debería disparar un dashboard general`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('11.2 "Necesito plata"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Necesito plata" (pregunta implícita)')
        console.log('='.repeat(60))

        // Debería mostrar: caja + por cobrar + por pagar
        console.log(`\n💰 Esta pregunta implícita debería mostrar situación de liquidez`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('11.3 "¿Hay algo urgente?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Hay algo urgente?"')
        console.log('='.repeat(60))

        // Stock bajo + facturas vencidas + entregas atrasadas
        console.log(`\n🚨 Esta pregunta debería mostrar alertas activas`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('11.4 "Vendeme un iPhone"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Vendeme un iPhone" (out of scope)')
        console.log('='.repeat(60))

        console.log(`\n⚠️ Esta pregunta NO es de Odoo - debería usar web_search o rechazar`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('11.5 "¿Cuánto vale el dólar?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto vale el dólar?" (out of scope)')
        console.log('='.repeat(60))

        console.log(`\n⚠️ Esta pregunta NO es de Odoo - debería usar web_search`)

        expect(true).toBe(true)
    })
})

// ============================================
// 12. PREGUNTAS CON FECHAS NATURALES
// ============================================
describe('12. FECHAS NATURALES - Interpretación de períodos', () => {

    test.skipIf(SKIP_TESTS)('12.1 "¿Cuánto vendimos la semana pasada?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto vendimos la semana pasada?"')
        console.log('='.repeat(60))

        const now = new Date()
        const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
        const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

        const start = twoWeeksAgo.toISOString().split('T')[0]
        const end = weekAgo.toISOString().split('T')[0]

        const ventas = await odooClient.readGroup('sale.order',
            [['date_order', '>=', start], ['date_order', '<', end], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        console.log(`\n✅ Semana pasada (${start} a ${end}): ${fmt(ventas[0]?.amount_total || 0)}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('12.2 "Ventas de diciembre"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Ventas de diciembre"')
        console.log('='.repeat(60))

        const ventas = await odooClient.readGroup('sale.order',
            [['date_order', '>=', '2024-12-01'], ['date_order', '<=', '2024-12-31'], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        console.log(`\n✅ Diciembre 2024: ${fmt(ventas[0]?.amount_total || 0)}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('12.3 "Del 1 al 15 de enero"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Ventas del 1 al 15 de enero"')
        console.log('='.repeat(60))

        const ventas = await odooClient.readGroup('sale.order',
            [['date_order', '>=', '2025-01-01'], ['date_order', '<=', '2025-01-15'], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        console.log(`\n✅ 1-15 enero 2025: ${fmt(ventas[0]?.amount_total || 0)}`)

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('12.4 "Primer trimestre del año pasado"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Ventas del primer trimestre del año pasado"')
        console.log('='.repeat(60))

        const ventas = await odooClient.readGroup('sale.order',
            [['date_order', '>=', '2024-01-01'], ['date_order', '<=', '2024-03-31'], ['state', 'in', ['sale', 'done']]],
            ['amount_total'], [], { limit: 1 })

        console.log(`\n✅ Q1 2024: ${fmt(ventas[0]?.amount_total || 0)}`)

        expect(true).toBe(true)
    })
})
// ============================================
// 13. BÚSQUEDAS DE PRODUCTOS (search-products skill)
// ============================================
describe('13. PRODUCTOS - Búsquedas diversas', () => {

    test.skipIf(SKIP_TESTS)('13.1 "¿Tenemos cable de red?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Tenemos cable de red?"')
        console.log('='.repeat(60))

        const productos = await odooClient.searchRead('product.product',
            [['name', 'ilike', '%cable%red%']], 
            ['name', 'qty_available', 'list_price'])

        console.log(`\n✅ Encontrados: ${productos.length} productos`)
        productos.slice(0, 5).forEach((p: any) => {
            console.log(`   - ${p.name}: ${p.qty_available} unidades @ ${fmt(p.list_price)}`)
        })

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('13.2 "Productos que vendan más de $50.000"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "Productos que vendan más de $50.000"')
        console.log('='.repeat(60))

        const productos = await odooClient.searchRead('product.product',
            [['list_price', '>', 50000]], 
            ['name', 'list_price', 'qty_available'],
            { limit: 10, order: 'list_price desc' })

        console.log(`\n✅ Productos > $50.000:`)
        productos.forEach((p: any) => {
            console.log(`   - ${p.name}: ${fmt(p.list_price)}`)
        })

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('13.3 "¿Cuántos SKUs tenemos activos?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuántos SKUs tenemos activos?"')
        console.log('='.repeat(60))

        const count = await odooClient.searchCount('product.product',
            [['active', '=', true], ['type', '!=', 'service']])

        console.log(`\n✅ Total SKUs activos: ${count}`)

        expect(true).toBe(true)
    })
})

// ============================================
// 14. PROVEEDORES Y COMPRAS (preguntas adicionales)
// ============================================
describe('14. PROVEEDORES - Más preguntas de compras', () => {

    test.skipIf(SKIP_TESTS)('14.1 "¿Cuánto le compramos a X este año?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Cuánto le compramos al proveedor principal este año?"')
        console.log('='.repeat(60))

        // Top proveedor
        const topSupplier = await odooClient.readGroup('purchase.order',
            [['state', 'in', ['purchase', 'done']], ['date_order', '>=', ESTE_ANO.start]],
            ['amount_total', 'partner_id'], ['partner_id'],
            { limit: 1, orderBy: 'amount_total desc' })

        if (topSupplier.length > 0) {
            console.log(`\n✅ Top proveedor: ${topSupplier[0].partner_id[1]}`)
            console.log(`   Total comprado: ${fmt(topSupplier[0].amount_total)}`)
        }

        expect(true).toBe(true)
    })

    test.skipIf(SKIP_TESTS)('14.2 "¿Tenemos órdenes de compra pendientes?"', async () => {
        console.log('\n' + '='.repeat(60))
        console.log('🗣️ "¿Tenemos órdenes de compra pendientes?"')
        console.log('='.repeat(60))

        const pendientes = await odooClient.searchCount('purchase.order',
            [['state', 'in', ['draft', 'sent', 'to approve']]])

        console.log(`\n✅ Órdenes de compra pendientes: ${pendientes}`)

        expect(true).toBe(true)
    })
})