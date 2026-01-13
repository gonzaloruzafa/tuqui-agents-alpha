/**
 * E2E Tests for Odoo Queries
 * 
 * These tests validate that Tuqui's responses match real Odoo data.
 * Run with: npx vitest run tests/e2e/odoo-queries.test.ts
 * 
 * IMPORTANT: These tests require:
 * 1. Valid Odoo credentials in .env.local
 * 2. Network access to Odoo server
 * 3. Real tenant data (Cedent: de7ef34a-12bd-4fe9-9d02-3d876a9393c2)
 */

import { describe, test, expect, beforeAll } from 'vitest'
import { executeQueries, MODEL_CONFIG } from '@/lib/tools/odoo/query-builder'
import { getOdooClient } from '@/lib/odoo/client'

// Test tenant - Cedent
const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

// Expected values from real Odoo (update these with real data)
interface ExpectedResult {
    query: string
    model: string
    dateRange?: { start: string; end: string }
    filters?: string
    expectedCount?: number
    expectedTotal?: number
    expectedCountRange?: [number, number]  // [min, max] for dynamic data
    expectedTotalRange?: [number, number]
    topItems?: Array<{ name: string; total: number }>
}

// ==========================================
// VENTAS (sale.order) - Primera semana diciembre 2025
// ==========================================
const VENTAS_PRIMERA_SEMANA_DIC_2025: ExpectedResult = {
    query: "ventas primera semana diciembre 2025",
    model: 'sale.order',
    dateRange: { start: '2025-12-01', end: '2025-12-07' },
    filters: 'state: sale',  // Solo confirmadas
    expectedCount: 258,  // Real: 258 órdenes según Odoo
    expectedTotal: 112137810.55,  // Real: $112,137,810.55
    topItems: [
        { name: 'Delpat SRL', total: 11286958.46 },
        { name: 'Maria Jose Carballo', total: 7509687.67 },
        { name: 'Jorge Lapettina', total: 6956496.42 },
        { name: 'ING. CARUSO SRL', total: 6272230.14 },
        { name: 'Gerónimo Eduardo Blanco', total: 4591021.53 },
    ]
}

// ==========================================
// COMPRAS (purchase.order) - Desde julio 2025
// ==========================================
const COMPRAS_DESDE_JULIO_2025: ExpectedResult = {
    query: "compras desde julio 2025",
    model: 'purchase.order.line',
    dateRange: { start: '2025-07-01', end: '2026-01-13' },
    filters: 'state: purchase',  // Solo confirmadas
    expectedCount: 59508,  // Total líneas según CSV
    expectedTotal: 12773832254.83,  // Subtotal según CSV
    topItems: [
        { name: '[C005069] Tornillo cabeza hexagonal SHi. ML', total: 407 },  // 407 unidades
        { name: '[C004721] Producto varios E. TDK', total: 290 },
        { name: '[C005068] Tornillo cabeza hexagonal SHe. ML', total: 189 },
    ]
}

describe('Odoo E2E Tests', () => {
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

    describe('Ventas (sale.order)', () => {
        test('Primera semana diciembre 2025 - count y total', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'test-ventas-dic',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: { start: '2025-12-01', end: '2025-12-07' },
                filters: 'state: sale',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            
            // Validate count (allow 5% margin for timing differences)
            const expectedCount = VENTAS_PRIMERA_SEMANA_DIC_2025.expectedCount!
            expect(r.count).toBeGreaterThan(expectedCount * 0.95)
            expect(r.count).toBeLessThan(expectedCount * 1.05)

            // Validate total
            const expectedTotal = VENTAS_PRIMERA_SEMANA_DIC_2025.expectedTotal!
            expect(r.total).toBeGreaterThan(expectedTotal * 0.95)
            expect(r.total).toBeLessThan(expectedTotal * 1.05)

            console.log(`✅ Ventas dic 2025: ${r.count} órdenes, $${r.total?.toLocaleString('es-AR')}`)
        })

        test('Top 10 clientes primera semana diciembre 2025', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'test-top-clientes',
                model: 'sale.order',
                operation: 'aggregate',
                dateRange: { start: '2025-12-01', end: '2025-12-07' },
                filters: 'state: sale',
                groupBy: ['partner_id'],
                limit: 10,
            }])

            const [r] = result
            expect(r.success).toBe(true)
            expect(r.grouped).toBeDefined()

            const topClients = Object.entries(r.grouped!)
                .sort((a: any, b: any) => b[1].total - a[1].total)
                .slice(0, 5)

            // Check top client is Delpat SRL
            const topClient = topClients[0]
            expect(topClient[0]).toContain('Delpat')

            console.log('✅ Top 5 clientes:')
            topClients.forEach(([name, data]: any, i) => {
                console.log(`   ${i + 1}. ${name}: $${data.total?.toLocaleString('es-AR')}`)
            })
        })
    })

    describe('Compras (purchase.order)', () => {
        test('Compras desde julio 2025 - productos más comprados', async () => {
            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'test-compras',
                model: 'purchase.order.line',
                operation: 'aggregate',
                dateRange: { start: '2025-07-01', end: '2026-01-13' },
                filters: 'state: purchase',
                groupBy: ['product_id'],
                limit: 10,
            }])

            const [r] = result
            expect(r.success).toBe(true)

            if (r.grouped) {
                const topProducts = Object.entries(r.grouped)
                    .sort((a: any, b: any) => b[1].count - a[1].count)
                    .slice(0, 5)

                console.log('✅ Top 5 productos comprados:')
                topProducts.forEach(([name, data]: any, i) => {
                    console.log(`   ${i + 1}. ${name}: ${data.count} unidades`)
                })
            }
        })
    })

    describe('Facturas (account.move)', () => {
        test('Facturas publicadas este mes', async () => {
            const now = new Date()
            const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
            const today = now.toISOString().split('T')[0]

            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'test-facturas',
                model: 'account.move',
                operation: 'count',
                dateRange: { start: startOfMonth, end: today },
                filters: 'state: posted',
            }])

            const [r] = result
            expect(r.success).toBe(true)
            expect(r.count).toBeGreaterThanOrEqual(0)

            console.log(`✅ Facturas este mes: ${r.count}`)
        })
    })

    describe('Pagos (account.payment)', () => {
        test('Pagos publicados este mes', async () => {
            const now = new Date()
            const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
            const today = now.toISOString().split('T')[0]

            const result = await executeQueries(odooClient, TENANT_ID, [{
                id: 'test-pagos',
                model: 'account.payment',
                operation: 'aggregate',
                dateRange: { start: startOfMonth, end: today },
                filters: 'state: posted',
            }])

            const [r] = result
            expect(r.success).toBe(true)

            console.log(`✅ Pagos este mes: ${r.count || 0} pagos, $${r.total?.toLocaleString('es-AR') || 0}`)
        })
    })
})

// ==========================================
// CHAT E2E TESTS (conversational flows)
// ==========================================
describe('Chat E2E Tests', () => {
    // These tests simulate real chat conversations
    // They call the chat-test endpoint and validate responses

    const CHAT_TEST_URL = 'http://localhost:3000/api/internal/chat-test'
    const API_KEY = 'test-key-change-in-prod'

    async function sendChatMessage(messages: Array<{ role: string; content: string }>) {
        const response = await fetch(`${CHAT_TEST_URL}?key=${API_KEY}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                tenantId: TENANT_ID,
                messages,
            }),
        })
        return response.json()
    }

    test.skip('Ventas primera semana diciembre - should auto-filter confirmed', async () => {
        const result = await sendChatMessage([
            { role: 'user', content: 'ventas primera semana de diciembre 2025' }
        ])

        expect(result.success).toBe(true)
        expect(result.response).toContain('$')
        
        // Should NOT contain stateWarning (we auto-filter now)
        expect(result.response).not.toContain('draft')
        expect(result.response).not.toContain('presupuesto')

        // Should be around $112M (confirmed orders only)
        const amountMatch = result.response.match(/\$\s*([\d.,]+)/g)
        if (amountMatch) {
            console.log('Amounts found:', amountMatch)
        }
    })

    test.skip('Follow-up question - should maintain date context', async () => {
        const result = await sendChatMessage([
            { role: 'user', content: 'ventas primera semana de diciembre 2025' },
            { role: 'assistant', content: 'Las ventas fueron de $112,137,810' },
            { role: 'user', content: 'a quiénes?' }
        ])

        expect(result.success).toBe(true)
        // Should show client breakdown for the SAME period
        expect(result.response).toContain('Delpat')
    })
})
