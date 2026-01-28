/**
 * MercadoLibre Hybrid Search Skill
 *
 * Combina Serper (URLs precisas) + Grounding (precios específicos)
 */

import type { MeliProduct } from './types'
import { searchMeliWithSerper } from './search'
import { getProductPricesWithGrounding } from './analyze'

/**
 * Skill: Búsqueda híbrida (Serper + Grounding)
 *
 * Estrategia:
 * 1. Serper: Obtiene URLs verificadas + títulos de productos
 * 2. Grounding: Busca precios específicos de esos productos por título
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

  // Step 1: Get verified URLs from Serper
  const serperResult = await searchMeliWithSerper(query, { maxResults, useCache })
  
  if (serperResult.products.length === 0) {
    return {
      products: [],
      analysis: 'No se encontraron productos en MercadoLibre.',
      method: 'hybrid',
    }
  }

  // Step 2: Use Grounding to get prices for these specific products
  const productTitles = serperResult.products.map(p => p.title).slice(0, 5)
  
  console.log(`[MeliSkill/Hybrid] Getting prices for ${productTitles.length} products via Grounding...`)
  
  const groundingResult = await getProductPricesWithGrounding(query, productTitles).catch((err) => {
    console.error('[MeliSkill/Hybrid] Grounding failed:', err.message)
    return null
  })

  // Step 3: Merge prices from Grounding into Serper products
  let products = serperResult.products
  let priceRangeInfo = ''
  
  if (groundingResult?.prices) {
    products = products.map((product, index) => {
      const groundingPrice = groundingResult.prices[index]
      if (groundingPrice && groundingPrice.price && product.price === null) {
        return {
          ...product,
          price: groundingPrice.price,
          priceFormatted: groundingPrice.priceFormatted,
        }
      }
      return product
    })
    
    const enrichedCount = products.filter(p => p.price !== null).length
    console.log(`[MeliSkill/Hybrid] ✓ Enriched ${enrichedCount}/${products.length} products with prices`)
    
    // If we have a price range but few matched products, include range in analysis
    if (groundingResult.priceRange && enrichedCount < products.length / 2) {
      const { min, max } = groundingResult.priceRange
      priceRangeInfo = `\n\n💰 Rango de precios en el mercado: $${min.toLocaleString('es-AR')} - $${max.toLocaleString('es-AR')}`
    }
  }

  return {
    products,
    analysis: (groundingResult?.analysis || '') + priceRangeInfo,
    method: 'hybrid',
  }
}
