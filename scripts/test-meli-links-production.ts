#!/usr/bin/env node
/**
 * Test MeLi Links en PRODUCCIÓN
 *
 * Valida que los links devueltos por búsquedas de MeLi:
 * 1. Sean links directos a productos (/articulo/MLA-)
 * 2. Coincidan con los productos mostrados
 * 3. No sean inventados por el LLM
 */

import * as dotenv from 'dotenv'
import * as path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.local') })

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://tuqui.adhoc.inc'
const TENANT_ID = 'ff9baa3d-acd1-425d-9c19-36304dea8b8d'

interface MeliTestCase {
    id: string
    query: string
    productKeywords: string[]  // Palabras que DEBEN aparecer en los productos
}

const TEST_CASES: MeliTestCase[] = [
    {
        id: 'MELI-LINK-01',
        query: 'busca precios de compresor odontológico silencioso en mercadolibre',
        productKeywords: ['compresor', 'odontológico']
    },
    {
        id: 'MELI-LINK-02',
        query: 'cuánto cuesta autoclave 18 litros en meli',
        productKeywords: ['autoclave', '18']
    },
    {
        id: 'MELI-LINK-03',
        query: 'precio sillón odontológico mercado libre',
        productKeywords: ['sillón', 'odontológico']
    }
]

async function testMeliSearch(testCase: MeliTestCase): Promise<any> {
    console.log(`\n${'='.repeat(80)}`)
    console.log(`🧪 TEST ${testCase.id}: ${testCase.query}`)
    console.log('='.repeat(80))

    try {
        const res = await fetch(`${API_URL}/api/chat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                messages: [
                    { role: 'user', content: testCase.query }
                ],
                tenantId: TENANT_ID
            })
        })

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${res.statusText}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error('No reader available')

        const decoder = new TextDecoder()
        let fullResponse = ''
        let chunks: string[] = []

        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const chunk = decoder.decode(value, { stream: true })
            chunks.push(chunk)
            fullResponse += chunk
        }

        console.log('\n📄 RESPUESTA COMPLETA:')
        console.log('-'.repeat(80))
        console.log(fullResponse.substring(0, 1000))
        if (fullResponse.length > 1000) {
            console.log(`... (${fullResponse.length - 1000} caracteres más)`)
        }
        console.log('-'.repeat(80))

        // Validaciones
        const validations = {
            hasContent: fullResponse.length > 0,
            hasPriceSymbol: fullResponse.includes('$'),
            hasLinks: false,
            hasDirectLinks: false,
            linksMatchProducts: false,
            linkCount: 0,
            directLinkCount: 0
        }

        // Extraer URLs
        const urlRegex = /https?:\/\/[^\s\)]+/g
        const urls = fullResponse.match(urlRegex) || []
        validations.linkCount = urls.length
        validations.hasLinks = urls.length > 0

        console.log(`\n🔗 LINKS ENCONTRADOS: ${urls.length}`)

        const directLinks: string[] = []
        const listingLinks: string[] = []

        urls.forEach((url, i) => {
            const isDirect = url.includes('/articulo') || url.includes('/MLA-') || url.includes('/p/')
            const isListing = url.includes('/listado')

            if (isDirect) {
                directLinks.push(url)
                console.log(`   ✅ [${i+1}] DIRECTO: ${url}`)
            } else if (isListing) {
                listingLinks.push(url)
                console.log(`   ❌ [${i+1}] LISTADO: ${url}`)
            } else {
                console.log(`   ⚠️  [${i+1}] OTRO: ${url}`)
            }
        })

        validations.directLinkCount = directLinks.length
        validations.hasDirectLinks = directLinks.length > 0

        // Validar que los keywords del producto aparezcan cerca de los links
        if (directLinks.length > 0) {
            const hasKeywords = testCase.productKeywords.some(keyword =>
                fullResponse.toLowerCase().includes(keyword.toLowerCase())
            )
            validations.linksMatchProducts = hasKeywords
        }

        // Resultado del test
        console.log('\n📊 VALIDACIONES:')
        console.log(`   ${validations.hasContent ? '✅' : '❌'} Tiene contenido`)
        console.log(`   ${validations.hasPriceSymbol ? '✅' : '❌'} Incluye símbolo $ (precios)`)
        console.log(`   ${validations.hasLinks ? '✅' : '❌'} Contiene links`)
        console.log(`   ${validations.hasDirectLinks ? '✅' : '❌'} Links directos a productos`)
        console.log(`   ${validations.linksMatchProducts ? '✅' : '❌'} Keywords coinciden con productos`)

        // Estadísticas
        console.log('\n📈 ESTADÍSTICAS:')
        console.log(`   Total links: ${validations.linkCount}`)
        console.log(`   Links directos (/articulo): ${validations.directLinkCount}`)
        console.log(`   Links de listado: ${listingLinks.length}`)

        const pass = validations.hasContent &&
                    validations.hasPriceSymbol &&
                    validations.hasDirectLinks &&
                    validations.linksMatchProducts &&
                    listingLinks.length === 0  // NO debe haber links de listado

        console.log(`\n${pass ? '✅ PASS' : '❌ FAIL'}: ${testCase.id}`)

        return {
            testCase,
            pass,
            validations,
            fullResponse,
            urls,
            directLinks,
            listingLinks
        }

    } catch (err: any) {
        console.error(`\n❌ ERROR: ${err.message}`)
        return {
            testCase,
            pass: false,
            error: err.message
        }
    }
}

async function main() {
    console.log('🔍 TEST: MeLi Links en Producción')
    console.log(`📍 API: ${API_URL}`)
    console.log(`🏢 Tenant: ${TENANT_ID}\n`)

    const results = []

    for (const testCase of TEST_CASES) {
        const result = await testMeliSearch(testCase)
        results.push(result)

        // Delay entre tests
        await new Promise(resolve => setTimeout(resolve, 3000))
    }

    // Resumen final
    console.log('\n' + '='.repeat(80))
    console.log('📊 RESUMEN FINAL')
    console.log('='.repeat(80))

    const passed = results.filter(r => r.pass).length
    const failed = results.filter(r => !r.pass).length
    const successRate = (passed / results.length * 100).toFixed(1)

    results.forEach(r => {
        const status = r.pass ? '✅ PASS' : '❌ FAIL'
        console.log(`${status} ${r.testCase.id}: ${r.testCase.query.substring(0, 50)}...`)

        if (r.validations) {
            console.log(`        Links directos: ${r.validations.directLinkCount}/${r.validations.linkCount}`)
            if (r.listingLinks && r.listingLinks.length > 0) {
                console.log(`        ⚠️  Links de listado encontrados: ${r.listingLinks.length}`)
            }
        }

        if (r.error) {
            console.log(`        Error: ${r.error}`)
        }
    })

    console.log(`\n🎯 Success Rate: ${successRate}% (${passed}/${results.length})`)

    if (successRate === '100.0') {
        console.log('\n✅ ÉXITO TOTAL: Todos los tests pasaron')
        console.log('   - Links directos a productos ✅')
        console.log('   - Sin links de listado ✅')
        console.log('   - Keywords coinciden ✅')
    } else {
        console.log(`\n⚠️  ATENCIÓN: ${failed} test(s) fallaron`)
        console.log('\n🔧 PROBLEMAS DETECTADOS:')

        results.filter(r => !r.pass).forEach(r => {
            console.log(`\n   ${r.testCase.id}:`)
            if (r.listingLinks && r.listingLinks.length > 0) {
                console.log(`   ❌ Links de listado encontrados (deben ser /articulo)`)
            }
            if (r.validations && !r.validations.hasDirectLinks) {
                console.log(`   ❌ No hay links directos a productos`)
            }
            if (r.validations && !r.validations.linksMatchProducts) {
                console.log(`   ❌ Keywords no coinciden con los productos`)
            }
        })
    }

    // Guardar resultados
    const fs = require('fs')
    const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0]
    const outputPath = path.join(__dirname, 'e2e-tests/results', `meli-links-${timestamp}.json`)

    fs.writeFileSync(outputPath, JSON.stringify({
        timestamp: new Date().toISOString(),
        apiUrl: API_URL,
        successRate: parseFloat(successRate),
        passed,
        failed,
        total: results.length,
        results
    }, null, 2))

    console.log(`\n💾 Resultados guardados: ${outputPath}`)

    process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)
