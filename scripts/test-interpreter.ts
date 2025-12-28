/**
 * Test Runner for Interpreter + Conversational Questions
 * 
 * Testea:
 * 1. Solo el intérprete (sin Odoo)
 * 2. Flujo completo con contexto conversacional
 */

import 'dotenv-flow/config'
import { interpretQuery } from '../lib/tools/odoo/interpreter'
import { streamChatWithOdoo } from '../lib/tools/gemini-odoo-v2'
import { 
    SIMPLE_QUESTIONS, 
    CONVERSATIONAL_TESTS, 
    EDGE_CASES,
    ConversationalTest 
} from './conversational-questions'
import { Content } from '@google/generative-ai'
import * as fs from 'fs'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

interface TestResult {
    id: number | string
    question: string
    category: string
    interpreted?: any
    response?: string
    success: boolean
    error?: string
    durationMs: number
}

// ============================================
// TEST 1: INTERPRETER ONLY
// ============================================
async function testInterpreterOnly(questions: string[]): Promise<TestResult[]> {
    console.log('\n' + '='.repeat(70))
    console.log('🧠 TEST 1: INTERPRETER ONLY (sin llamar a Odoo)')
    console.log('='.repeat(70))
    
    const results: TestResult[] = []
    
    for (let i = 0; i < questions.length; i++) {
        const q = questions[i]
        const start = Date.now()
        
        try {
            const interpreted = await interpretQuery(q, [])
            const duration = Date.now() - start
            
            const success = interpreted.intent !== 'clarify' && interpreted.model !== undefined
            
            console.log(`\n[${i + 1}/${questions.length}] "${q.substring(0, 50)}..."`)
            console.log(`   → Intent: ${interpreted.intent}, Model: ${interpreted.model}`)
            console.log(`   → ${success ? '✅' : '⚠️'} ${duration}ms`)
            
            results.push({
                id: i + 1,
                question: q,
                category: 'simple',
                interpreted,
                success,
                durationMs: duration
            })
        } catch (e: any) {
            console.log(`\n[${i + 1}] "${q}" → ❌ Error: ${e.message}`)
            results.push({
                id: i + 1,
                question: q,
                category: 'simple',
                success: false,
                error: e.message,
                durationMs: Date.now() - start
            })
        }
        
        // Rate limiting
        await new Promise(r => setTimeout(r, 200))
    }
    
    return results
}

// ============================================
// TEST 2: CONVERSATIONAL INTERPRETER
// ============================================
async function testConversationalInterpreter(tests: ConversationalTest[]): Promise<TestResult[]> {
    console.log('\n' + '='.repeat(70))
    console.log('💬 TEST 2: CONVERSATIONAL INTERPRETER (con historial)')
    console.log('='.repeat(70))
    
    const results: TestResult[] = []
    
    for (const test of tests) {
        const start = Date.now()
        
        // Convertir mensajes a formato Content[]
        const history: Content[] = test.messages.slice(0, -1).map(m => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        }))
        
        const lastMessage = test.messages[test.messages.length - 1].content
        
        try {
            const interpreted = await interpretQuery(lastMessage, history)
            const duration = Date.now() - start
            
            // Evaluar si la interpretación es correcta según expectedBehavior
            const hasContext = !!interpreted.contextFromHistory
            const success = interpreted.intent !== 'clarify'
            
            console.log(`\n[${test.id}] ${test.category}`)
            console.log(`   Historial: ${test.messages.length - 1} mensajes`)
            console.log(`   Pregunta: "${lastMessage}"`)
            console.log(`   → Intent: ${interpreted.intent}, Model: ${interpreted.model}`)
            console.log(`   → GroupBy: ${interpreted.groupBy?.join(', ') || 'ninguno'}`)
            console.log(`   → Contexto: ${interpreted.contextFromHistory || 'ninguno'}`)
            console.log(`   → ${success ? '✅' : '⚠️'} ${hasContext ? '(usó contexto)' : ''} ${duration}ms`)
            
            results.push({
                id: test.id,
                question: lastMessage,
                category: test.category,
                interpreted,
                success,
                durationMs: duration
            })
        } catch (e: any) {
            console.log(`\n[${test.id}] ${test.category} → ❌ Error: ${e.message}`)
            results.push({
                id: test.id,
                question: lastMessage,
                category: test.category,
                success: false,
                error: e.message,
                durationMs: Date.now() - start
            })
        }
        
        await new Promise(r => setTimeout(r, 200))
    }
    
    return results
}

// ============================================
// TEST 3: FULL FLOW (Interpreter + Odoo)
// ============================================
async function testFullFlow(questions: string[], count: number = 10): Promise<TestResult[]> {
    console.log('\n' + '='.repeat(70))
    console.log('🚀 TEST 3: FULL FLOW (Interpreter + Odoo)')
    console.log('='.repeat(70))
    
    const results: TestResult[] = []
    const toTest = questions.slice(0, count)
    
    for (let i = 0; i < toTest.length; i++) {
        const q = toTest[i]
        const start = Date.now()
        
        try {
            let response = ''
            const stream = streamChatWithOdoo(TENANT_ID, '', q, [])
            
            for await (const chunk of stream) {
                response += chunk
            }
            
            const duration = Date.now() - start
            const hasData = response.includes('$') || response.includes('total') || 
                           response.includes('vendimos') || /\d+/.test(response)
            
            console.log(`\n[${i + 1}/${toTest.length}] "${q}"`)
            console.log(`   → ${response.substring(0, 150).replace(/\n/g, ' ')}...`)
            console.log(`   → ${hasData ? '✅' : '⚠️'} ${duration}ms`)
            
            results.push({
                id: i + 1,
                question: q,
                category: 'full-flow',
                response,
                success: hasData,
                durationMs: duration
            })
        } catch (e: any) {
            console.log(`\n[${i + 1}] "${q}" → ❌ Error: ${e.message}`)
            results.push({
                id: i + 1,
                question: q,
                category: 'full-flow',
                success: false,
                error: e.message,
                durationMs: Date.now() - start
            })
        }
        
        await new Promise(r => setTimeout(r, 500))
    }
    
    return results
}

// ============================================
// MAIN
// ============================================
async function main() {
    const args = process.argv.slice(2)
    const mode = args[0] || 'all'
    
    console.log('🧪 Odoo BI Agent - Test Suite con Intérprete')
    console.log('Modo:', mode)
    
    let allResults: TestResult[] = []
    
    if (mode === 'interpreter' || mode === 'all') {
        // Test 1: Solo intérprete con preguntas simples
        const simpleResults = await testInterpreterOnly(SIMPLE_QUESTIONS.slice(0, 20))
        allResults = [...allResults, ...simpleResults]
        
        // Test 2: Intérprete con contexto conversacional
        const convResults = await testConversationalInterpreter(CONVERSATIONAL_TESTS)
        allResults = [...allResults, ...convResults]
    }
    
    if (mode === 'full' || mode === 'all') {
        // Test 3: Flujo completo
        const fullResults = await testFullFlow(SIMPLE_QUESTIONS, 10)
        allResults = [...allResults, ...fullResults]
    }
    
    if (mode === 'edge') {
        // Test edge cases
        const edgeResults = await testInterpreterOnly(EDGE_CASES)
        allResults = [...allResults, ...edgeResults]
    }
    
    // ============================================
    // RESUMEN
    // ============================================
    console.log('\n' + '='.repeat(70))
    console.log('📊 RESUMEN')
    console.log('='.repeat(70))
    
    const successful = allResults.filter(r => r.success).length
    const total = allResults.length
    const rate = ((successful / total) * 100).toFixed(1)
    
    console.log(`Total: ${total}`)
    console.log(`✅ Exitosos: ${successful}`)
    console.log(`⚠️ Fallidos: ${total - successful}`)
    console.log(`Tasa de éxito: ${rate}%`)
    
    // Agrupar por categoría
    const byCategory: Record<string, { success: number; total: number }> = {}
    for (const r of allResults) {
        if (!byCategory[r.category]) {
            byCategory[r.category] = { success: 0, total: 0 }
        }
        byCategory[r.category].total++
        if (r.success) byCategory[r.category].success++
    }
    
    console.log('\nPor categoría:')
    for (const [cat, stats] of Object.entries(byCategory)) {
        const catRate = ((stats.success / stats.total) * 100).toFixed(0)
        console.log(`  ${cat}: ${stats.success}/${stats.total} (${catRate}%)`)
    }
    
    // Guardar resultados
    const filename = `interpreter-results-${new Date().toISOString().split('T')[0]}.json`
    fs.writeFileSync(filename, JSON.stringify(allResults, null, 2))
    console.log(`\n💾 Resultados guardados en: ${filename}`)
    
    // Mostrar fallas
    const failures = allResults.filter(r => !r.success)
    if (failures.length > 0) {
        console.log('\n❌ FALLAS:')
        for (const f of failures.slice(0, 10)) {
            console.log(`  [${f.id}] ${f.question.substring(0, 50)}...`)
            console.log(`      ${f.error || 'Interpretación incompleta'}`)
        }
    }
}

main().catch(console.error)
