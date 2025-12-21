import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getTenantClient } from '../lib/supabase/tenant';
import { generateEmbedding } from '../lib/rag/embeddings';

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2';

async function main() {
  const client = await getTenantClient(TENANT_ID);
  
  console.log('=== RAG SEARCH DEBUG ===\n');
  
  // 1. Get a RAG-enabled agent
  const { data: agents } = await client
    .from('agents')
    .select('id, name, rag_enabled, rag_strict')
    .eq('rag_enabled', true)
    .limit(1);
  
  if (!agents || agents.length === 0) {
    console.log('❌ No RAG-enabled agents');
    return;
  }
  
  const agent = agents[0];
  console.log('Agent:', agent.name, agent.id);
  console.log('RAG Enabled:', agent.rag_enabled);
  console.log('RAG Strict:', agent.rag_strict);
  
  // 2. Create a test document
  const { data: doc, error: docErr } = await client
    .from('documents')
    .insert({
      name: 'Test RAG Doc',
      content: 'La política de devoluciones de Adhoc permite devoluciones dentro de 30 días.',
      type: 'text',
      agent_id: null, // Available to all
      is_global: false
    })
    .select()
    .single();
  
  if (docErr) {
    console.log('❌ Error creating document:', docErr.message);
    return;
  }
  console.log('\nDocument created:', doc.id);
  
  // 3. Generate embedding
  const content = 'La política de devoluciones de Adhoc permite devoluciones dentro de 30 días.';
  const embedding = await generateEmbedding(content);
  console.log('Embedding generated, length:', embedding.length);
  
  // 4. Insert chunk
  const { data: chunk, error: chunkErr } = await client
    .from('document_chunks')
    .insert({
      document_id: doc.id,
      content: content,
      embedding: embedding,
      chunk_index: 0
    })
    .select()
    .single();
  
  if (chunkErr) {
    console.log('❌ Error creating chunk:', chunkErr.message);
    await client.from('documents').delete().eq('id', doc.id);
    return;
  }
  console.log('Chunk created:', chunk.id);
  
  // 5. Test RPC with correct parameter names
  console.log('\n--- Testing match_documents RPC ---');
  
  const queryEmbedding = await generateEmbedding('política de devoluciones');
  console.log('Query embedding generated');
  
  // Call with EXACTLY the parameter names from the function
  const { data: results, error: rpcErr } = await client.rpc('match_documents', {
    query_embedding: queryEmbedding,
    match_agent_id: agent.id,
    match_threshold: 0.0,  // Accept all
    match_count: 10
  });
  
  console.log('\nRPC call result:');
  console.log('  Error:', rpcErr?.message || 'none');
  console.log('  Results:', results?.length || 0);
  
  if (results && results.length > 0) {
    console.log('  First result:', results[0]);
  }
  
  // 6. Direct query to verify data exists
  console.log('\n--- Direct query verification ---');
  const { data: allChunks } = await client.from('document_chunks').select('id, content');
  console.log('Chunks in DB:', allChunks?.length || 0);
  
  const { data: allDocs } = await client.from('documents').select('id, name, agent_id, is_global');
  console.log('Documents in DB:', allDocs?.length || 0);
  if (allDocs) {
    allDocs.forEach(d => console.log(`  - ${d.name}: agent=${d.agent_id}, global=${d.is_global}`));
  }
  
  // 7. Test if function exists
  console.log('\n--- Function check via raw SQL ---');
  const { data: funcCheck, error: funcErr } = await client.rpc('match_documents', {
    query_embedding: embedding, // Use exact same embedding
    match_agent_id: agent.id,
    match_threshold: 0.99, // Should still match exact embedding
    match_count: 10
  });
  
  console.log('Exact embedding match:');
  console.log('  Error:', funcErr?.message || 'none');
  console.log('  Results:', funcCheck?.length || 0);
  
  // 8. Cleanup
  console.log('\n--- Cleanup ---');
  await client.from('document_chunks').delete().eq('document_id', doc.id);
  await client.from('documents').delete().eq('id', doc.id);
  console.log('Test data cleaned up');
}

main().catch(console.error);
