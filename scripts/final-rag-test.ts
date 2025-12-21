import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getTenantClient } from '../lib/supabase/tenant';
import { generateEmbedding } from '../lib/rag/embeddings';

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2';

async function main() {
  const client = await getTenantClient(TENANT_ID);
  
  console.log('=== FINAL RAG TEST ===\n');
  
  // Get RAG agent
  const { data: agents } = await client.from('agents').select('id, name, rag_enabled').eq('rag_enabled', true).limit(1);
  const agent = agents![0];
  console.log('Agent:', agent.name, '| RAG:', agent.rag_enabled);
  
  // Create doc
  const content = 'La política de devoluciones permite retornos dentro de 30 días.';
  const { data: doc, error: docErr } = await client.from('documents').insert({
    title: 'Test',
    content: content,
    source_type: 'test',
    agent_id: null,
    is_global: false
  }).select().single();
  
  if (docErr || !doc) {
    console.log('Doc error:', docErr?.message);
    return;
  }
  console.log('Doc:', doc.id);
  
  // Create chunk with embedding (no chunk_index)
  const emb = await generateEmbedding(content);
  console.log('Embedding generated, length:', emb.length);
  
  const { data: chunk, error: chunkErr } = await client.from('document_chunks').insert({
    document_id: doc.id,
    content: content,
    embedding: emb
  }).select().single();
  
  if (chunkErr || !chunk) {
    console.log('Chunk error:', chunkErr?.message);
    await client.from('documents').delete().eq('id', doc.id);
    return;
  }
  console.log('Chunk:', chunk.id, '| has embedding:', !!chunk.embedding);
  
  // Test RPC
  console.log('\n--- Calling match_documents ---');
  const queryEmb = await generateEmbedding('devoluciones');
  const { data: results, error: rpcErr } = await client.rpc('match_documents', {
    query_embedding: queryEmb,
    match_agent_id: agent.id,
    match_threshold: 0.0,
    match_count: 10
  });
  
  console.log('RPC Error:', rpcErr?.message || 'none');
  console.log('Results:', results?.length || 0);
  
  if (results && results.length > 0) {
    console.log('\n✅ SUCCESS! RAG Search works!');
    console.log('First result:', JSON.stringify(results[0], null, 2));
  } else {
    console.log('\n❌ No results returned');
    
    // Debug: Check if chunk embedding was saved
    const { data: savedChunk } = await client.from('document_chunks').select('embedding').eq('id', chunk.id).single();
    console.log('Chunk has saved embedding:', !!savedChunk?.embedding);
    
    // Debug: Check doc visibility conditions
    const { data: docCheck } = await client.from('documents').select('agent_id, is_global').eq('id', doc.id).single();
    console.log('Doc agent_id:', docCheck?.agent_id, '| is_global:', docCheck?.is_global);
  }
  
  // Cleanup
  await client.from('documents').delete().eq('id', doc.id);
  console.log('\nCleaned up');
}

main().catch(console.error);
