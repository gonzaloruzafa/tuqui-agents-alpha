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
    threshold = 0.5
): Promise<SearchResult[]> {
    const client = await getTenantClient(tenantId)
    const embedding = await generateEmbedding(query)

    const { data, error } = await client.rpc('match_documents', {
        query_embedding: embedding,
        match_agent_id: agentId,
        match_threshold: threshold,
        match_count: limit
    })

    if (error) {
        console.error('Error searching documents:', error)
        return []
    }

    return (data as SearchResult[]) || []
}
