import { tool } from 'ai'
import { z } from 'zod'

/**
 * Search the web using Tavily API
 */
async function searchWeb(
    query: string,
    options?: {
        search_depth?: 'basic' | 'advanced'
        max_results?: number
        include_answer?: boolean
    }
) {
    const apiKey = process.env.TAVILY_API_KEY

    if (!apiKey) {
        return { error: 'TAVILY_API_KEY no configurada' }
    }

    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                search_depth: options?.search_depth || 'basic',
                max_results: options?.max_results || 5,
                include_answer: options?.include_answer ?? true,
                include_raw_content: false,
                include_images: false,
            })
        })

        if (!res.ok) {
            const error = await res.text()
            return { error: `Tavily error: ${error}` }
        }

        const data = await res.json()

        return {
            answer: data.answer || null,
            sources: data.results?.map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 500) || ''
            })) || []
        }
    } catch (error: any) {
        return { error: error.message }
    }
}

/**
 * Tavily web search tool for AI SDK
 */
export const tavilySearchTool = tool({
    description: 'Buscar información actualizada en internet. Útil para noticias, datos actuales, precios, información que cambia frecuentemente.',
    parameters: z.object({
        query: z.string().describe('Términos de búsqueda en español o inglés'),
        search_depth: z.string().optional().describe('Profundidad: basic o advanced'),
        max_results: z.number().optional().describe('Cantidad máxima de resultados')
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async ({ query, search_depth, max_results }: any) => {
        return await searchWeb(query, {
            search_depth: search_depth || 'basic',
            max_results: max_results || 5,
            include_answer: true
        })
    }
} as any)
