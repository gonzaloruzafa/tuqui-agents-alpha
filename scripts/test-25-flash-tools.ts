import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const testTool = tool({
    description: 'Buscar datos',
    parameters: z.object({
        query: z.string().describe('Texto a buscar')
    }),
    execute: async ({ query }) => {
        console.log('Tool called with:', query)
        return { result: 'Datos encontrados para: ' + query }
    }
})

async function test() {
    console.log('Testing gemini-2.5-flash with tools...')
    try {
        const { text, toolCalls, toolResults } = await generateText({
            model: google('gemini-2.5-flash'),
            tools: { buscar: testTool },
            prompt: 'Busca ventas de abril',
            maxSteps: 3
        })
        console.log('Text:', text)
        console.log('Tool calls:', toolCalls?.length)
        console.log('Tool results:', toolResults?.length)
        console.log('✅ gemini-2.5-flash works with tools!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
