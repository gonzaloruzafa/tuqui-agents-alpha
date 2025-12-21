import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'
import { generateEmbedding, generateEmbeddings } from '../lib/rag/embeddings'
import { chunkDocument } from '../lib/rag/chunker'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function debugRAGSearch() {
    const db = await getTenantClient(TENANT_ID)
    
    console.log('=== DEBUG RAG SEARCH ===\n')
    
    // 1. Get RAG agent
    const { data: agent } = await db.from('agents')
        .select('*')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    console.log('1. Agent:', agent?.name, '- ID:', agent?.id)
    console.log('   rag_enabled:', agent?.rag_enabled)
    console.log('   rag_strict:', agent?.rag_strict)
    
    // 2. Insert test document assigned to this agent
    const testContent = `
# Información sobre IVA

El IVA (Impuesto al Valor Agregado) en Argentina tiene una alícuota general del 21%.
Para ciertos productos alimenticios, la alícuota es reducida al 10.5%.
Los servicios de salud y educación están exentos de IVA.
`
    
    const { data: doc, error: docErr } = await db.from('documents').insert({
        title: 'Test IVA Document',
        content: testContent,
        agent_id: agent?.id,  // Assign to agent
        is_global: false,
        source_type: 'test'
    }).select().single()
    
    if (docErr) {
        console.error('2. Error inserting document:', docErr)
        return
    }
    console.log('\n2. Document inserted:', doc.id)
    console.log('   agent_id:', doc.agent_id)
    console.log('   is_global:', doc.is_global)
    
    // 3. Create and insert chunk with embedding
    const chunks = chunkDocument(testContent, doc.id)
    console.log('\n3. Chunks created:', chunks.length)
    
    const embeddings = await generateEmbeddings(chunks.map(c => c.content))
    console.log('   Embeddings generated:', embeddings.length)
    
    const { error: chunkErr } = await db.from('document_chunks').insert(
        chunks.map((c, i) => ({
            document_id: doc.id,
            content: c.content,
            embedding: embeddings[i],
            metadata: c.metadata
        }))
    )
    
    if (chunkErr) {
        console.error('   Error inserting chunks:', chunkErr)
        await db.from('documents').delete().eq('id', doc.id)
        return
    }
    console.log('   Chunks inserted successfully')
    
    // 4. Verify chunks are in DB
    const { data: savedChunks } = await db.from('document_chunks')
        .select('id, document_id, content')
        .eq('document_id', doc.id)
    console.log('\n4. Chunks in DB:', savedChunks?.length)
    savedChunks?.forEach(c => console.log('   -', c.content.substring(0, 50) + '...'))
    
    // 5. Test search with different thresholds
    console.log('\n5. Testing match_documents with different thresholds...')
    
    const queryEmbedding = await generateEmbedding('IVA 21%')
    console.log('   Query embedding generated (768 dims)')
    
    for (const threshold of [0.0, 0.1, 0.3, 0.5, 0.7]) {
        const { data, error } = await db.rpc('match_documents', {
            query_embedding: queryEmbedding,
            match_agent_id: agent?.id,
            match_threshold: threshold,
            match_count: 5
        })
        
        if (error) {
            console.log(`   Threshold ${threshold}: ERROR - ${error.message}`)
        } else {
            console.log(`   Threshold ${threshold}: ${data?.length || 0} results`)
            if (data && data.length > 0) {
                data.forEach((r: any) => console.log(`      - similarity: ${r.similarity.toFixed(3)}, content: ${r.content.substring(0, 40)}...`))
            }
        }
    }
    
    // 6. Test direct similarity query (bypass function)
    console.log('\n6. Direct similarity query (bypass RPC)...')
    const { data: directResults, error: directErr } = await db
        .from('document_chunks')
        .select('id, content, document_id')
        .eq('document_id', doc.id)
    
    if (directErr) {
        console.log('   Direct query error:', directErr.message)
    } else {
        console.log('   Direct query found:', directResults?.length, 'chunks')
    }
    
    // 7. Cleanup
    console.log('\n7. Cleaning up...')
    await db.from('documents').delete().eq('id', doc.id)
    console.log('   Done!')
}

debugRAGSearch()
