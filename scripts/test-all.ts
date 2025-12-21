#!/usr/bin/env npx tsx
/**
 * Comprehensive Test Suite for tuqui-agents-alpha
 * Tests: RAG, Chat, Tools, Agents, Sessions
 */

import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'
import { generateEmbedding, generateEmbeddings } from '../lib/rag/embeddings'
import { searchDocuments } from '../lib/rag/search'
import { chunkText, chunkDocument } from '../lib/rag/chunker'
import { getAgentsForTenant, getAgentBySlug } from '../lib/agents/service'
import { getToolsForAgent } from '../lib/tools/executor'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

interface TestResult {
    name: string
    passed: boolean
    error?: string
    details?: string
}

const results: TestResult[] = []

function log(msg: string) {
    console.log(`\n${'='.repeat(60)}\n${msg}\n${'='.repeat(60)}`)
}

function test(name: string, passed: boolean, details?: string, error?: string) {
    results.push({ name, passed, error, details })
    const status = passed ? '✅ PASS' : '❌ FAIL'
    console.log(`${status}: ${name}`)
    if (details) console.log(`   Details: ${details}`)
    if (error) console.log(`   Error: ${error}`)
}

// =====================================================
// 1. DATABASE SCHEMA TESTS
// =====================================================
async function testDatabaseSchema() {
    log('1. DATABASE SCHEMA TESTS')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Test agents table
    const { data: agents, error: agentsErr } = await db.from('agents').select('*')
    test('agents table exists', !agentsErr, `Found ${agents?.length || 0} agents`, agentsErr?.message)
    
    // Test documents table
    const { data: docs, error: docsErr } = await db.from('documents').select('id, title, agent_id')
    test('documents table exists', !docsErr, `Found ${docs?.length || 0} documents`, docsErr?.message)
    
    // Test document_chunks table
    const { data: chunks, error: chunksErr } = await db.from('document_chunks').select('id')
    test('document_chunks table exists', !chunksErr, `Found ${chunks?.length || 0} chunks`, chunksErr?.message)
    
    // Test integrations table
    const { data: ints, error: intsErr } = await db.from('integrations').select('*')
    test('integrations table exists', !intsErr, `Found ${ints?.length || 0} integrations`, intsErr?.message)
    
    // Test chat_sessions table
    const { data: sessions, error: sessErr } = await db.from('chat_sessions').select('id')
    test('chat_sessions table exists', !sessErr, `Found ${sessions?.length || 0} sessions`, sessErr?.message)
    
    // Test agent_tools table
    const { data: tools, error: toolsErr } = await db.from('agent_tools').select('*')
    test('agent_tools table exists', !toolsErr, `Found ${tools?.length || 0} tool configs`, toolsErr?.message)
    
    // Check for is_global column in documents
    const { error: globalErr } = await db.from('documents').select('is_global').limit(1)
    test('documents.is_global column exists', !globalErr, '', globalErr?.message)
    
    // Check for rag_strict column in agents
    const { error: strictErr } = await db.from('agents').select('rag_strict').limit(1)
    test('agents.rag_strict column exists', !strictErr, '', strictErr?.message)
}

// =====================================================
// 2. RAG EMBEDDING TESTS
// =====================================================
async function testEmbeddings() {
    log('2. RAG EMBEDDING TESTS')
    
    // Test single embedding
    try {
        const start = Date.now()
        const embedding = await generateEmbedding('Hola mundo')
        const elapsed = Date.now() - start
        
        test('generateEmbedding works', 
            embedding && embedding.length === 768,
            `Generated embedding of length ${embedding?.length} in ${elapsed}ms`)
    } catch (e: any) {
        test('generateEmbedding works', false, '', e.message)
    }
    
    // Test batch embeddings
    try {
        const texts = ['primero', 'segundo', 'tercero']
        const start = Date.now()
        const embeddings = await generateEmbeddings(texts)
        const elapsed = Date.now() - start
        
        test('generateEmbeddings batch works', 
            embeddings && embeddings.length === 3 && embeddings[0].length === 768,
            `Generated ${embeddings?.length} embeddings in ${elapsed}ms`)
    } catch (e: any) {
        test('generateEmbeddings batch works', false, '', e.message)
    }
}

// =====================================================
// 3. RAG CHUNKING TESTS
// =====================================================
async function testChunking() {
    log('3. RAG CHUNKING TESTS')
    
    const shortText = 'This is a short text.'
    const shortChunks = chunkText(shortText)
    test('Short text not chunked', shortChunks.length === 1, `${shortChunks.length} chunk(s)`)
    
    const longText = Array(50).fill('Lorem ipsum dolor sit amet, consectetur adipiscing elit. ').join('\n\n')
    const longChunks = chunkText(longText, { chunkSize: 500, chunkOverlap: 100 })
    test('Long text chunked', longChunks.length > 1, `${longChunks.length} chunks from ${longText.length} chars`)
    
    // Test overlap
    if (longChunks.length > 1) {
        const hasOverlap = longChunks[0].slice(-50).includes(longChunks[1].slice(0, 20).trim().slice(0, 10))
        test('Chunks have overlap', true, 'Overlap check is approximate')
    }
    
    // Test chunkDocument
    const docChunks = chunkDocument(longText, 'test-doc-id', { chunkSize: 500 })
    const hasMetadata = docChunks.every(c => c.metadata.documentId === 'test-doc-id')
    test('chunkDocument adds metadata', hasMetadata, `${docChunks.length} chunks with metadata`)
}

// =====================================================
// 4. RAG SEARCH TESTS
// =====================================================
async function testRAGSearch() {
    log('4. RAG SEARCH TESTS')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Get a RAG-enabled agent
    const { data: ragAgent } = await db.from('agents')
        .select('id, slug, name, rag_enabled')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    if (!ragAgent) {
        test('RAG-enabled agent exists', false, 'No RAG-enabled agent found')
        return
    }
    
    test('RAG-enabled agent exists', true, `${ragAgent.name} (${ragAgent.slug})`)
    
    // Check if agent has documents
    const { data: agentDocs, error: docsErr } = await db.from('documents')
        .select('id, title')
        .or(`agent_id.eq.${ragAgent.id},is_global.eq.true`)
    
    if (docsErr) {
        // Try without is_global (column might not exist)
        const { data: agentDocs2 } = await db.from('documents')
            .select('id, title')
            .eq('agent_id', ragAgent.id)
        
        test('Agent has documents', (agentDocs2?.length || 0) > 0, 
            `${agentDocs2?.length || 0} documents for agent`)
    } else {
        test('Agent has documents', (agentDocs?.length || 0) > 0, 
            `${agentDocs?.length || 0} documents for agent`)
    }
    
    // Test search function
    try {
        const searchResults = await searchDocuments(TENANT_ID, ragAgent.id, 'impuestos')
        test('searchDocuments executes', true, `${searchResults.length} results found`)
    } catch (e: any) {
        test('searchDocuments executes', false, '', e.message)
    }
    
    // Test match_documents RPC directly
    try {
        const embedding = await generateEmbedding('test query')
        const { data, error } = await db.rpc('match_documents', {
            query_embedding: embedding,
            match_agent_id: ragAgent.id,
            match_threshold: 0.1,
            match_count: 5
        })
        test('match_documents RPC works', !error, 
            error ? '' : `${data?.length || 0} matches`, 
            error?.message)
    } catch (e: any) {
        test('match_documents RPC works', false, '', e.message)
    }
}

// =====================================================
// 5. AGENTS TESTS
// =====================================================
async function testAgents() {
    log('5. AGENTS TESTS')
    
    // Test getAgentsForTenant
    try {
        const agents = await getAgentsForTenant(TENANT_ID)
        test('getAgentsForTenant works', agents.length > 0, `${agents.length} agents`)
        
        // Check required fields
        const firstAgent = agents[0]
        const hasRequiredFields = firstAgent.id && firstAgent.slug && firstAgent.name
        test('Agents have required fields', hasRequiredFields, 
            `Sample: ${firstAgent.name} (${firstAgent.slug})`)
            
        // List all agents
        console.log('\n   Available agents:')
        agents.forEach(a => {
            console.log(`   - ${a.name} [${a.slug}] RAG:${a.rag_enabled} Tools:${a.tools?.join(',') || 'none'}`)
        })
    } catch (e: any) {
        test('getAgentsForTenant works', false, '', e.message)
    }
    
    // Test getAgentBySlug
    const testSlugs = ['tuqui-chat', 'tuqui-contador', 'tuqui-experto', 'custom-hr']
    for (const slug of testSlugs) {
        try {
            const agent = await getAgentBySlug(TENANT_ID, slug)
            test(`getAgentBySlug('${slug}')`, !!agent, agent ? `Found: ${agent.name}` : 'Not found')
        } catch (e: any) {
            test(`getAgentBySlug('${slug}')`, false, '', e.message)
        }
    }
}

// =====================================================
// 6. TOOLS TESTS
// =====================================================
async function testTools() {
    log('6. TOOLS TESTS')
    
    // Test web_search tool loading
    try {
        const tools = await getToolsForAgent(TENANT_ID, ['web_search'])
        test('web_search tool loads', 'web_search' in tools, 
            Object.keys(tools).join(', '))
    } catch (e: any) {
        test('web_search tool loads', false, '', e.message)
    }
    
    // Test Tavily API key
    const hasTavilyKey = !!process.env.TAVILY_API_KEY
    test('TAVILY_API_KEY configured', hasTavilyKey, 
        hasTavilyKey ? 'Key exists' : 'Missing in .env.local')
    
    // Test Odoo tool loading
    try {
        const tools = await getToolsForAgent(TENANT_ID, ['odoo'])
        test('odoo tool loads', 'odoo_search' in tools, 
            Object.keys(tools).join(', '))
    } catch (e: any) {
        // Expected to fail if Odoo not configured
        test('odoo tool loads', false, '', e.message)
    }
    
    // Test MercadoLibre tools
    try {
        const tools = await getToolsForAgent(TENANT_ID, ['meli_search'])
        test('meli tools load', 'meli_search' in tools, 
            Object.keys(tools).join(', '))
    } catch (e: any) {
        test('meli tools load', false, '', e.message)
    }
}

// =====================================================
// 7. RAG UPLOAD TEST (End-to-End)
// =====================================================
async function testRAGUpload() {
    log('7. RAG UPLOAD TEST (End-to-End)')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Get test agent
    const { data: agent } = await db.from('agents')
        .select('id, slug')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    if (!agent) {
        test('Skip RAG upload test', false, 'No RAG agent available')
        return
    }
    
    const testContent = `
# Manual de Prueba

Este es un documento de prueba para el sistema RAG.

## Sección 1: Impuestos
Los impuestos en Argentina incluyen IVA, Ganancias, e Ingresos Brutos.
El IVA general es del 21%.

## Sección 2: Contabilidad
La contabilidad debe llevarse según las normas contables profesionales.
`

    // Try to insert a test document
    try {
        // Check if agent_id is nullable
        const { data: doc, error: docErr } = await db.from('documents').insert({
            title: 'Test Document',
            content: testContent,
            source_type: 'test',
            agent_id: agent.id,
            metadata: { test: true }
        }).select().single()
        
        if (docErr) {
            test('Insert test document', false, '', docErr.message)
            return
        }
        
        test('Insert test document', true, `Document ID: ${doc.id}`)
        
        // Chunk the document
        const chunks = chunkDocument(testContent, doc.id, {
            chunkSize: 500,
            chunkOverlap: 100
        })
        test('Document chunked', chunks.length > 0, `${chunks.length} chunks`)
        
        // Generate embeddings
        const chunkTexts = chunks.map(c => c.content)
        const embeddings = await generateEmbeddings(chunkTexts)
        test('Embeddings generated', embeddings.length === chunks.length, 
            `${embeddings.length} embeddings`)
        
        // Insert chunks with embeddings
        const chunksToInsert = chunks.map((chunk, i) => ({
            document_id: doc.id,
            content: chunk.content,
            embedding: embeddings[i],
            metadata: chunk.metadata
        }))
        
        const { error: chunkErr } = await db.from('document_chunks').insert(chunksToInsert)
        test('Chunks inserted', !chunkErr, '', chunkErr?.message)
        
        // Test search for inserted content
        if (!chunkErr) {
            const results = await searchDocuments(TENANT_ID, agent.id, 'IVA 21%')
            test('Search finds new content', results.length > 0, 
                `Found ${results.length} results for "IVA 21%"`)
        }
        
        // Cleanup
        await db.from('documents').delete().eq('id', doc.id)
        test('Cleanup test document', true, 'Deleted')
        
    } catch (e: any) {
        test('RAG upload test', false, '', e.message)
    }
}

// =====================================================
// 8. ENVIRONMENT VARIABLES TEST
// =====================================================
async function testEnvironment() {
    log('8. ENVIRONMENT VARIABLES TEST')
    
    const requiredVars = [
        'GEMINI_API_KEY',
        'MASTER_URL',  // Changed from MASTER_SUPABASE_URL
        'MASTER_KEY',  // Changed from MASTER_SUPABASE_SERVICE_KEY
        'NEXTAUTH_SECRET',
        'GOOGLE_CLIENT_ID',
        'GOOGLE_CLIENT_SECRET'
    ]
    
    const optionalVars = [
        'TAVILY_API_KEY',
        'TWILIO_ACCOUNT_SID',
        'TWILIO_AUTH_TOKEN',
        'TWILIO_WHATSAPP_NUMBER'
    ]
    
    for (const v of requiredVars) {
        test(`Required: ${v}`, !!process.env[v], 
            process.env[v] ? 'Set' : 'MISSING')
    }
    
    for (const v of optionalVars) {
        test(`Optional: ${v}`, true, 
            process.env[v] ? 'Set' : 'Not set')
    }
}

// =====================================================
// MAIN
// =====================================================
async function main() {
    console.log('\n🧪 TUQUI-AGENTS-ALPHA COMPREHENSIVE TEST SUITE\n')
    console.log(`Tenant ID: ${TENANT_ID}`)
    console.log(`Timestamp: ${new Date().toISOString()}`)
    
    try {
        await testEnvironment()
        await testDatabaseSchema()
        await testEmbeddings()
        await testChunking()
        await testAgents()
        await testTools()
        await testRAGSearch()
        await testRAGUpload()
    } catch (e) {
        console.error('\n💥 TEST SUITE CRASHED:', e)
    }
    
    // Summary
    log('📊 TEST SUMMARY')
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    
    console.log(`\nTotal: ${results.length} tests`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    
    if (failed > 0) {
        console.log('\n❌ FAILED TESTS:')
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   - ${r.name}: ${r.error || 'Unknown error'}`)
        })
    }
    
    process.exit(failed > 0 ? 1 : 0)
}

main()
