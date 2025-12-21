import { config } from 'dotenv'
config({ path: '.env.local' })

import { google } from '@ai-sdk/google'
import { generateText, jsonSchema, tool } from 'ai'

async function test() {
    console.log('Testing with JSON Schema...')
    try {
        const testTool = tool({
            description: 'Buscar en Odoo',
            parameters: jsonSchema({
                type: 'object',
                properties: {
                    model: {
                        type: 'string',
                        description: 'Modelo de Odoo: sale.order, res.partner, product.template, account.move',
                        enum: ['sale.order', 'res.partner', 'product.template', 'account.move']
                    },
                    filters: {
                        type: 'string',
                        description: 'Filtros en lenguaje natural'
                    },
                    limit: {
                        type: 'number',
                        description: 'Cantidad máxima de resultados'
                    }
                },
                required: ['model']
            }),
            execute: async ({ model, filters, limit }: any) => {
                console.log('Tool called with:', { model, filters, limit })
                return { success: true, model, filters, limit }
            }
        })
        
        const { text, toolCalls, toolResults } = await generateText({
            model: google('gemini-2.0-flash'),
            tools: {
                odoo_search: testTool
            },
            prompt: 'Dame las ventas de abril',
            maxSteps: 3
        })
        
        console.log('Text:', text)
        console.log('Tool calls:', JSON.stringify(toolCalls, null, 2))
        console.log('Tool results:', JSON.stringify(toolResults, null, 2))
        console.log('\n✅ JSON Schema tool works!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
        console.log('Data:', e.data)
    }
}

test()
