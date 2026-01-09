import { tool } from 'ai'
import { z } from 'zod'
import { GoogleGenerativeAI } from '@google/generative-ai'

/**
 * Unified Web Search Tool
 *
 * Combina 3 métodos de búsqueda en uno solo:
 * 1. Tavily: Búsqueda web general (noticias, info general)
 * 2. Google Grounding: Búsqueda con Gemini + Google Search (precios ecommerce, info actualizada)
 * 3. Firecrawl (DEPRECATED): Solo mantiene backward compatibility, será eliminado
 *
 * Google Grounding reemplaza a Firecrawl porque:
 * - 20x más barato ($0.15 vs $4.00 por 1000 queries)
 * - 6-7x más rápido (5-8s vs 30-40s)
 * - 100% success rate en PoC
 * - No requiere stealth mode ni bypass de login walls
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
 * Método 2: Google Grounding (Gemini con Google Search)
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

        // Detectar tipo de búsqueda
        const isPrice = isPriceQuery(query)
        const marketplace = detectMarketplace(query)

        console.log(`[WebSearch] Query: "${query}" | Price: ${isPrice} | Marketplace: ${marketplace || 'none'}`)

        // ESTRATEGIA: Usar Grounding para precios, Tavily para lo demás.
        // Si es marketplace (MeLi), usamos AMBOS en paralelo para tener análisis (Grounding) y links directos (Tavily).
        let result: any

        if (isPrice && marketplace) {
            console.log('[WebSearch] Multi-source strategy: Grounding + Tavily for marketplace prices')
            const [groundingRes, tavilyRes] = await Promise.all([
                searchWithGrounding(query, {
                    site_filter: marketplace,
                    max_results: 5
                }),
                searchWithTavily(query, {
                    site_filter: marketplace,
                    max_results: 5
                })
            ])

            // ESTRATEGIA ANTI-ALUCINACIÓN:
            // 1. Usamos análisis de Grounding (mejor para comparar precios)
            // 2. PERO: Reemplazamos los links de Grounding por los de Tavily
            // 3. Tavily devuelve links directos a productos (/articulo) vs listados (/listado)

            const tavilySources = tavilyRes.sources || []
            const groundingText = groundingRes.answer || ''

            // Si Tavily encontró links, son los ÚNICOS que debe usar
            if (tavilySources.length > 0) {
                // Construir respuesta híbrida: análisis de Grounding + links MANDATORIOS de Tavily
                const linksSection = tavilySources
                    .map((s: any, i: number) => `[${i+1}] ${s.title}\n   URL: ${s.url}`)
                    .join('\n\n')

                const hybridAnswer = `${groundingText}

━━━━━━━━━━━━━━━━━━━━━━
🔗 LINKS VERIFICADOS (usar ESTOS únicamente):
━━━━━━━━━━━━━━━━━━━━━━

${linksSection}

⚠️ IMPORTANTE: Los links arriba son los ÚNICOS correctos. No usar otros URLs.`

                result = {
                    method: 'hybrid (grounding+tavily)',
                    answer: hybridAnswer,
                    sources: tavilySources,  // SOLO Tavily sources (son los correctos)
                    searchQueries: [...(groundingRes.searchQueries || []), ...(tavilyRes.searchQueries || [])]
                }
            } else {
                // Fallback: Solo Grounding (si Tavily falló)
                console.log('[WebSearch] Tavily returned no results, using Grounding only')
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

        return {
            query,
            method: result.method,
            answer: result.answer,
            sources: result.sources || [],
            searchQueries: result.searchQueries,
            latency
        }
    }
} as any)
