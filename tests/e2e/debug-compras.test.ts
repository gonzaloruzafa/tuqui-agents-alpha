/**
 * Debug: Query directa para comparar con Tuqui
 * 
 * Requires TEST_TENANT_ID in .env.local to run.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { config } from 'dotenv'
import { getOdooClient } from '@/lib/tools/odoo/client'
import { executeQueries } from '@/lib/tools/odoo/query-builder'

config({ path: '.env.local' })

// Environment-based tenant ID
const TENANT_ID = process.env.TEST_TENANT_ID
const SKIP_TESTS = !TENANT_ID

if (SKIP_TESTS) {
    console.log('⚠️  TEST_TENANT_ID not set - skipping debug-compras tests')
}

const fmt = (n: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0
}).format(n)

let odoo: any

describe.skipIf(SKIP_TESTS)('Debug: Compras Este Mes', () => {

    beforeAll(async () => {
        odoo = await getOdooClient(TENANT_ID!)
        console.log('✅ Conectado a Odoo')
    })

    it('Query directa a Odoo (sin executeQueries)', async () => {
        const now = new Date()
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`

        // Query directa con filtro de estado
        const result = await odoo.readGroup(
            'purchase.report',
            [
                ['date_order', '>=', startOfMonth],
                ['date_order', '<=', endOfMonth],
                ['state', 'in', ['purchase', 'done']]
            ],
            ['price_total:sum'],
            [],
            { limit: 1 }
        )

        console.log('\n=== QUERY DIRECTA ===')
        console.log(`Fecha: ${startOfMonth} a ${endOfMonth}`)
        console.log(`Total: ${fmt(result[0]?.price_total || 0)}`)
    })

    it('executeQueries SIN groupBy (aggregate total)', async () => {
        const now = new Date()
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`

        const result = await executeQueries(odoo, TENANT_ID!, [{
            id: 'test-1',
            model: 'purchase.report',
            operation: 'aggregate',
            groupBy: [],  // SIN groupBy
            dateRange: { start: startOfMonth, end: endOfMonth }
        }])

        console.log('\n=== executeQueries SIN groupBy ===')
        console.log(`Total: ${fmt(result[0]?.total || 0)}`)
        console.log(`Count: ${result[0]?.count || 0}`)
    })

    it('executeQueries CON groupBy partner_id', async () => {
        const now = new Date()
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`

        const result = await executeQueries(odoo, TENANT_ID!, [{
            id: 'test-2',
            model: 'purchase.report',
            operation: 'aggregate',
            groupBy: ['partner_id'],  // CON groupBy
            dateRange: { start: startOfMonth, end: endOfMonth }
        }])

        console.log('\n=== executeQueries CON groupBy partner_id ===')
        console.log(`Total: ${fmt(result[0]?.total || 0)}`)
        console.log(`Groups: ${result[0]?.count || 0}`)
        console.log(`Shown: ${result[0]?.shownGroups || 0}`)

        // Mostrar top 5
        const grouped = result[0]?.grouped || {}
        console.log('\nTop 5 proveedores:')
        Object.entries(grouped).slice(0, 5).forEach(([name, data]: [string, any], i) => {
            console.log(`   ${i + 1}. ${name}: ${fmt(data.total)}`)
        })
    })

    it('executeQueries con filters "este mes" (como haría Tuqui)', async () => {
        const result = await executeQueries(odoo, TENANT_ID!, [{
            id: 'test-3',
            model: 'purchase.report',
            operation: 'aggregate',
            filters: 'este mes',  // Filtro en lenguaje natural
            groupBy: []
        }])

        console.log('\n=== executeQueries con filters "este mes" ===')
        console.log(`Total: ${fmt(result[0]?.total || 0)}`)
        console.log(`Count: ${result[0]?.count || 0}`)
    })

    it('COMPARACIÓN FINAL', async () => {
        const now = new Date()
        const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
        const endOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-31`

        // 1. Query directa
        const direct = await odoo.readGroup(
            'purchase.report',
            [
                ['date_order', '>=', startOfMonth],
                ['date_order', '<=', endOfMonth],
                ['state', 'in', ['purchase', 'done']]
            ],
            ['price_total:sum'],
            [],
            { limit: 1 }
        )
        const totalDirect = direct[0]?.price_total || 0

        // 2. executeQueries sin groupBy
        const execNoGroup = await executeQueries(odoo, TENANT_ID!, [{
            id: 'test-4',
            model: 'purchase.report',
            operation: 'aggregate',
            groupBy: [],
            dateRange: { start: startOfMonth, end: endOfMonth }
        }])
        const totalExecNoGroup = execNoGroup[0]?.total || 0

        // 3. executeQueries con groupBy
        const execWithGroup = await executeQueries(odoo, TENANT_ID!, [{
            id: 'test-5',
            model: 'purchase.report',
            operation: 'aggregate',
            groupBy: ['partner_id'],
            dateRange: { start: startOfMonth, end: endOfMonth }
        }])
        const totalExecWithGroup = execWithGroup[0]?.total || 0

        console.log('\n============================================================')
        console.log('📊 COMPARACIÓN FINAL - COMPRAS ENERO 2026')
        console.log('============================================================')
        console.log(`   Query directa:           ${fmt(totalDirect)}`)
        console.log(`   executeQueries sin group: ${fmt(totalExecNoGroup)}`)
        console.log(`   executeQueries con group: ${fmt(totalExecWithGroup)}`)

        // Deben ser iguales (o muy cercanos)
        const diff1 = Math.abs(totalDirect - totalExecNoGroup) / totalDirect * 100
        const diff2 = Math.abs(totalDirect - totalExecWithGroup) / totalDirect * 100

        console.log(`\n   Diferencia sin group: ${diff1.toFixed(2)}%`)
        console.log(`   Diferencia con group: ${diff2.toFixed(2)}%`)

        expect(diff1).toBeLessThan(1)  // Deben ser iguales
        expect(diff2).toBeLessThan(1)  // Deben ser iguales
    })
})
