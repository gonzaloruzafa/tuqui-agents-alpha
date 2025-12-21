import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'
import { generateEmbedding, generateEmbeddings } from '../lib/rag/embeddings'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function testSimilarityDirectly() {
    const db = await getTenantClient(TENANT_ID)
    
    console.log('=== TEST COSINE SIMILARITY DIRECTLY ===\n')
    
    // 1. Get agent
    const { data: agent } = await db.from('agents')
        .select('id, name, rag_enabled')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    console.log('Agent:', agent?.name, agent?.id)
    
    // 2. Insert test doc
    const testContent = 'El IVA en Argentina tiene una alícuota general del 21 por ciento.'
    
    const { data: doc } = await db.from('documents').insert({
        title: 'Test IVA',
        content: testContent,
        agent_id: agent?.id,
        is_global: false,
        source_type: 'test'
    }).select().single()
    
    console.log('Document created:', doc?.id)
    
    // 3. Generate and store embedding
    const docEmbedding = await generateEmbedding(testContent)
    console.log('Document embedding generated')
    
    await db.from('document_chunks').insert({
        document_id: doc?.id,
        content: testContent,
        embedding: docEmbedding,
        metadata: {}
    })
    console.log('Chunk inserted')
    
    // 4. Generate query embedding
    const queryEmbedding = await generateEmbedding('IVA 21%')
    console.log('Query embedding generated')
    
    // 5. Calculate cosine similarity manually
    function cosineSimilarity(a: number[], b: number[]): number {
        let dotProduct = 0
        let normA = 0
        let normB = 0
        for (let i = 0; i < a.length; i++) {
            dotProduct += a[i] * b[i]
            normA += a[i] * a[i]
            normB += b[i] * b[i]
        }
        return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
    }
    
    const manualSimilarity = cosineSimilarity(docEmbedding, queryEmbedding)
    console.log('\nManual cosine similarity:', manualSimilarity.toFixed(4))
    
    // 6. Test RPC
    const { data: rpcResults, error } = await db.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_agent_id: agent?.id,
        match_threshold: 0.0,
        match_count: 10
    })
    
    if (error) {
        console.log('RPC Error:', error.message)
    } else {
        console.log('RPC Results:', rpcResults?.length || 0)
        rpcResults?.forEach((r: any) => console.log(' -', r.similarity.toFixed(4), r.content?.substring(0, 40)))
    }
    
    // 7. Test with exact embedding (should return 1.0)
    console.log('\nTest with EXACT embedding (should find it):')
    const { data: exactResults } = await db.rpc('match_documents', {
        query_embedding: docEmbedding,
        match_agent_id: agent?.id,
        match_threshold: 0.0,
        match_count: 10
    })
    console.log('Exact Results:', exactResults?.length || 0)
    exactResults?.forEach((r: any) => console.log(' -', r.similarity.toFixed(4), r.content?.substring(0, 40)))
    
    // Cleanup
    await db.from('documents').delete().eq('id', doc?.id)
    console.log('\nCleaned up')
}

testSimilarityDirectly()
