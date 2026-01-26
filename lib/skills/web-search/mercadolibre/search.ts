/**
 * MercadoLibre Search Skill
 *
 * Búsqueda de productos usando Serper (Google Search API)
 * Retorna URLs de productos (/articulo/) no de listados (/listado/)
 */

import { MLLinkValidator } from './_validator'
import { MLCache } from './_cache'
import { extractPriceFromText, formatPrice, type MeliProduct, type MeliSearchResult } from './types'

/**
 * Skill: Buscar productos en MercadoLibre con Serper
 *
 * Serper es mejor que Tavily para MercadoLibre porque:
 * - Permite búsquedas site: precisas
 * - Devuelve URLs de /articulo/ (productos) no /listado/ (categorías)
 * - Detecta precios automáticamente en algunos casos
 */
export async function searchMeliWithSerper(
  query: string,
  options: {
    maxResults?: number
    useCache?: boolean
  } = {}
): Promise<MeliSearchResult> {
  const { maxResults = 5, useCache = true } = options

  // Check cache
  const cacheKey = `meli:serper:${query}`
  if (useCache) {
    const cached = MLCache.get<MeliSearchResult>(cacheKey)
    if (cached) {
      console.log('[MeliSkill/Serper] Cache HIT:', query)
      return { ...cached, cacheHit: true }
    }
  }

  const SERPER_API_KEY = process.env.SERPER_API_KEY
  if (!SERPER_API_KEY) {
    throw new Error('SERPER_API_KEY no configurada')
  }

  // Query optimizada para productos directos (no listados)
  const searchQuery = `${query} site:articulo.mercadolibre.com.ar OR site:mercadolibre.com.ar/p/`

  console.log('[MeliSkill/Serper] Searching:', searchQuery)

  const res = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: {
      'X-API-KEY': SERPER_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      q: searchQuery,
      num: maxResults,
      gl: 'ar',
      hl: 'es',
    }),
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Serper error (${res.status}): ${error}`)
  }

  const data = await res.json()
  const organic = data.organic || []

  console.log('[MeliSkill/Serper] Found', organic.length, 'results')

  // Parse and filter valid product URLs
  const products: MeliProduct[] = organic
    .filter((r: any) => MLLinkValidator.isProductURL(r.link))
    .map((r: any) => {
      const price = extractPriceFromText(r.snippet || r.title || '')
      return {
        id: MLLinkValidator.extractProductId(r.link),
        title: r.title,
        url: r.link,
        snippet: r.snippet || '',
        price,
        priceFormatted: formatPrice(price),
      }
    })

  const result: MeliSearchResult = {
    products,
    query,
    method: 'serper',
    cacheHit: false,
  }

  // Cache result
  if (useCache && products.length > 0) {
    MLCache.set(cacheKey, result)
  }

  return result
}
