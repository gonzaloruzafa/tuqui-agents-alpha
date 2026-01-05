import { tool } from 'ai'
import { z } from 'zod'

/**
 * Ecommerce Search Tool
 * 
 * Busca productos en marketplaces y extrae precios reales.
 * Combina Tavily (búsqueda) + Firecrawl (scraping de precios).
 * 
 * Soporta:
 * - MercadoLibre Argentina (stealth mode)
 * - Amazon (básico)
 * - Otros ecommerce (genérico)
 */

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY
const TAVILY_API_KEY = process.env.TAVILY_API_KEY

// Configuración por marketplace
const MARKETPLACE_CONFIG: Record<string, {
    domain: string
    searchUrl: string
    needsStealth: boolean
    country?: string
}> = {
    mercadolibre: {
        domain: 'mercadolibre.com.ar',
        searchUrl: 'https://listado.mercadolibre.com.ar/',
        needsStealth: true,
        country: 'AR'
    },
    amazon: {
        domain: 'amazon.com',
        searchUrl: 'https://www.amazon.com/s?k=',
        needsStealth: false
    },
    // Agregar más según necesidad
}

/**
 * Detecta qué marketplace es basado en la URL
 */
function detectMarketplace(url: string): string | null {
    if (url.includes('mercadolibre') || url.includes('mercadoli')) return 'mercadolibre'
    if (url.includes('amazon')) return 'amazon'
    return null
}

/**
 * Valida que una URL existe y responde (HEAD request)
 * Timeout corto para no bloquear demasiado
 */
async function validateUrl(url: string): Promise<boolean> {
    try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 3000) // 3s timeout
        
        const res = await fetch(url, {
            method: 'HEAD',
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; TuquiBot/1.0)'
            }
        })
        
        clearTimeout(timeout)
        
        // Aceptamos 200-399 (incluye redirects)
        return res.status >= 200 && res.status < 400
    } catch (error) {
        console.log(`[EcommerceSearch] URL validation failed for ${url}:`, (error as Error).message)
        return false
    }
}

/**
 * Extrae precios del contenido scrapeado
 */
function extractPrices(content: string, marketplace: string): string[] {
    const prices: string[] = []
    
    // Pattern depende del marketplace
    let pricePattern: RegExp
    let minValue = 1000
    
    if (marketplace === 'mercadolibre') {
        // Pesos argentinos: $273.000, $1.225.000
        // El minValue alto filtra precios de cuotas, descuentos, etc.
        pricePattern = /\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g
        minValue = 50000  // Mínimo 50k ARS para filtrar cuotas y precios parciales
    } else if (marketplace === 'amazon') {
        // USD: $29.99, $1,299.00
        pricePattern = /\$(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g
        minValue = 1
    } else {
        // Genérico
        pricePattern = /\$\s?(\d+[\d.,]*)/g
        minValue = 1
    }
    
    let match
    while ((match = pricePattern.exec(content)) !== null) {
        const priceStr = match[1]
        const numericValue = parseInt(priceStr.replace(/[.,]/g, ''))
        
        if (!prices.includes(`$${priceStr}`) && numericValue >= minValue) {
            prices.push(`$${priceStr}`)
        }
        if (prices.length >= 10) break
    }
    
    return prices
}

/**
 * Scrapea una URL de ecommerce usando Firecrawl
 */
async function scrapeEcommerceUrl(url: string): Promise<{
    title: string
    prices: string[]
    content: string
    error?: string
}> {
    if (!FIRECRAWL_API_KEY) {
        return { title: '', prices: [], content: '', error: 'FIRECRAWL_API_KEY no configurada' }
    }

    const marketplace = detectMarketplace(url)
    const config = marketplace ? MARKETPLACE_CONFIG[marketplace] : null
    
    console.log(`[EcommerceSearch] Scraping ${url} (marketplace: ${marketplace || 'unknown'})`)

    const requestBody: any = {
        url,
        formats: ['markdown'],
        timeout: 30000
    }

    // Configuración especial para marketplaces que bloquean bots
    if (config?.needsStealth) {
        requestBody.mobile = true
        requestBody.proxy = 'stealth'
        requestBody.waitFor = 2000
        if (config.country) {
            requestBody.location = {
                country: config.country,
                languages: [`es-${config.country}`]
            }
        }
        requestBody.actions = [
            { type: 'wait', milliseconds: 1000 },
            { type: 'scroll', direction: 'down', amount: 500 }
        ]
    } else {
        requestBody.waitFor = 2000
        requestBody.onlyMainContent = true
    }

    try {
        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${FIRECRAWL_API_KEY}`
            },
            body: JSON.stringify(requestBody)
        })

        if (!res.ok) {
            const error = await res.text()
            console.error('[EcommerceSearch] Firecrawl error:', res.status)
            return { title: '', prices: [], content: '', error: `Error ${res.status}` }
        }

        const data = await res.json()

        if (!data.success) {
            return { title: '', prices: [], content: '', error: data.error }
        }

        const markdown = data.data?.markdown || ''
        const title = data.data?.metadata?.title || ''

        // Detectar login wall (MeLi específico)
        if (markdown.includes('Ingresá tu e-mail') || markdown.includes('Iniciá sesión')) {
            return { 
                title, 
                prices: [], 
                content: 'Página bloqueada - requiere login', 
                error: 'login_wall' 
            }
        }

        const prices = extractPrices(markdown, marketplace || 'generic')
        
        console.log(`[EcommerceSearch] Extracted ${prices.length} prices from ${url}`)

        return {
            title,
            prices,
            content: markdown.slice(0, 10000)
        }
    } catch (error: any) {
        console.error('[EcommerceSearch] Exception:', error.message)
        return { title: '', prices: [], content: '', error: error.message }
    }
}

/**
 * Busca productos usando Tavily
 */
async function searchProducts(query: string, marketplace?: string): Promise<{
    results: Array<{ title: string; url: string; snippet: string }>
    answer?: string
    error?: string
}> {
    if (!TAVILY_API_KEY) {
        return { results: [], error: 'TAVILY_API_KEY no configurada' }
    }

    // Agregar site: filter si hay marketplace específico
    let searchQuery = query
    if (marketplace && MARKETPLACE_CONFIG[marketplace]) {
        searchQuery = `${query} site:${MARKETPLACE_CONFIG[marketplace].domain}`
    }

    console.log(`[EcommerceSearch] Tavily search: ${searchQuery}`)

    try {
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

        if (!res.ok) {
            return { results: [], error: `Tavily error ${res.status}` }
        }

        const data = await res.json()

        return {
            results: data.results?.map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 300) || ''
            })) || [],
            answer: data.answer
        }
    } catch (error: any) {
        return { results: [], error: error.message }
    }
}

/**
 * Ecommerce Search Tool - Busca y scrapea productos con precios
 */
export const ecommerceSearchTool = tool({
    description: `Buscador de Productos en Ecommerce: Busca productos en MercadoLibre Argentina y extrae precios REALES.

SIEMPRE devuelve precios reales extraídos de las páginas.

Ejemplos de búsqueda:
- "sillón odontológico"
- "termo stanley 1 litro"
- "notebook lenovo"

Para Amazon, incluí "amazon" en la búsqueda.`,
    parameters: z.object({
        query: z.string().describe('Producto a buscar (ej: "sillón odontológico", "termo stanley")')
    }),
    execute: async ({ query }: { query: string }) => {
        // Detectar marketplace de la query
        const marketplace = query.toLowerCase().includes('amazon') ? 'amazon' : 'mercadolibre'
        console.log(`[EcommerceSearch] Query: "${query}" | Marketplace: ${marketplace}`)

        // Paso 1: Buscar con Tavily
        const searchResult = await searchProducts(query, marketplace)
        
        if (searchResult.error || searchResult.results.length === 0) {
            return {
                success: false,
                error: searchResult.error || 'No se encontraron resultados para esta búsqueda.',
                products: [],
                _instruction: 'NO inventes URLs. Decile al usuario que no encontraste resultados.'
            }
        }

        // Paso 2: Scrapear las primeras 3 URLs del marketplace
        const urlsToScrape = searchResult.results
            .filter(r => {
                const config = MARKETPLACE_CONFIG[marketplace]
                return config ? r.url.includes(config.domain) : true
            })
            .slice(0, 3)

        const products: Array<{
            title: string
            url: string
            price: string | null
            prices: string[]
            verified: boolean
        }> = []

        for (const result of urlsToScrape) {
            // Validar que la URL existe antes de scrapear
            const isValidUrl = await validateUrl(result.url)
            if (!isValidUrl) {
                console.log(`[EcommerceSearch] Skipping invalid URL: ${result.url}`)
                continue
            }
            
            const scraped = await scrapeEcommerceUrl(result.url)
            
            products.push({
                title: scraped.title || result.title,
                url: result.url,
                price: scraped.prices[0] || null,
                prices: scraped.prices,
                verified: true
            })
        }

        // Si no hay productos válidos después de verificación
        if (products.length === 0) {
            return {
                success: false,
                error: 'No se pudieron verificar los resultados de búsqueda.',
                products: [],
                _instruction: 'NO inventes URLs. Decile al usuario que hubo un problema verificando los resultados.'
            }
        }

        // Filtrar productos sin precio si hay algunos con precio
        const productsWithPrices = products.filter(p => p.price)
        const finalProducts = productsWithPrices.length > 0 ? productsWithPrices : products

        return {
            success: true,
            query,
            marketplace,
            products: finalProducts,
            summary: searchResult.answer,
            totalFound: finalProducts.length,
            _instruction: 'SOLO mostrá las URLs de products[].url. NUNCA inventes links. Todos los links fueron verificados.'
        }
    }
} as any)

/**
 * Export scrapeUrl for backward compatibility and direct use
 */
export { scrapeEcommerceUrl as scrapeUrl }
