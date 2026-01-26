/**
 * MercadoLibre Hybrid Search Skill
 *
 * Combina Serper (URLs precisas) + Grounding (análisis de precios)
 */

import type { MeliProduct } from './types'
import { searchMeliWithSerper } from './search'
import { analyzeMeliPricesWithGrounding } from './analyze'

/**
 * Skill: Búsqueda híbrida (Serper + Grounding)
 *
 * Combina lo mejor de ambos:
 * - Serper: URLs precisas de productos
 * - Grounding: Análisis y contexto de precios
 */
export async function searchMeliHybrid(
  query: string,
  options: {
    maxResults?: number
    useCache?: boolean
  } = {}
): Promise<{
  products: MeliProduct[]
  analysis: string
  method: 'hybrid'
}> {
  const { maxResults = 5, useCache = true } = options

  console.log('[MeliSkill/Hybrid] Starting hybrid search for:', query)

  // Run both in parallel
  const [serperResult, groundingResult] = await Promise.all([
    searchMeliWithSerper(query, { maxResults, useCache }),
    analyzeMeliPricesWithGrounding(query).catch((err) => {
      console.error('[MeliSkill/Hybrid] Grounding failed:', err.message)
      return null
    }),
  ])

  // Combine results
  const products = serperResult.products
  const analysis = groundingResult?.analysis || ''

  // Enrich products with prices from Grounding if missing
  if (groundingResult && products.some((p) => p.price === null)) {
    // Try to extract more prices from Grounding analysis
    // This is a best-effort enrichment
  }

  return {
    products,
    analysis,
    method: 'hybrid',
  }
}
