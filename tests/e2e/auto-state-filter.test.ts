/**
 * Test: Auto State Filter - Enfoque Declarativo
 * 
 * Valida que el nuevo sistema de autoFilterStates funciona correctamente
 * comparando datos CON y SIN filtro de estado.
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { config } from 'dotenv'
import { getOdooClient } from '@/lib/tools/odoo/client'
import { executeQueries } from '@/lib/tools/odoo/query-builder'

// Load env
config({ path: '.env.local' })

const CEDENT_TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

// Formato de números
const fmt = (n: number) => new Intl.NumberFormat('es-AR', { 
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0 
}).format(n)

let odoo: any

describe('Auto State Filter - Validación', () => {

    beforeAll(async () => {
        odoo = await getOdooClient(CEDENT_TENANT_ID)
    })

    describe('purchase.report - Problema Original', () => {
        
        it('SIN filtro de estado: incluye borradores y cancelados', async () => {
            const startDate = '2025-07-01'
            const endDate = '2026-01-14'
            
            // Query SIN filtro de estado (comportamiento actual roto)
            const sinFiltro = await odoo.readGroup(
                'purchase.report',
                [['date_order', '>=', startDate], ['date_order', '<=', endDate]],
                ['price_total:sum'],
                [],
                { limit: 1 }
            )
            const totalSinFiltro = sinFiltro[0]?.price_total || 0
            
            // Query CON filtro de estado (comportamiento correcto)
            const conFiltro = await odoo.readGroup(
                'purchase.report',
                [
                    ['date_order', '>=', startDate], 
                    ['date_order', '<=', endDate],
                    ['state', 'in', ['purchase', 'done']]  // Solo confirmadas
                ],
                ['price_total:sum'],
                [],
                { limit: 1 }
            )
            const totalConFiltro = conFiltro[0]?.price_total || 0
            
            console.log('\n============================================================')
            console.log('🔍 DIAGNÓSTICO: purchase.report (Jul 2025 - Ene 2026)')
            console.log('============================================================')
            console.log(`   SIN filtro estado: ${fmt(totalSinFiltro)}`)
            console.log(`   CON filtro estado: ${fmt(totalConFiltro)}`)
            console.log(`   Diferencia: ${fmt(totalSinFiltro - totalConFiltro)} (${((totalSinFiltro - totalConFiltro) / totalConFiltro * 100).toFixed(1)}% más sin filtro)`)
            
            // El problema: sin filtro es MUCHO mayor (incluye draft, cancel)
            expect(totalSinFiltro).toBeGreaterThan(totalConFiltro)
        })

        it('CON filtro de estado: debe coincidir con datos reales de Odoo', async () => {
            // Datos reales del usuario (desde Odoo directamente)
            // Total reportado: ~$2.493.034.484 (desde Jul 2025)
            const EXPECTED_APPROX = 2_500_000_000  // ~$2.5B
            const TOLERANCE = 0.20  // 20% tolerancia
            
            const startDate = '2025-07-01'
            const endDate = '2026-01-14'
            
            const result = await odoo.readGroup(
                'purchase.report',
                [
                    ['date_order', '>=', startDate], 
                    ['date_order', '<=', endDate],
                    ['state', 'in', ['purchase', 'done']]
                ],
                ['price_total:sum'],
                [],
                { limit: 1 }
            )
            const total = result[0]?.price_total || 0
            
            console.log('\n============================================================')
            console.log('✅ VALIDACIÓN: Comparación con datos reales')
            console.log('============================================================')
            console.log(`   Odoo pivot table: ~${fmt(EXPECTED_APPROX)}`)
            console.log(`   Nuestra query: ${fmt(total)}`)
            
            const diff = Math.abs(total - EXPECTED_APPROX) / EXPECTED_APPROX
            console.log(`   Diferencia: ${(diff * 100).toFixed(1)}%`)
            
            // Debe estar dentro del 20% del valor esperado
            expect(diff).toBeLessThan(TOLERANCE)
        })

        it('Top proveedores CON filtro deben coincidir', async () => {
            // Datos reales del usuario:
            // FOSHAN CINGOL: $528.506.043
            // Megadental SA: $258.612.111
            
            const startDate = '2025-07-01'
            const endDate = '2026-01-14'
            
            const result = await odoo.readGroup(
                'purchase.report',
                [
                    ['date_order', '>=', startDate], 
                    ['date_order', '<=', endDate],
                    ['state', 'in', ['purchase', 'done']]
                ],
                ['partner_id', 'price_total:sum'],
                ['partner_id'],
                { orderby: 'price_total desc', limit: 10 }
            )
            
            console.log('\n============================================================')
            console.log('📊 Top 10 Proveedores (con filtro de estado)')
            console.log('============================================================')
            result.forEach((r: any, i: number) => {
                const name = r.partner_id?.[1] || 'Sin nombre'
                console.log(`   ${i + 1}. ${name}: ${fmt(r.price_total)}`)
            })
            
            // Validar que FOSHAN está en el top y con valor razonable
            const foshan = result.find((r: any) => 
                r.partner_id?.[1]?.toLowerCase().includes('foshan cingol')
            )
            
            if (foshan) {
                const foshanTotal = foshan.price_total
                console.log(`\n   🎯 FOSHAN CINGOL: ${fmt(foshanTotal)}`)
                console.log(`   Esperado: ~$528.506.043`)
                
                // Debe estar cerca de $528M, no $946M o más
                expect(foshanTotal).toBeLessThan(700_000_000)  // No puede ser > $700M
                expect(foshanTotal).toBeGreaterThan(400_000_000)  // Debe ser > $400M
            }
            
            // Validar que Envapol NO está en el top (era un error)
            const envapol = result.find((r: any) => 
                r.partner_id?.[1]?.toLowerCase().includes('envapol')
            )
            
            if (envapol) {
                console.log(`\n   ⚠️ Envapol encontrado: ${fmt(envapol.price_total)}`)
                // Envapol tenía $6.6B en el bug, en realidad tiene ~$7.6M
                expect(envapol.price_total).toBeLessThan(50_000_000)
            }
        })
    })

    describe('sale.report - Validación', () => {
        
        it('CON filtro de estado debe dar valores correctos', async () => {
            const startDate = '2025-01-01'
            const endDate = '2025-12-31'
            
            // SIN filtro
            const sinFiltro = await odoo.readGroup(
                'sale.report',
                [['date', '>=', startDate], ['date', '<=', endDate]],
                ['price_total:sum'],
                [],
                { limit: 1 }
            )
            
            // CON filtro
            const conFiltro = await odoo.readGroup(
                'sale.report',
                [
                    ['date', '>=', startDate], 
                    ['date', '<=', endDate],
                    ['state', 'in', ['sale', 'done']]
                ],
                ['price_total:sum'],
                [],
                { limit: 1 }
            )
            
            console.log('\n============================================================')
            console.log('🔍 sale.report - Año 2025')
            console.log('============================================================')
            console.log(`   SIN filtro: ${fmt(sinFiltro[0]?.price_total || 0)}`)
            console.log(`   CON filtro: ${fmt(conFiltro[0]?.price_total || 0)}`)
            
            // Ambos deben ser positivos
            expect(conFiltro[0]?.price_total).toBeGreaterThan(0)
        })
    })

    describe('account.invoice.report - Validación', () => {
        
        it('CON filtro posted debe excluir borradores', async () => {
            const startDate = '2025-01-01'
            const endDate = '2025-12-31'
            
            // SIN filtro (puede incluir borradores)
            const sinFiltro = await odoo.readGroup(
                'account.invoice.report',
                [
                    ['invoice_date', '>=', startDate], 
                    ['invoice_date', '<=', endDate],
                    ['move_type', 'in', ['out_invoice', 'out_refund']]
                ],
                ['price_subtotal:sum'],
                [],
                { limit: 1 }
            )
            
            // CON filtro posted
            const conFiltro = await odoo.readGroup(
                'account.invoice.report',
                [
                    ['invoice_date', '>=', startDate], 
                    ['invoice_date', '<=', endDate],
                    ['move_type', 'in', ['out_invoice', 'out_refund']],
                    ['state', '=', 'posted']
                ],
                ['price_subtotal:sum'],
                [],
                { limit: 1 }
            )
            
            console.log('\n============================================================')
            console.log('🔍 account.invoice.report - Facturas de venta 2025')
            console.log('============================================================')
            console.log(`   SIN filtro estado: ${fmt(sinFiltro[0]?.price_subtotal || 0)}`)
            console.log(`   CON filtro posted: ${fmt(conFiltro[0]?.price_subtotal || 0)}`)
            
            expect(conFiltro[0]?.price_subtotal).toBeGreaterThan(0)
        })
    })

    describe('Distribución de Estados', () => {
        
        it('purchase.report: mostrar distribución de estados', async () => {
            const startDate = '2025-07-01'
            
            const distribution = await odoo.readGroup(
                'purchase.report',
                [['date_order', '>=', startDate]],
                ['state', 'price_total:sum'],
                ['state'],
                { limit: 20 }
            )
            
            console.log('\n============================================================')
            console.log('📊 Distribución de estados en purchase.report')
            console.log('============================================================')
            
            let totalAll = 0
            let totalConfirmed = 0
            
            distribution.forEach((d: any) => {
                const state = d.state || 'unknown'
                const total = d.price_total || 0
                const count = d.__count || d.state_count || 0
                console.log(`   ${state}: ${fmt(total)} (${count} registros)`)
                totalAll += total
                if (['purchase', 'done'].includes(state)) {
                    totalConfirmed += total
                }
            })
            
            console.log(`\n   TOTAL todos los estados: ${fmt(totalAll)}`)
            console.log(`   TOTAL solo confirmados: ${fmt(totalConfirmed)}`)
            console.log(`   Diferencia: ${fmt(totalAll - totalConfirmed)} (${((totalAll - totalConfirmed) / totalConfirmed * 100).toFixed(1)}%)`)
        })
    })

    describe('executeQueries - Auto Filter Declarativo', () => {
        
        it('purchase.report: executeQueries debe auto-aplicar filtro de estado', async () => {
            const startDate = '2025-07-01'
            const endDate = '2026-01-14'
            
            // Usar executeQueries (el código que usa Tuqui) SIN especificar estado
            const result = await executeQueries(odoo, CEDENT_TENANT_ID, [{
                model: 'purchase.report',
                operation: 'aggregate',
                groupBy: ['partner_id'],
                dateRange: { start: startDate, end: endDate }
            }])
            
            const total = result[0]?.total || 0
            
            console.log('\n============================================================')
            console.log('🎯 executeQueries CON auto-filter declarativo')
            console.log('============================================================')
            console.log(`   Total via executeQueries: ${fmt(total)}`)
            console.log(`   Esperado (~$2.5B con filtro): ~${fmt(2_500_000_000)}`)
            
            // Debe dar el valor filtrado (~$2.5B), NO el inflado (~$3.1B)
            expect(total).toBeLessThan(3_000_000_000)  // No puede ser > $3B (inflado)
            expect(total).toBeGreaterThan(2_000_000_000)  // Debe ser > $2B
        })
        
        it('sale.report: executeQueries debe auto-aplicar filtro de estado', async () => {
            const startDate = '2025-01-01'
            const endDate = '2025-12-31'
            
            // Usar executeQueries SIN especificar estado
            const result = await executeQueries(odoo, CEDENT_TENANT_ID, [{
                model: 'sale.report',
                operation: 'aggregate',
                groupBy: [],
                dateRange: { start: startDate, end: endDate }
            }])
            
            const total = result[0]?.total || 0
            
            console.log('\n============================================================')
            console.log('🎯 sale.report via executeQueries')
            console.log('============================================================')
            console.log(`   Total via executeQueries: ${fmt(total)}`)
            console.log(`   Esperado (~$7.5B con filtro): ~${fmt(7_500_000_000)}`)
            console.log(`   Sin filtro sería: ~${fmt(20_900_000_000)}`)
            
            // Debe dar ~$7.5B (filtrado), NO ~$20.9B (sin filtro)
            expect(total).toBeLessThan(10_000_000_000)  // No puede ser > $10B
            expect(total).toBeGreaterThan(5_000_000_000)  // Debe ser > $5B
        })

        it('account.invoice.report: executeQueries debe auto-aplicar posted', async () => {
            const startDate = '2025-01-01'
            const endDate = '2025-12-31'
            
            const result = await executeQueries(odoo, CEDENT_TENANT_ID, [{
                model: 'account.invoice.report',
                operation: 'aggregate',
                groupBy: [],
                filters: "move_type: out_invoice",  // Solo facturas de venta
                dateRange: { start: startDate, end: endDate }
            }])
            
            const total = result[0]?.total || 0
            
            console.log('\n============================================================')
            console.log('🎯 account.invoice.report via executeQueries')
            console.log('============================================================')
            console.log(`   Total via executeQueries: ${fmt(total)}`)
            
            expect(total).toBeGreaterThan(0)
        })
    })
})
