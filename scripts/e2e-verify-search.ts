
import dotenv from 'dotenv'
dotenv.config({ path: '.env.local' })

import { webSearchTool } from '../lib/tools/web-search'
import puppeteer from 'puppeteer-extra'
import StealthPlugin from 'puppeteer-extra-plugin-stealth'
puppeteer.use(StealthPlugin())

async function runVerification(query: string) {
    console.log(`\n🚀 INICIANDO VERIFICACIÓN E2E`)
    console.log(`🔍 Query: "${query}"`)
    console.log(`--------------------------------------------------`)

    // 1. Ejecutar la herramienta de búsqueda (Híbrida: Grounding + Tavily)
    console.log(`📡 Llamando a webSearchTool...`)
    const searchResult = await (webSearchTool as any).execute({ query })

    if (searchResult.error) {
        console.error(`❌ Error en búsqueda: ${searchResult.error}`)
        return
    }

    console.log(`✅ Búsqueda completada (${searchResult.method})`)
    console.log(`📊 Respuesta del Agente (Fragmento):`)
    console.log(searchResult.answer?.slice(0, 300) + '...')
    
    const sources = searchResult.sources || []
    console.log(`🔗 Fuentes encontradas: ${sources.length}`)

    if (sources.length === 0) {
        console.log(`⚠️ No se encontraron fuentes para verificar.`)
        return
    }

    // 2. Iniciar Navegador para verificación real
    console.log(`\n🌐 Iniciando Puppeteer para verificar links...`)
    const browser = await puppeteer.launch({ 
        headless: true, 
        args: ['--no-sandbox', '--disable-setuid-sandbox'] 
    })

    const results = []

    try {
        for (const source of sources) {
            console.log(`\n🧐 Verificando: ${source.title}`)
            console.log(`   URL: ${source.url}`)

            const page = await browser.newPage()
            await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36')
            
            try {
                await page.goto(source.url, { waitUntil: 'networkidle2', timeout: 30000 })
                
                // Extraer datos reales
                const pageData = await page.evaluate(() => {
                    const title = document.querySelector('h1.ui-pdp-title')?.textContent?.trim() || 
                                 document.querySelector('.ui-pdp-title')?.textContent?.trim()
                    
                    const priceContainer = document.querySelector('.ui-pdp-price__main-container')
                    const price = priceContainer?.querySelector('.andes-money-amount__fraction')?.textContent?.trim()
                    
                    return { title, price, url: window.location.href }
                })

                console.log(`   ✨ Datos en página: [${pageData.price}] ${pageData.title}`)
                
                // Verificar si es un link de listado o de producto
                const isProductPage = source.url.includes('/articulo.mercadolibre.com.ar') || !!pageData.title
                
                // Verificar coincidencia de precio con el reporte del agente
                const agentMentionedPrice = searchResult.answer.includes(pageData.price || '---')
                
                results.push({
                    source: source.title,
                    isProductPage,
                    priceMatch: agentMentionedPrice,
                    realPrice: pageData.price,
                    realTitle: pageData.title
                })

                if (isProductPage) {
                    console.log(agentMentionedPrice ? `   ✅ EL PRECIO COINCIDE` : `   ❌ EL PRECIO NO COINCIDE con el reporte`)
                } else {
                    console.log(`   ⚠️ El link parece ser una búsqueda/listado, no un producto directo.`)
                }

            } catch (err: any) {
                console.log(`   ❌ Error accediendo al link: ${err.message}`)
            } finally {
                await page.close()
            }
        }
    } finally {
        await browser.close()
    }

    // Informe Final
    console.log(`\n${'='.repeat(50)}`)
    console.log(`📝 INFORME FINAL DE VERIFICACIÓN`)
    console.log(`${'='.repeat(50)}`)
    
    const productLinks = results.filter(r => r.isProductPage)
    const matches = productLinks.filter(r => r.priceMatch)

    console.log(`- Total Links verificados: ${results.length}`)
    console.log(`- Links de producto directo: ${productLinks.length}`)
    console.log(`- Coincidencias de precio: ${matches.length} / ${productLinks.length}`)
    
    if (matches.length === productLinks.length && productLinks.length > 0) {
        console.log(`\n🎉 EXCELENTE: El agente está reportando precios reales y links precisos.`)
    } else if (productLinks.length === 0) {
        console.log(`\n⚠️ ADVERTENCIA: La mayoría de los links son listados, no productos directos.`)
    } else {
        console.log(`\n❌ HAY DISCREPANCIAS: Algunos precios o links no coinciden con la realidad.`)
    }
}

const query = process.argv[2] || "Turbina Kmd Draco precio"
runVerification(query).catch(console.error)
