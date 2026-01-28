import { GoogleGenerativeAI, Content, FunctionDeclaration, SchemaType } from '@google/generative-ai'
import { ThinkingStep, OnThinkingStep, getToolSource } from '@/lib/thinking/types'

/**
 * Record of a tool call made during generation
 */
export interface ToolCallRecord {
    toolName: string
    args: Record<string, any>
    result: any
    durationMs: number
    error?: string
}

/**
 * Extended result with tool call tracking
 */
export interface GenerateTextResultWithTools {
    text: string
    usage: { totalTokens: number }
    toolCalls: ToolCallRecord[]
}

/**
 * Convert Zod schema to Gemini parameters format
 * Uses Zod 4 native toJSONSchema() method
 */
function zodToGeminiParams(zodSchema: any): { type: SchemaType, properties: Record<string, any>, required: string[] } {
    try {
        // Zod 4 has native toJSONSchema() method
        if (typeof zodSchema.toJSONSchema !== 'function') {
            console.warn('[NativeGemini] Schema does not have toJSONSchema method')
            return { type: SchemaType.OBJECT, properties: {}, required: [] }
        }
        
        const jsonSchema = zodSchema.toJSONSchema()
        
        // Extract properties and required from JSON Schema
        const properties: Record<string, any> = {}
        const required: string[] = jsonSchema.required || []
        
        for (const [key, value] of Object.entries(jsonSchema.properties || {})) {
            const prop = value as any
            properties[key] = convertJsonSchemaType(prop)
        }
        
        return {
            type: SchemaType.OBJECT,
            properties,
            required
        }
    } catch (error) {
        console.warn('[NativeGemini] Failed to convert Zod schema:', error)
        return {
            type: SchemaType.OBJECT,
            properties: {},
            required: []
        }
    }
}

/**
 * Convert JSON Schema type to Gemini SchemaType
 */
function convertJsonSchemaType(prop: any): any {
    const typeMap: Record<string, SchemaType> = {
        'string': SchemaType.STRING,
        'number': SchemaType.NUMBER,
        'integer': SchemaType.INTEGER,
        'boolean': SchemaType.BOOLEAN,
        'array': SchemaType.ARRAY,
        'object': SchemaType.OBJECT,
    }
    
    // Handle enum
    if (prop.enum) {
        return { type: SchemaType.STRING, enum: prop.enum, description: prop.description }
    }
    
    // Handle array
    if (prop.type === 'array') {
        return {
            type: SchemaType.ARRAY,
            items: prop.items ? convertJsonSchemaType(prop.items) : { type: SchemaType.STRING },
            description: prop.description
        }
    }
    
    // Handle object
    if (prop.type === 'object' && prop.properties) {
        const nestedProps: Record<string, any> = {}
        for (const [k, v] of Object.entries(prop.properties)) {
            nestedProps[k] = convertJsonSchemaType(v)
        }
        return {
            type: SchemaType.OBJECT,
            properties: nestedProps,
            required: prop.required || [],
            description: prop.description
        }
    }
    
    // Simple type
    return {
        type: typeMap[prop.type] || SchemaType.STRING,
        description: prop.description
    }
}

/**
 * Generic Native Gemini Text Generation with Tool Support
 * Fixes "parameters schema should be of type OBJECT" error in AI SDK
 * 
 * @param onThinkingStep - Optional callback to emit thinking events as tools execute
 */
export async function generateTextNative({
    model: modelName = 'gemini-3-flash-preview',
    system,
    messages,
    tools,
    maxSteps = 5,
    onThinkingStep
}: {
    model?: string
    system: string
    messages: any[]
    tools?: Record<string, any>
    maxSteps?: number
    onThinkingStep?: OnThinkingStep
}) {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

    // Convert AI SDK tools to Gemini FunctionDeclarations
    const functionDeclarations: FunctionDeclaration[] = []

    if (tools) {
        for (const [name, tool] of Object.entries(tools)) {
            // Manual conversion for each tool type
            if (name === 'web_search') {
                functionDeclarations.push({
                    name,
                    description: tool.description || 'Buscar información en internet (Tavily + Google Grounding)',
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {
                            query: { type: SchemaType.STRING, description: 'Términos de búsqueda' }
                        },
                        required: ['query']
                    }
                })
            } else if (tool.parameters) {
                // Use Zod schema conversion for Skills
                try {
                    const params = zodToGeminiParams(tool.parameters)
                    functionDeclarations.push({
                        name,
                        description: tool.description || `Execute ${name}`,
                        parameters: params
                    })
                    console.log(`[NativeGemini] Converted skill ${name} with ${Object.keys(params.properties).length} params`)
                } catch (convError) {
                    console.warn(`[NativeGemini] Tool ${name} schema conversion failed, using empty params`)
                    functionDeclarations.push({
                        name,
                        description: tool.description,
                        parameters: {
                            type: SchemaType.OBJECT,
                            properties: {},
                            required: []
                        }
                    })
                }
            } else {
                // Fallback for tools without parameters schema
                console.warn(`[NativeGemini] Tool ${name} has no parameters schema`)
                functionDeclarations.push({
                    name,
                    description: tool.description,
                    parameters: {
                        type: SchemaType.OBJECT,
                        properties: {},
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

    let result: any
    let response: any
    let totalTokens = 0
    const toolCalls: ToolCallRecord[] = []
    
    try {
        result = await chat.sendMessage(lastMessage)
        response = result.response
        totalTokens = response.usageMetadata?.totalTokenCount || 0
    } catch (error: any) {
        console.error('[NativeGemini] Initial sendMessage error:', error)
        
        // Mensajes amigables según el tipo de error
        if (error.status === 404 || error.message?.includes('not found')) {
            throw new Error('El modelo de IA no está disponible momentáneamente. Intentá de nuevo.')
        } else if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate')) {
            throw new Error('Demasiadas consultas. Esperá unos segundos e intentá de nuevo.')
        } else if (error.status === 503 || error.message?.includes('overloaded')) {
            throw new Error('El servicio de IA está sobrecargado. Intentá en unos minutos.')
        }
        throw error // Re-throw otros errores
    }

    // Manual Tool Loop (maxSteps)
    for (let i = 0; i < maxSteps; i++) {
        const parts = response.candidates?.[0]?.content?.parts || []
        
        // Find ALL function calls in this response (Gemini may call multiple tools at once)
        const functionCalls = parts.filter((p: any) => 'functionCall' in p) as any[]

        if (functionCalls.length === 0) break

        // Execute ALL function calls and collect responses
        const functionResponses: any[] = []
        
        for (const call of functionCalls) {
            const { name, args } = call.functionCall
            console.log(`[NativeGemini] Executing ${name} with args:`, args)

            const tool = tools?.[name]
            let toolResult: any
            let error: string | undefined
            const startTime = Date.now()
            const source = getToolSource(name)
            
            // Emit thinking step: running
            if (onThinkingStep) {
                onThinkingStep({
                    tool: name,
                    source,
                    status: 'running',
                    startedAt: startTime
                })
            }
            
            if (!tool || !tool.execute) {
                console.warn(`[NativeGemini] Tool ${name} not found, returning error to model`)
                
                // Special handling for deprecated odoo_intelligent_query
                if (name === 'odoo_intelligent_query') {
                    toolResult = { 
                        error: `La tool "odoo_intelligent_query" fue reemplazada por skills específicas. ` +
                               `Usá las skills disponibles según lo que necesites: ` +
                               `get_invoices_by_customer (facturas), get_debt_by_customer (deudas), ` +
                               `get_overdue_invoices (vencidas), get_accounts_receivable (cuentas por cobrar), ` +
                               `get_sales_total (ventas), search_customers (buscar clientes), etc.`
                    }
                } else {
                    toolResult = { error: `Tool ${name} no está disponible.` }
                }
                error = `Tool ${name} not found`
            } else {
                try {
                    toolResult = await tool.execute(args)
                } catch (execError: any) {
                    console.error(`[NativeGemini] Tool ${name} execution error:`, execError)
                    toolResult = { error: execError.message || 'Tool execution failed' }
                    error = execError.message
                }
            }
            
            const durationMs = Date.now() - startTime
            
            // Emit thinking step: done or error
            if (onThinkingStep) {
                onThinkingStep({
                    tool: name,
                    source,
                    status: error ? 'error' : 'done',
                    duration: durationMs,
                    error,
                    startedAt: startTime
                })
            }
            
            // Record the tool call
            toolCalls.push({
                toolName: name,
                args,
                result: toolResult,
                durationMs,
                error
            })

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
        usage: { totalTokens },
        toolCalls
    } as GenerateTextResultWithTools
}
