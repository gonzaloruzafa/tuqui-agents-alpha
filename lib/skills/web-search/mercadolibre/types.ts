/**
 * Types and utility functions for MercadoLibre skills
 */

// ============================================
// TYPES
// ============================================

export interface MeliProduct {
  id: string | null
  title: string
  url: string
  snippet: string
  price: number | null
  priceFormatted: string | null
}

export interface MeliSearchResult {
  products: MeliProduct[]
  query: string
  method: 'serper' | 'grounding' | 'hybrid'
  cacheHit: boolean
}

export interface MeliPriceAnalysis {
  query: string
  analysis: string
  minPrice: number | null
  maxPrice: number | null
  avgPrice: number | null
  products: MeliProduct[]
}

// ============================================
// PRICE PARSING
// ============================================

/**
 * Extrae precio de un string
 * Formatos: "$ 123.456", "$123456", "ARS 123.456", "1.234.567"
 */
export function parsePrice(text: string): number | null {
  if (!text) return null

  // Remove currency symbols and normalize
  const normalized = text
    .replace(/ARS|USD|\$|,/gi, '')
    .replace(/\s+/g, '')
    .trim()

  // Pattern for Argentine prices (123.456.789 or 123456789)
  const match = normalized.match(/(\d{1,3}(?:\.\d{3})*|\d+)/)
  if (!match) return null

  // Remove dots (thousands separator in Argentina)
  const priceStr = match[1].replace(/\./g, '')
  const price = parseInt(priceStr, 10)

  return isNaN(price) ? null : price
}

/**
 * Busca precio en snippet o título
 */
export function extractPriceFromText(text: string): number | null {
  const patterns = [
    /\$\s*([\d.]+)/, // $ 123.456
    /([\d.]+)\s*pesos/i, // 123.456 pesos
    /ARS\s*([\d.]+)/i, // ARS 123.456
    /precio[:\s]*([\d.]+)/i, // precio: 123.456
    /desde\s*\$?\s*([\d.]+)/i, // desde $ 123.456
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      const price = parsePrice(match[1] || match[0])
      if (price && price > 1000) return price // Filter out non-prices
    }
  }

  return null
}

/**
 * Formatea precio en pesos argentinos
 */
export function formatPrice(price: number | null): string | null {
  if (price === null) return null
  return `$ ${price.toLocaleString('es-AR')}`
}
