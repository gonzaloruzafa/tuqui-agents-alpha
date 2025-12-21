import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'
import { generateEmbedding, generateEmbeddings } from '../lib/rag/embeddings'
import { chunkDocument } from '../lib/rag/chunker'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function debugMatchFunction() {
    const db = await getTenantClient(TENANT_ID)
    
    console.log('=== DEBUG MATCH_DOCUMENTS FUNCTION ===\n')
    
    // 1. Get agent
    const { data: agent } = await db.from('agents')
        .select('id, name, rag_enabled, rag_strict')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    console.log('1. Agent:', agent)
    
    // 2. Insert test doc and chunk
    const testContent = 'El IVA en Argentina es del 21 por ciento.'
    
    const { data: doc } = await db.from('documents').insert({
        title: 'Test',
        content: testContent,
        agent_id: agent?.id,
        is_global: false,
        source_type: 'test'
    }).select().single()
    
    console.log('2. Document:', doc?.id)
    
    const embedding = await generateEmbedding(testContent)
    console.log('3. Embedding length:', embedding.length)
    
    const { error: chunkErr } = await db.from('document_chunks').insert({
        document_id: doc?.id,
        content: testContent,
        embedding: embedding,
        metadata: {}
    })
    
    if (chunkErr) {
        console.error('Chunk insert error:', chunkErr)
        await db.from('documents').delete().eq('id', doc?.id)
        return
    }
    
    console.log('4. Chunk inserted')
    
    // 5. Verify chunk with embedding exists
    const { data: chunk } = await db.from('document_chunks')
        .select('id, document_id, content, embedding')
        .eq('document_id', doc?.id)
        .single()
    
    console.log('5. Chunk has embedding:', chunk?.embedding ? 'YES (length: ' + (chunk.embedding as any[]).length + ')' : 'NO')
    
    // 6. Test raw SQL-like query with cosine similarity
    // Since we can't do raw SQL, let's test the RPC with exact same embedding
    console.log('\n6. Testing RPC with EXACT same embedding...')
    
    const { data: exactMatch, error: exactErr } = await db.rpc('match_documents', {
        query_embedding: embedding, // Use exact same embedding
        match_agent_id: agent?.id,
        match_threshold: 0.0, // Lowest threshold
        match_count: 10
    })
    
    if (exactErr) {
        console.log('   Error:', exactErr.message)
    } else {
        console.log('   Results:', exactMatch?.length || 0)
        if (exactMatch) exactMatch.forEach((r: any) => console.log('   -', r.similarity, r.content?.substring(0, 30)))
    }
    
    // 7. Check if the issue is with the function logic
    // Let's check if agent_id matching works
    console.log('\n7. Checking document-agent relationship...')
    const { data: docCheck } = await db.from('documents')
        .select('id, agent_id, is_global')
        .eq('id', doc?.id)
        .single()
    console.log('   Document agent_id:', docCheck?.agent_id)
    console.log('   Document is_global:', docCheck?.is_global)
    console.log('   Query agent_id:', agent?.id)
    console.log('   Match:', docCheck?.agent_id === agent?.id)
    
    // 8. Manual similarity check using direct query
    console.log('\n8. Checking if embeddings are stored correctly...')
    const { data: allChunks } = await db.from('document_chunks')
        .select('id, embedding')
        .eq('document_id', doc?.id)
    
    if (allChunks && allChunks.length > 0) {
        const storedEmb = allChunks[0].embedding as number[]
        console.log('   Stored embedding first 5 values:', storedEmb?.slice(0, 5))
        console.log('   Query embedding first 5 values:', embedding.slice(0, 5))
        
        // Check if they're the same
        let match = true
        for (let i = 0; i < 5; i++) {
            if (Math.abs(storedEmb[i] - embedding[i]) > 0.0001) {
                match = false
                break
            }
        }
        console.log('   Embeddings match:', match)
    }
    
    // Cleanup
    console.log('\n9. Cleaning up...')
    await db.from('documents').delete().eq('id', doc?.id)
    console.log('   Done!')
}

debugMatchFunction()
