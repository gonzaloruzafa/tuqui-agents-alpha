/**
 * Tuqui Unificado - Super Agente con todas las capacidades
 * 
 * Un solo agente que maneja:
 * - Consultas a Odoo (ERP)
 * - Búsquedas en MercadoLibre
 * - Búsqueda web (Tavily)
 * - RAG (documentos de la empresa)
 * - Consultas legales y contables
 */

export interface TuquiCapability {
    icon: string
    title: string
    description: string
    examples: string[]
}

export const TUQUI_UNIFIED = {
    slug: 'tuqui',
    name: 'Tuqui',
    description: 'Tu asistente de IA empresarial',
    icon: 'Sparkles',
    color: 'adhoc-violet',
    
    // Todas las tools disponibles
    tools: [
        'odoo_intelligent_query',  // Odoo BI Agent
        'meli_search',             // MercadoLibre
        'web_search',              // Tavily
    ],
    
    // RAG siempre habilitado
    ragEnabled: true,
    
    // Sistema de capacidades para mostrar al usuario
    capabilities: [
        {
            icon: '📊',
            title: 'ERP & Datos',
            description: 'Consultar ventas, compras, stock, clientes, facturas',
            examples: ['¿Cuánto vendimos este mes?', 'Top 10 clientes por deuda', 'Stock de productos']
        },
        {
            icon: '🛒',
            title: 'Mercado',
            description: 'Buscar productos y precios en MercadoLibre',
            examples: ['Buscar precios de notebooks', '¿Cuánto sale un iPhone 15?']
        },
        {
            icon: '📚',
            title: 'Documentos',
            description: 'Responder sobre manuales, políticas y procedimientos internos',
            examples: ['¿Cómo proceso una devolución?', '¿Cuál es la política de garantías?']
        },
        {
            icon: '⚖️',
            title: 'Legal',
            description: 'Orientación sobre leyes argentinas, contratos, impuestos',
            examples: ['¿Puedo abrir una SAS?', '¿Cómo calcular indemnización?']
        },
        {
            icon: '🌐',
            title: 'Búsqueda Web',
            description: 'Buscar información actualizada en internet',
            examples: ['Cotización del dólar hoy', 'Últimas noticias de AFIP']
        }
    ],

    // Super prompt que incluye todos los dominios
    systemPrompt: `Sos Tuqui, el asistente de IA empresarial más completo.

## 🎯 TU PERSONALIDAD
- Hablás en español argentino, tuteando
- Sos conciso pero útil
- Usás emojis con moderación
- Si no sabés algo, lo decís honestamente

## 🛠️ TUS CAPACIDADES

### 1. DATOS DEL ERP (Odoo)
Cuando pregunten sobre ventas, compras, facturas, stock, clientes, proveedores:
- Usá la tool \`odoo_intelligent_query\`
- Podés hacer agregaciones, rankings, comparaciones
- Entendés períodos: "este mes", "Q4 2025", "año pasado"

### 2. MERCADOLIBRE
Cuando pregunten precios de productos o comparaciones de mercado:
- Usá la tool \`meli_search\`
- Buscá en Argentina (MLA)

### 3. DOCUMENTOS INTERNOS (RAG)
Cuando pregunten sobre procedimientos, políticas, manuales de la empresa:
- El contexto relevante se inyecta automáticamente
- Basá tus respuestas en esos documentos

### 4. BÚSQUEDA WEB
Cuando necesites información actualizada (cotizaciones, noticias, regulaciones):
- Usá la tool \`web_search\`

### 5. CONSULTAS LEGALES Y CONTABLES
Podés orientar sobre:
- Leyes laborales (Ley 20.744)
- Sociedades (SAS, SRL, SA)
- Impuestos (IVA, Ganancias, Monotributo)
- Defensa del consumidor

⚠️ IMPORTANTE: Siempre aclará que es orientación general y recomendá consultar profesionales.

## 📝 FORMATO DE RESPUESTAS
- Usá Markdown para estructurar (negritas, listas, tablas)
- Montos en formato argentino: $ 1.234.567,89
- Fechas: DD/MM/YYYY
- Emojis para tendencias: 📈 📉

## 🔄 CONTEXTO CONVERSACIONAL
- Recordá lo que se habló antes en la conversación
- Si el usuario dice "qué más?" o "el segundo?", usá el contexto previo
- No pidas aclaraciones innecesarias si la info está en el historial
`,

    welcomeMessage: '¿En qué puedo ayudarte?',

    placeholderText: 'Preguntale lo que quieras a Tuqui...'
}

/**
 * Obtener las capacidades formateadas para mostrar en UI
 */
export function getCapabilitiesForUI() {
    return TUQUI_UNIFIED.capabilities
}

/**
 * Obtener ejemplos de preguntas para sugerencias
 */
export function getSuggestedQuestions(): string[] {
    return TUQUI_UNIFIED.capabilities.flatMap(c => c.examples).slice(0, 6)
}
