import { config } from 'dotenv'
config({ path: '.env.local' })

import { streamChatWithOdoo } from '../lib/tools/gemini-odoo'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function test() {
    const systemPrompt = `Eres Tuqui Odoo, un asistente de consultas ERP.`
    
    console.log('Test 1: Listar ventas\n')
    for await (const chunk of streamChatWithOdoo(TENANT_ID, systemPrompt, 'Listame las últimas 5 ventas')) {
        process.stdout.write(chunk)
    }
    
    console.log('\n\nTest 2: Clientes\n')
    for await (const chunk of streamChatWithOdoo(TENANT_ID, systemPrompt, 'Cuántos clientes tengo?')) {
        process.stdout.write(chunk)
    }
    
    console.log('\n\nTest 3: Productos\n')
    for await (const chunk of streamChatWithOdoo(TENANT_ID, systemPrompt, 'Dame los productos disponibles')) {
        process.stdout.write(chunk)
    }
}

test()
