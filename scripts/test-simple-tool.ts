import { config } from 'dotenv'
config({ path: '.env.local' })

import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { streamText, tool } from 'ai'
import { z } from 'zod'

const google = createGoogleGenerativeAI({
    apiKey: process.env.GEMINI_API_KEY
})

// Test tool with simple parameters
const simpleTools = {
    test_tool: tool({
        description: 'Una herramienta de prueba',
        parameters: z.object({
            query: z.string().describe('Texto a buscar'),
            limit: z.number().optional().describe('Límite de resultados')
        }),
        execute: async ({ query, limit }) => {
            return { query, limit, result: 'OK' }
        }
    })
}

async function test() {
    console.log('Testing simple tool...')
    try {
        const result = streamText({
            model: google('gemini-2.0-flash'),
            messages: [{ role: 'user', content: 'Busca algo' }],
            tools: simpleTools,
            maxSteps: 1
        })
        
        for await (const chunk of (result as any).textStream) {
            process.stdout.write(chunk)
        }
        console.log('\n✅ Simple tool works!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
