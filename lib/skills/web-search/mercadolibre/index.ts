/**
 * MercadoLibre Skills for Web Search Tool
 *
 * Funciones especializadas que el tool web_search usa internamente
 * cuando detecta búsquedas de MercadoLibre.
 *
 * Estas NO son skills del registry global - son helpers específicos del tool.
 *
 * @example
 * import { MeliSkills } from '@/lib/skills/web-search/mercadolibre'
 *
 * // Búsqueda híbrida (Serper + Grounding)
 * const result = await MeliSkills.hybrid('turbina led', { maxResults: 5 })
 *
 * // Solo búsqueda de URLs con Serper
 * const search = await MeliSkills.search('iphone 15')
 *
 * // Solo análisis de precios con Grounding
 * const analysis = await MeliSkills.analyze('macbook pro m3')
 *
 * // Comparar precio del usuario vs mercado
 * const compare = await MeliSkills.compare('turbina led', 150000)
 */

// Re-export types
export * from './types'

// Re-export classes
export { MLCache } from './_cache'
export { MLLinkValidator } from './_validator'

// Re-export individual skills
export { searchMeliWithSerper } from './search'
export { analyzeMeliPricesWithGrounding } from './analyze'
export { searchMeliHybrid } from './hybrid'
export { compareMeliPrices } from './compare'

// Import for bundled export
import { parsePrice, formatPrice } from './types'
import { searchMeliWithSerper } from './search'
import { analyzeMeliPricesWithGrounding } from './analyze'
import { searchMeliHybrid } from './hybrid'
import { compareMeliPrices } from './compare'

/**
 * Bundled MercadoLibre skills object
 * Provides all skills in a single namespace
 */
export const MeliSkills = {
  search: searchMeliWithSerper,
  analyze: analyzeMeliPricesWithGrounding,
  hybrid: searchMeliHybrid,
  compare: compareMeliPrices,
  parsePrice,
  formatPrice,
}
