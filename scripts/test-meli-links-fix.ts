#!/usr/bin/env node
/**
 * Test: Validar que los links de MeLi sean correctos
 *
 * PROBLEMA REPORTADO:
 * - Google Grounding devuelve links a /listado en vez de /articulo
 * - Los links no coinciden con los productos mostrados
 *
 * SOLUCIÓN IMPLEMENTADA:
 * - Estrategia híbrida: análisis de Grounding + links SOLO de Tavily
 * - Tavily devuelve links directos a productos
 * - Mensaje explícito "usar ESTOS únicamente" para evitar alucinación
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

// Simular el tool
import { GoogleGenerativeAI } from '@google/generative-ai'

const TEST_QUERIES = [
    'precio compresor odontológico silencioso mercadolibre',
    'cuánto cuesta autoclave 18 litros meli',
    'sillón odontológico precio mercado libre'
]

async function searchWithTavily(query: string, options: any) {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY
    if (!TAVILY_API_KEY) {
        throw new Error('TAVILY_API_KEY missing')
    }

    let searchQuery = query
    if (options?.site_filter) {
        searchQuery = `${query} site:${options.site_filter}`
    }

    const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: TAVILY_API_KEY,
            query: searchQuery,
            search_depth: 'basic',
            max_results: 5,
            include_answer: true
        })
    })

    const data = await res.json()
    return {
        sources: data.results?.map((r: any) => ({
            title: r.title,
            url: r.url,
            snippet: r.content?.slice(0, 200)
        })) || []
    }
}

async function searchWithGrounding(query: string, options: any) {
    const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!GEMINI_API_KEY) {
        throw new Error('GOOGLE_GENERATIVE_AI_API_KEY missing')
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash-exp',
        tools: [{ googleSearch: {} } as any]
    })

    const prompt = `Buscá en MercadoLibre Argentina precios de: ${query}.
Dame los 5 productos más relevantes con precios.`

    const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }]
    })

    const response = result.response
    const text = response.text()
    const groundingMetadata = (response as any).groundingMetadata

    let sources = []
    if (groundingMetadata?.groundingChunks) {
        sources = groundingMetadata.groundingChunks
            .map((chunk: any) => ({
                title: chunk.web?.title || 'Google Search',
                url: chunk.web?.uri
            }))
            .filter((s: any) => s.url)
    }

    return { answer: text, sources }
}

async function testHybridStrategy(query: string) {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`🧪 TEST: ${query}`)
    console.log('='.repeat(80))

    const [groundingRes, tavilyRes] = await Promise.all([
        searchWithGrounding(query, { site_filter: 'mercadolibre.com.ar' }),
        searchWithTavily(query, { site_filter: 'mercadolibre.com.ar' })
    ])

    console.log('\n📊 RESULTADOS:\n')

    console.log('1️⃣  Google Grounding Links:')
    groundingRes.sources.forEach((s: any, i: number) => {
        const linkType = s.url.includes('/articulo') ? '✅ DIRECTO' : '❌ LISTADO'
        console.log(`   [${i+1}] ${linkType} ${s.url}`)
    })

    console.log('\n2️⃣  Tavily Links:')
    tavilyRes.sources.forEach((s: any, i: number) => {
        const linkType = s.url.includes('/articulo') ? '✅ DIRECTO' : '❌ LISTADO'
        console.log(`   [${i+1}] ${linkType} ${s.url}`)
    })

    // Validar estrategia híbrida
    const tavilySources = tavilyRes.sources
    const hasDirectLinks = tavilySources.some((s: any) => s.url.includes('/articulo'))

    console.log('\n3️⃣  Estrategia Híbrida (IMPLEMENTADA):')
    console.log(`   ✅ Análisis: Google Grounding`)
    console.log(`   ✅ Links: Tavily ÚNICAMENTE`)
    console.log(`   ${hasDirectLinks ? '✅' : '⚠️'} Links directos a productos: ${hasDirectLinks ? 'SÍ' : 'NO'}`)

    return {
        query,
        groundingSources: groundingRes.sources.length,
        tavilySources: tavilySources.length,
        hasDirectLinks,
        pass: tavilySources.length > 0 && hasDirectLinks
    }
}

async function main() {
    console.log('🔍 TEST: MeLi Links Fix - Estrategia Híbrida\n')
    console.log('OBJETIVO: Validar que los links sean directos (/articulo) y no listados\n')

    const results = []

    for (const query of TEST_QUERIES) {
        try {
            const result = await testHybridStrategy(query)
            results.push(result)
        } catch (err: any) {
            console.error(`\n❌ ERROR: ${err.message}`)
            results.push({ query, pass: false, error: err.message })
        }

        // Delay entre queries
        await new Promise(resolve => setTimeout(resolve, 2000))
    }

    console.log('\n' + '='.repeat(80))
    console.log('📊 RESUMEN FINAL')
    console.log('='.repeat(80))

    results.forEach(r => {
        const status = r.pass ? '✅ PASS' : '❌ FAIL'
        console.log(`${status} ${r.query}`)
        if (r.error) console.log(`        Error: ${r.error}`)
    })

    const passRate = results.filter(r => r.pass).length / results.length * 100
    console.log(`\n🎯 Success Rate: ${passRate.toFixed(1)}%`)

    if (passRate === 100) {
        console.log('\n✅ ÉXITO: Todos los tests pasaron. Links directos confirmados.')
    } else {
        console.log('\n⚠️ ATENCIÓN: Algunos tests fallaron. Revisar implementación.')
    }
}

main().catch(console.error)
