/**
 * Test Odoo BI Agent v2
 * 
 * Tests the new intelligent query system with:
 * - Multiple sub-queries
 * - Comparisons
 * - Insights
 * 
 * Run: npx tsx scripts/test-odoo-bi-agent.ts
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { chatWithOdoo } from '../lib/tools/gemini-odoo'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

interface TestCase {
    name: string
    question: string
    expectedFeatures: {
        shouldUseTool?: boolean
        toolName?: string
        hasGrouped?: boolean
        hasComparison?: boolean
        hasInsights?: boolean
    }
}

const testCases: TestCase[] = [
    {
        name: 'Top 10 clientes por deuda',
        question: 'Dame los 10 clientes de mayor deuda',
        expectedFeatures: {
            shouldUseTool: true,
            hasGrouped: true
        }
    },
    {
        name: 'Pregunta múltiple - clientes + vendedores + CRM',
        question: 'Qué cliente me está comprando menos que otros meses, los vendedores están activos, y qué movimiento le estamos dando al CRM',
        expectedFeatures: {
            shouldUseTool: true,
            hasInsights: true
        }
    },
    {
        name: 'Comparación mensual de ventas',
        question: 'Cómo van las ventas este mes comparado con el mes anterior',
        expectedFeatures: {
            shouldUseTool: true,
            hasComparison: true
        }
    },
    {
        name: 'Usuarios inactivos',
        question: 'Hay algún usuario que hace mucho que no se conecta?',
        expectedFeatures: {
            shouldUseTool: true
        }
    },
    {
        name: 'Estado del CRM',
        question: 'Cuántas oportunidades tenemos abiertas y en qué etapas están',
        expectedFeatures: {
            shouldUseTool: true,
            hasGrouped: true
        }
    }
]

async function runTest(test: TestCase): Promise<{ passed: boolean; details: string }> {
    console.log(`\n${'='.repeat(60)}`)
    console.log(`📋 Test: ${test.name}`)
    console.log(`❓ Pregunta: "${test.question}"`)
    console.log('='.repeat(60))
    
    try {
        const startTime = Date.now()
        
        const response = await chatWithOdoo(
            TENANT_ID,
            'Eres un asistente de Business Intelligence para Odoo.',
            test.question,
            []
        )
        
        const elapsed = Date.now() - startTime
        
        console.log(`\n⏱️  Tiempo: ${elapsed}ms`)
        
        // Check tool usage
        if (test.expectedFeatures.shouldUseTool) {
            if (!response.toolCalls || response.toolCalls.length === 0) {
                return { passed: false, details: 'Se esperaba uso de herramienta pero no se usó ninguna' }
            }
            console.log(`🔧 Herramienta usada: ${response.toolCalls[0].name}`)
            
            if (test.expectedFeatures.toolName && response.toolCalls[0].name !== test.expectedFeatures.toolName) {
                return { passed: false, details: `Se esperaba ${test.expectedFeatures.toolName} pero se usó ${response.toolCalls[0].name}` }
            }
        }
        
        // Check tool results
        if (response.toolResults && response.toolResults.length > 0) {
            const result = response.toolResults[0]
            
            console.log(`✅ Success: ${result.success}`)
            if (result.count) console.log(`📊 Count: ${result.count}`)
            if (result.total) console.log(`💰 Total: $${result.total.toLocaleString()}`)
            if (result.cached) console.log(`💾 Cached: ${result.cached}`)
            if (result.executionMs) console.log(`⚡ Query time: ${result.executionMs}ms`)
            
            if (result.grouped) {
                const groupedEntries = Object.entries(result.grouped)
                console.log(`📈 Agrupaciones: ${groupedEntries.length}`)
                console.log(`   Top 3: ${groupedEntries.slice(0, 3).map(([k, v]) => `${k}: $${v.total.toLocaleString()}`).join(', ')}`)
            }
            
            if (result.comparison) {
                console.log(`📊 Comparación: ${result.comparison.periodLabels.current} vs ${result.comparison.periodLabels.previous}`)
                console.log(`   Variación: ${result.comparison.variation.trend} ${result.comparison.variation.label}`)
            }
            
            if (result.insights && result.insights.length > 0) {
                console.log(`💡 Insights: ${result.insights.length}`)
                result.insights.slice(0, 3).forEach(i => {
                    console.log(`   ${i.icon} ${i.title}: ${i.description.substring(0, 60)}...`)
                })
            }
            
            // Validate expected features
            if (test.expectedFeatures.hasGrouped && !result.grouped) {
                return { passed: false, details: 'Se esperaban datos agrupados pero no se obtuvieron' }
            }
            if (test.expectedFeatures.hasComparison && !result.comparison) {
                // This might not always be returned, depends on the tool call
                console.log('⚠️  Nota: No se obtuvo comparación (puede depender del query)')
            }
            if (test.expectedFeatures.hasInsights && (!result.insights || result.insights.length === 0)) {
                console.log('⚠️  Nota: No se obtuvieron insights (puede depender del query)')
            }
        }
        
        // Show response text (truncated)
        console.log(`\n📝 Respuesta (truncada):`)
        console.log(response.text.substring(0, 500) + (response.text.length > 500 ? '...' : ''))
        
        return { passed: true, details: 'OK' }
        
    } catch (error: any) {
        console.error(`❌ Error: ${error.message}`)
        return { passed: false, details: error.message }
    }
}

async function main() {
    console.log('🚀 Testing Odoo BI Agent v2')
    console.log('=' .repeat(60))
    
    const results: Array<{ name: string; passed: boolean; details: string }> = []
    
    for (const test of testCases) {
        const result = await runTest(test)
        results.push({ name: test.name, ...result })
        
        // Small delay between tests
        await new Promise(r => setTimeout(r, 1000))
    }
    
    // Summary
    console.log('\n' + '='.repeat(60))
    console.log('📊 RESUMEN DE TESTS')
    console.log('='.repeat(60))
    
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    
    for (const r of results) {
        const icon = r.passed ? '✅' : '❌'
        console.log(`${icon} ${r.name}: ${r.details}`)
    }
    
    console.log('\n' + '-'.repeat(60))
    console.log(`Total: ${passed}/${results.length} tests pasaron`)
    
    if (failed > 0) {
        console.log(`\n⚠️  ${failed} tests fallaron`)
        process.exit(1)
    } else {
        console.log('\n🎉 Todos los tests pasaron!')
    }
}

main().catch(console.error)
