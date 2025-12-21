import { GoogleGenerativeAI, Part, Content, SchemaType, FunctionDeclaration } from '@google/generative-ai'
import { getOdooClient } from './odoo/client'

// Native Google Gemini wrapper for tool calling
// Using native SDK because AI SDK v5 has issues with Gemini function declarations

interface ToolCall {
    name: string
    args: Record<string, any>
}

interface OdooToolResult {
    success: boolean
    data?: any[]
    error?: string
    count?: number
    total_amount?: number
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

// Execute Odoo tool
async function executeOdooTool(
    tenantId: string,
    toolName: string,
    args: Record<string, any>
): Promise<OdooToolResult> {
    try {
        const odoo = await getOdooClient(tenantId)
        
        if (toolName === 'odoo_search') {
            const { model, filters } = args
            const domain = filters ? parseFiltersToOdooDomain(filters) : []
            const defaultFields: Record<string, string[]> = {
                'sale.order': ['name', 'partner_id', 'date_order', 'amount_total', 'state'],
                'res.partner': ['name', 'email', 'phone', 'city'],
                'product.template': ['name', 'list_price', 'default_code', 'qty_available'],
                'account.move': ['name', 'partner_id', 'invoice_date', 'amount_total', 'state']
            }
            const fields = defaultFields[model] || []
            const results = await odoo.searchRead(model, domain, fields, 10)
            return {
                success: true,
                data: results,
                count: results.length
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
            const model = modelMap[type] || 'sale.order'
            const domain = period ? parseFiltersToOdooDomain(period) : []
            
            if (type === 'sales') {
                domain.push(['state', '=', 'sale'])
                const results = await odoo.searchRead(model, domain, ['amount_total'], 100)
                const total = results.reduce((sum: number, r: any) => sum + (r.amount_total || 0), 0)
                return {
                    success: true,
                    count: results.length,
                    total_amount: total
                }
            } else {
                const results = await odoo.searchRead(model, domain, ['id'], 100)
                return {
                    success: true,
                    count: results.length
                }
            }
        }
        
        return { success: false, error: `Unknown tool: ${toolName}` }
    } catch (error: any) {
        return { success: false, error: error.message }
    }
}

// Function declarations for Gemini
const odooFunctionDeclarations: FunctionDeclaration[] = [
    {
        name: 'odoo_search',
        description: `Buscar registros en Odoo ERP. USAR SIEMPRE para consultas de datos.
Modelos disponibles:
- sale.order: Órdenes de venta
- res.partner: Contactos/Clientes  
- product.template: Productos
- account.move: Facturas`,
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                model: {
                    type: SchemaType.STRING,
                    description: 'Modelo de Odoo: sale.order, res.partner, product.template, account.move'
                },
                filters: {
                    type: SchemaType.STRING,
                    description: 'Filtros en lenguaje natural: abril, mayo, cliente Juan, confirmadas'
                }
            },
            required: ['model']
        }
    },
    {
        name: 'odoo_summary',
        description: 'Obtener resumen de datos: totales de ventas, cantidad de registros, etc.',
        parameters: {
            type: SchemaType.OBJECT,
            properties: {
                type: {
                    type: SchemaType.STRING,
                    description: 'Tipo: sales, partners, products, invoices'
                },
                period: {
                    type: SchemaType.STRING,
                    description: 'Período: abril, mayo, este mes'
                }
            },
            required: ['type']
        }
    }
]

export interface GeminiOdooResponse {
    text: string
    toolCalls?: ToolCall[]
    toolResults?: OdooToolResult[]
}

export async function chatWithOdoo(
    tenantId: string,
    systemPrompt: string,
    userMessage: string,
    history: Content[] = []
): Promise<GeminiOdooResponse> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{ functionDeclarations: odooFunctionDeclarations }],
        toolConfig: {
            functionCallingConfig: {
                mode: 'AUTO' as any  // AUTO allows model to choose when to use tools
            }
        }
    })
    
    const chat = model.startChat({
        history,
        systemInstruction: systemPrompt
    })
    
    // First turn - user message
    let result = await chat.sendMessage(userMessage)
    let response = result.response
    
    const toolCalls: ToolCall[] = []
    const toolResults: OdooToolResult[] = []
    
    // Process function calls (up to 3 iterations)
    for (let i = 0; i < 3; i++) {
        const candidate = response.candidates?.[0]
        const functionCall = candidate?.content?.parts?.find(
            (part): part is Part & { functionCall: { name: string; args: Record<string, any> } } => 
                'functionCall' in part
        )
        
        if (!functionCall) break
        
        const { name, args } = functionCall.functionCall
        console.log(`[GeminiOdoo] Tool call: ${name}`, args)
        
        toolCalls.push({ name, args })
        
        // Execute the tool
        const toolResult = await executeOdooTool(tenantId, name, args)
        toolResults.push(toolResult)
        
        console.log(`[GeminiOdoo] Tool result:`, toolResult)
        
        // Send function response back to model
        result = await chat.sendMessage([{
            functionResponse: {
                name,
                response: toolResult
            }
        }])
        response = result.response
    }
    
    return {
        text: response.text(),
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        toolResults: toolResults.length > 0 ? toolResults : undefined
    }
}

// Stream version for real-time responses
export async function* streamChatWithOdoo(
    tenantId: string,
    systemPrompt: string,
    userMessage: string,
    history: Content[] = []
): AsyncGenerator<string, void, unknown> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{ functionDeclarations: odooFunctionDeclarations }],
        toolConfig: {
            functionCallingConfig: {
                mode: 'AUTO' as any
            }
        },
        systemInstruction: {
            role: 'user',
            parts: [{ text: systemPrompt }]
        }
    })
    
    const chat = model.startChat({
        history
    })
    
    // First turn - send message and check for function calls
    const result = await chat.sendMessage(userMessage)
    let response = result.response
    
    // Check for function call
    const candidate = response.candidates?.[0]
    const functionCall = candidate?.content?.parts?.find(
        (part): part is Part & { functionCall: { name: string; args: Record<string, any> } } => 
            'functionCall' in part
    )
    
    if (functionCall) {
        const { name, args } = functionCall.functionCall
        console.log(`[GeminiOdoo] Tool call: ${name}`, args)
        
        yield `🔧 Consultando ${name === 'odoo_search' ? 'datos' : 'resumen'}...\n\n`
        
        // Execute the tool
        const toolResult = await executeOdooTool(tenantId, name, args)
        
        if (!toolResult.success) {
            yield `❌ Error: ${toolResult.error}\n`
            return
        }
        
        // Send function response back and stream the final response
        const streamResult = await chat.sendMessageStream([{
            functionResponse: {
                name,
                response: toolResult
            }
        }])
        
        for await (const chunk of streamResult.stream) {
            const text = chunk.text()
            if (text) yield text
        }
    } else {
        // No function call, just yield the text
        yield response.text()
    }
}
