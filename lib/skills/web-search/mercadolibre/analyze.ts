/**
 * MercadoLibre Price Analysis Skill
 *
 * Análisis de precios usando Google Grounding (Gemini 2.0)
 * Mejor para comparar y resumir precios que para encontrar URLs
 */

import { parsePrice, type MeliPriceAnalysis } from './types'

/**
 * Skill: Analizar precios de MercadoLibre con Google Grounding
 *
 * Grounding es mejor para:
 * - Comparar y resumir precios
 * - Dar contexto sobre el mercado
 * - Responder preguntas complejas sobre productos
 */
export async function analyzeMeliPricesWithGrounding(
  query: string,
  options: {
    maxResults?: number
  } = {}
): Promise<MeliPriceAnalysis> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')

  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY no configurada')
  }

  console.log('[MeliSkill/Grounding] Analyzing:', query)

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: [{ googleSearch: {} } as any],
  })

  const prompt = `Buscá precios de "${query}" en MercadoLibre Argentina.

Respondé con:
1. Rango de precios encontrado (mínimo y máximo)
2. Precio promedio aproximado
3. Factores que afectan el precio (nuevo/usado, vendedor, etc)
4. Recomendación de compra

IMPORTANTE:
- NO incluyas links ni URLs en tu respuesta
- Solo analiza precios, NO proporciones links
- Los links se obtienen de otra fuente verificada

Usá datos actuales de MercadoLibre Argentina.
Respondé en español argentino, sé conciso.`

  const result = await model.generateContent(prompt)
  const response = result.response
  let text = response.text()

  // CRITICAL: Remove any MercadoLibre URLs that Grounding might have invented
  // Grounding often generates plausible-looking URLs that don't exist or point to wrong products
  // Only Serper URLs are verified - we strip all ML URLs from Grounding's analysis
  const meliUrlPattern = /https?:\/\/(?:www\.|articulo\.)?mercadolibre\.com\.ar\/[^\s\)\]"<>]+/gi
  const foundUrls = text.match(meliUrlPattern) || []
  if (foundUrls.length > 0) {
    console.log(`[MeliSkill/Grounding] ⚠️ Stripping ${foundUrls.length} unverified URLs from analysis`)
    text = text.replace(meliUrlPattern, '[URL removida - usar links verificados de Serper]')
  }

  // Try to extract prices from the analysis
  const prices: number[] = []
  const priceMatches = text.matchAll(/\$\s*([\d.]+)/g)
  for (const match of priceMatches) {
    const price = parsePrice(match[1])
    if (price && price > 1000) prices.push(price)
  }

  const minPrice = prices.length > 0 ? Math.min(...prices) : null
  const maxPrice = prices.length > 0 ? Math.max(...prices) : null
  const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null

  return {
    query,
    analysis: text,
    minPrice,
    maxPrice,
    avgPrice,
    products: [], // Grounding doesn't return structured products
  }
}

interface ProductPrice {
  title: string
  price: number | null
  priceFormatted: string | null
}

/**
 * Get prices for specific products using Grounding
 * 
 * Strategy: Ask Grounding to find prices for the general query,
 * then try to match prices to specific products or provide a range
 */
export async function getProductPricesWithGrounding(
  query: string,
  productTitles: string[]
): Promise<{
  prices: ProductPrice[]
  analysis: string
  priceRange?: { min: number; max: number }
}> {
  const { GoogleGenerativeAI } = await import('@google/generative-ai')

  const GEMINI_API_KEY = process.env.GOOGLE_GENERATIVE_AI_API_KEY
  if (!GEMINI_API_KEY) {
    throw new Error('GOOGLE_GENERATIVE_AI_API_KEY no configurada')
  }

  console.log('[MeliSkill/Grounding] Getting prices for:', query)

  const genAI = new GoogleGenerativeAI(GEMINI_API_KEY)
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash-exp',
    tools: [{ googleSearch: {} } as any],
  })

  const prompt = `Buscá precios de "${query}" en MercadoLibre Argentina.

Necesito que respondas en este formato EXACTO:

PRECIOS:
- Precio mínimo: $XX.XXX
- Precio máximo: $XX.XXX
- Precio promedio: $XX.XXX

PRODUCTOS CON PRECIO (listá 3-5 productos específicos con su precio):
1. [Nombre del producto] - $XX.XXX
2. [Nombre del producto] - $XX.XXX
3. [Nombre del producto] - $XX.XXX

ANÁLISIS:
[2-3 oraciones sobre el mercado, variaciones de precio, recomendaciones]

IMPORTANTE:
- Usá precios en pesos argentinos de MercadoLibre Argentina
- NO incluyas links ni URLs
- Si un producto no tiene precio visible, no lo incluyas`

  const result = await model.generateContent(prompt)
  const response = result.response
  let text = response.text()

  // Strip any URLs
  const meliUrlPattern = /https?:\/\/(?:www\.|articulo\.)?mercadolibre\.com\.ar\/[^\s\)\]"<>]+/gi
  text = text.replace(meliUrlPattern, '')

  console.log('[MeliSkill/Grounding] Raw response:', text.substring(0, 500))

  // Extract all prices from the response
  const allPrices: number[] = []
  const priceMatches = [...text.matchAll(/\$\s*([\d.]+)/g)]
  for (const match of priceMatches) {
    const priceStr = match[1].replace(/\./g, '')
    const price = parseInt(priceStr, 10)
    if (!isNaN(price) && price > 1000) {
      allPrices.push(price)
    }
  }

  // Extract specific product-price pairs from the response
  // Pattern: "1. ProductName - $XX.XXX" or "- ProductName: $XX.XXX"
  const productPricePattern = /(?:\d+\.\s*|\-\s*)([^-\n]+?)\s*[-:]\s*\$\s*([\d.]+)/g
  const productPriceMatches = [...text.matchAll(productPricePattern)]
  
  const extractedProducts: { name: string; price: number }[] = []
  for (const match of productPriceMatches) {
    const name = match[1].trim()
    const priceStr = match[2].replace(/\./g, '')
    const price = parseInt(priceStr, 10)
    if (!isNaN(price) && price > 1000 && name.length > 3) {
      extractedProducts.push({ name, price })
    }
  }

  console.log(`[MeliSkill/Grounding] Extracted ${extractedProducts.length} product-price pairs`)

  // Match extracted prices to Serper products by similarity
  const prices: ProductPrice[] = productTitles.map(title => {
    // Try to find a matching price from Grounding
    const titleWords = title.toLowerCase().split(/\s+/).filter(w => w.length > 3)
    
    for (const extracted of extractedProducts) {
      const extractedWords = extracted.name.toLowerCase().split(/\s+/).filter(w => w.length > 3)
      // Check if at least 2 significant words match
      const matchCount = titleWords.filter(w => extractedWords.some(ew => ew.includes(w) || w.includes(ew))).length
      if (matchCount >= 2) {
        return {
          title,
          price: extracted.price,
          priceFormatted: `$${extracted.price.toLocaleString('es-AR')}`,
        }
      }
    }
    
    return { title, price: null, priceFormatted: null }
  })

  // Calculate price range
  const priceRange = allPrices.length >= 2 
    ? { min: Math.min(...allPrices), max: Math.max(...allPrices) }
    : undefined

  // Extract analysis section
  const analysisMatch = text.match(/AN[ÁA]LISIS:?\s*\n?([\s\S]*?)(?:$|IMPORTANTE|NOTA)/i)
  const analysis = analysisMatch?.[1]?.trim() || 
    (priceRange ? `Precios encontrados entre $${priceRange.min.toLocaleString('es-AR')} y $${priceRange.max.toLocaleString('es-AR')}.` : '')

  const foundPrices = prices.filter(p => p.price !== null).length
  console.log(`[MeliSkill/Grounding] Matched ${foundPrices}/${productTitles.length} products with prices`)

  return { prices, analysis, priceRange }
}
