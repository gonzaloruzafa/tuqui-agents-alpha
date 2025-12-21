import { config } from 'dotenv'
config({ path: '.env.local' })

import { GoogleGenerativeAI } from '@google/generative-ai'

async function test() {
    console.log('Testing native Google SDK with function calling...')
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{
            functionDeclarations: [{
                name: 'odoo_search',
                description: 'Buscar en Odoo ERP',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        model: {
                            type: 'STRING',
                            description: 'Modelo: sale.order, res.partner'
                        },
                        query: {
                            type: 'STRING',
                            description: 'Qué buscar'
                        }
                    },
                    required: ['model', 'query']
                }
            }]
        }]
    })

    try {
        const chat = model.startChat()
        const result = await chat.sendMessage('Dame las ventas de abril')
        
        const response = result.response
        console.log('Response text:', response.text())
        
        const functionCalls = response.functionCalls()
        console.log('Function calls:', JSON.stringify(functionCalls, null, 2))
        
        console.log('✅ Success!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
    }
}

test()
