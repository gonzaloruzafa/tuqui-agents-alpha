import { config } from 'dotenv'
config({ path: '.env.local' })

import { handleOdooChat, getOdooTools } from '../lib/tools/odoo/wrapper'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function main() {
    console.log('=== Testing Odoo Wrapper ===\n')
    
    // 1. Test tools loading
    console.log('1. Loading tools...')
    try {
        const tools = await getOdooTools(TENANT_ID)
        console.log('   Tools:', Object.keys(tools))
    } catch (e: any) {
        console.log('   Error:', e.message)
    }
    
    // 2. Test chat
    console.log('\n2. Testing chat with "dame ventas de abril"...')
    try {
        const messages = [{ role: 'user' as const, content: 'dame ventas de abril' }]
        const systemPrompt = 'Sos un asistente de Odoo que ayuda a consultar datos.'
        
        const response = await handleOdooChat(TENANT_ID, messages, systemPrompt)
        
        console.log('   Response type:', typeof response)
        console.log('   Response is Response:', response instanceof Response)
        
        if (response.body) {
            const reader = response.body.getReader()
            const decoder = new TextDecoder()
            let text = ''
            
            console.log('\n   Stream output:')
            while (true) {
                const { done, value } = await reader.read()
                if (done) break
                const chunk = decoder.decode(value)
                text += chunk
                process.stdout.write(chunk)
            }
            console.log('\n\n   Total length:', text.length)
        }
    } catch (e: any) {
        console.log('   Error:', e.message)
        console.log('   Stack:', e.stack?.split('\n').slice(0, 5).join('\n'))
    }
    
    console.log('\n=== Test Complete ===')
}

main()
