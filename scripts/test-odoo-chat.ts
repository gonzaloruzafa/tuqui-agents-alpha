// Test Odoo Chat Flow
// Run: npx tsx scripts/test-odoo-chat.ts

import { config } from 'dotenv'
config({ path: '.env.local' })
import { getAgentBySlug } from '../lib/agents/service'
import { getToolsForAgent } from '../lib/tools/executor'
import { getOdooClient } from '../lib/tools/odoo/client'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText } from 'ai'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function main() {
    console.log('=== Testing Odoo Chat Flow ===\n')

    // 1. Test Get Agent
    console.log('1. Getting agent...')
    try {
        const agent = await getAgentBySlug(TENANT_ID, 'tuqui-odoo')
        console.log('   ✅ Agent found:', agent?.name)
        console.log('   Tools:', agent?.tools)
    } catch (e: any) {
        console.log('   ❌ Agent error:', e.message)
        return
    }

    // 2. Test Odoo Client
    console.log('\n2. Testing Odoo client...')
    try {
        const odoo = await getOdooClient(TENANT_ID)
        console.log('   ✅ Odoo client created')
        
        // Try to authenticate
        console.log('   Authenticating...')
        const uid = await odoo.authenticate()
        console.log('   ✅ Authenticated! UID:', uid)
    } catch (e: any) {
        console.log('   ❌ Odoo error:', e.message)
        console.log('   Stack:', e.stack?.split('\n').slice(0, 3).join('\n'))
    }

    // 3. Test Tools Loading
    console.log('\n3. Testing tools loading...')
    try {
        const agent = await getAgentBySlug(TENANT_ID, 'tuqui-odoo')
        const tools = await getToolsForAgent(TENANT_ID, agent?.tools || [])
        console.log('   ✅ Tools loaded:', Object.keys(tools))
        
        // Check if odoo_search exists
        if (tools.odoo_search) {
            console.log('   odoo_search description:', tools.odoo_search.description)
        }
    } catch (e: any) {
        console.log('   ❌ Tools error:', e.message)
    }

    // 4. Test streamText with tools
    console.log('\n4. Testing streamText with Odoo tools...')
    try {
        const agent = await getAgentBySlug(TENANT_ID, 'tuqui-odoo')
        const tools = await getToolsForAgent(TENANT_ID, agent?.tools || [])
        
        const google = createGoogleGenerativeAI({
            apiKey: process.env.GEMINI_API_KEY
        })

        const messages = [{ role: 'user' as const, content: 'dame ventas de abril' }]
        
        console.log('   Calling streamText...')
        const result = streamText({
            model: google('gemini-2.5-flash'),
            system: agent?.system_prompt || 'Sos un asistente de Odoo',
            messages,
            tools,
            maxSteps: 5,
            onStepFinish: (step) => {
                console.log('   Step:', step.stepType, step.usage)
            }
        })

        console.log('   Result type:', typeof result)
        console.log('   Result keys:', Object.keys(result))

        // Try to get the response
        console.log('   Checking response methods...')
        console.log('   - toDataStreamResponse:', typeof (result as any).toDataStreamResponse)
        console.log('   - toTextStreamResponse:', typeof (result as any).toTextStreamResponse)

        // Consume the stream
        console.log('\n   Reading text stream...')
        let fullText = ''
        const textStream = (result as any).textStream
        if (textStream) {
            for await (const chunk of textStream) {
                process.stdout.write(chunk)
                fullText += chunk
            }
        }
        console.log('\n   ✅ Full text received, length:', fullText.length)
        
    } catch (e: any) {
        console.log('   ❌ streamText error:', e.message)
        console.log('   Stack:', e.stack)
    }

    console.log('\n=== Test Complete ===')
}

main().catch(console.error)
