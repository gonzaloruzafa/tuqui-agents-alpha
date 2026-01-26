/**
 * MercadoLibre Price Comparison Skill
 *
 * Compara precios de usuario contra el mercado
 */

import { formatPrice } from './types'
import { searchMeliWithSerper } from './search'

/**
 * Skill: Comparar precios de un producto
 *
 * Útil cuando el usuario pregunta "estoy caro?" o "cuánto debería costar?"
 */
export async function compareMeliPrices(
  productName: string,
  userPrice?: number
): Promise<{
  productName: string
  marketPrices: {
    min: number | null
    max: number | null
    avg: number | null
  }
  userPriceAnalysis: string | null
  recommendation: string
}> {
  const searchResult = await searchMeliWithSerper(productName, { maxResults: 10 })

  const prices = searchResult.products.map((p) => p.price).filter((p): p is number => p !== null)

  const min = prices.length > 0 ? Math.min(...prices) : null
  const max = prices.length > 0 ? Math.max(...prices) : null
  const avg = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null

  let userPriceAnalysis: string | null = null
  let recommendation = ''

  if (userPrice && avg) {
    const diff = ((userPrice - avg) / avg) * 100
    if (diff > 20) {
      userPriceAnalysis = `Tu precio (${formatPrice(userPrice)}) está ${Math.round(diff)}% arriba del promedio.`
      recommendation = 'Estás caro. Considerá bajar el precio para ser más competitivo.'
    } else if (diff > 5) {
      userPriceAnalysis = `Tu precio está ${Math.round(diff)}% arriba del promedio.`
      recommendation = 'Estás en el rango alto. Es aceptable si tu producto tiene diferenciadores.'
    } else if (diff > -5) {
      userPriceAnalysis = `Tu precio está alineado con el mercado.`
      recommendation = 'Buen precio, competitivo.'
    } else {
      userPriceAnalysis = `Tu precio está ${Math.abs(Math.round(diff))}% abajo del promedio.`
      recommendation = 'Estás barato. Podrías subir el precio sin perder competitividad.'
    }
  } else if (prices.length === 0) {
    recommendation = 'No encontré suficientes precios para comparar. Probá con términos más específicos.'
  } else {
    recommendation = `El precio promedio en MercadoLibre es ${formatPrice(avg)}. Rango: ${formatPrice(min)} - ${formatPrice(max)}.`
  }

  return {
    productName,
    marketPrices: { min, max, avg },
    userPriceAnalysis,
    recommendation,
  }
}
