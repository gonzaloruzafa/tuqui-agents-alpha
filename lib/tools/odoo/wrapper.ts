/**
 * Odoo Chat Wrapper using Native Google SDK
 * 
 * This wrapper uses the native Google Generative AI SDK instead of the Vercel AI SDK
 * because the AI SDK has issues converting Zod schemas to Gemini's function declaration format.
 * The native SDK allows us to define tools in a format that Gemini accepts correctly.
 */

import { GoogleGenerativeAI } from '@google/generative-ai'
import { getOdooClient } from './client'

// Lazy initialization to ensure env vars are loaded
function getGenAI() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_GENERATIVE_AI_API_KEY
    if (!apiKey) {
        throw new Error('Missing GEMINI_API_KEY or GOOGLE_GENERATIVE_AI_API_KEY')
    }
    return new GoogleGenerativeAI(apiKey)
}

// Helper to parse natural language filters into Odoo domain
function parseFiltersToOdooDomain(filters: string): any[] {
    const domain: any[] = []
    
    // Parse date filters
    const datePatterns = [
        { regex: /abril|april/i, month: '04' },
        { regex: /mayo|may/i, month: '05' },
        { regex: /junio|june/i, month: '06' },
        { regex: /julio|july/i, month: '07' },
        { regex: /agosto|august/i, month: '08' },
        { regex: /septiembre|september/i, month: '09' },
        { regex: /octubre|october/i, month: '10' },
        { regex: /noviembre|november/i, month: '11' },
        { regex: /diciembre|december/i, month: '12' },
        { regex: /enero|january/i, month: '01' },
        { regex: /febrero|february/i, month: '02' },
        { regex: /marzo|march/i, month: '03' },
    ]
    
    const currentYear = new Date().getFullYear()
    
    for (const { regex, month } of datePatterns) {
        if (regex.test(filters)) {
            const startDate = `${currentYear}-${month}-01`
            const endDay = new Date(currentYear, parseInt(month), 0).getDate()
            const endDate = `${currentYear}-${month}-${endDay}`
            domain.push(['date_order', '>=', startDate])
            domain.push(['date_order', '<=', endDate])
            break
        }
    }
    
    // Parse state filters
    if (/confirmad|confirm/i.test(filters)) {
        domain.push(['state', '=', 'sale'])
    } else if (/borrador|draft/i.test(filters)) {
        domain.push(['state', '=', 'draft'])
    } else if (/cancelad|cancel/i.test(filters)) {
        domain.push(['state', '=', 'cancel'])
    }
    
    return domain
}

// Tool definitions for Gemini
const odooTools = [
    {
        name: 'odoo_search',
        description: `Buscar registros en Odoo ERP. Usa esta herramienta para consultar ventas, contactos, productos, facturas.
        
Modelos disponibles:
- sale.order: Órdenes de venta (campos: name, partner_id, date_order, amount_total, state)
- res.partner: Contactos/Clientes (campos: name, email, phone, city)
- product.template: Productos (campos: name, list_price, default_code, qty_available)
- account.move: Facturas (campos: name, partner_id, invoice_date, amount_total, state)`,
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                model: {
                    type: 'STRING' as const,
                    description: 'Modelo de Odoo: sale.order, res.partner, product.template, account.move'
                },
                filters: {
                    type: 'STRING' as const,
                    description: 'Filtros en lenguaje natural. Ej: "abril", "cliente Juan", "confirmadas"'
                },
                limit: {
                    type: 'NUMBER' as const,
                    description: 'Cantidad máxima de resultados (default 10)'
                }
            },
            required: ['model']
        }
    },
    {
        name: 'odoo_summary',
        description: 'Obtener un resumen de datos de Odoo: totales de ventas, cantidad de clientes, productos, etc.',
        parameters: {
            type: 'OBJECT' as const,
            properties: {
                type: {
                    type: 'STRING' as const,
                    description: 'Tipo de resumen: sales (ventas), partners (clientes), products (productos), invoices (facturas)'
                },
                period: {
                    type: 'STRING' as const,
                    description: 'Período para el resumen. Ej: "abril", "mayo 2025", "este mes"'
                }
            },
            required: ['type']
        }
    }
]

// Execute Odoo tool
async function executeOdooTool(tenantId: string, toolName: string, args: any): Promise<any> {
    const odoo = await getOdooClient(tenantId)
    
    if (toolName === 'odoo_search') {
        const { model, filters, limit } = args
        const domain = filters ? parseFiltersToOdooDomain(filters) : []
        const defaultFields: Record<string, string[]> = {
            'sale.order': ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
            'res.partner': ['name', 'email', 'phone', 'city'],
            'product.template': ['name', 'list_price', 'default_code', 'qty_available'],
            'account.move': ['name', 'partner_id', 'invoice_date', 'amount_total', 'state']
        }
        const fields = defaultFields[model] || []
        
        try {
            const results = await odoo.searchRead(model, domain, fields, limit || 10)
            return {
                success: true,
                model,
                count: results.length,
                records: results
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }
    
    if (toolName === 'odoo_summary') {
        const { type, period } = args
        const modelMap: Record<string, string> = {
            'sales': 'sale.order',
            'partners': 'res.partner',
            'products': 'product.template',
            'invoices': 'account.move'
        }
        const model = modelMap[type]
        const domain = period ? parseFiltersToOdooDomain(period) : []
        
        try {
            if (type === 'sales') {
                domain.push(['state', '=', 'sale'])
                const results = await odoo.searchRead(model, domain, ['amount_total'], 100)
                const total = results.reduce((sum: number, r: any) => sum + (r.amount_total || 0), 0)
                return {
                    success: true,
                    type,
                    period: period || 'todos',
                    count: results.length,
                    total_amount: total
                }
            } else {
                const results = await odoo.searchRead(model, domain, ['id'], 100)
                return {
                    success: true,
                    type,
                    period: period || 'todos',
                    count: results.length
                }
            }
        } catch (error: any) {
            return { success: false, error: error.message }
        }
    }
    
    return { success: false, error: 'Unknown tool' }
}

/**
 * Get Odoo tools in native Google format
 */
export async function getOdooTools(tenantId: string) {
    // Verify Odoo is configured
    try {
        await getOdooClient(tenantId)
        return { odoo_search: odooTools[0], odoo_summary: odooTools[1] }
    } catch (e) {
        console.warn('[OdooWrapper] Odoo not configured:', e)
        return {}
    }
}

/**
 * Handle chat with Odoo tools using native Google SDK
 */
export async function handleOdooChat(
    tenantId: string,
    messages: Array<{ role: 'user' | 'assistant' | 'system', content: string }>,
    systemPrompt: string
): Promise<Response> {
    const genAI = getGenAI()
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.5-flash',
        systemInstruction: systemPrompt,
        tools: [{
            functionDeclarations: odooTools as any
        }]
    })
    
    // Convert messages to Gemini format
    const contents = messages.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
    }))
    
    // Generate with function calling
    const result = await model.generateContent({
        contents,
        toolConfig: {
            functionCallingConfig: {
                mode: 'AUTO' as any
            }
        }
    })
    
    let response = result.response
    let fullText = ''
    
    // Handle function calls
    while (true) {
        const functionCalls = response.functionCalls()
        
        if (!functionCalls || functionCalls.length === 0) {
            // No more function calls, get the final text
            fullText = response.text()
            break
        }
        
        // Execute function calls
        const functionResponses = []
        for (const call of functionCalls) {
            console.log(`[OdooWrapper] Executing tool: ${call.name}`, call.args)
            const toolResult = await executeOdooTool(tenantId, call.name, call.args)
            console.log(`[OdooWrapper] Tool result:`, JSON.stringify(toolResult).substring(0, 200))
            functionResponses.push({
                functionResponse: {
                    name: call.name,
                    response: toolResult
                }
            })
        }
        
        // Send function results back to the model
        const nextResult = await model.generateContent({
            contents: [
                ...contents,
                { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) },
                { role: 'user', parts: functionResponses.map(fr => fr) }
            ]
        })
        
        response = nextResult.response
    }
    
    // Create a readable stream response
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
        start(controller) {
            // Send the text in chunks to simulate streaming
            const chunks = fullText.match(/.{1,50}/g) || [fullText]
            for (const chunk of chunks) {
                controller.enqueue(encoder.encode(chunk))
            }
            controller.close()
        }
    })
    
    return new Response(stream, {
        headers: {
            'Content-Type': 'text/plain; charset=utf-8',
            'Transfer-Encoding': 'chunked'
        }
    })
}

/**
 * Check if agent has Odoo tools
 */
export function hasOdooTools(agentTools: string[]): boolean {
    return agentTools.some(t => t.startsWith('odoo'))
}
