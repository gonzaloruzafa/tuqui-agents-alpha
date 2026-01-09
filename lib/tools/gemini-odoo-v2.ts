/**
 * Odoo BI Agent v2 - Intelligent Query Builder with Insights
 * 
 * Features:
 * - Single intelligent tool (odoo_intelligent_query) instead of multiple specific tools
 * - Multiple sub-queries in parallel (max 5)
 * - Automatic temporal comparisons (MoM, YoY)
 * - Lateral insights without being asked
 * - Chart data for visualizations
 * - 5-minute cache for performance
 */

import { GoogleGenerativeAI, Part, Content, SchemaType, FunctionDeclaration } from '@google/generative-ai'
import { getOdooClient } from './odoo/client'
import {
    OdooSubQuery,
    QueryResult,
    ChartData,
    executeQueries,
    buildDomain,
    generateChartData,
    MODEL_CONFIG
} from './odoo/query-builder'
import {
    getComparisonPeriods,
    getPeriodDomain,
    compareGroupedData,
    calculateVariation,
    ComparisonResult
} from './odoo/comparisons'
import {
    generateInsights,
    formatInsightsAsText,
    Insight,
    InsightContext
} from './odoo/insights'
import { getMetricsPromptSnippet } from '../odoo/metrics-dictionary'
import { StrictValidator } from '../validation/strict-validator'

// ============================================
// TYPES
// ============================================

interface ToolCall {
    name: string
    args: Record<string, any>
}

export interface OdooToolResult {
    success: boolean
    data?: any[]
    error?: string
    count?: number
    total?: number
    grouped?: Record<string, { count: number; total: number }>
    comparison?: {
        current: any
        previous: any
        variation: { value: number; percent: number; trend: string; label: string }
        periodLabels: { current: string; previous: string }
    }
    insights?: Insight[]
    chartData?: ChartData
    cached?: boolean
    executionMs?: number
    query_metadata?: Array<{
        id: string
        model: string
        filters?: string
        interpretation?: string
    }>
}

export interface GeminiOdooResponse {
    text: string
    toolCalls?: ToolCall[]
    toolResults?: OdooToolResult[]
}

// ============================================
// BI ANALYST SYSTEM PROMPT
// ============================================

const BI_ANALYST_PROMPT = `Eres un analista de Business Intelligence experto trabajando con datos de Odoo ERP.

**TU ROL:**
- Analizar datos de ventas, facturas, clientes, CRM, stock, usuarios y actividades
- Responder preguntas de manera precisa y directa
- NUNCA pedir clarificación si el historial tiene la información necesaria

**⚠️ REGLA CRÍTICA - MOSTRAR DATOS REALES (NO INVENTAR):**

SI EL TOOL DEVUELVE VACÍO O ERROR:
- ✅ CORRECTO: "$ 0 en ventas ayer" o "No hay datos para ese período"
- ❌ PROHIBIDO: Inventar nombres, montos o datos

SI EL TOOL DEVUELVE DATOS:
- ✅ USA LOS NOMBRES EXACTOS: Si dice "Maria Inés Salomon", mostrar "Maria Inés Salomon"
- ❌ PROHIBIDO: Cambiar a "Maria Gimenez" o "Carlos Rodriguez"
- ✅ USA LOS MONTOS EXACTOS: Si dice "633.921.469", mostrar "$ 633.921.469"
- ❌ PROHIBIDO: Cambiar a "$ 92.450.000"

NOMBRES GENÉRICOS = ALUCINACIÓN:
Si estás pensando escribir "Carlos Rodriguez", "Juan Perez", "Maria Gimenez":
→ DETENTE. Esos nombres son inventados.
→ USA SOLO los nombres que vienen del tool result.

**OPERACIONES DISPONIBLES:**

1. "dame las ventas/facturas de X" → operation: "search" (LISTAR registros)
2. "cuántas ventas hubo" → operation: "count" (CONTAR)
3. "top clientes por X" / "quién compró más" → operation: "aggregate" con groupBy: ["partner_id"]
4. "usuarios con más actividad" → operation: "aggregate" con groupBy: ["user_id"]
5. "qué campos tiene el modelo X" → operation: "discover" (DESCUBRIR schema)

**REGLA CRÍTICA - GroupBy por fechas:**
- PROHIBIDO: groupBy: ["invoice_date:month"] ❌ (causa error en Odoo)
- PERMITIDO: groupBy: ["invoice_date:quarter"] ✅ (para tendencias trimestrales)
- PERMITIDO: groupBy: ["invoice_date:year"] ✅ (para comparar años)
- PERMITIDO: groupBy: ["partner_id"] ✅
- PERMITIDO: groupBy: ["user_id"] ✅
- PERMITIDO: groupBy: ["stage_id"] ✅
- Para tendencias/estacionalidad, usa :quarter o :year, NUNCA :month

**🚨 REGLA ABSOLUTA - FORMATO CUANDO NO HAY DATOS:**

Cuando el tool devuelve vacío (total: 0, records: []), SIEMPRE responde con "$ 0":

❌ INCORRECTO:
- "No hubo ventas"
- "No se encontraron datos"
- "no realizó compras"
- "No tengo datos de ventas"

✅ CORRECTO:
- "$ 0 en ventas hoy"
- "$ 0 en compras este mes"
- "$ 0 en cuentas por cobrar"

**EJEMPLOS DE FORMATO CORRECTO:**

User: "¿Cuánto vendimos hoy?"
Tool: { total: 0, records: [] }
✅ RESPUESTA: "$ 0 en ventas hoy (2026-01-09)"

User: "Ranking de vendedores del mes"
Tool: { total: 0, records: [] }
✅ RESPUESTA: "$ 0 en ventas este mes. No hay ranking de vendedores para mostrar."

User: "¿Cuánto nos compró Juan Pérez este mes?"
Tool: { total: 0 }
✅ RESPUESTA: "$ 0 en compras este mes"

User: "Top 10 productos más vendidos"
Tool: { total: 0, records: [] }
✅ RESPUESTA: "$ 0 en ventas de productos. No hay ranking para mostrar."

User: "Dame el ranking de clientes"
Tool: { total: 0, records: [] }
✅ RESPUESTA: "$ 0 en ventas de clientes. No hay ranking para mostrar."

**REGLA: Cuando es un ranking/lista vacía, SIEMPRE mencionar la palabra clave del ranking (vendedor, producto, cliente)**
✅ RESPUESTA: "$ 0 en ventas. No hay productos para rankear este período."

**SELECCIÓN DE MODELO:**

1. "ventas" / "pedidos" / "compraron" → sale.order
2. "productos más vendidos" / "qué se vende más" → sale.order.line (groupBy: ["product_id"])
3. "deuda" / "por cobrar" / "saldo pendiente" → account.move con filtro "por cobrar facturas cliente"
4. "pagos recibidos" / "cobramos" / "cobros" → account.payment con filtro "inbound"
5. "pagos realizados" / "pagamos" → account.payment con filtro "outbound"
6. "usuarios conectados" / "login" → res.users
7. "actividad de usuarios" → mail.activity con groupBy: ["user_id"]
8. "oportunidades" / "leads" / "CRM" → crm.lead
9. "productos" / "artículos" → product.template o product.product
10. "stock" / "existencias" / "inventario" → stock.quant
11. "movimientos de stock" / "ajustes de inventario" → stock.move
12. "compras" / "proveedores" → purchase.order
13. "clientes" / "contactos" → res.partner
14. "entregas" / "envíos" / "picking" → stock.picking

**MODELOS PRINCIPALES Y CAMPOS:**
- sale.order: date_order, amount_total, partner_id, user_id, state
- sale.order.line: order_id, product_id, product_uom_qty, price_subtotal, state
- account.move: invoice_date, amount_total, amount_residual, move_type, payment_state
- account.payment: date, amount, partner_id, payment_type (inbound=cobro, outbound=pago), state
- res.partner: name, email, phone, customer_rank, supplier_rank, credit, debit
- res.users: login_date, active, name
- mail.activity: user_id, date_deadline, state
- crm.lead: expected_revenue, stage_id, probability, user_id
- product.template: name, list_price, qty_available, default_code, categ_id
- product.product: name, default_code, list_price, qty_available, categ_id, type
- stock.quant: product_id, location_id, quantity, reserved_quantity, value (valor total del stock)
- stock.move: product_id, product_uom_qty, quantity, location_id, location_dest_id, date, state, origin
- stock.picking: scheduled_date, date_done, state, partner_id, picking_type_code
- purchase.order: date_order, amount_total, partner_id, state

**SI NO CONOCÉS UN MODELO:**
Si te preguntan por algo que no está en la lista, usá operation: "discover" primero para conocer los campos disponibles.

**FILTROS EN LENGUAJE NATURAL:**
- Fechas: "abril", "abril 2025", "este mes", "mes pasado", "últimos 30 días"
- Estados: "confirmadas", "por cobrar", "pagadas", "pendiente"
- Tipos: "facturas cliente", "facturas proveedor"

**EJEMPLOS:**

Q: "dame las ventas de abril 2025"
→ { model: "sale.order", operation: "search", filters: "abril 2025" }

Q: "top 10 clientes por deuda"
→ { model: "account.move", operation: "aggregate", filters: "por cobrar facturas cliente", groupBy: ["partner_id"], limit: 10 }

Q: "cuáles son los productos más vendidos"
→ { model: "sale.order.line", operation: "aggregate", filters: "confirmadas", groupBy: ["product_id"], aggregateField: "product_uom_qty:sum", limit: 10, order: "product_uom_qty desc" }

Q: "cuántos pagos recibimos hoy"
→ { model: "account.payment", operation: "count", filters: "hoy inbound" }

Q: "dame el inventario valorizado total" o "valor del inventario"
→ { model: "stock.quant", operation: "aggregate", aggregateField: "value:sum" }

Q: "movimientos de stock del mes"
→ { model: "stock.move", operation: "search", filters: "este mes state:done" }

Q: "ajustes de inventario"
→ { model: "stock.move", operation: "search", filters: "location_id.usage:inventory" }

**FORMATO DE RESPUESTA (CRÍTICO - WhatsApp + Web):**
- Negritas solo con *asterisco* (NO **)
- Un emoji por sección máximo (📈 o 📉 para tendencias)
- Precios sin céntimos: $ 123.456 (NO $ 123.456,89)
- Listas simples (NO tablas markdown)
- USA LOS NOMBRES REALES de productos/clientes/etc que vienen en "grouped"

EJEMPLO BUENO:
*Top 5 Productos*

1. *[C001063] Adhesivo Adper* - $ 82.150
2. *Filtek Z350* - $ 46.800

Total: $ 128.950

EJEMPLO MALO (NO HACER):
### 📊 Top 5 Productos 💰

| Producto | Valor |
| Adhesivo | $ 82.150,40 |

**EJEMPLO DE RESPUESTA CON DATOS REALES:**
Si grouped = {"[C001063] Adhesivo Adper": {count: 12, total: 90420017.8}}
Tu respuesta debe mostrar "[C001063] Adhesivo Adper" NO "Producto A"

${getMetricsPromptSnippet(['ventas_totales', 'ventas_netas', 'margen_bruto', 'stock_disponible', 'caja_disponible', 'ticket_promedio'])}
`

// ============================================
// INTELLIGENT QUERY TOOL
// ============================================

const odooIntelligentQueryDeclaration: FunctionDeclaration = {
    name: 'odoo_intelligent_query',
    description: `Ejecutar consultas inteligentes a Odoo ERP.

OPERACIONES:
- search: Buscar registros con filtros
- count: Contar registros  
- aggregate: Agregaciones con GROUP BY
- discover: Descubrir campos de un modelo desconocido

MODELOS PRINCIPALES: sale.order, account.move, res.partner, product.template, crm.lead, res.users, mail.activity, purchase.order, stock.picking

COMPARACIONES: Usa compare: "mom" (mes vs mes anterior) o "yoy" (año vs año anterior)`,
    parameters: {
        type: SchemaType.OBJECT,
        properties: {
            queries: {
                type: SchemaType.ARRAY,
                description: 'Array de sub-queries a ejecutar en paralelo (máximo 5)',
                items: {
                    type: SchemaType.OBJECT,
                    properties: {
                        id: {
                            type: SchemaType.STRING,
                            description: 'ID único para esta query (ej: "sales_by_customer", "crm_stages")'
                        },
                        model: {
                            type: SchemaType.STRING,
                            description: 'Modelo Odoo: sale.order, account.move, res.partner, product.template, crm.lead, res.users, mail.activity'
                        },
                        operation: {
                            type: SchemaType.STRING,
                            description: 'Tipo de operación: search (listado), count (conteo), aggregate (agrupación), discover (campos del modelo)'
                        },
                        filters: {
                            type: SchemaType.STRING,
                            description: 'Filtros en lenguaje natural: "abril", "este mes", "por cobrar", "facturas cliente", "inactivos", etc.'
                        },
                        groupBy: {
                            type: SchemaType.ARRAY,
                            description: 'Campos para agrupar (para aggregate): ["partner_id"], ["stage_id"], ["user_id"]',
                            items: { type: SchemaType.STRING }
                        },
                        limit: {
                            type: SchemaType.NUMBER,
                            description: 'Máximo de registros (default 50, max 500)'
                        },
                        orderBy: {
                            type: SchemaType.STRING,
                            description: 'Ordenamiento: "amount_total desc", "date_order asc"'
                        },
                        compare: {
                            type: SchemaType.STRING,
                            description: 'Comparación temporal: "mom" (mes vs anterior) o "yoy" (año vs anterior)'
                        }
                    },
                    required: ['id', 'model', 'operation']
                }
            },
            include_comparison: {
                type: SchemaType.BOOLEAN,
                description: 'Incluir comparación automática con período anterior para queries de ventas/facturas'
            },
            include_insights: {
                type: SchemaType.BOOLEAN,
                description: 'Generar insights automáticos (top clientes, tendencias, alertas)'
            }
        },
        required: ['queries']
    }
}

// ============================================
// TOOL EXECUTOR
// ============================================

async function executeIntelligentQuery(
    tenantId: string,
    args: {
        queries: Array<{
            id: string
            model: string
            operation: string
            filters?: string
            groupBy?: string[]
            limit?: number
            orderBy?: string
            compare?: 'mom' | 'yoy'
        }>
        include_comparison?: boolean
        include_insights?: boolean
    }
): Promise<OdooToolResult> {
    const startTime = Date.now()

    try {
        const odoo = await getOdooClient(tenantId)

        // Convert args to OdooSubQuery format
        const subQueries: OdooSubQuery[] = args.queries.slice(0, 5).map(q => ({
            id: q.id,
            model: q.model,
            operation: q.operation as 'search' | 'count' | 'aggregate',
            filters: q.filters,
            groupBy: q.groupBy,
            limit: q.limit,
            orderBy: q.orderBy,
            compare: q.compare
        }))

        // Execute all queries in parallel
        const results = await executeQueries(odoo, tenantId, subQueries)

        // Process results
        let allData: any[] = []
        let totalCount = 0
        let totalAmount = 0
        let allGrouped: Record<string, { count: number; total: number }> = {}
        let comparisonData: OdooToolResult['comparison'] | undefined
        let chartData: ChartData | undefined

        for (let i = 0; i < results.length; i++) {
            const result = results[i]
            const query = subQueries[i]

            if (!result.success) continue

            if (result.data) allData = allData.concat(result.data)
            if (result.count) totalCount += result.count
            if (result.total) totalAmount += result.total
            if (result.grouped) {
                // Merge grouped data
                for (const [key, value] of Object.entries(result.grouped)) {
                    if (!allGrouped[key]) {
                        allGrouped[key] = { count: 0, total: 0 }
                    }
                    allGrouped[key].count += value.count
                    allGrouped[key].total += value.total
                }
            }

            // Handle comparisons
            if (query.compare && result.grouped && args.include_comparison) {
                const periods = getComparisonPeriods(new Date(), query.compare)
                const config = MODEL_CONFIG[query.model] || { dateField: 'create_date', defaultFields: [] }

                // Execute previous period query
                const prevDomain = [
                    ...getPeriodDomain(periods.previous, config.dateField),
                    ...(query.filters ? buildDomain(query.filters, query.model).filter(d => !d[0].includes('date')) : [])
                ]

                const prevQuery: OdooSubQuery = {
                    id: `${query.id}_prev`,
                    model: query.model,
                    operation: 'aggregate',
                    domain: prevDomain,
                    groupBy: query.groupBy,
                    limit: query.limit
                }

                const [prevResult] = await executeQueries(odoo, tenantId, [prevQuery])

                if (prevResult.success && prevResult.grouped) {
                    const compared = compareGroupedData(result.grouped, prevResult.grouped)

                    // Calculate overall variation
                    const currentTotal = Object.values(result.grouped).reduce((s, g) => s + g.total, 0)
                    const previousTotal = Object.values(prevResult.grouped).reduce((s, g) => s + g.total, 0)
                    const variation = calculateVariation(currentTotal, previousTotal)

                    comparisonData = {
                        current: result.grouped,
                        previous: prevResult.grouped,
                        variation,
                        periodLabels: {
                            current: periods.current.label,
                            previous: periods.previous.label
                        }
                    }
                }
            }

            // Generate chart data for the first grouped result
            if (result.grouped && !chartData) {
                const chart = generateChartData(result, 'bar', `Datos por ${query.groupBy?.[0] || 'grupo'}`)
                if (chart) chartData = chart
            }
        }

        // Generate insights if requested
        let insights: Insight[] | undefined
        if (args.include_insights) {
            const firstQuery = subQueries[0]
            const queryType = getQueryType(firstQuery.model)

            const context: InsightContext = {
                queryType,
                model: firstQuery.model,
                hasComparison: !!comparisonData,
                comparisonType: firstQuery.compare
            }

            // Build comparison records for insight generation
            let comparisonRecords: Record<string, ComparisonResult<{ count: number; total: number }>> | undefined
            if (comparisonData) {
                comparisonRecords = {}
                const allKeys = new Set([
                    ...Object.keys(comparisonData.current),
                    ...Object.keys(comparisonData.previous)
                ])
                for (const key of allKeys) {
                    const current = comparisonData.current[key] || { count: 0, total: 0 }
                    const previous = comparisonData.previous[key] || { count: 0, total: 0 }
                    comparisonRecords[key] = {
                        current,
                        previous,
                        variation: calculateVariation(current.total, previous.total)
                    }
                }
            }

            insights = generateInsights(context, results, comparisonRecords)
        }

        return {
            success: true,
            data: allData.length > 0 ? allData : undefined,
            count: totalCount,
            total: totalAmount > 0 ? totalAmount : undefined,
            grouped: Object.keys(allGrouped).length > 0 ? allGrouped : undefined,
            comparison: comparisonData,
            insights,
            chartData,
            cached: results.some(r => r.cached),
            executionMs: Date.now() - startTime,
            query_metadata: subQueries.map(q => ({
                id: q.id,
                model: q.model,
                filters: q.filters,
                interpretation: q.domain ? JSON.stringify(q.domain) : undefined
            }))
        }

    } catch (error: any) {
        return {
            success: false,
            error: error.message,
            executionMs: Date.now() - startTime
        }
    }
}

function getQueryType(model: string): InsightContext['queryType'] {
    const typeMap: Record<string, InsightContext['queryType']> = {
        'sale.order': 'sales',
        'account.move': 'invoices',
        'res.partner': 'customers',
        'product.template': 'products',
        'crm.lead': 'crm',
        'res.users': 'users',
        'mail.activity': 'activities'
    }
    return typeMap[model] || 'general'
}

// ============================================
// PUBLIC API
// ============================================

/**
 * Chat with Odoo using the BI Agent
 */
export async function chatWithOdoo(
    tenantId: string,
    systemPrompt: string,
    userMessage: string,
    history: Content[] = []
): Promise<GeminiOdooResponse> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

    // ============================================
    // PASO 1: INTERPRETAR LA CONSULTA
    // ============================================
    const { interpretQuery } = await import('./odoo/interpreter')
    const interpreted = await interpretQuery(userMessage, history)

    if (interpreted.intent === 'clarify') {
        return { text: interpreted.needsClarification || interpreted.description }
    }

    // ============================================
    // PASO 2: EJECUTAR LA CONSULTA
    // ============================================
    // Merge custom system prompt with BI analyst prompt and interpretation
    const executorPrompt = `${BI_ANALYST_PROMPT}

**CONSULTA INTERPRETADA:**
${JSON.stringify(interpreted, null, 2)}

**INSTRUCCIONES:**
- Usa odoo_intelligent_query para ejecutar esta consulta
- La interpretación ya analizó el contexto y el historial
- Responde de forma clara y concisa con los datos obtenidos
- Formato: español, montos legibles, emojis para tendencias

${systemPrompt}`

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{ functionDeclarations: [odooIntelligentQueryDeclaration] }],
        toolConfig: {
            functionCallingConfig: {
                mode: 'AUTO' as any
            }
        },
        systemInstruction: {
            role: 'user',
            parts: [{ text: executorPrompt }]
        }
    })

    const chat = model.startChat({
        history
    })

    const enhancedMessage = `Consulta del usuario: "${userMessage}"

Interpretación: ${interpreted.description}
Modelo: ${interpreted.model}
Operación: ${interpreted.intent}
${interpreted.period ? `Período: ${interpreted.period}` : ''}
${interpreted.groupBy ? `Agrupar por: ${interpreted.groupBy.join(', ')}` : ''}
${interpreted.metric ? `Métrica: ${interpreted.metric}` : ''}
${interpreted.contextFromHistory ? `Contexto: ${interpreted.contextFromHistory}` : ''}

Ejecuta la consulta y responde al usuario.`

    // First turn - enhanced message
    let result = await chat.sendMessage(enhancedMessage)
    let response = result.response

    const toolCalls: ToolCall[] = []
    const toolResults: OdooToolResult[] = []

    // Process function calls (up to 5 iterations for complex queries)
    for (let i = 0; i < 5; i++) {
        const candidate = response.candidates?.[0]
        const functionCall = candidate?.content?.parts?.find(
            (part): part is Part & { functionCall: { name: string; args: Record<string, any> } } =>
                'functionCall' in part
        )

        if (!functionCall) break

        const { name, args } = functionCall.functionCall
        console.log(`[OdooBIAgent] Tool call: ${name}`, JSON.stringify(args, null, 2))

        toolCalls.push({ name, args })

        // Execute the tool
        const toolResult = await executeIntelligentQuery(tenantId, args as any)

        toolResults.push(toolResult)

        console.log(`[OdooBIAgent] Tool result: success=${toolResult.success}, count=${toolResult.count}, cached=${toolResult.cached}, ms=${toolResult.executionMs}`)

        // Prepare response for model (include insights text if available)
        const responseForModel: any = { ...toolResult }
        if (toolResult.insights && toolResult.insights.length > 0) {
            responseForModel.insights_text = formatInsightsAsText(toolResult.insights)
        }

        // Send function response back to model
        result = await chat.sendMessage([{
            functionResponse: {
                name,
                response: responseForModel
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

/**
 * Stream chat with Odoo for real-time responses
 * 
 * Flow:
 * 1. Interpreter: Analiza mensaje + historial → Query estructurada
 * 2. Executor: Ejecuta query con tool call → Respuesta formateada
 */
export async function* streamChatWithOdoo(
    tenantId: string,
    systemPrompt: string,
    userMessage: string,
    history: Content[] = []
): AsyncGenerator<string, void, unknown> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)

    // ============================================
    // PASO 1: INTERPRETAR LA CONSULTA
    // ============================================
    console.log('[OdooBIAgent] Step 1: Interpreting query...')
    console.log('[OdooBIAgent] History length:', history.length)

    const { interpretQuery, interpretedQueryToToolParams } = await import('./odoo/interpreter')
    const interpreted = await interpretQuery(userMessage, history)

    console.log('[OdooBIAgent] Interpreted:', JSON.stringify(interpreted, null, 2))

    // Si necesita clarificación, preguntar al usuario
    if (interpreted.intent === 'clarify') {
        yield interpreted.needsClarification || interpreted.description
        return
    }

    // ============================================
    // PASO 2: EJECUTAR LA CONSULTA
    // ============================================
    console.log('[OdooBIAgent] Step 2: Executing query...')

    // Construir prompt mejorado con la interpretación
    const executorPrompt = `${BI_ANALYST_PROMPT}

**CONSULTA INTERPRETADA:**
${JSON.stringify(interpreted, null, 2)}

**INSTRUCCIONES:**
- Usa odoo_intelligent_query para ejecutar esta consulta
- La interpretación ya analizó el contexto y el historial
- Responde de forma clara y concisa con los datos obtenidos
- Formato: español, montos legibles, emojis para tendencias

${systemPrompt}`

    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        tools: [{ functionDeclarations: [odooIntelligentQueryDeclaration] }],
        toolConfig: {
            functionCallingConfig: {
                mode: 'AUTO' as any
            }
        },
        systemInstruction: {
            role: 'user',
            parts: [{ text: executorPrompt }]
        }
    })

    // Incluir historial para contexto adicional
    const chat = model.startChat({ history })

    // Mensaje mejorado que incluye la interpretación
    const enhancedMessage = `Consulta del usuario: "${userMessage}"

Interpretación: ${interpreted.description}
Modelo: ${interpreted.model}
Operación: ${interpreted.intent}
${interpreted.period ? `Período: ${interpreted.period}` : ''}
${interpreted.groupBy ? `Agrupar por: ${interpreted.groupBy.join(', ')}` : ''}
${interpreted.metric ? `Métrica: ${interpreted.metric}` : ''}
${interpreted.contextFromHistory ? `Contexto: ${interpreted.contextFromHistory}` : ''}

Ejecuta la consulta y responde al usuario.`

    // First turn - send message and check for function calls
    let result = await chat.sendMessage(enhancedMessage)
    let response = result.response

    // Process up to 5 function calls
    for (let i = 0; i < 5; i++) {
        const candidate = response.candidates?.[0]
        const functionCall = candidate?.content?.parts?.find(
            (part): part is Part & { functionCall: { name: string; args: Record<string, any> } } =>
                'functionCall' in part
        )

        if (!functionCall) break

        const { name, args } = functionCall.functionCall
        console.log(`[OdooBIAgent Stream] Tool call: ${name}`)

        // Show progress indicator
        const queryCount = (args as any).queries?.length || 1
        yield `🔧 Analizando datos (${queryCount} consulta${queryCount > 1 ? 's' : ''})...\n\n`

        // Execute the tool
        const toolResult = await executeIntelligentQuery(tenantId, args as any)

        if (!toolResult.success) {
            yield `❌ Error: ${toolResult.error}\n`
            return
        }

        // Prepare response for model
        const responseForModel: any = { ...toolResult }
        if (toolResult.insights && toolResult.insights.length > 0) {
            responseForModel.insights_text = formatInsightsAsText(toolResult.insights)
        }

        // ============================================
        // VALIDATION: Strict validation with fallback to clean response
        // ============================================
        console.log('[OdooBIAgent] Generating response for validation...')

        // Send function response and get complete response (non-streaming)
        const validationResult = await chat.sendMessage([{
            functionResponse: {
                name,
                response: responseForModel
            }
        }])

        const candidateText = validationResult.response.text()
        console.log('[OdooBIAgent] Response length:', candidateText.length)

        // STRICT VALIDATION: Check for fake names and wrong data
        const strictValidation = StrictValidator.validate(
            candidateText,
            toolResult,
            { userQuery: userMessage }
        )

        console.log('[OdooBIAgent] StrictValidation:', JSON.stringify({
            isClean: strictValidation.isClean,
            hasFakeNames: strictValidation.hasFakeNames,
            hasWrongPeriod: strictValidation.hasWrongPeriod,
            fakeNamesFound: strictValidation.fakeNamesFound,
            realNames: strictValidation.realNamesFromTool.slice(0, 5)
        }))

        if (!strictValidation.isClean) {
            console.warn('[OdooBIAgent] HALLUCINATION DETECTED:', strictValidation.issues)
            console.warn('[OdooBIAgent] Fake names found:', strictValidation.fakeNamesFound)

            // CRITICAL: Don't trust LLM regeneration - use clean response from tool data
            if (strictValidation.suggestedResponse) {
                console.log('[OdooBIAgent] Using clean response from tool data')
                yield strictValidation.suggestedResponse
            } else {
                // Fallback: Show raw tool data with warning
                console.log('[OdooBIAgent] Fallback: showing raw tool data')
                yield `⚠️ Datos verificados del sistema:\n\n`

                if (toolResult.grouped) {
                    const entries = Object.entries(toolResult.grouped)
                        .sort((a: any, b: any) => (b[1].total || 0) - (a[1].total || 0))
                        .slice(0, 10)

                    for (const [itemName, data] of entries) {
                        const itemData = data as any
                        yield `• *${itemName}* - $ ${Math.round(itemData.total || 0).toLocaleString('es-AR')}\n`
                    }
                }

                if (toolResult.total) {
                    yield `\n*Total:* $ ${Math.round(toolResult.total).toLocaleString('es-AR')}`
                }
            }

            response = validationResult.response
        } else {
            // Validation passed - stream the original response
            console.log('[OdooBIAgent] Validation passed, streaming response')

            // Since we already have the complete text, yield it in chunks to simulate streaming
            const chunkSize = 50
            for (let i = 0; i < candidateText.length; i += chunkSize) {
                yield candidateText.substring(i, Math.min(i + chunkSize, candidateText.length))
            }

            response = validationResult.response
        }

        // Check if there's another function call in the response
        const nextCandidate = response.candidates?.[0]
        const nextFunctionCall = nextCandidate?.content?.parts?.find(
            (part): part is Part & { functionCall: { name: string; args: Record<string, any> } } =>
                'functionCall' in part
        )

        if (!nextFunctionCall) {
            // No more function calls, we're done
            return
        }

        // Continue loop with new function call (should be rare after validation)
    }

    // If we get here without returning, yield any remaining text
    const text = response.text()
    if (text) yield text
}

// Export for testing
export { executeIntelligentQuery, BI_ANALYST_PROMPT }
