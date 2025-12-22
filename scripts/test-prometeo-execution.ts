/**
 * Test de Ejecución Real de Prometeo
 * 
 * Prueba el flujo completo de ejecución de una tarea:
 * 1. Crear tarea activa
 * 2. Ejecutar el runner
 * 3. Verificar que la tarea fue procesada
 * 
 * Requiere: Server corriendo (npm run dev) o llamar directamente al runner
 * 
 * Ejecutar: npx tsx scripts/test-prometeo-execution.ts
 */

import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const TENANT_URL = process.env.INITIAL_TENANT_URL!
const TENANT_KEY = process.env.INITIAL_TENANT_SERVICE_KEY!
const TENANT_ID = process.env.INITIAL_TENANT_ID || 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

const tenant = createClient(TENANT_URL, TENANT_KEY)

function log(msg: string) {
  console.log(`   ${msg}`)
}

async function main() {
  console.log('\n🚀 PROMETEO - TEST DE EJECUCIÓN REAL\n')
  console.log('=' .repeat(60))
  
  // 1. Get an active agent
  console.log('\n1️⃣  OBTENIENDO AGENTE')
  const { data: agent } = await tenant
    .from('agents')
    .select('id, name, system_prompt')
    .eq('is_active', true)
    .limit(1)
    .single()
  
  if (!agent) {
    console.log('❌ No active agent found')
    process.exit(1)
  }
  log(`Agent: ${agent.name} (${agent.id})`)
  
  // 2. Create a test task that's due NOW
  console.log('\n2️⃣  CREANDO TAREA DE PRUEBA (ACTIVA)')
  const taskData = {
    name: 'Test Execution - ' + new Date().toISOString(),
    agent_id: agent.id,
    user_email: 'test@execution.com',
    prompt: 'Responde solamente con: "✅ Prometeo execution test successful at ' + new Date().toLocaleTimeString() + '"',
    schedule: '* * * * *', // Every minute
    is_active: true,
    notification_type: 'push',
    recipients: ['test@execution.com'],
    next_run: new Date(Date.now() - 60000).toISOString(), // 1 minute in the past = should run immediately
    created_by: 'test@execution.com'
  }
  
  const { data: task, error: createError } = await tenant
    .from('prometeo_tasks')
    .insert(taskData)
    .select()
    .single()
  
  if (createError) {
    console.log('❌ Error creating task:', createError.message)
    process.exit(1)
  }
  log(`Created task ID: ${task.id}`)
  log(`Next run: ${task.next_run} (should be in the past)`)
  
  // 3. Import and execute the runner directly
  console.log('\n3️⃣  EJECUTANDO RUNNER')
  
  try {
    // Dynamic import the runner
    const { runPendingTasks, executePrometeoTask } = await import('../lib/prometeo/runner')
    
    // Get the full task with agent
    const { data: fullTask } = await tenant
      .from('prometeo_tasks')
      .select('*')
      .eq('id', task.id)
      .single()
    
    log('Calling executePrometeoTask...')
    const result = await executePrometeoTask(TENANT_ID, fullTask)
    
    log(`Result: ${JSON.stringify(result)}`)
    
    if (result.success) {
      console.log('\n✅ TAREA EJECUTADA EXITOSAMENTE!')
      log(`Message: ${result.message}`)
    } else {
      console.log('\n⚠️  Tarea ejecutada con error:')
      log(`Error: ${result.message}`)
    }
    
  } catch (e) {
    console.log('\n❌ Error ejecutando runner:', e instanceof Error ? e.message : e)
    // This might happen if there are missing dependencies in the runner
    // Let's still check what happened
  }
  
  // 4. Check task state after execution
  console.log('\n4️⃣  VERIFICANDO ESTADO POST-EJECUCIÓN')
  const { data: updatedTask } = await tenant
    .from('prometeo_tasks')
    .select('*')
    .eq('id', task.id)
    .single()
  
  if (updatedTask) {
    log(`last_run: ${updatedTask.last_run || 'null'}`)
    log(`next_run: ${updatedTask.next_run}`)
    log(`last_result: ${updatedTask.last_result || 'null'}`)
    log(`is_active: ${updatedTask.is_active}`)
    
    if (updatedTask.last_result === 'success') {
      console.log('\n🎉 PROMETEO FUNCIONANDO CORRECTAMENTE!')
    } else if (updatedTask.last_result === 'error') {
      console.log('\n⚠️  La tarea se ejecutó pero hubo un error')
    } else {
      console.log('\n⏳ La tarea no fue procesada aún')
    }
  }
  
  // 5. Cleanup
  console.log('\n5️⃣  LIMPIEZA')
  await tenant.from('prometeo_tasks').delete().eq('id', task.id)
  log('Test task deleted')
  
  console.log('\n' + '=' .repeat(60))
  console.log('Done.\n')
}

main().catch(console.error)
