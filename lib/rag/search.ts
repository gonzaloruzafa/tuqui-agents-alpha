import { getTenantClient } from '../supabase/tenant'
import { generateEmbedding } from './embeddings'

export interface SearchResult {
    id: string
    content: string
    similarity: number
}

export async function searchDocuments(
    tenantId: string,
    agentId: string,
    query: string,
    limit = 5,
    threshold = 0.3  // Lowered from 0.5 for better recall
): Promise<SearchResult[]> {
    try {
        const client = await getTenantClient(tenantId)
        console.log(`[RAG] Generating embedding for query: "${query.substring(0, 30)}..."`)
        const embedding = await generateEmbedding(query)
        console.log(`[RAG] Embedding generated. Calling match_documents RPC...`)

        const { data, error } = await client.rpc('match_documents', {
            query_embedding: embedding,
            match_agent_id: agentId,
            match_threshold: threshold,
            match_count: limit
        })

        if (error) {
            console.error('[RAG] Error in match_documents RPC:', error)
            return []
        }

        console.log(`[RAG] match_documents returned ${data?.length || 0} results`)
        return (data as SearchResult[]) || []
    } catch (e) {
        console.error('[RAG] searchDocuments exception:', e)
        throw e
    }
}
