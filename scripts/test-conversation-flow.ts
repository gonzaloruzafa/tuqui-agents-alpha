// Test de conversación con historial
import 'dotenv-flow/config'
import { Content } from '@google/generative-ai'
import { streamChatWithOdoo } from '../lib/tools/gemini-odoo-v2'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function testConversation() {
  // Primera pregunta
  console.log('\n=== PREGUNTA 1: top 5 clientes por ventas ===')
  let response1 = ''
  const history1: Content[] = []
  
  for await (const chunk of streamChatWithOdoo(TENANT_ID, '', 'dame el top 5 clientes por ventas', history1)) {
    response1 += chunk
    process.stdout.write(chunk)
  }
  
  // Construir historial
  const history2: Content[] = [
    { role: 'user', parts: [{ text: 'dame el top 5 clientes por ventas' }] },
    { role: 'model', parts: [{ text: response1 }] }
  ]
  
  // Segunda pregunta con contexto
  console.log('\n\n=== PREGUNTA 2: el segundo? ===')
  let response2 = ''
  for await (const chunk of streamChatWithOdoo(TENANT_ID, '', 'el segundo?', history2)) {
    response2 += chunk
    process.stdout.write(chunk)
  }
  
  // Tercera pregunta
  const history3: Content[] = [
    ...history2,
    { role: 'user', parts: [{ text: 'el segundo?' }] },
    { role: 'model', parts: [{ text: response2 }] }
  ]
  
  console.log('\n\n=== PREGUNTA 3: desglosame por trimestre ===')
  for await (const chunk of streamChatWithOdoo(TENANT_ID, '', 'desglosame por trimestre', history3)) {
    process.stdout.write(chunk)
  }
  
  console.log('\n\nTest completado!')
}

testConversation().catch(console.error)
