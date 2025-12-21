import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const testTool = tool({
    description: 'Buscar datos',
    parameters: z.object({
        model: z.string().describe('Modelo'),
        query: z.string().describe('Búsqueda')
    }),
    execute: async ({ model, query }) => {
        console.log('Tool executed:', { model, query })
        return { success: true, data: [{ id: 1, name: 'Test' }] }
    }
})

async function test() {
    console.log('Testing gemini-2.0-flash-lite with tools...')
    try {
        const { text, toolCalls, toolResults, steps } = await generateText({
            model: google('gemini-2.0-flash-lite'),
            system: 'Eres un asistente. Usa la herramienta para cualquier consulta.',
            tools: { search: testTool },
            prompt: 'Busca ventas de abril',
            maxSteps: 3,
            toolChoice: 'required'
        })
        console.log('Text:', text)
        console.log('Steps:', steps?.length)
        console.log('Tool calls:', toolCalls?.length)
        if (toolCalls?.length) {
            console.log('First tool call input:', toolCalls[0].input)
        }
        console.log('✅ Success!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
