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

### 5. MODELOS SEGÚN CONTEXTO:
- "ventas" / "vendedores" / "quién vendió" → sale.order
- "productos" / "qué se vendió" → sale.order.line (Suele usarse para detalles de ventas)
- "facturas" → account.move
- "stock" → stock.quant

**OUTPUT ESPERADO:**
Responde SOLO con el JSON:
{ 
  "intent": "aggregate" | "search" | "count" | "discover" | "clarify",
  "description": "Descripción",
  "model": "model.name",
  "period": "periodo detectado/persistido",
  "filters": "filtros (ej: 'user_id: Martin Travella')",
  "groupBy": ["campo"],
  "metric": "campo:operacion",
  "contextFromHistory": "Por qué se tomó esta decisión"
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
