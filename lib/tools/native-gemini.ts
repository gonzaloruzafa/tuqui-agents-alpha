import { GoogleGenerativeAI, Content, FunctionDeclaration, SchemaType } from '@google/generative-ai'

/**
 * Generic Native Gemini Text Generation with Tool Support
 * Fixes "parameters schema should be of type OBJECT" error in AI SDK
 */
export async function generateTextNative({
    model: modelName = 'gemini-3-flash',
    system,
    messages,
    tools,
    maxSteps = 5
}: {
    model?: string
    system: string
    messages: any[]
    tools?: Record<string, any>
    maxSteps?: number
}) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

    // Convert AI SDK tools to Gemini FunctionDeclarations
    const functionDeclarations: FunctionDeclaration[] = []

    if (tools) {
        for (const [name, tool] of Object.entries(tools)) {
            // Manual conversion for each tool type
            // Aliases: tavily -> web_search, firecrawl -> web_investigator
            if (name === 'web_search' || name === 'tavily') {
                functionDeclarations.push({
                    name,
                    description: tool.description || 'Buscar información en internet',
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            query: { type: SchemaType.STRING, description: 'Términos de búsqueda' }
                        },
                        required: ['query']
                    }
                })
            } else if (name === 'web_investigator' || name === 'firecrawl') {
                functionDeclarations.push({
                    name: 'web_investigator', // Standardize name
                    description: tool.description || 'Extraer contenido de una página web',
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            url: { type: SchemaType.STRING, description: 'URL completa a investigar (incluir https://)' }
                        },
                        required: ['url']
                    }
                })
            } else if (name === 'ecommerce_search') {
                functionDeclarations.push({
                    name: 'ecommerce_search',
                    description: tool.description || 'Buscar productos y precios en MercadoLibre',
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            query: { type: SchemaType.STRING, description: 'Producto a buscar (ej: sillón odontológico)' }
                        },
                        required: ['query']
                    }
                })
            } else if (name === 'web_scraper') {
                functionDeclarations.push({
                    name: 'web_scraper',
                    description: tool.description || 'Extraer contenido de una página web',
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            url: { type: SchemaType.STRING, description: 'URL de la página a scrapear' }
                        },
                        required: ['url']
                    }
                })
            } else {
                // Heuristic conversion for other tools
                console.warn(`[NativeGemini] Tool ${name} using heuristic conversion`)
                functionDeclarations.push({
                    name,
                    description: tool.description,
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {}, // Fallback to empty object if not specified
                        required: []
                    }
                })
            }
        }
    }

    const model = genAI.getGenerativeModel({
        model: modelName,
        tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : [],
    })

    // Prepare history and system instruction
    const history: Content[] = messages.slice(0, -1).map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }))

    const lastMessage = messages[messages.length - 1].content

    const chat = model.startChat({
        history,
        systemInstruction: {
            role: 'system',
            parts: [{ text: system }]
        }
    })

    let result = await chat.sendMessage(lastMessage)
    let response = result.response
    let totalTokens = response.usageMetadata?.totalTokenCount || 0

    // Manual Tool Loop (maxSteps)
    for (let i = 0; i < maxSteps; i++) {
        const parts = response.candidates?.[0]?.content?.parts || []
        
        // Find ALL function calls in this response (Gemini may call multiple tools at once)
        const functionCalls = parts.filter(p => 'functionCall' in p) as any[]

        if (functionCalls.length === 0) break

        // Execute ALL function calls and collect responses
        const functionResponses: any[] = []
        
        for (const call of functionCalls) {
            const { name, args } = call.functionCall
            console.log(`[NativeGemini] Executing ${name} with args:`, args)

            const tool = tools?.[name]
            let toolResult: any
            
            if (!tool || !tool.execute) {
                console.warn(`[NativeGemini] Tool ${name} not found, returning error to model`)
                toolResult = { error: `Tool ${name} no está disponible. Usa web_search o web_investigator.` }
            } else {
                try {
                    toolResult = await tool.execute(args)
                } catch (execError: any) {
                    console.error(`[NativeGemini] Tool ${name} execution error:`, execError)
                    toolResult = { error: execError.message || 'Tool execution failed' }
                }
            }

            functionResponses.push({
                functionResponse: {
                    name,
                    response: toolResult
                }
            })
        }

        // Send ALL function responses together (this is what Gemini expects)
        result = await chat.sendMessage(functionResponses)

        response = result.response
        totalTokens += response.usageMetadata?.totalTokenCount || 0
    }

    return {
        text: response.text(),
        usage: { totalTokens }
    }
}
