import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const TENANT_URL = 'https://ancgbbzvfhoqqxiueyoz.supabase.co'
const TENANT_SERVICE_KEY = process.env.INITIAL_TENANT_SERVICE_KEY!

async function applyMigration() {
    console.log('Applying RAG schema fixes...')
    
    const db = createClient(TENANT_URL, TENANT_SERVICE_KEY)
    
    // 1. Add is_global to documents
    console.log('1. Adding is_global column to documents...')
    const { error: err1 } = await db.rpc('exec_sql', { 
        sql: 'ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;'
    })
    if (err1) {
        console.log('   Note: exec_sql RPC may not exist, trying direct approach...')
        // We can't run raw SQL via REST API, need to run manually
    }
    
    // 2. Test if columns exist now
    console.log('\n2. Testing columns...')
    const { data: docTest, error: docErr } = await db
        .from('documents')
        .select('id, is_global')
        .limit(1)
    
    if (docErr) {
        console.log('   is_global column still missing. Run this SQL manually:')
        console.log('   ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;')
    } else {
        console.log('   ✅ is_global column exists')
    }
    
    const { data: agentTest, error: agentErr } = await db
        .from('agents')
        .select('id, rag_strict')
        .limit(1)
    
    if (agentErr) {
        console.log('   rag_strict column still missing. Run this SQL manually:')
        console.log('   ALTER TABLE agents ADD COLUMN IF NOT EXISTS rag_strict BOOLEAN DEFAULT false;')
    } else {
        console.log('   ✅ rag_strict column exists')
    }
    
    // 3. Check document_chunks schema
    console.log('\n3. Checking document_chunks schema...')
    const { data: chunkTest, error: chunkErr } = await db
        .from('document_chunks')
        .select('id, document_id, content')
        .limit(1)
    
    if (chunkErr) {
        console.log('   Error checking document_chunks:', chunkErr.message)
    } else {
        console.log('   ✅ document_chunks table accessible')
    }
    
    // Try inserting with just document_id (no agent_id)
    console.log('\n4. Testing chunk insert (without agent_id)...')
    
    // First need a test document
    const { data: testDoc, error: testDocErr } = await db
        .from('documents')
        .select('id')
        .limit(1)
        .single()
    
    if (!testDoc) {
        console.log('   No documents to test with, creating a test one...')
        
        // Get an agent first
        const { data: agent } = await db.from('agents').select('id').limit(1).single()
        
        const { data: newDoc, error: newDocErr } = await db.from('documents').insert({
            title: 'Migration Test',
            content: 'Test content',
            agent_id: agent?.id
        }).select().single()
        
        if (newDocErr) {
            console.log('   Error creating test doc:', newDocErr.message)
            return
        }
        
        // Try inserting a chunk
        const { error: chunkInsertErr } = await db.from('document_chunks').insert({
            document_id: newDoc.id,
            content: 'Test chunk',
            embedding: Array(768).fill(0)
        })
        
        if (chunkInsertErr) {
            console.log('   ❌ Chunk insert failed:', chunkInsertErr.message)
            if (chunkInsertErr.message.includes('agent_id')) {
                console.log('\n   The document_chunks table has an agent_id NOT NULL constraint.')
                console.log('   Run this SQL manually to fix:')
                console.log('   ALTER TABLE document_chunks DROP COLUMN IF EXISTS agent_id;')
                console.log('   -- OR if you want to keep it:')
                console.log('   ALTER TABLE document_chunks ALTER COLUMN agent_id DROP NOT NULL;')
            }
        } else {
            console.log('   ✅ Chunk insert works!')
        }
        
        // Cleanup
        await db.from('documents').delete().eq('id', newDoc.id)
    }
    
    console.log('\n===== SUMMARY =====')
    console.log('If there are issues, run the SQL in:')
    console.log('supabase/migrations/002_fix_rag_schema.sql')
    console.log('via Supabase Dashboard > SQL Editor')
}

applyMigration()
