import { config } from 'dotenv'
config({ path: '.env.local' })

import { GoogleGenerativeAI } from '@google/generative-ai'

async function test() {
    console.log('Testing native Google SDK with forced function calling...')
    
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{
            functionDeclarations: [{
                name: 'odoo_search',
                description: 'Buscar datos en Odoo ERP. USAR SIEMPRE para consultas de datos.',
                parameters: {
                    type: 'OBJECT',
                    properties: {
                        model: {
                            type: 'STRING',
                            description: 'Modelo de Odoo: sale.order para ventas, res.partner para contactos'
                        },
                        filters: {
                            type: 'STRING',
                            description: 'Filtros de búsqueda: abril, mayo, cliente X'
                        }
                    },
                    required: ['model', 'filters']
                }
            }]
        }],
        toolConfig: {
            functionCallingConfig: {
                mode: 'ANY',
                allowedFunctionNames: ['odoo_search']
            }
        }
    })

    try {
        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [{ text: 'Dame las ventas de abril' }] }],
            systemInstruction: 'Eres un asistente de Odoo. SIEMPRE usa odoo_search para consultar datos.'
        })
        
        const response = result.response
        
        // Check for function call first
        const candidate = response.candidates?.[0]
        if (candidate?.content?.parts) {
            for (const part of candidate.content.parts) {
                if ('functionCall' in part) {
                    console.log('Function call found!')
                    console.log('Name:', part.functionCall.name)
                    console.log('Args:', JSON.stringify(part.functionCall.args, null, 2))
                }
            }
        }
        
        console.log('Text:', response.text())
        console.log('✅ Success!')
    } catch (e: any) {
        console.log('❌ Error:', e.message)
        console.log('Stack:', e.stack?.split('\n').slice(0, 5).join('\n'))
    }
}

test()
