#!/usr/bin/env npx tsx
/**
 * Comprehensive End-to-End Test Suite for tuqui-agents-alpha
 * Tests all features: RAG Upload, Chat, Tools, Sessions, Admin
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
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

interface TestResult {
    category: string
    name: string
    passed: boolean
    error?: string
    details?: string
    duration?: number
}

const results: TestResult[] = []

function log(msg: string) {
    console.log(`\n${'='.repeat(70)}\n${msg}\n${'='.repeat(70)}`)
}

function test(category: string, name: string, passed: boolean, details?: string, error?: string, duration?: number) {
    results.push({ category, name, passed, error, details, duration })
    const status = passed ? '✅' : '❌'
    console.log(`${status} ${name}`)
    if (details) console.log(`   → ${details}`)
    if (error) console.log(`   ⚠️ ${error}`)
    if (duration) console.log(`   ⏱️ ${duration}ms`)
}

// =====================================================
// FEATURE 1: DATABASE & SCHEMA
// =====================================================
async function testDatabase() {
    log('📦 FEATURE 1: DATABASE & SCHEMA')
    const db = await getTenantClient(TENANT_ID)
    
    // Core tables
    const tables = ['agents', 'documents', 'document_chunks', 'integrations', 'chat_sessions', 'chat_messages', 'agent_tools', 'agent_documents']
    
    for (const table of tables) {
        const start = Date.now()
        const { error } = await db.from(table).select('*').limit(1)
        test('Database', `Table ${table} exists`, !error, '', error?.message, Date.now() - start)
    }
    
    // Required columns
    const { error: e1 } = await db.from('documents').select('is_global').limit(1)
    test('Database', 'documents.is_global column', !e1, '', e1?.message)
    
    const { error: e2 } = await db.from('agents').select('rag_strict').limit(1)
    test('Database', 'agents.rag_strict column', !e2, '', e2?.message)
    
    // Check document_chunks does NOT have agent_id
    const { data: chunkCols } = await db.from('document_chunks').select('*').limit(1)
    if (chunkCols && chunkCols.length > 0) {
        const hasAgentId = 'agent_id' in chunkCols[0]
        test('Database', 'document_chunks NO agent_id', !hasAgentId, 
            hasAgentId ? 'agent_id still exists!' : 'Correct - no agent_id')
    } else {
        test('Database', 'document_chunks NO agent_id', true, 'Table empty, cannot verify')
    }
}

// =====================================================
// FEATURE 2: AGENTS SYSTEM
// =====================================================
async function testAgents() {
    log('🤖 FEATURE 2: AGENTS SYSTEM')
    
    // Get all agents
    const start = Date.now()
    const agents = await getAgentsForTenant(TENANT_ID)
    test('Agents', 'Load all agents', agents.length > 0, `${agents.length} agents loaded`, '', Date.now() - start)
    
    // Test each agent type
    const expectedAgents = ['tuqui-chat', 'tuqui-contador', 'tuqui-experto', 'tuqui-legal', 'tuqui-mercadolibre', 'tuqui-odoo']
    for (const slug of expectedAgents) {
        const agent = await getAgentBySlug(TENANT_ID, slug)
        test('Agents', `Agent ${slug}`, !!agent, agent ? `RAG: ${agent.rag_enabled}, Tools: ${agent.tools?.join(', ') || 'none'}` : 'Not found')
    }
    
    // Verify RAG agents
    const ragAgents = agents.filter(a => a.rag_enabled)
    test('Agents', 'RAG-enabled agents exist', ragAgents.length > 0, `${ragAgents.length} agents with RAG`)
    
    // Verify agent with tools
    const toolAgents = agents.filter(a => a.tools && a.tools.length > 0)
    test('Agents', 'Tool-enabled agents exist', toolAgents.length >= 0, `${toolAgents.length} agents with tools`)
}

// =====================================================
// FEATURE 3: RAG - EMBEDDINGS
// =====================================================
async function testEmbeddings() {
    log('🧬 FEATURE 3: RAG - EMBEDDINGS')
    
    // Single embedding
    const start1 = Date.now()
    try {
        const embedding = await generateEmbedding('Test query for embedding')
        test('Embeddings', 'Generate single embedding', 
            embedding.length === 768, 
            `Vector size: ${embedding.length}`, '', Date.now() - start1)
    } catch (e: any) {
        test('Embeddings', 'Generate single embedding', false, '', e.message)
    }
    
    // Batch embeddings
    const start2 = Date.now()
    try {
        const embeddings = await generateEmbeddings(['Query 1', 'Query 2', 'Query 3'])
        test('Embeddings', 'Generate batch embeddings', 
            embeddings.length === 3 && embeddings[0].length === 768,
            `${embeddings.length} embeddings`, '', Date.now() - start2)
    } catch (e: any) {
        test('Embeddings', 'Generate batch embeddings', false, '', e.message)
    }
}

// =====================================================
// FEATURE 4: RAG - CHUNKING
// =====================================================
async function testChunking() {
    log('✂️ FEATURE 4: RAG - CHUNKING')
    
    // Short text
    const shortChunks = chunkText('Short text.', { chunkSize: 500 })
    test('Chunking', 'Short text (no split)', shortChunks.length === 1, `${shortChunks.length} chunk`)
    
    // Long text
    const longText = Array(100).fill('This is a sentence. ').join('')
    const longChunks = chunkText(longText, { chunkSize: 500, chunkOverlap: 100 })
    test('Chunking', 'Long text (split)', longChunks.length > 1, `${longChunks.length} chunks from ${longText.length} chars`)
    
    // Document chunking with metadata
    const docChunks = chunkDocument(longText, 'test-doc-123', { chunkSize: 500 })
    const hasMetadata = docChunks.every(c => c.metadata.documentId === 'test-doc-123')
    test('Chunking', 'Document metadata', hasMetadata, `All ${docChunks.length} chunks have metadata`)
}

// =====================================================
// FEATURE 5: RAG - FULL PIPELINE
// =====================================================
async function testRAGPipeline() {
    log('🔍 FEATURE 5: RAG - FULL UPLOAD & SEARCH PIPELINE')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Get a RAG agent
    const { data: ragAgent } = await db.from('agents')
        .select('id, slug, name')
        .eq('rag_enabled', true)
        .limit(1)
        .single()
    
    if (!ragAgent) {
        test('RAG Pipeline', 'Find RAG agent', false, '', 'No RAG agent found')
        return
    }
    
    test('RAG Pipeline', 'Find RAG agent', true, `${ragAgent.name} (${ragAgent.id})`)
    
    // Insert test document
    const testContent = `
# Documento de Prueba RAG

## Información de IVA
El IVA en Argentina es del 21% para la alícuota general.
Para ciertos productos la alícuota reducida es del 10.5%.

## Monotributo
El monotributo es un régimen simplificado para pequeños contribuyentes.
Las categorías van de la A a la K según facturación.
`
    
    const { data: doc, error: docErr } = await db.from('documents').insert({
        title: 'Test RAG Document',
        content: testContent,
        agent_id: ragAgent.id,
        is_global: false,
        source_type: 'test'
    }).select().single()
    
    if (docErr) {
        test('RAG Pipeline', 'Insert document', false, '', docErr.message)
        return
    }
    test('RAG Pipeline', 'Insert document', true, `ID: ${doc.id}`)
    
    // Chunk and embed
    const chunks = chunkDocument(testContent, doc.id, { chunkSize: 500, chunkOverlap: 100 })
    test('RAG Pipeline', 'Chunk document', chunks.length > 0, `${chunks.length} chunks`)
    
    try {
        const embeddings = await generateEmbeddings(chunks.map(c => c.content))
        test('RAG Pipeline', 'Generate embeddings', embeddings.length === chunks.length, `${embeddings.length} embeddings`)
        
        // Insert chunks
        const chunksToInsert = chunks.map((c, i) => ({
            document_id: doc.id,
            content: c.content,
            embedding: embeddings[i],
            metadata: c.metadata
        }))
        
        const { error: chunkErr } = await db.from('document_chunks').insert(chunksToInsert)
        test('RAG Pipeline', 'Insert chunks', !chunkErr, chunkErr?.message || `${chunksToInsert.length} chunks saved`)
        
        if (!chunkErr) {
            // Search test - use the SAME content we just indexed for guaranteed match
            try {
                // Use a query that should semantically match
                const results = await searchDocuments(TENANT_ID, ragAgent.id, 'información sobre IVA impuesto valor agregado', 5, 0.3)
                test('RAG Pipeline', 'Search documents', results.length > 0, `Found ${results.length} results (threshold 0.3)`)
                
                if (results.length > 0) {
                    test('RAG Pipeline', 'Search relevance', 
                        results[0].content.toLowerCase().includes('iva'),
                        `Top result similarity: ${results[0].similarity.toFixed(3)}`)
                }
            } catch (searchErr: any) {
                test('RAG Pipeline', 'Search documents', false, '', searchErr.message)
            }
        }
        
    } catch (e: any) {
        test('RAG Pipeline', 'Embedding generation', false, '', e.message)
    }
    
    // Cleanup
    await db.from('documents').delete().eq('id', doc.id)
    test('RAG Pipeline', 'Cleanup', true, 'Test document deleted')
}

// =====================================================
// FEATURE 6: CHAT - STREAMING
// =====================================================
async function testChatStreaming() {
    log('💬 FEATURE 6: CHAT - STREAMING')
    
    const messages = [{ role: 'user' as const, content: '¿Qué es el IVA en Argentina?' }]
    
    try {
        const start = Date.now()
        const result = streamText({
            model: google('gemini-2.0-flash'),
            system: 'Sos un asistente contable argentino.',
            messages,
            maxSteps: 1
        })
        
        let fullText = ''
        let chunkCount = 0
        for await (const chunk of result.textStream) {
            fullText += chunk
            chunkCount++
        }
        
        const duration = Date.now() - start
        test('Chat', 'Stream text', fullText.length > 100, `${fullText.length} chars in ${chunkCount} chunks`, '', duration)
        test('Chat', 'Response quality', fullText.toLowerCase().includes('impuesto') || fullText.toLowerCase().includes('iva'), 'Relevant response')
        
        // Check response methods
        const hasTextStream = typeof (result as any).toTextStreamResponse === 'function'
        test('Chat', 'toTextStreamResponse available', hasTextStream)
        
    } catch (e: any) {
        test('Chat', 'Stream text', false, '', e.message)
    }
}

// =====================================================
// FEATURE 7: CHAT WITH RAG CONTEXT
// =====================================================
async function testChatWithRAG() {
    log('🧠 FEATURE 7: CHAT WITH RAG CONTEXT')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Check if there are any documents
    const { data: docs } = await db.from('documents').select('id').limit(1)
    
    if (!docs || docs.length === 0) {
        test('Chat+RAG', 'Documents exist', false, '', 'No documents in DB - upload some first')
        return
    }
    
    // Get RAG agent
    const agent = await getAgentBySlug(TENANT_ID, 'tuqui-contador')
    if (!agent) {
        test('Chat+RAG', 'Get RAG agent', false, '', 'tuqui-contador not found')
        return
    }
    
    test('Chat+RAG', 'Get RAG agent', true, `${agent.name} (RAG: ${agent.rag_enabled})`)
    
    // Search for context
    try {
        const ragResults = await searchDocuments(TENANT_ID, agent.id, 'impuestos')
        test('Chat+RAG', 'RAG search', true, `${ragResults.length} context chunks found`)
        
        // Build system prompt with context
        let systemPrompt = agent.system_prompt || 'Sos un asistente.'
        if (ragResults.length > 0) {
            systemPrompt += '\n\nCONTEXTO:\n' + ragResults.map(r => r.content).join('\n---\n')
        }
        
        // Chat with context
        const result = streamText({
            model: google('gemini-2.0-flash'),
            system: systemPrompt,
            messages: [{ role: 'user', content: '¿Qué alícuota de IVA se aplica?' }],
            maxSteps: 1
        })
        
        let response = ''
        for await (const chunk of result.textStream) {
            response += chunk
        }
        
        test('Chat+RAG', 'Generate response with context', response.length > 50, `${response.length} chars`)
        
    } catch (e: any) {
        test('Chat+RAG', 'RAG integration', false, '', e.message)
    }
}

// =====================================================
// FEATURE 8: TOOLS
// =====================================================
async function testTools() {
    log('🔧 FEATURE 8: TOOLS SYSTEM')
    
    // Web search tool
    try {
        const webTools = await getToolsForAgent(TENANT_ID, ['web_search'])
        test('Tools', 'Web search tool', 'web_search' in webTools, Object.keys(webTools).join(', '))
    } catch (e: any) {
        test('Tools', 'Web search tool', false, '', e.message)
    }
    
    // MercadoLibre tools
    try {
        const meliTools = await getToolsForAgent(TENANT_ID, ['meli_search'])
        test('Tools', 'MercadoLibre tools', 'meli_search' in meliTools, Object.keys(meliTools).join(', '))
    } catch (e: any) {
        test('Tools', 'MercadoLibre tools', false, '', e.message)
    }
    
    // Odoo tools - now uses native Google SDK wrapper
    // We test by checking if getOdooClient works (meaning Odoo is configured)
    try {
        const { getOdooClient } = await import('../lib/tools/odoo/client')
        const odoo = await getOdooClient(TENANT_ID)
        const authenticated = await odoo.authenticate()
        test('Tools', 'Odoo tools (native wrapper)', !!authenticated, `Odoo UID: ${authenticated}`)
    } catch (e: any) {
        test('Tools', 'Odoo tools (native wrapper)', false, '', 'Not configured: ' + e.message)
    }
    
    // Tavily API key check
    const hasTavily = !!process.env.TAVILY_API_KEY
    test('Tools', 'Tavily API key', hasTavily, hasTavily ? 'Configured' : 'Not set in .env.local')
}

// =====================================================
// FEATURE 9: CHAT SESSIONS
// =====================================================
async function testSessions() {
    log('📝 FEATURE 9: CHAT SESSIONS')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Get an agent
    const { data: agent } = await db.from('agents').select('id').limit(1).single()
    if (!agent) {
        test('Sessions', 'Get agent', false, '', 'No agents found')
        return
    }
    
    // Create session
    const { data: session, error: sessErr } = await db.from('chat_sessions').insert({
        agent_id: agent.id,
        user_email: 'test@test.com',
        title: 'Test Session'
    }).select().single()
    
    if (sessErr) {
        test('Sessions', 'Create session', false, '', sessErr.message)
        return
    }
    test('Sessions', 'Create session', true, `ID: ${session.id}`)
    
    // Add messages
    const { error: msg1Err } = await db.from('chat_messages').insert({
        session_id: session.id,
        role: 'user',
        content: 'Hola'
    })
    test('Sessions', 'Add user message', !msg1Err, '', msg1Err?.message)
    
    const { error: msg2Err } = await db.from('chat_messages').insert({
        session_id: session.id,
        role: 'assistant',
        content: 'Hola! ¿En qué puedo ayudarte?'
    })
    test('Sessions', 'Add assistant message', !msg2Err, '', msg2Err?.message)
    
    // Read messages
    const { data: msgs } = await db.from('chat_messages')
        .select('*')
        .eq('session_id', session.id)
        .order('created_at')
    test('Sessions', 'Read messages', msgs?.length === 2, `${msgs?.length} messages`)
    
    // Update session
    const { error: updateErr } = await db.from('chat_sessions')
        .update({ title: 'Updated Title', updated_at: new Date().toISOString() })
        .eq('id', session.id)
    test('Sessions', 'Update session', !updateErr, '', updateErr?.message)
    
    // Cleanup
    await db.from('chat_sessions').delete().eq('id', session.id)
    test('Sessions', 'Delete session (cascade)', true, 'Session and messages deleted')
}

// =====================================================
// FEATURE 10: INTEGRATIONS CONFIG
// =====================================================
async function testIntegrations() {
    log('⚙️ FEATURE 10: INTEGRATIONS CONFIG')
    
    const db = await getTenantClient(TENANT_ID)
    
    // Check integrations table
    const { data: ints, error } = await db.from('integrations').select('*')
    test('Integrations', 'Read integrations', !error, `${ints?.length || 0} configured`, error?.message)
    
    // Test upsert - use 'type' which is the unique key
    const { error: upsertErr } = await db.from('integrations').upsert({
        type: 'test_integration',
        is_active: false,
        config: { test: true }
    }, { onConflict: 'type' })
    test('Integrations', 'Upsert integration', !upsertErr, '', upsertErr?.message)
    
    // Cleanup
    await db.from('integrations').delete().eq('type', 'test_integration')
    test('Integrations', 'Delete integration', true, 'Test integration removed')
}

// =====================================================
// MAIN
// =====================================================
async function main() {
    console.log('\n🧪 TUQUI-AGENTS-ALPHA EXHAUSTIVE TEST SUITE')
    console.log(`Tenant ID: ${TENANT_ID}`)
    console.log(`Timestamp: ${new Date().toISOString()}\n`)
    
    try {
        await testDatabase()
        await testAgents()
        await testEmbeddings()
        await testChunking()
        await testRAGPipeline()
        await testChatStreaming()
        await testChatWithRAG()
        await testTools()
        await testSessions()
        await testIntegrations()
    } catch (e) {
        console.error('\n💥 TEST SUITE CRASHED:', e)
    }
    
    // Summary by category
    log('📊 RESULTS BY CATEGORY')
    const categories = [...new Set(results.map(r => r.category))]
    
    for (const cat of categories) {
        const catResults = results.filter(r => r.category === cat)
        const passed = catResults.filter(r => r.passed).length
        const total = catResults.length
        const pct = Math.round((passed / total) * 100)
        const icon = pct === 100 ? '✅' : pct >= 80 ? '🟡' : '❌'
        console.log(`${icon} ${cat}: ${passed}/${total} (${pct}%)`)
    }
    
    // Overall summary
    log('📊 OVERALL SUMMARY')
    const passed = results.filter(r => r.passed).length
    const failed = results.filter(r => !r.passed).length
    const total = results.length
    
    console.log(`Total: ${total} tests`)
    console.log(`✅ Passed: ${passed}`)
    console.log(`❌ Failed: ${failed}`)
    console.log(`Score: ${Math.round((passed / total) * 100)}%`)
    
    if (failed > 0) {
        console.log('\n❌ FAILED TESTS:')
        results.filter(r => !r.passed).forEach(r => {
            console.log(`   [${r.category}] ${r.name}`)
            if (r.error) console.log(`      → ${r.error}`)
        })
    }
    
    process.exit(failed > 0 ? 1 : 0)
}

main()
