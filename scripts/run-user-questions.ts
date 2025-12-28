/**
 * Runner para ejecutar las preguntas de usuario contra el agente
 * 
 * Uso:
 *   npx tsx scripts/run-user-questions.ts                    # 5 aleatorias
 *   npx tsx scripts/run-user-questions.ts --all              # Todas (200)
 *   npx tsx scripts/run-user-questions.ts --category "Deuda" # Por categoría
 *   npx tsx scripts/run-user-questions.ts --n 20             # N aleatorias
 *   npx tsx scripts/run-user-questions.ts --id 42            # Una específica
 */

import { config } from 'dotenv'
config({ path: '.env.local' })

import { streamChatWithOdoo } from '../lib/tools/gemini-odoo'
import { 
    USER_QUESTIONS, 
    CATEGORIES, 
    getQuestionsByCategory, 
    getRandomQuestions,
    UserQuestion 
} from './user-questions'
import * as fs from 'fs'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

interface TestResult {
    id: number
    category: string
    question: string
    response: string
    durationMs: number
    hasData: boolean
    timestamp: string
}

async function runQuestion(q: UserQuestion): Promise<TestResult> {
    const start = Date.now()
    let response = ''
    
    try {
        const stream = streamChatWithOdoo(TENANT_ID, '', q.question, [])
        
        for await (const chunk of stream) {
            response += chunk
        }
    } catch (error: any) {
        response = `ERROR: ${error.message}`
    }
    
    const durationMs = Date.now() - start
    
    // Heurística simple: tiene datos si responde algo sustancial
    const hasData = response.length > 50 && 
        !response.toLowerCase().includes('no tengo datos') &&
        !response.toLowerCase().includes('no encontré') &&
        !response.toLowerCase().includes('no puedo')
    
    return {
        id: q.id,
        category: q.category,
        question: q.question,
        response: response.trim(),
        durationMs,
        hasData,
        timestamp: new Date().toISOString()
    }
}

async function main() {
    const args = process.argv.slice(2)
    
    let questions: UserQuestion[] = []
    
    // Parse args
    if (args.includes('--all')) {
        questions = USER_QUESTIONS
    } else if (args.includes('--category')) {
        const idx = args.indexOf('--category')
        const cat = args[idx + 1]
        questions = getQuestionsByCategory(cat)
        if (questions.length === 0) {
            console.log(`❌ Categoría "${cat}" no encontrada.`)
            console.log(`Categorías disponibles: ${CATEGORIES.join(', ')}`)
            process.exit(1)
        }
    } else if (args.includes('--id')) {
        const idx = args.indexOf('--id')
        const id = parseInt(args[idx + 1])
        const q = USER_QUESTIONS.find(q => q.id === id)
        if (!q) {
            console.log(`❌ Pregunta #${id} no encontrada.`)
            process.exit(1)
        }
        questions = [q]
    } else if (args.includes('--n')) {
        const idx = args.indexOf('--n')
        const n = parseInt(args[idx + 1]) || 10
        questions = getRandomQuestions(n)
    } else {
        // Default: 5 aleatorias
        questions = getRandomQuestions(5)
    }
    
    console.log(`\n🧪 Ejecutando ${questions.length} preguntas...\n`)
    console.log('='.repeat(70))
    
    const results: TestResult[] = []
    let passed = 0
    let failed = 0
    
    for (const q of questions) {
        console.log(`\n📝 [${q.id}] ${q.category}`)
        console.log(`   Q: ${q.question}`)
        console.log('-'.repeat(70))
        
        const result = await runQuestion(q)
        results.push(result)
        
        // Mostrar respuesta (truncada si es muy larga)
        const displayResponse = result.response.length > 500 
            ? result.response.substring(0, 500) + '...' 
            : result.response
        console.log(`   A: ${displayResponse}`)
        console.log(`   ⏱️  ${result.durationMs}ms | ${result.hasData ? '✅ Con datos' : '⚠️  Sin datos'}`)
        
        if (result.hasData) passed++
        else failed++
    }
    
    // Resumen
    console.log('\n' + '='.repeat(70))
    console.log(`\n📊 RESUMEN`)
    console.log(`   Total: ${questions.length}`)
    console.log(`   ✅ Con datos: ${passed}`)
    console.log(`   ⚠️  Sin datos: ${failed}`)
    console.log(`   Tasa de éxito: ${Math.round(passed / questions.length * 100)}%`)
    
    // Guardar resultados
    const filename = `test-results-${new Date().toISOString().split('T')[0]}.json`
    fs.writeFileSync(filename, JSON.stringify(results, null, 2))
    console.log(`\n💾 Resultados guardados en: ${filename}`)
}

main().catch(console.error)
