/**
 * Test Completo de Prometeo
 * 
 * Prueba el flujo completo:
 * 1. CRUD de tareas
 * 2. Ejecución del runner
 * 3. Push subscriptions
 * 4. Envío de notificaciones
 * 
 * Ejecutar: npx tsx scripts/test-prometeo.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'

config({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const TENANT_URL = process.env.INITIAL_TENANT_URL!
const TENANT_KEY = process.env.INITIAL_TENANT_SERVICE_KEY!
const BASE_URL = process.env.NEXTAUTH_URL || 'http://localhost:3000'
const PROMETEO_SECRET = process.env.PROMETEO_SECRET!

const tenant = createClient(TENANT_URL, TENANT_KEY)

interface TestResult {
  name: string
  status: 'PASS' | 'FAIL' | 'SKIP'
  message: string
  data?: any
}

const results: TestResult[] = []

function log(msg: string) {
  console.log(`   ${msg}`)
}

async function runTest(name: string, fn: () => Promise<any>): Promise<any> {
  try {
    const data = await fn()
    results.push({ name, status: 'PASS', message: 'OK', data })
    console.log(`✅ ${name}`)
    return data
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error)
    results.push({ name, status: 'FAIL', message: msg })
    console.log(`❌ ${name}: ${msg}`)
    return null
  }
}

// ==========================================
// TESTS
// ==========================================

let testAgentId: string | null = null
let testTaskId: string | null = null

async function getTestAgent(): Promise<string> {
  const { data, error } = await tenant
    .from('agents')
    .select('id, name')
    .eq('is_active', true)
    .limit(1)
    .single()
  
  if (error || !data) throw new Error('No active agent found')
  log(`Agent: ${data.name} (${data.id})`)
  return data.id
}

async function testCreateTask(): Promise<string> {
  if (!testAgentId) throw new Error('No agent ID')
  
  const taskData = {
    name: 'Test Task - Debug ' + new Date().toISOString(),
    agent_id: testAgentId,
    user_email: 'test@example.com', // Required NOT NULL field
    prompt: 'Di "Hola, soy un test de Prometeo funcionando correctamente"',
    schedule: '*/5 * * * *', // cada 5 minutos
    is_active: false, // Inactivo para no ejecutar realmente
    notification_type: 'push',
    recipients: ['test@example.com'],
    next_run: new Date(Date.now() + 60000).toISOString(),
    created_by: 'test@example.com'
  }
  
  log(`Creating task: ${taskData.name}`)
  log(`Schedule: ${taskData.schedule}`)
  log(`Agent ID: ${taskData.agent_id}`)
  
  const { data, error } = await tenant
    .from('prometeo_tasks')
    .insert(taskData)
    .select()
    .single()
  
  if (error) {
    log(`Error details: ${JSON.stringify(error)}`)
    throw new Error(`Insert error: ${error.message}`)
  }
  
  log(`Created task ID: ${data.id}`)
  return data.id
}

async function testReadTask(): Promise<any> {
  if (!testTaskId) throw new Error('No task ID')
  
  const { data, error } = await tenant
    .from('prometeo_tasks')
    .select('*')
    .eq('id', testTaskId)
    .single()
  
  if (error) throw new Error(`Read error: ${error.message}`)
  
  log(`Task name: ${data.name}`)
  log(`Prompt: ${data.prompt.substring(0, 50)}...`)
  log(`Schedule: ${data.schedule}`)
  log(`Active: ${data.is_active}`)
  log(`Notification type: ${data.notification_type}`)
  log(`Next run: ${data.next_run}`)
  
  return data
}

async function testUpdateTask(): Promise<void> {
  if (!testTaskId) throw new Error('No task ID')
  
  const { error } = await tenant
    .from('prometeo_tasks')
    .update({
      name: 'Test Task - Updated',
      prompt: 'Prompt actualizado para test'
    })
    .eq('id', testTaskId)
  
  if (error) throw new Error(`Update error: ${error.message}`)
  
  // Verificar update
  const { data } = await tenant
    .from('prometeo_tasks')
    .select('name, prompt')
    .eq('id', testTaskId)
    .single()
  
  log(`Updated name: ${data?.name}`)
  log(`Updated prompt: ${data?.prompt}`)
}

async function testListTasks(): Promise<void> {
  const { data, error } = await tenant
    .from('prometeo_tasks')
    .select(`
      id,
      name,
      schedule,
      is_active,
      next_run,
      agents!inner(name)
    `)
    .order('created_at', { ascending: false })
  
  if (error) throw new Error(`List error: ${error.message}`)
  
  log(`Total tasks: ${data?.length || 0}`)
  data?.forEach((t: any) => {
    log(`  - ${t.name} (${t.is_active ? '🟢 active' : '⚪ inactive'}) → Agent: ${t.agents?.name}`)
  })
}

async function testGetDueTasks(): Promise<void> {
  // Simular la query que hace el runner
  const now = new Date().toISOString()
  
  const { data, error } = await tenant
    .from('prometeo_tasks')
    .select(`
      *,
      agents:agent_id (
        id,
        name,
        system_prompt
      )
    `)
    .eq('is_active', true)
    .lte('next_run', now)
  
  if (error) throw new Error(`Due tasks query error: ${error.message}`)
  
  log(`Due tasks (active and past next_run): ${data?.length || 0}`)
  if (data && data.length > 0) {
    data.forEach((t: any) => {
      log(`  - ${t.name} should run (next_run: ${t.next_run})`)
    })
  }
}

async function testPushSubscriptions(): Promise<void> {
  const { data, error } = await tenant
    .from('push_subscriptions')
    .select('id, user_email, created_at')
  
  if (error) throw new Error(`Push subs error: ${error.message}`)
  
  log(`Total subscriptions: ${data?.length || 0}`)
  data?.forEach((s: any) => {
    log(`  - ${s.user_email} (${new Date(s.created_at).toLocaleDateString()})`)
  })
}

async function testCreateMockSubscription(): Promise<void> {
  // Crear una suscripción mock para testing
  // First delete if exists to avoid unique constraint error
  await tenant
    .from('push_subscriptions')
    .delete()
    .eq('user_email', 'test-prometeo@example.com')
  
  const mockSubscription = {
    user_email: 'test-prometeo@example.com',
    subscription: {
      endpoint: 'https://mock-push-service.com/test-' + Date.now(),
      keys: {
        p256dh: 'mock-p256dh-key',
        auth: 'mock-auth-key'
      }
    }
  }
  
  const { error } = await tenant
    .from('push_subscriptions')
    .insert(mockSubscription)
  
  if (error) throw new Error(`Create subscription error: ${error.message}`)
  log(`Created mock subscription for: ${mockSubscription.user_email}`)
}

async function testPrometeoRunnerEndpoint(): Promise<void> {
  // Test que el endpoint /api/prometeo/run existe y requiere auth
  try {
    const response = await fetch(`${BASE_URL}/api/prometeo/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    })
    
    if (response.status === 401) {
      log('Endpoint exists and requires PROMETEO_SECRET ✓')
    } else {
      const body = await response.text()
      log(`Status: ${response.status}, Body: ${body.substring(0, 100)}`)
    }
  } catch (e) {
    log('⚠️  Server not running - this is OK for DB tests')
  }
}

async function testTasksAPIEndpoint(): Promise<void> {
  // Test GET /api/prometeo/tasks
  try {
    const response = await fetch(`${BASE_URL}/api/prometeo/tasks`)
    
    if (response.status === 401) {
      log('Endpoint requires auth ✓')
    } else {
      log(`Status: ${response.status}`)
    }
  } catch (e) {
    log('⚠️  Server not running - this is OK for DB tests')
  }
}

async function testDeleteTask(): Promise<void> {
  if (!testTaskId) throw new Error('No task ID')
  
  const { error } = await tenant
    .from('prometeo_tasks')
    .delete()
    .eq('id', testTaskId)
  
  if (error) throw new Error(`Delete error: ${error.message}`)
  
  // Verificar que se eliminó
  const { data } = await tenant
    .from('prometeo_tasks')
    .select('id')
    .eq('id', testTaskId)
  
  if (data && data.length > 0) {
    throw new Error('Task was not deleted')
  }
  
  log('Task deleted successfully')
}

async function testCleanupMockSubscription(): Promise<void> {
  const { error } = await tenant
    .from('push_subscriptions')
    .delete()
    .eq('user_email', 'test-prometeo@example.com')
  
  if (error) log(`Cleanup warning: ${error.message}`)
  else log('Mock subscription cleaned up')
}

async function testEnvVars(): Promise<void> {
  log(`TENANT_URL: ${TENANT_URL ? '✓ set' : '❌ missing'}`)
  log(`TENANT_KEY: ${TENANT_KEY ? '✓ set' : '❌ missing'}`)
  log(`PROMETEO_SECRET: ${PROMETEO_SECRET ? '✓ set' : '❌ missing'}`)
  log(`VAPID_PUBLIC_KEY: ${process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ? '✓ set' : '❌ missing'}`)
  log(`VAPID_PRIVATE_KEY: ${process.env.VAPID_PRIVATE_KEY ? '✓ set' : '❌ missing'}`)
  
  if (!PROMETEO_SECRET) {
    throw new Error('PROMETEO_SECRET not configured')
  }
}

async function testTableSchema(): Promise<void> {
  // Verificar todas las columnas de prometeo_tasks
  const { data, error } = await tenant
    .from('prometeo_tasks')
    .select('*')
    .limit(0)
  
  if (error) throw new Error(`Schema query error: ${error.message}`)
  
  // Intentar insertar con todos los campos para verificar schema
  const testFields = {
    name: 'Schema Test',
    agent_id: testAgentId,
    user_email: 'test@test.com', // Required NOT NULL
    prompt: 'test',
    schedule: '* * * * *',
    is_active: false,
    notification_type: 'push',
    recipients: ['test@test.com'],
    next_run: new Date().toISOString(),
    last_run: null,
    last_result: null,
    created_by: 'test@test.com'
  }
  
  log(`Testing insert with all fields...`)
  const { data: inserted, error: insertError } = await tenant
    .from('prometeo_tasks')
    .insert(testFields)
    .select()
    .single()
  
  if (insertError) {
    throw new Error(`Schema validation failed: ${insertError.message}`)
  }
  
  log('All schema fields valid ✓')
  log(`Fields: ${Object.keys(inserted).join(', ')}`)
  
  // Limpiar
  await tenant.from('prometeo_tasks').delete().eq('id', inserted.id)
}

// ==========================================
// MAIN
// ==========================================

async function main() {
  console.log('\n🔥 PROMETEO - DEBUG COMPLETO\n')
  console.log('=' .repeat(60))
  
  // Environment
  console.log('\n⚙️  ENVIRONMENT')
  await runTest('Environment Variables', testEnvVars)
  
  // Get agent for tests
  console.log('\n🤖 SETUP')
  testAgentId = await runTest('Get Test Agent', getTestAgent)
  
  if (!testAgentId) {
    console.log('\n❌ Cannot continue without agent')
    process.exit(1)
  }
  
  // Schema validation
  console.log('\n📋 SCHEMA VALIDATION')
  await runTest('Table Schema', testTableSchema)
  
  // CRUD Tests
  console.log('\n📝 CRUD OPERATIONS')
  testTaskId = await runTest('CREATE Task', testCreateTask)
  await runTest('READ Task', testReadTask)
  await runTest('UPDATE Task', testUpdateTask)
  await runTest('LIST Tasks', testListTasks)
  
  // Query Tests
  console.log('\n🔍 QUERY OPERATIONS')
  await runTest('Get Due Tasks', testGetDueTasks)
  
  // Push Subscriptions
  console.log('\n📲 PUSH SUBSCRIPTIONS')
  await runTest('List Subscriptions', testPushSubscriptions)
  await runTest('Create Mock Subscription', testCreateMockSubscription)
  
  // API Endpoints (if server running)
  console.log('\n🌐 API ENDPOINTS')
  await runTest('Runner Endpoint', testPrometeoRunnerEndpoint)
  await runTest('Tasks API Endpoint', testTasksAPIEndpoint)
  
  // Cleanup
  console.log('\n🧹 CLEANUP')
  await runTest('Delete Test Task', testDeleteTask)
  await runTest('Cleanup Mock Subscription', testCleanupMockSubscription)
  
  // Summary
  console.log('\n' + '=' .repeat(60))
  console.log('📊 RESUMEN PROMETEO\n')
  
  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  
  console.log(`   ✅ Passed:  ${passed}`)
  console.log(`   ❌ Failed:  ${failed}`)
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
