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

### 1. PERSISTENCIA TEMPORAL (REGLA DE ORO)
Si el usuario definió un período anteriormente (ej: "2025"), MANTENERLO hasta que se cambie.

### 2. EXTRACCIÓN DE ENTIDADES POR NOMBRE
Usa field: 'Nombre' (sin IDs). Odoo se encargará de buscar el nombre.
Ejemplo: user_id: 'Denise Grivarello'

### 3. PREGUNTAS DE CONFIRMACIÓN (pero esos son...?)
Si el usuario pregunta "pero esos son de X?", quiere REPETIR la consulta anterior pero asegurando el filtro de X.
- NUNCA devuelvas "clarify" si el usuario está cuestionando un resultado previo. 
- RE-EJECUTA la consulta con el filtro reforzado.

### 4. DESGLOSES Y PROFUNDIZACIÓN
- "pero qué productos?" (tras ventas de Martin) → MANTENER user_id: 'Martin' + period: '2025' + model: 'sale.order.line' + groupBy: ['product_id'].
- "el segundo?" o "cuanto?" después de un ranking → EXTRAER la entidad del segundo puesto del historial y consultar por ella.

### 5. REFERENCIAS IMPLÍCITAS (CRÍTICO)
Cuando el usuario dice:
- "qué vendió martin?" después de un ranking → model: 'sale.order.line' + filters: 'user_id: Martin [apellido del historial]'
- "cuánto compramos?" después de hablar de compras → model: 'purchase.order', mantener período
- "desglosame eso" → repetir última consulta pero con más detalle (más groupBy o search en vez de aggregate)
- "compara con el mes anterior" → agregar compare: 'mom' a la consulta previa

### 6. MODELOS SEGÚN CONTEXTO:
- "ventas" / "vendedores" / "quién vendió" → sale.order
- "compras" / "proveedores" / "qué compramos" → purchase.order
- "productos vendidos" / "qué se vendió" / "qué vendió [nombre]" → sale.order.line (para detalle de líneas)
- "facturas" → account.move
- "stock" → stock.quant

### 7. EVITAR CLARIFICACIONES INNECESARIAS
NUNCA pidas clarificación si:
- El modelo/operación se puede inferir del contexto
- El período ya fue definido previamente
- La entidad (vendedor, cliente) fue mencionada antes

**OUTPUT ESPERADO:**
Responde SOLO con el JSON:
{ 
  "intent": "aggregate" | "search" | "count" | "discover" | "clarify",
  "description": "Descripción breve de la consulta",
  "model": "model.name",
  "period": "periodo detectado/persistido",
  "filters": "filtros (ej: 'user_id: Martin Travella, state: sale')",
  "groupBy": ["campo"],
  "metric": "campo:operacion (ej: price_total:sum)",
  "limit": 10,
  "orderBy": "campo desc",
  "contextFromHistory": "Explicación de por qué se tomó esta decisión"
}

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

    // Construir contexto del historial - ser más generoso con el contexto
    let historyContext = ''
    if (history.length > 0) {
        const recentHistory = history.slice(-15) // Últimos 15 mensajes para mejor contexto
        historyContext = '\n\n**HISTORIAL DE CONVERSACIÓN (Analiza para mantener contexto):**\n'
        for (const msg of recentHistory) {
            const role = msg.role === 'model' ? 'Asistente' : 'Usuario'
            const text = msg.parts.map((p: any) => p.text || '').join('')
            if (text) {
                // Incluir más contenido para capturar nombres, números, etc.
                historyContext += `${role}: ${text.substring(0, 800)}\n`
            }
        }
    }

    const prompt = `${INTERPRETER_PROMPT}${historyContext}\n\n**MENSAJE ACTUAL DEL USUARIO:**\n${userMessage}\n\nRecuerda: Si hay entidades (nombres, períodos, productos) en el historial que el usuario está referenciando implícitamente, USARLAS. NO pedir clarificación si la info está en el historial.`

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
