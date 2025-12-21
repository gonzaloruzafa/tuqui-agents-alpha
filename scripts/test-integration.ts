/**
 * Test de Integración Completo - Tuqui Agents Alpha
 * 
 * Prueba todos los circuitos principales:
 * 1. Autenticación y Tenant
 * 2. Agentes (CRUD)
 * 3. RAG Pipeline
 * 4. Chat con Odoo
 * 5. Prometeo (Tareas Programadas)
 * 6. Push Subscriptions
 * 
 * Ejecutar: npx tsx scripts/test-integration.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

// Cargar .env.local
config({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

// Configuración
const TENANT_URL = process.env.INITIAL_TENANT_URL || 'https://ancgbbzvfhoqqxiueyoz.supabase.co'
const TENANT_KEY = process.env.INITIAL_TENANT_SERVICE_KEY || ''
const MASTER_URL = process.env.NEXT_PUBLIC_MASTER_SUPABASE_URL || 'https://uhmrsalgmyufufsxixpu.supabase.co'
const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || ''

const tenant = createClient(TENANT_URL, TENANT_KEY)
const master = createClient(MASTER_URL, MASTER_KEY)

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  message: string
  duration: number
}

const results: TestResult[] = []

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now()
  try {
    await fn()
    results.push({
      name,
      status: 'PASS',
      message: 'OK',
      duration: Date.now() - start
    })
    console.log(`✅ ${name}`)
  } catch (error) {
    results.push({
      name,
      status: 'FAIL',
      message: error instanceof Error ? error.message : String(error),
      duration: Date.now() - start
    })
    console.log(`❌ ${name}: ${error instanceof Error ? error.message : error}`)
  }
}

// ==========================================
// TESTS
// ==========================================

async function testMasterConnection() {
  const { data, error } = await master.from('tenants').select('id, name').limit(1)
  if (error) throw new Error(`Master DB error: ${error.message}`)
  if (!data || data.length === 0) throw new Error('No tenants found in master')
  console.log(`   Found tenant: ${data[0].name}`)
}

async function testTenantConnection() {
  const { data, error } = await tenant.from('agents').select('id, name').limit(1)
  if (error) throw new Error(`Tenant DB error: ${error.message}`)
  console.log(`   Found ${data?.length || 0} agents`)
}

async function testAgentsExist() {
  const { data, error } = await tenant.from('agents').select('id, name, slug, is_active')
  if (error) throw new Error(`Agents query error: ${error.message}`)
  if (!data || data.length === 0) throw new Error('No agents configured')
  
  const activeAgents = data.filter(a => a.is_active)
  console.log(`   ${activeAgents.length} active agents: ${activeAgents.map(a => a.name).join(', ')}`)
}

async function testOdooIntegration() {
  const { data, error } = await tenant
    .from('integrations')
    .select('*')
    .eq('type', 'odoo')
    .single()
  
  if (error || !data) throw new Error('Odoo integration not configured')
  if (!data.is_active) throw new Error('Odoo integration is disabled')
  
  const config = data.config as any
  if (!config) throw new Error('Odoo config is empty')
  console.log(`   Odoo URL: ${config.odoo_url || config.url}`)
  console.log(`   Database: ${config.odoo_db || config.db}`)
}

async function testRAGDocuments() {
  const { data, error } = await tenant.from('documents').select('id, title, source_type')
  if (error) throw new Error(`Documents query error: ${error.message}`)
  
  console.log(`   ${data?.length || 0} documents stored`)
  
  if (!data || data.length === 0) {
    console.log('   ⚠️  No documents for RAG - upload some to /admin/rag')
  }
}

async function testEmbeddingsExist() {
  const { count, error } = await tenant
    .from('embeddings')
    .select('*', { count: 'exact', head: true })
  
  if (error) throw new Error(`Embeddings query error: ${error.message}`)
  console.log(`   ${count || 0} embedding vectors`)
}

async function testMatchDocumentsFunction() {
  // Primero obtener un agente válido
  const { data: agents } = await tenant.from('agents').select('id').limit(1)
  if (!agents || agents.length === 0) {
    throw new Error('No agents to test with')
  }
  
  // Test que la función match_documents existe y funciona
  const { data, error } = await tenant.rpc('match_documents', {
    query_embedding: new Array(768).fill(0.1), // nomic-embed tiene 768 dims
    match_agent_id: agents[0].id,
    match_threshold: 0.5,
    match_count: 1
  })
  
  if (error && !error.message.includes('No results') && !error.message.includes('not find the function')) {
    throw new Error(`match_documents error: ${error.message}`)
  }
  
  if (error && error.message.includes('not find the function')) {
    console.log('   ⚠️  Function not created - run migrations/004_final_fixes.sql')
    throw new Error('Function needs to be created')
  }
  
  console.log(`   Function works, returned ${data?.length || 0} results`)
}

async function testPrometeoTasksTable() {
  const { data, error } = await tenant.from('prometeo_tasks').select('*').limit(5)
  if (error) throw new Error(`prometeo_tasks error: ${error.message}`)
  console.log(`   ${data?.length || 0} tasks configured`)
  
  // Verificar schema
  if (data && data.length > 0) {
    const task = data[0]
    const requiredFields = ['id', 'agent_id', 'prompt', 'schedule', 'is_active', 'next_run']
    const missingFields = requiredFields.filter(f => !(f in task))
    if (missingFields.length > 0) {
      throw new Error(`Missing columns: ${missingFields.join(', ')}`)
    }
  }
}

async function testPushSubscriptionsTable() {
  const { data, error } = await tenant.from('push_subscriptions').select('id').limit(1)
  if (error) throw new Error(`push_subscriptions error: ${error.message}`)
  console.log(`   Table exists, ${data?.length || 0} subscriptions`)
}

async function testPrometeoNewColumns() {
  // Verificar que las columnas nuevas existan
  const { data, error } = await tenant
    .from('prometeo_tasks')
    .select('notification_type, recipients, last_result, created_by')
    .limit(1)
  
  if (error) {
    if (error.message.includes('column') && error.message.includes('does not exist')) {
      throw new Error('New columns not migrated - run SQL migration')
    }
    throw new Error(`Query error: ${error.message}`)
  }
  console.log('   New columns exist (notification_type, recipients, last_result, created_by)')
}

async function testChatSessionsTable() {
  const { count, error } = await tenant
    .from('chat_sessions')
    .select('*', { count: 'exact', head: true })
  
  if (error) throw new Error(`chat_sessions error: ${error.message}`)
  console.log(`   ${count || 0} chat sessions`)
}

async function testMessagesTable() {
  const { count, error } = await tenant
    .from('messages')
    .select('*', { count: 'exact', head: true })
  
  if (error) throw new Error(`messages error: ${error.message}`)
  console.log(`   ${count || 0} messages stored`)
}

// Prueba de Chat API (simulated - no auth)
async function testChatEndpointStructure() {
  // Solo verificamos que el endpoint existe
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000'
  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [] })
    })
    
    // Esperamos 401 sin auth, eso significa que el endpoint existe
    if (response.status === 401) {
      console.log('   Endpoint exists (requires auth)')
    } else {
      console.log(`   Endpoint returned ${response.status}`)
    }
  } catch (e) {
    console.log('   ⚠️  Server not running - start with npm run dev')
  }
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  console.log('\n🧪 TUQUI AGENTS - TEST DE INTEGRACIÓN\n')
  console.log('=' .repeat(50))
  
  // Database Connection
  console.log('\n📦 DATABASE CONNECTION')
  await runTest('Master DB Connection', testMasterConnection)
  await runTest('Tenant DB Connection', testTenantConnection)
  
  // Agents
  console.log('\n🤖 AGENTS')
  await runTest('Agents Exist', testAgentsExist)
  
  // Integrations
  console.log('\n🔌 INTEGRATIONS')
  await runTest('Odoo Integration', testOdooIntegration)
  
  // RAG
  console.log('\n📚 RAG PIPELINE')
  await runTest('RAG Documents', testRAGDocuments)
  await runTest('Embeddings Exist', testEmbeddingsExist)
  await runTest('match_documents Function', testMatchDocumentsFunction)
  
  // Prometeo
  console.log('\n⏰ PROMETEO')
  await runTest('prometeo_tasks Table', testPrometeoTasksTable)
  await runTest('Prometeo New Columns', testPrometeoNewColumns)
  await runTest('push_subscriptions Table', testPushSubscriptionsTable)
  
  // Chat
  console.log('\n💬 CHAT')
  await runTest('chat_sessions Table', testChatSessionsTable)
  await runTest('messages Table', testMessagesTable)
  await runTest('Chat API Endpoint', testChatEndpointStructure)
  
  // Summary
  console.log('\n' + '=' .repeat(50))
  console.log('📊 RESUMEN\n')
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'SKIP').length
  
  console.log(`   ✅ Passed:  ${passed}`)
  console.log(`   ❌ Failed:  ${failed}`)
  console.log(`   ⏭️  Skipped: ${skipped}`)
  console.log(`   📈 Total:   ${results.length}`)
  
  if (failed > 0) {
    console.log('\n❌ FAILURES:')
    results
      .filter(r => r.status === 'FAIL')
      .forEach(r => console.log(`   - ${r.name}: ${r.message}`))
  }
  
  console.log('\n')
  process.exit(failed > 0 ? 1 : 0)
}

main().catch(console.error)
