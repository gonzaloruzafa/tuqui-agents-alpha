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
        console.error('[Tavily] TAVILY_API_KEY no configurada')
        return { error: 'TAVILY_API_KEY no configurada' }
    }

    console.log('[Tavily] Searching:', query)

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
            console.error('[Tavily] Error response:', res.status, error)
            return { error: `Tavily error (${res.status}): ${error}` }
        }

        const data = await res.json()
        console.log('[Tavily] Success, sources:', data.results?.length || 0)

        return {
            answer: data.answer || null,
            sources: data.results?.map((r: any) => ({
                title: r.title,
                url: r.url,
                snippet: r.content?.slice(0, 500) || ''
            })) || []
        }
    } catch (error: any) {
        console.error('[Tavily] Exception:', error.message)
        return { error: error.message }
    }
}

/**
 * Tavily web search tool for AI SDK
 */
export const tavilySearchTool = tool({
    description: 'Navegador Web: Busca información actualizada en internet. Usa esto para encontrar noticias recientes, preguntas generales, comparar fuentes múltiples.',
    parameters: z.object({
        query: z.string().describe('Términos de búsqueda en español o inglés')
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    execute: async ({ query }: any) => {
        return await searchWeb(query, {
            search_depth: 'basic',
            max_results: 5,
            include_answer: true
        })
    }
} as any)
