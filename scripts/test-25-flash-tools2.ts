import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, tool } from 'ai'
import { z } from 'zod'

const testTool = tool({
    description: 'Buscar datos en la base de datos. SIEMPRE usar esta herramienta para cualquier consulta.',
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
        const { text, toolCalls, toolResults, steps } = await generateText({
            model: google('gemini-2.5-flash'),
            system: 'Eres un asistente que SIEMPRE usa la herramienta buscar para cualquier consulta. Nunca respondas sin usar la herramienta primero.',
            tools: { buscar: testTool },
            prompt: 'Dame información sobre las ventas de abril',
            maxSteps: 3,
            toolChoice: 'required'
        })
        console.log('Text:', text)
        console.log('Steps:', steps?.length)
        console.log('Tool calls:', toolCalls?.length)
        console.log('Tool results:', toolResults?.length)
        console.log('✅ Success!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
        console.log('Data:', e.data)
    }
}

test()
