import { tool } from 'ai'
import { z } from 'zod'

/**
 * Check if URL is from MercadoLibre (needs special stealth handling)
 */
function isMercadoLibreUrl(url: string): boolean {
    return url.includes('mercadolibre') || 
           url.includes('mercadoli.com') || 
           url.includes('meli.') ||
           url.includes('articulo.mercadolibre')
}

/**
 * Scrape a URL using Firecrawl API
 * Uses STEALTH PROXY + MOBILE mode for MercadoLibre to bypass anti-bot
 * 
 * Test results showed:
 * - stealth + mobile: Successfully gets real prices
 * - Regular mode: Gets login wall
 */
async function scrapeUrl(url: string) {
    const apiKey = process.env.FIRECRAWL_API_KEY

    if (!apiKey) {
        console.error('[Firecrawl] API key not found')
        return { error: 'FIRECRAWL_API_KEY no configurada' }
    }

    const isMeLi = isMercadoLibreUrl(url)

    try {
        console.log('[Firecrawl] Scraping:', url, isMeLi ? '(MeLi: stealth+mobile)' : '')

        // Build request body
        const requestBody: any = {
            url,
            formats: ['markdown'],
            timeout: 30000
        }

        if (isMeLi) {
            // MercadoLibre requires stealth proxy + mobile to bypass anti-bot
            // This costs 5 credits per request but actually works
            requestBody.mobile = true           // Mobile user agent works better
            requestBody.proxy = 'stealth'       // Stealth proxy bypasses blocks
            requestBody.waitFor = 2000          // Wait for dynamic content
            requestBody.location = {
                country: 'AR',
                languages: ['es-AR']
            }
            // Actions to scroll and load more content (for listings)
            requestBody.actions = [
                { type: 'wait', milliseconds: 1000 },
                { type: 'scroll', direction: 'down', amount: 500 }
            ]
        } else {
            // For non-MeLi sites, use basic scraping
            requestBody.waitFor = 2000
            requestBody.onlyMainContent = true
        }

        const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': \`Bearer \${apiKey}\`
            },
            body: JSON.stringify(requestBody)
        })

        if (!res.ok) {
            const error = await res.text()
            console.error('[Firecrawl] HTTP Error:', res.status, error)
            return { error: \`Error \${res.status}: \${error}\` }
        }

        const data = await res.json()

        if (!data.success) {
            console.error('[Firecrawl] Scrape failed:', data.error)
            return { error: data.error || 'Error al extraer contenido' }
        }

        const markdown = data.data?.markdown || ''

        // Check if we got blocked by login page (shouldn't happen with stealth mode)
        if (markdown.includes('Ingresá tu e-mail') || markdown.includes('Iniciá sesión') || markdown.includes('Ingresar')) {
            console.warn('[Firecrawl] Login wall detected (stealth may have failed):', url)
            return {
                url,
                title: data.data?.metadata?.title || 'Página protegida',
                content: 'MercadoLibre requiere inicio de sesión. Probá con una URL de listado de búsqueda: https://listado.mercadolibre.com.ar/...',
                blocked: true
            }
        }

        console.log('[Firecrawl] Success:', markdown.length, 'chars from', url)

        // Extract prices for MeLi products
        const prices = isMeLi ? extractPrices(markdown) : null

        return {
            url,
            title: data.data?.metadata?.title || 'Sin título',
            content: markdown.slice(0, 15000) || '', // Increased to 15K for MeLi listings
            description: data.data?.metadata?.description,
            prices: prices  // Array of found prices
        }
    } catch (error: any) {
        console.error('[Firecrawl] Exception:', error.message)
        return { error: error.message }
    }
}

/**
 * Extract prices from MercadoLibre markdown content
 * Returns array of prices found
 */
function extractPrices(content: string): string[] {
    const prices: string[] = []
    
    // Pattern for Argentine peso prices (e.g., $273.000, $1.225.000)
    const pricePattern = /\$\s?(\d{1,3}(?:\.\d{3})*(?:,\d{2})?)/g
    
    let match
    while ((match = pricePattern.exec(content)) !== null) {
        const price = \`\$\${match[1]}\`
        // Avoid duplicates and filter out very small numbers (likely not prices)
        if (!prices.includes(price) && parseInt(match[1].replace(/\./g, '')) >= 1000) {
            prices.push(price)
        }
        // Limit to 10 prices
        if (prices.length >= 10) break
    }
    
    return prices
}

/**
 * Firecrawl Web Investigator tool for AI SDK
 * Used by agents to scrape web pages and extract content
 */
export const webInvestigatorTool = tool({
    description: \`Investigador Web: Extrae contenido completo de una URL específica.

USO PRINCIPAL: Obtener precios y detalles de productos de MercadoLibre.

TIPOS DE URLs que funcionan bien:
- Listados de búsqueda: https://listado.mercadolibre.com.ar/termo-stanley
- Productos específicos: https://articulo.mercadolibre.com.ar/MLA-...

IMPORTANTE: Siempre usa esta herramienta DESPUÉS de web_search para obtener los precios reales de las URLs encontradas.\`,
    parameters: z.object({
        url: z.string().describe('URL completa a investigar (debe incluir https://)')
    }),
    execute: async ({ url }: any) => {
        console.log('[Firecrawl] Tool called with:', url)
        return await scrapeUrl(url)
    }
} as any)
