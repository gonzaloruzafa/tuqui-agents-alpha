/**
 * Native Gemini V2 - Using @google/genai SDK with Thinking Support
 * 
 * This version uses the new Google GenAI SDK that supports:
 * - Native thinking (Chain of Thought)
 * - Thought summaries that can be streamed to the UI
 * - Better tool/function calling integration
 */

import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai'
import { ThinkingStep, OnThinkingStep, getToolSource, ThinkingSource } from '@/lib/thinking/types'

/**
 * Map string literals to ThinkingLevel enum values
 */
const thinkingLevelMap = {
    'minimal': ThinkingLevel.MINIMAL,
    'low': ThinkingLevel.LOW,
    'medium': ThinkingLevel.MEDIUM,
    'high': ThinkingLevel.HIGH
} as const

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
 * Extended result with tool call tracking and thinking
 */
export interface GenerateTextResultWithThinking {
    text: string
    thinkingSummary?: string  // The model's thought summary
    usage: { totalTokens: number; thinkingTokens?: number }
    toolCalls: ToolCallRecord[]
}

/**
 * Callback for streaming thinking summaries
 */
export type OnThinkingSummary = (summary: string) => void

/**
 * Convert Zod schema to Gemini Type format for the new SDK
 */
function zodToGeminiSchema(zodSchema: any): Record<string, any> {
    try {
        if (typeof zodSchema.toJSONSchema !== 'function') {
            return { type: Type.OBJECT, properties: {} }
        }
        
        const jsonSchema = zodSchema.toJSONSchema()
        return convertJsonSchemaToGemini(jsonSchema)
    } catch (error) {
        console.warn('[NativeGeminiV2] Failed to convert Zod schema:', error)
        return { type: Type.OBJECT, properties: {} }
    }
}

function convertJsonSchemaToGemini(schema: any): Record<string, any> {
    if (schema.enum) {
        return { type: Type.STRING, enum: schema.enum, description: schema.description }
    }
    
    if (schema.type === 'array') {
        return {
            type: Type.ARRAY,
            items: schema.items ? convertJsonSchemaToGemini(schema.items) : { type: Type.STRING },
            description: schema.description
        }
    }
    
    if (schema.type === 'object' || schema.properties) {
        const properties: Record<string, any> = {}
        for (const [k, v] of Object.entries(schema.properties || {})) {
            properties[k] = convertJsonSchemaToGemini(v as any)
        }
        return {
            type: Type.OBJECT,
            properties,
            required: schema.required || [],
            description: schema.description
        }
    }
    
    const typeMap: Record<string, any> = {
        'string': Type.STRING,
        'number': Type.NUMBER,
        'integer': Type.INTEGER,
        'boolean': Type.BOOLEAN,
    }
    
    return {
        type: typeMap[schema.type] || Type.STRING,
        description: schema.description
    }
}

/**
 * Generate text with native thinking support using the new SDK
 * 
 * @param onThinkingStep - Callback for tool execution events
 * @param onThinkingSummary - Callback for streaming thinking summaries (Chain of Thought)
 */
export async function generateTextWithThinking({
    model: modelName = 'gemini-3-flash-preview',
    system,
    messages,
    tools,
    maxSteps = 5,
    thinkingLevel = 'medium',
    includeThoughts = true,
    onThinkingStep,
    onThinkingSummary
}: {
    model?: string
    system: string
    messages: any[]
    tools?: Record<string, any>
    maxSteps?: number
    thinkingLevel?: 'minimal' | 'low' | 'medium' | 'high' | ThinkingLevel
    includeThoughts?: boolean
    onThinkingStep?: OnThinkingStep
    onThinkingSummary?: OnThinkingSummary
}): Promise<GenerateTextResultWithThinking> {
    
    const client = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! })
    
    // Convert string to ThinkingLevel enum if needed
    const resolvedThinkingLevel = typeof thinkingLevel === 'string' 
        ? thinkingLevelMap[thinkingLevel as keyof typeof thinkingLevelMap] 
        : thinkingLevel

    // Convert tools to function declarations
    const functionDeclarations: any[] = []
    
    if (tools) {
        for (const [name, tool] of Object.entries(tools)) {
            if (name === 'web_search') {
                functionDeclarations.push({
                    name,
                    description: tool.description || 'Buscar información en internet',
                    parameters: {
                        type: Type.OBJECT,
                        properties: {
                            query: { type: Type.STRING, description: 'Términos de búsqueda' }
                        },
                        required: ['query']
                    }
                })
            } else if (tool.parameters) {
                try {
                    const params = zodToGeminiSchema(tool.parameters)
                    functionDeclarations.push({
                        name,
                        description: tool.description || `Execute ${name}`,
                        parameters: params
                    })
                } catch (e) {
                    functionDeclarations.push({
                        name,
                        description: tool.description,
                        parameters: { type: Type.OBJECT, properties: {} }
                    })
                }
            }
        }
    }

    // Build conversation contents
    const contents: any[] = []
    
    // Add history (all messages except the last)
    for (const m of messages.slice(0, -1)) {
        contents.push({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }]
        })
    }
    
    // Add the last message
    const lastMessage = messages[messages.length - 1].content
    contents.push({
        role: 'user',
        parts: [{ text: lastMessage }]
    })

    const toolCalls: ToolCallRecord[] = []
    let thinkingSummary = ''
    let totalTokens = 0
    let thinkingTokens = 0
    let finalText = ''

    try {
        // Initial request with thinking enabled
        let response = await client.models.generateContent({
            model: modelName,
            contents,
            config: {
                systemInstruction: system,
                tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
                thinkingConfig: {
                    thinkingLevel: resolvedThinkingLevel,
                    includeThoughts
                }
            }
        })

        // Track usage
        if (response.usageMetadata) {
            totalTokens = response.usageMetadata.totalTokenCount || 0
            thinkingTokens = response.usageMetadata.thoughtsTokenCount || 0
        }

        // Process response parts for thinking and function calls
        for (let step = 0; step < maxSteps; step++) {
            const parts = response.candidates?.[0]?.content?.parts || []
            
            // Collect thinking summaries and function calls
            const functionCallParts: any[] = []
            
            for (const part of parts) {
                // Check for thought summary
                if (part.thought && part.text) {
                    thinkingSummary += part.text
                    if (onThinkingSummary) {
                        onThinkingSummary(part.text)
                    }
                }
                
                // Check for function call
                if (part.functionCall) {
                    functionCallParts.push(part)
                }
                
                // Check for regular text
                if (!part.thought && part.text) {
                    finalText += part.text
                }
            }

            // If no function calls, we're done
            if (functionCallParts.length === 0) break

            // Execute all function calls
            const functionResponses: any[] = []
            
            for (const part of functionCallParts) {
                const { name, args } = part.functionCall
                console.log(`[NativeGeminiV2] Executing ${name} with args:`, args)

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
                    if (name === 'odoo_intelligent_query') {
                        toolResult = { 
                            error: `La tool "odoo_intelligent_query" fue reemplazada. Usá: ` +
                                   `get_sales_total, get_invoices_by_customer, get_debt_by_customer, etc.`
                        }
                    } else {
                        toolResult = { error: `Tool ${name} no está disponible.` }
                    }
                    error = `Tool ${name} not found`
                } else {
                    try {
                        toolResult = await tool.execute(args)
                    } catch (execError: any) {
                        console.error(`[NativeGeminiV2] Tool ${name} error:`, execError)
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

            // Add function responses to conversation and continue
            contents.push({
                role: 'model',
                parts: functionCallParts
            })
            contents.push({
                role: 'user',
                parts: functionResponses
            })

            // Continue the conversation
            response = await client.models.generateContent({
                model: modelName,
                contents,
                config: {
                    systemInstruction: system,
                    tools: functionDeclarations.length > 0 ? [{ functionDeclarations }] : undefined,
                    thinkingConfig: {
                        thinkingLevel: resolvedThinkingLevel,
                        includeThoughts
                    }
                }
            })

            // Update usage
            if (response.usageMetadata) {
                totalTokens += response.usageMetadata.totalTokenCount || 0
                thinkingTokens += response.usageMetadata.thoughtsTokenCount || 0
            }

            // Extract final text from this response
            for (const part of response.candidates?.[0]?.content?.parts || []) {
                if (part.thought && part.text) {
                    thinkingSummary += part.text
                    if (onThinkingSummary) {
                        onThinkingSummary(part.text)
                    }
                }
                if (!part.thought && part.text) {
                    finalText += part.text
                }
            }
        }

        return {
            text: finalText,
            thinkingSummary: thinkingSummary || undefined,
            usage: { totalTokens, thinkingTokens },
            toolCalls
        }

    } catch (error: any) {
        console.error('[NativeGeminiV2] Error:', error)
        
        if (error.status === 404 || error.message?.includes('not found')) {
            throw new Error('El modelo de IA no está disponible momentáneamente. Intentá de nuevo.')
        } else if (error.status === 429 || error.message?.includes('quota') || error.message?.includes('rate')) {
            throw new Error('Demasiadas consultas. Esperá unos segundos e intentá de nuevo.')
        } else if (error.status === 503 || error.message?.includes('overloaded')) {
            throw new Error('El servicio de IA está sobrecargado. Intentá en unos minutos.')
        }
        throw error
    }
}
