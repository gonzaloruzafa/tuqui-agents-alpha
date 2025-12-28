/**
 * Test específico para consultas de deuda de clientes
 * 
 * Run: npx tsx scripts/test-odoo-deuda.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { chatWithOdoo } from '../lib/tools/gemini-odoo'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

const systemPrompt = `Eres Tuqui Odoo, un asistente de ERP que ayuda a consultar datos de Odoo.

IMPORTANTE para consultas de DEUDA de clientes:
- Para obtener deuda por cliente, usa odoo_summary con type="facturas_cliente", period="por cobrar" y group_by="partner"
- Esto agrupa facturas con amount_residual > 0 por cliente

Responde siempre en español, de forma clara y concisa.`

const testQueries = [
    'dame los 10 clientes de mayor deuda',
    'cuál es el cliente que más debe',
    'clientes con facturas pendientes de cobro',
    'resumen de deuda por cliente',
    'top 5 deudores',
]

async function main() {
    console.log('🧪 Test de Consultas de Deuda\n')
    
    for (const query of testQueries) {
        console.log(`\n📝 Query: "${query}"`)
        console.log('-'.repeat(60))
        
        try {
            const result = await chatWithOdoo(
                TENANT_ID,
                systemPrompt,
                query
            )
            
            if (result.toolCalls) {
                result.toolCalls.forEach(tc => {
                    console.log(`   📞 Tool: ${tc.name}`)
                    console.log(`   📋 Args: ${JSON.stringify(tc.args)}`)
                })
            }
            
            if (result.toolResults) {
                result.toolResults.forEach((tr, i) => {
                    console.log(`   ${tr.success ? '✅' : '❌'} Result ${i + 1}:`, 
                        tr.success 
                            ? `${tr.count || 0} records` 
                            : tr.error
                    )
                    if (tr.grouped_data) {
                        console.log('   📊 Top 5 grupos:')
                        Object.entries(tr.grouped_data).slice(0, 5).forEach(([k, v]) => {
                            console.log(`      - ${k}: $${v.total.toLocaleString()} (${v.count} facturas)`)
                        })
                    }
                })
            }
            
            console.log(`\n   💬 Response: ${result.text.substring(0, 200)}...`)
            
        } catch (error: any) {
            console.log(`   ❌ ERROR: ${error.message}`)
        }
    }
    
    console.log('\n✨ Tests completados')
}

main().catch(console.error)
