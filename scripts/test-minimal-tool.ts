import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, tool } from 'ai'
import { z } from 'zod'

// Minimal tool - only required string params
const minimalTool = tool({
    description: 'Buscar en Odoo',
    parameters: z.object({
        model: z.string(),
        query: z.string()
    }),
    execute: async ({ model, query }) => {
        console.log('Tool executed:', { model, query })
        return { success: true, model, query }
    }
})

async function test() {
    console.log('Testing minimal tool with gemini-2.5-flash...')
    try {
        const { text, toolCalls, toolResults, steps } = await generateText({
            model: google('gemini-2.5-flash'),
            tools: { odoo: minimalTool },
            prompt: 'Busca las ventas de abril usando el modelo sale.order',
            maxSteps: 3
        })
        console.log('Text:', text)
        console.log('Steps:', steps?.length)
        console.log('Tool calls:', toolCalls?.length)
        if (toolCalls?.length) {
            console.log('First tool call:', toolCalls[0])
        }
        console.log('✅ Success!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
