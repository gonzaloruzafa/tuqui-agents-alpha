import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, tool } from 'ai'
import { z } from 'zod'

// Minimal tool - only required string params
const minimalTool = tool({
    description: 'Buscar datos en la base de datos Odoo. SIEMPRE usar esta herramienta para consultas de datos.',
    parameters: z.object({
        model: z.string().describe('Modelo: sale.order, res.partner, product.template'),
        query: z.string().describe('Descripción de lo que se busca')
    }),
    execute: async ({ model, query }) => {
        console.log('Tool executed:', { model, query })
        return { 
            success: true, 
            data: [
                { id: 1, name: 'SO001', amount: 1500 },
                { id: 2, name: 'SO002', amount: 2300 }
            ]
        }
    }
})

async function test() {
    console.log('Testing minimal tool with gemini-2.5-flash + system prompt...')
    try {
        const { text, toolCalls, toolResults, steps } = await generateText({
            model: google('gemini-2.5-flash'),
            system: 'Eres un asistente de Odoo. SIEMPRE usa la herramienta odoo para cualquier consulta de datos. Nunca inventes datos.',
            tools: { odoo: minimalTool },
            prompt: 'Dame las ventas de abril',
            maxSteps: 3,
            toolChoice: 'required'
        })
        console.log('Text:', text)
        console.log('Steps:', steps?.length)
        console.log('Tool calls:', toolCalls?.length)
        if (toolCalls?.length) {
            console.log('First tool call:', JSON.stringify(toolCalls[0], null, 2))
        }
        console.log('Tool results:', toolResults?.length)
        console.log('✅ Success!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
