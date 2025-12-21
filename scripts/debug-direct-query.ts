import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'
import { generateEmbedding, generateEmbeddings } from '../lib/rag/embeddings'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function debugDirectQuery() {
    const db = await getTenantClient(TENANT_ID)
    
    console.log('=== DEBUG DIRECT QUERY ===\n')
    
    // Get agent
    const { data: agent } = await db.from('agents')
        .select('id, name')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    console.log('Agent:', agent?.name, agent?.id)
    
    // Insert test doc
    const testContent = 'El IVA en Argentina tiene una alícuota del 21 por ciento para la mayoría de productos.'
    
    const { data: doc } = await db.from('documents').insert({
        title: 'Test IVA',
        content: testContent,
        agent_id: agent?.id,
        is_global: false
    }).select().single()
    
    console.log('Document:', doc?.id)
    
    const embedding = await generateEmbedding(testContent)
    
    await db.from('document_chunks').insert({
        document_id: doc?.id,
        content: testContent,
        embedding: embedding,
        metadata: {}
    })
    
    console.log('Chunk inserted')
    
    // Now test a simple RPC that just returns ALL chunks
    const queryEmb = await generateEmbedding('IVA')
    
    console.log('\n--- Testing match_documents ---')
    
    // Test 1: Agent ID match
    console.log('\nTest 1: With agent_id =', agent?.id)
    const { data: t1, error: e1 } = await db.rpc('match_documents', {
        query_embedding: queryEmb,
        match_agent_id: agent?.id,
        match_threshold: 0.0,
        match_count: 10
    })
    console.log('Result:', t1?.length || 0, 'Error:', e1?.message || 'none')
    
    // Test 2: Check if issue is threshold
    console.log('\nTest 2: With threshold = -10 (accept everything)')
    const { data: t2, error: e2 } = await db.rpc('match_documents', {
        query_embedding: queryEmb,
        match_agent_id: agent?.id,
        match_threshold: -10,
        match_count: 10
    })
    console.log('Result:', t2?.length || 0, 'Error:', e2?.message || 'none')
    
    // Test 3: Check raw query without function
    console.log('\n--- Direct SQL-like query ---')
    
    // Get all chunks
    const { data: allChunks } = await db.from('document_chunks').select('id, document_id, content')
    console.log('Total chunks in DB:', allChunks?.length || 0)
    
    // Get documents for this agent
    const { data: agentDocs } = await db.from('documents')
        .select('id, title, agent_id, is_global')
        .or(`agent_id.eq.${agent?.id},is_global.eq.true,agent_id.is.null`)
    console.log('Documents for agent:', agentDocs?.length || 0)
    agentDocs?.forEach(d => console.log(' -', d.id, 'agent:', d.agent_id, 'global:', d.is_global))
    
    // Check if our test doc is in that list
    const testDocInList = agentDocs?.some(d => d.id === doc?.id)
    console.log('Test doc in list:', testDocInList)
    
    // Cleanup
    await db.from('documents').delete().eq('id', doc?.id)
    console.log('\nCleaned up')
}

debugDirectQuery()
