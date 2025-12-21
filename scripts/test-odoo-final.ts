import { config } from 'dotenv'
config({ path: '.env.local' })

import { streamChatWithOdoo } from '../lib/tools/gemini-odoo'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function test() {
    console.log('Testing Odoo chat with native Gemini...')
    
    const systemPrompt = `Eres Tuqui Odoo, un asistente especializado en consultas de Odoo ERP.

INSTRUCCIONES:
- Usa las herramientas odoo_search y odoo_summary para consultar datos
- Responde en español
- Sé conciso y útil
- Si no hay datos, indícalo claramente`
    
    try {
        console.log('\n--- Streaming response ---\n')
        const stream = streamChatWithOdoo(
            TENANT_ID,
            systemPrompt,
            'Dame las ventas de abril'
        )
        
        for await (const chunk of stream) {
            process.stdout.write(chunk)
        }
        
        console.log('\n\n--- Test complete ---')
    } catch (e: any) {
        console.error('Error:', e.message)
        console.error('Stack:', e.stack)
    }
}

test()
