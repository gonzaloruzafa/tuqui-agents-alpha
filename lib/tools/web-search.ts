import { tool } from 'ai'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { MLCache } from '@/lib/mercadolibre/cache'
import { MLLinkValidator } from '@/lib/mercadolibre/link-validator'
import { MeliSkills } from './web-search/meli-skills'

/**
 * Unified Web Search Tool
 *
 * Combina 3 métodos de búsqueda en uno solo:
 * 1. Tavily: Búsqueda web general (noticias, info general)
 * 2. Serper.dev: Links directos a productos en marketplaces (MercadoLibre, etc)
 * 3. Google Grounding: Análisis de precios con Gemini + Google Search
 *
 * Estrategia Híbrida para Ecommerce:
 * - Grounding: Análisis y comparación de precios (mejor razonamiento)
 * - Serper: Links directos a productos (/articulo) vs listados (/listado)
 * - Resultado: Mejor análisis + Links correctos
 *
 * Costos:
 * - Serper: $2.50 / 1000 queries (2500 gratis/mes)
 * - Grounding: $0.15 / 1000 queries
 * - Total combinado: ~$2.65 / 1000 queries (vs Firecrawl $4.00)
 */

/**
 * Método 1: Tavily Search (búsqueda web rápida)
 */
async function searchWithTavily(
    query: string,
    options?: {
        search_depth?: 'basic' | 'advanced'
        max_results?: number
        site_filter?: string
    }
) {
    const TAVILY_API_KEY = process.env.TAVILY_API_KEY
    if (!TAVILY_API_KEY) {
        console.error('[WebSearch/Tavily] TAVILY_API_KEY no configurada')
        return { error: 'TAVILY_API_KEY no configurada' }
    }

    console.log('[WebSearch/Tavily] Searching:', query)

    try {
        // Agregar site: filter si se especifica
        let searchQuery = query
        if (options?.site_filter) {
            searchQuery = `${query} site:${options.site_filter}`
        }

        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: TAVILY_API_KEY,
                query: searchQuery,
                search_depth: options?.search_depth || 'basic',
                max_results: options?.max_results || 5,
                include_answer: true,
                include_raw_content: false,
                include_images: false,
            })
        })

        if (!res.ok) {
            const error = await res.text()
            console.error('[WebSearch/Tavily] Error response:', res.status, error)
            return { error: `Tavily error (${res.status}): ${error}` }
        }

        const data = await res.json()
        console.log('[WebSearch/Tavily] Success, sources:', data.results?.length || 0)

        return {
            method: 'tavily',
            answer: data.answer || null,
            sources: data.results?.map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 500) || ''
            })) || [],
            searchQueries: []
        }
    } catch (error: any) {
        console.error('[WebSearch/Tavily] Exception:', error.message)
        return { error: error.message }
    }
}

/**
 * Método 2: Serper.dev (Google Search API especializado en ecommerce)
 * Mejor para obtener links directos a productos en MercadoLibre
 */
async function searchWithSerper(
    query: string,
    options?: {
        site_filter?: string
        max_results?: number
    }
) {
    const SERPER_API_KEY = process.env.SERPER_API_KEY
    if (!SERPER_API_KEY) {
        console.error('[WebSearch/Serper] SERPER_API_KEY no configurada')
        return { error: 'SERPER_API_KEY no configurada' }
    }

    console.log('[WebSearch/Serper] Searching:', query)

    try {
        // Construir query optimizada para productos directos
        let searchQuery = query
        if (options?.site_filter?.includes('mercadolibre')) {
            // Forzar búsqueda en URLs de productos directos
            searchQuery = `${query} site:articulo.mercadolibre.com.ar OR site:mercadolibre.com.ar/p/`
        } else if (options?.site_filter) {
            searchQuery = `${query} site:${options.site_filter}`
        }

        const res = await fetch('https://google.serper.dev/search', {
            method: 'POST',
            headers: {
                'X-API-KEY': SERPER_API_KEY,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                q: searchQuery,
                num: options?.max_results || 5,
                gl: 'ar',  // Argentina
                hl: 'es'   // Español
            })
        })

        if (!res.ok) {
            const error = await res.text()
            console.error('[WebSearch/Serper] Error response:', res.status, error)
            return { error: `Serper error (${res.status}): ${error}` }
        }

        const data = await res.json()
        console.log('[WebSearch/Serper] Success, organic results:', data.organic?.length || 0)

        // Extraer resultados orgánicos
        const sources = (data.organic || []).map((r: any) => ({
            title: r.title,
            url: r.link,
            snippet: r.snippet || ''
        }))

        // Extraer precios si están disponibles (Serper detecta precios automáticamente)
        let priceInfo = ''
        if (data.answerBox?.price) {
            priceInfo = `Precio destacado: ${data.answerBox.price}\n`
        }

        return {
            method: 'serper',
            answer: priceInfo || null,
            sources,
            searchQueries: [searchQuery]
        }
    } catch (error: any) {
        console.error('[WebSearch/Serper] Exception:', error.message)
        return { error: error.message }
    }
}

/**
 * Método 3: Google Grounding (Gemini con Google Search)
 */
async function searchWithGrounding(
    query: string,
    options?: {
        site_filter?: string
        max_results?: number
    }
) {
    const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!GEMINI_API_KEY) {
        console.error('[WebSearch/Grounding] GOOGLE_GENERATIVE_AI_API_KEY no configurada')
        return { error: 'GOOGLE_GENERATIVE_AI_API_KEY no configurada' }
    }

    console.log('[WebSearch/Grounding] Searching:', query)

    try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)

        const model = genAI.getGenerativeModel({
            model: 'gemini-2.0-flash-exp',
            tools: [
                {
                    googleSearch: {}  // Activa grounding con Google Search (Gemini 2.0)
                } as any
            ]
        })

        // Construir prompt optimizado
        let prompt = query
        if (options?.site_filter) {
            prompt = `Buscá en ${options.site_filter}: ${query}`
        }

        // Si es búsqueda de precios, agregar instrucciones específicas
        const isPriceQuery = query.toLowerCase().includes('precio') ||
                           query.toLowerCase().includes('cuánto cuesta') ||
                           query.toLowerCase().includes('cuánto sale')

        if (isPriceQuery && options?.site_filter?.includes('mercadolibre')) {
            prompt = `Buscá en MercadoLibre Argentina precios de: ${query.replace(/precio[s]?/i, '').trim()}.

Dame los ${options?.max_results || 5} productos más relevantes con:
1. Nombre del producto
2. Precio en pesos argentinos (formato: $ X.XXX.XXX)
3. Vendedor (si está disponible)

IMPORTANTE:
- SOLO precios de MercadoLibre Argentina
- Precios COMPLETOS (no cuotas)
- Formato de respuesta limpio y estructurado`
        }

        const result = await model.generateContent({
            contents: [{
                role: 'user',
                parts: [{ text: prompt }]
            }]
        })

        const response = result.response
        const text = response.text()
        
        // El metadata puede estar en el candidate o en el result directamente según la versión del SDK
        const groundingMetadata = (response as any).groundingMetadata || 
                                 (result as any).groundingMetadata ||
                                 (response.candidates?.[0] as any)?.groundingMetadata;

        console.log('[WebSearch/Grounding] Raw GroundingMetadata keys:', groundingMetadata ? Object.keys(groundingMetadata) : 'none')

        // Extraer sources del metadata (Gemini 2.0 tiene un formato diferente)
        let sources = []
        
        // Formato Gemini 2.0/3.0 (Google AI SDK)
        if (groundingMetadata?.groundingChunks) {
            console.log('[WebSearch/Grounding] Mapping groundingChunks to sources')
            sources = (groundingMetadata as any).groundingChunks
                ?.map((chunk: any) => ({
                    title: chunk.web?.title || 'Google Search',
                    url: chunk.web?.uri
                }))
                .filter((s: any) => s.url) || []
        }
        // Formato Vertex AI / Legacy
        else if (groundingMetadata?.retrievalMetadata) {
            sources = (groundingMetadata.retrievalMetadata as any).map((meta: any) => ({
                title: meta.title || 'Sin título',
                url: meta.uri,
                snippet: ''
            }))
        }

        console.log('[WebSearch/Grounding] Success, sources:', sources.length)

        // IMPORTANTE: Si el modelo no devuelve links en el texto (o inventa), 
        // inyectamos los links reales al final del "answer" para que el modelo padre los vea obligatoriamente.
        let finalAnswer = text
        if (sources.length > 0) {
            const linksText = sources.map((s: any, i: number) => `[${i+1}] ${s.title}: ${s.url}`).join('\n')
            finalAnswer += `\n\n--- REAL VERIFIED LINKS ---\n${linksText}`
        }

        return {
            method: 'grounding',
            answer: finalAnswer,
            sources,
            searchQueries: groundingMetadata?.webSearchQueries || []
        }
    } catch (error: any) {
        console.error('[WebSearch/Grounding] Exception:', error.message)
        return { error: error.message }
    }
}

/**
 * Detecta si la query es de precios en ecommerce
 */
function isPriceQuery(query: string): boolean {
    const lowerQuery = query.toLowerCase()

    const priceKeywords = [
        'precio', 'precios', 'cuánto cuesta', 'cuánto sale', 'cuánto vale',
        'cuanto cuesta', 'cuanto sale', 'cuanto vale',
        'costo', 'valor', 'cotización', 'cotizacion'
    ]

    const ecommerceKeywords = [
        'mercadolibre', 'mercado libre', 'meli',
        'amazon', 'tienda', 'comprar'
    ]

    const hasPriceKeyword = priceKeywords.some(kw => lowerQuery.includes(kw))
    const hasEcommerceKeyword = ecommerceKeywords.some(kw => lowerQuery.includes(kw))

    // Si menciona precio (aunque no diga meli), suele ser para buscarlo
    if (hasPriceKeyword) return true

    // Si menciona ecommerce (meli, amazon, etc)
    if (hasEcommerceKeyword && !lowerQuery.includes('cómo') && !lowerQuery.includes('qué es')) {
        return true
    }

    return false
}

/**
 * Detecta marketplace de la query
 */
function detectMarketplace(query: string): string | null {
    const lowerQuery = query.toLowerCase()

    if (lowerQuery.includes('mercadolibre') || lowerQuery.includes('mercado libre') || lowerQuery.includes('meli')) {
        return 'mercadolibre.com.ar'
    }
    if (lowerQuery.includes('amazon')) {
        return 'amazon.com'
    }

    // Default para Argentina es MercadoLibre
    if (isPriceQuery(query)) {
        return 'mercadolibre.com.ar'
    }

    return null
}

/**
 * Unified Web Search Tool
 */
export const webSearchTool = tool({
    description: `Navegador Web Unificado: Busca información actualizada en internet.

Casos de uso:
- Noticias y eventos recientes
- Información general de cualquier tema
- Precios de productos en ecommerce (MercadoLibre, Amazon)
- Comparación de múltiples fuentes
- Datos actualizados que no están en la base de conocimiento

El sistema elige automáticamente el mejor método:
- Tavily: Para búsquedas generales rápidas
- Google Grounding: Para precios en ecommerce y búsquedas que requieren datos muy actualizados

Ejemplos:
- "últimas noticias sobre IA"
- "precio sillón odontológico mercadolibre"
- "cuánto cuesta termo stanley 1 litro"
- "comparar precios notebook lenovo"`,
    parameters: z.object({
        query: z.string().describe('Términos de búsqueda en español o inglés')
    }),
    execute: async ({ query }: { query: string }) => {
        const startTime = Date.now()

        // Check cache primero (solo para búsquedas de marketplace)
        const marketplace = detectMarketplace(query)
        if (marketplace) {
            const cached = MLCache.get(query)
            if (cached) {
                console.log('[WebSearch] Cache HIT para:', query)
                return {
                    ...cached,
                    fromCache: true,
                    executionTime: Date.now() - startTime
                }
            }
        }

        // Detectar tipo de búsqueda
        const isPrice = isPriceQuery(query)

        console.log(`[WebSearch] Query: "${query}" | Price: ${isPrice} | Marketplace: ${marketplace || 'none'}`)

        // ESTRATEGIA: Usar Grounding para análisis, Serper para links directos.
        // Serper.dev devuelve links de productos reales (/articulo) vs listados (/listado)
        let result: any

        if (isPrice && marketplace === 'mercadolibre.com.ar') {
            // ========================================
            // MERCADOLIBRE: Usar MeliSkills (híbrido)
            // ========================================
            console.log('[WebSearch] Using MeliSkills.hybrid for MercadoLibre search')

            try {
                const meliResult = await MeliSkills.hybrid(query, {
                    maxResults: 5,
                    useCache: true,
                })

                // Construir productos estructurados con precios
                const products = meliResult.products.map((p, i) => ({
                    numero: i + 1,
                    titulo: p.title,
                    precio: p.priceFormatted || 'Consultar',
                    url_verificada: p.url,
                    descripcion: p.snippet?.substring(0, 150) || ''
                }))

                const productsJSON = JSON.stringify(products, null, 2)

                const hybridAnswer = `${meliResult.analysis}

════════════════════════════════════════════════════════
🛒 PRODUCTOS ENCONTRADOS (DATOS VERIFICADOS)
════════════════════════════════════════════════════════

${productsJSON}

════════════════════════════════════════════════════════
⚠️ INSTRUCCIONES OBLIGATORIAS PARA TU RESPUESTA:
════════════════════════════════════════════════════════

1. Usá ÚNICAMENTE las URLs del campo "url_verificada" de arriba
2. Copiá la URL EXACTA - no modifiques ni un caracter
3. Formato de link: [Ver en MercadoLibre](URL_EXACTA)
4. Mostrá el precio del campo "precio" si está disponible
5. Si no hay URL para algo, NO inventes - decí que no encontraste
6. PROHIBIDO construir URLs como "articulo.mercadolibre.com.ar/MLA-XXXXX"

❌ Si inventás una URL, el usuario verá ERROR 404`

                result = {
                    method: 'meli-hybrid',
                    answer: hybridAnswer,
                    sources: meliResult.products.map(p => ({
                        title: p.title,
                        url: p.url,
                        snippet: p.snippet,
                        price: p.priceFormatted
                    })),
                    searchQueries: [query]
                }
            } catch (meliError: any) {
                console.error('[WebSearch] MeliSkills.hybrid failed, falling back to legacy:', meliError.message)
                // Fallback to legacy Grounding + Serper
                const [groundingRes, serperRes] = await Promise.all([
                    searchWithGrounding(query, { site_filter: marketplace, max_results: 5 }),
                    searchWithSerper(query, { site_filter: marketplace, max_results: 5 })
                ])
                const serperSources = serperRes.sources || []
                const groundingText = groundingRes.answer || ''
                result = {
                    method: 'hybrid (grounding+serper) [fallback]',
                    answer: groundingText,
                    sources: serperSources,
                    searchQueries: [...(groundingRes.searchQueries || []), ...(serperRes.searchQueries || [])]
                }
            }
        } else if (isPrice && marketplace) {
            console.log('[WebSearch] Multi-source strategy: Grounding + Serper for marketplace prices')
            const [groundingRes, serperRes] = await Promise.all([
                searchWithGrounding(query, {
                    site_filter: marketplace,
                    max_results: 5
                }),
                searchWithSerper(query, {
                    site_filter: marketplace,
                    max_results: 5
                })
            ])

            // ESTRATEGIA ANTI-ALUCINACIÓN V3:
            // 1. Usamos análisis de Grounding (mejor para comparar precios)
            // 2. Usamos links de Serper (más precisos, apuntan a /articulo)
            // 3. Devolvemos productos como JSON estructurado para que el LLM NO invente URLs

            const serperSources = serperRes.sources || []
            const groundingText = groundingRes.answer || ''

            // Si Serper encontró links, son los ÚNICOS que debe usar
            if (serperSources.length > 0) {
                // Construir productos estructurados para que el LLM copie URLs exactas
                const products = serperSources.map((s: any, i: number) => ({
                    numero: i + 1,
                    titulo: s.title,
                    url_verificada: s.url,
                    descripcion: s.snippet?.substring(0, 150) || ''
                }))

                const productsJSON = JSON.stringify(products, null, 2)

                const hybridAnswer = `${groundingText}

════════════════════════════════════════════════════════
🛒 PRODUCTOS ENCONTRADOS (DATOS VERIFICADOS)
════════════════════════════════════════════════════════

${productsJSON}

════════════════════════════════════════════════════════
⚠️ INSTRUCCIONES OBLIGATORIAS PARA TU RESPUESTA:
════════════════════════════════════════════════════════

1. Usá ÚNICAMENTE las URLs del campo "url_verificada" de arriba
2. Copiá la URL EXACTA - no modifiques ni un caracter
3. Formato de link: [Ver en MercadoLibre](URL_EXACTA)
4. Si no hay URL para algo, NO inventes - decí que no encontraste
5. PROHIBIDO construir URLs como "articulo.mercadolibre.com.ar/MLA-XXXXX"

❌ Si inventás una URL, el usuario verá ERROR 404`

                result = {
                    method: 'hybrid (grounding+serper)',
                    answer: hybridAnswer,
                    sources: serperSources,
                    searchQueries: [...(groundingRes.searchQueries || []), ...(serperRes.searchQueries || [])]
                }
            } else {
                // Fallback: Solo Grounding (si Serper falló)
                console.log('[WebSearch] Serper returned no results, using Grounding only')
                result = groundingRes
            }
        } else if (marketplace) {
            // Menciona ecommerce pero no es precio → Tavily con site filter
            result = await searchWithTavily(query, {
                site_filter: marketplace,
                max_results: 5
            })
        } else {
            // Búsqueda general → Tavily (más rápido para info general)
            result = await searchWithTavily(query, {
                search_depth: 'basic',
                max_results: 5
            })
        }

        const latency = Date.now() - startTime

        if (result.error) {
            return {
                error: result.error,
                query,
                latency
            }
        }

        // Validar y filtrar links de MercadoLibre si hay sources
        let validatedSources = result.sources || []
        if (marketplace && validatedSources.length > 0) {
            const urls = validatedSources.map((s: any) => s.url)
            const validURLs = MLLinkValidator.filterValidURLs(urls)

            // Filtrar solo sources con URLs válidas
            validatedSources = validatedSources.filter((s: any) =>
                validURLs.includes(s.url)
            )

            console.log(`[WebSearch] Link validation: ${urls.length} total → ${validURLs.length} valid`)
        }

        const finalResult = {
            query,
            method: result.method,
            answer: result.answer,
            sources: validatedSources,
            searchQueries: result.searchQueries,
            latency
        }

        // Guardar en cache si es búsqueda de marketplace
        if (marketplace) {
            MLCache.set(query, finalResult)
        }

        return finalResult
    }
} as any)
