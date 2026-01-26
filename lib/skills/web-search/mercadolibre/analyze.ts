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

Usá datos actuales de MercadoLibre Argentina (mercadolibre.com.ar).
Respondé en español argentino, sé conciso.`

  const result = await model.generateContent(prompt)
  const response = result.response
  const text = response.text()

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
