import { tool } from 'ai'
import { z } from 'zod'
import { searchProducts } from './browser-client'
import { calculatePercentiles, MELI_SITE_LIST } from './schema'

export const searchTool = tool({
    description: 'Buscar productos en Mercado Libre (precios, links, imagenes)',
    parameters: z.object({
        query: z.string().describe('Producto a buscar'),
        site: z.string().optional().describe('Código de sitio MeLi (MLA, MLB, etc)'),
        maxResults: z.number().optional().describe('Cantidad máxima de resultados')
    }),
    execute: async ({ query, site, maxResults }: any) => {
        return await searchProducts(query, site || 'MLA', maxResults || 5)
    }
} as any)

export const priceAnalysisTool = tool({
    description: 'Analizar precios de un producto (promedio, minimos, maximos)',
    parameters: z.object({
        query: z.string().describe('Producto a analizar'),
        site: z.string().optional().describe('Código de sitio MeLi'),
        sampleSize: z.number().optional().describe('Tamaño de muestra para análisis')
    }),
    execute: async ({ query, site, sampleSize }: any) => {
        const result = await searchProducts(query, site || 'MLA', sampleSize)
        if (!result.success || result.products.length === 0) {
            return { error: 'No se encontraron productos' }
        }

        const prices = result.products.map(p => p.price).filter(p => p > 0)
        const stats = calculatePercentiles(prices)

        return {
            stats,
            cheapest: result.products.sort((a, b) => a.price - b.price).slice(0, 3)
        }
    }
} as any)

export const meliTools = {
    meli_search: searchTool,
    meli_price_analysis: priceAnalysisTool
}
