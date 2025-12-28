/**
 * Odoo Query Interpreter v2.0
 * 
 * Primera capa de procesamiento que interpreta la intención del usuario
 * considerando el historial de conversación y produce una query estructurada.
 * 
 * Actualizado con mejoras de contexto conversacional.
 */

import { GoogleGenerativeAI, Content } from '@google/generative-ai'

// ============================================
// TYPES
// ============================================

export interface InterpretedQuery {
    intent: 'aggregate' | 'search' | 'count' | 'discover' | 'clarify'
    description: string
    model: string
    period?: string
    metric?: string
    groupBy?: string[]
    filters?: string
    limit?: number
    orderBy?: string
    contextFromHistory?: string
    needsClarification?: string
}

// ============================================
// INTERPRETER PROMPT v2.0
// ============================================

const INTERPRETER_PROMPT = `Eres un intérprete experto de consultas de negocio para Odoo ERP.

**TU TRABAJO:**
Analizar el mensaje del usuario junto con el historial de conversación y producir una query estructurada en JSON.

## 🔄 MANEJO DE CONTEXTO CONVERSACIONAL - CRÍTICO

### REGLA FUNDAMENTAL:
Si el mensaje del usuario es CORTO (< 30 caracteres) o contiene palabras contextuales, SIEMPRE revisar el historial antes de responder.

### 1. Referencias ORDINALES (el primero, el segundo, etc.)

Cuando el usuario dice "el primero", "el segundo", "el tercero", "el último", etc., se refiere a un elemento de la LISTA que mostró el asistente anteriormente.

**ACCIÓN:** Extraer el ID o nombre del elemento N de la respuesta anterior y hacer la consulta usando ese dato.

Ejemplo:
- Asistente mostró: "1. Cliente A, 2. Cliente B, 3. Cliente C"
- Usuario: "el segundo cuánto nos debe?"
- → Buscar deuda del SEGUNDO cliente (Cliente B) de la lista anterior

### 2. Desgloses (desglosame, por vendedor, por mes)

Cuando el usuario dice "desglosame", "por vendedor", "por mes", "por producto", etc., quiere la MISMA consulta anterior pero con un AGRUPAMIENTO adicional.

**ACCIÓN:** Tomar la consulta anterior, mantener todos los filtros, agregar groupBy.

Ejemplo:
- Usuario pidió: "ventas de diciembre"
- Asistente respondió: "$5.000.000"
- Usuario: "desglosame por vendedor"
- → REPETIR consulta de ventas de diciembre + groupBy: ["user_id"]

### 3. Modificadores (pero, sin, excluyendo)

Cuando el usuario dice "pero", "sin", "excepto", "sin contar", quiere MODIFICAR la consulta anterior.

**ACCIÓN:** Tomar consulta anterior, agregar/modificar filtros.

Ejemplo:
- Asistente mostró ranking con "Sin Asignar" primero
- Usuario: "pero sin el sin asignar"
- → Agregar filtro user_id != False

### 4. Continuaciones Temporales (y de mayo?, y el mes pasado?)

Cuando el usuario dice "y de mayo?", "y el mes pasado?", "y este año?", quiere una consulta SIMILAR con parámetros de tiempo diferentes.

**ACCIÓN:** Repetir estructura de consulta exacta con nuevo período.

Ejemplo:
- Usuario pidió: "ventas de noviembre"
- Usuario: "y de diciembre?"
- → MISMA consulta pero con período diciembre

### 5. Profundización (más detalle, quiénes son, mostrame)

Cuando el usuario pide más detalle sobre un resultado agregado, quiere VER REGISTROS INDIVIDUALES.

**ACCIÓN:** Cambiar de aggregate a search para mostrar registros.

Ejemplo:
- Asistente: "Hay 5 clientes con deuda vencida"
- Usuario: "quiénes son?"
- → Cambiar a intent: "search" para listar los 5 clientes

### 6. Referencias Pronominales (ese, esa, de él, de esos)

Cuando el usuario usa "ese cliente", "de él", "sus facturas", "de esos", se refiere a la última entidad mencionada.

**ACCIÓN:** Identificar la entidad referenciada del historial y usar su ID en la nueva consulta.

Ejemplo:
- Asistente: "El top vendedor es Martín con $50M"
- Usuario: "qué productos vende él?"
- → Buscar productos filtrados por user_id = [ID de Martín del contexto]

### NUNCA pedir clarificación si:
- El historial tiene la información necesaria
- El usuario dice "desglosame" después de una consulta agregada
- El usuario usa ordinales y hay una lista previa
- El usuario dice "por vendedor/producto/mes" después de un total
- El usuario dice "y de X?" siguiendo un patrón temporal
- El usuario dice "mostrame las facturas del primero" (usar primer elemento)

### SÍ pedir clarificación si:
- Es el PRIMER mensaje y es ambiguo
- No hay historial relevante en los últimos 5 mensajes
- Realmente no se puede inferir la intención

**MODELOS según contexto:**
- "ventas" / "pedidos" / "vendimos" → sale.order
- "productos más vendidos" → sale.order.line (groupBy: product_id)
- "facturas" / "facturación" / "deuda" → account.move
- "pagos" / "cobramos" / "cobros" → account.payment
- "clientes" / "compradores" → res.partner o groupBy partner_id
- "vendedores" / "por vendedor" → groupBy user_id
- "stock" / "inventario" / "existencias" → stock.quant
- "movimientos de stock" / "ajustes" → stock.move
- "entregas" / "pickings" → stock.picking
- "compras" / "proveedores" → purchase.order
- "oportunidades" / "CRM" / "leads" → crm.lead
- "actividades" / "tareas pendientes" → mail.activity

**GroupBy permitidos (CRÍTICO):**
- PERMITIDOS: "partner_id", "user_id", "product_id", "stage_id", "state", "team_id", "categ_id"
- PERMITIDOS para fechas: "date_order:quarter", "date_order:year", "invoice_date:quarter", "invoice_date:year"
- PROHIBIDO: "date_order:month", "invoice_date:month" (causa error en Odoo)

**EJEMPLOS:**

Usuario: "dame las ventas de abril 2025"
→ { "intent": "aggregate", "description": "Total de ventas de abril 2025", "model": "sale.order", "period": "abril 2025", "metric": "amount_total:sum" }

Usuario: "desglosame por vendedor" (después de consulta de ventas)
→ { "intent": "aggregate", "description": "Ventas agrupadas por vendedor", "model": "sale.order", "period": "abril 2025", "metric": "amount_total:sum", "groupBy": ["user_id"], "contextFromHistory": "Agregando groupBy a la consulta anterior" }

Usuario: "el tercero cuánto vendió?" (después de un ranking)
→ { "intent": "aggregate", "description": "Ventas del tercer vendedor del ranking", "model": "sale.order", "metric": "amount_total:sum", "filters": "user_id = [ID del tercero]", "contextFromHistory": "Consultando el 3er elemento del ranking anterior" }

**SI NO ESTÁ CLARO:**
Solo si realmente no hay contexto, usa:
{ "intent": "clarify", "description": "Pregunta de clarificación", "needsClarification": "¿Te refieres a X o Y?" }

**OUTPUT:**
Responde SOLO con el JSON, sin explicaciones adicionales.
La fecha actual es ${new Date().toLocaleDateString('es-AR', { year: 'numeric', month: 'long', day: 'numeric' })}.
`

// ============================================
// INTERPRETER FUNCTION
// ============================================

export async function interpretQuery(
    userMessage: string,
    history: Content[] = []
): Promise<InterpretedQuery> {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    
    const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: {
            temperature: 0.1, // Muy determinístico
            responseMimeType: 'application/json'
        }
    })
    
    // Construir contexto del historial
    let historyContext = ''
    if (history.length > 0) {
        const recentHistory = history.slice(-10) // Últimos 10 mensajes
        historyContext = '\n\n**HISTORIAL DE CONVERSACIÓN:**\n'
        for (const msg of recentHistory) {
            const role = msg.role === 'model' ? 'Asistente' : 'Usuario'
            const text = msg.parts.map((p: any) => p.text || '').join('')
            if (text) {
                historyContext += `${role}: ${text.substring(0, 500)}\n`
            }
        }
    }
    
    const prompt = `${INTERPRETER_PROMPT}${historyContext}\n\n**MENSAJE ACTUAL DEL USUARIO:**\n${userMessage}`
    
    try {
        const result = await model.generateContent(prompt)
        const response = result.response.text()
        
        // Parse JSON response
        const parsed = JSON.parse(response) as InterpretedQuery
        
        console.log('[Interpreter] Input:', userMessage)
        console.log('[Interpreter] Output:', JSON.stringify(parsed, null, 2))
        
        return parsed
    } catch (error: any) {
        console.error('[Interpreter] Error:', error.message)
        
        // Fallback: devolver query básica
        return {
            intent: 'search',
            description: userMessage,
            model: 'sale.order',
            filters: userMessage
        }
    }
}

/**
 * Convierte InterpretedQuery a parámetros para odoo_intelligent_query
 */
export function interpretedQueryToToolParams(query: InterpretedQuery): any {
    const params: any = {
        queries: [{
            id: 'main_query',
            model: query.model,
            operation: query.intent === 'clarify' ? 'search' : query.intent,
            filters: [query.period, query.filters].filter(Boolean).join(' '),
            limit: query.limit || (query.intent === 'search' ? 50 : 100)
        }]
    }
    
    if (query.groupBy && query.groupBy.length > 0) {
        params.queries[0].groupBy = query.groupBy
    }
    
    if (query.orderBy) {
        params.queries[0].orderBy = query.orderBy
    }
    
    // Para aggregates, asegurar que tenga aggregateField
    if (query.intent === 'aggregate' && query.metric) {
        params.queries[0].aggregateField = query.metric
    }
    
    return params
}
