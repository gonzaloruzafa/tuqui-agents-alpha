import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

import { getTenantClient } from '../lib/supabase/tenant';

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2';

async function main() {
  const tenantDb = await getTenantClient(TENANT_ID);
  console.log('=== DEBUG FUNCTION DEFINITION ===\n');
  
  // Try to call the function with zero embedding
  const zeroEmb = Array(768).fill(0);
  
  const { data: d1, error: e1 } = await tenantDb.rpc('match_documents', {
    query_embedding: zeroEmb,
    match_threshold: -100,
    match_count: 100
  });
  
  console.log('Test 1 - Zero embedding, threshold -100:');
  console.log('  Results:', d1?.length ?? 0);
  console.log('  Error:', e1?.message ?? 'none');
  
  // Check chunks directly
  const { data: chunks } = await tenantDb.from('document_chunks').select('id, content, embedding');
  console.log('\nChunks in DB:', chunks?.length ?? 0);
  
  if (chunks && chunks.length > 0) {
    const chunk = chunks[0];
    console.log('  Chunk ID:', chunk.id);
    console.log('  Content preview:', chunk.content?.substring(0, 50));
    console.log('  Embedding exists:', !!chunk.embedding);
    console.log('  Embedding type:', typeof chunk.embedding);
    
    // Check if embedding is an array or string
    if (chunk.embedding) {
      const emb = typeof chunk.embedding === 'string' 
        ? JSON.parse(chunk.embedding) 
        : chunk.embedding;
      console.log('  Embedding is array:', Array.isArray(emb));
      console.log('  Embedding length:', emb?.length);
      console.log('  First 3 values:', emb?.slice(0, 3));
      
      // Now try to call with the EXACT embedding
      const { data: d2, error: e2 } = await tenantDb.rpc('match_documents', {
        query_embedding: emb,
        match_threshold: -100,
        match_count: 100
      });
      
      console.log('\nTest 2 - Exact embedding from chunk:');
      console.log('  Results:', d2?.length ?? 0);
      console.log('  Error:', e2?.message ?? 'none');
      if (d2 && d2.length > 0) {
        console.log('  First result:', JSON.stringify(d2[0], null, 2));
      }
      
      // Try with agent_id parameter
      const { data: agents } = await tenantDb.from('agents').select('id').limit(1);
      if (agents && agents.length > 0) {
        const agentId = agents[0].id;
        console.log('\nTest 3 - With agent_id:', agentId);
        
        const { data: d3, error: e3 } = await tenantDb.rpc('match_documents', {
          query_embedding: emb,
          match_threshold: -100,
          match_count: 100,
          filter_agent_id: agentId
        });
        
        console.log('  Results:', d3?.length ?? 0);
        console.log('  Error:', e3?.message ?? 'none');
      }
    }
  }
  
  // Check what function signature exists
  console.log('\n=== CHECKING FUNCTION PARAMETERS ===');
  
  // Try different parameter names
  const testCases = [
    { name: 'no agent filter', params: { query_embedding: Array(768).fill(0.1), match_threshold: 0.0, match_count: 10 } },
    { name: 'with filter_agent_id null', params: { query_embedding: Array(768).fill(0.1), match_threshold: 0.0, match_count: 10, filter_agent_id: null } },
    { name: 'with p_agent_id null', params: { query_embedding: Array(768).fill(0.1), match_threshold: 0.0, match_count: 10, p_agent_id: null } },
  ];
  
  for (const tc of testCases) {
    const { data, error } = await tenantDb.rpc('match_documents', tc.params as any);
    console.log(`\n${tc.name}:`);
    console.log('  Results:', data?.length ?? 0);
    console.log('  Error:', error?.message ?? 'none');
  }
}

main().catch(console.error);
