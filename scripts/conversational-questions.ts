/**
 * 100 Conversational Test Questions for Odoo BI Agent
 * 
 * Incluye preguntas con referencias contextuales para probar el intérprete
 */

export interface ConversationalTest {
    id: number
    messages: Array<{ role: 'user' | 'assistant'; content: string }>
    expectedBehavior: string
    category: string
}

// Preguntas simples (sin contexto)
export const SIMPLE_QUESTIONS: string[] = [
    // Ventas - Totales
    "dame las ventas de abril 2025",
    "cuánto vendimos este mes",
    "total de ventas del año",
    "facturación de diciembre",
    "ventas del último trimestre",
    
    // Ventas - Rankings
    "top 10 clientes por ventas",
    "cuáles son los productos más vendidos",
    "qué vendedor vendió más",
    "ranking de productos por cantidad",
    "mejores clientes del año",
    
    // Deuda y Cobranzas
    "cuánta deuda tenemos",
    "quién nos debe más plata",
    "facturas vencidas",
    "top 10 morosos",
    "deuda mayor a 60 días",
    
    // Stock
    "productos con stock bajo",
    "cuánto stock tenemos",
    "productos sin movimiento",
    "inventario total",
    
    // Compras
    "cuánto compramos este mes",
    "principales proveedores",
    "compras pendientes",
    
    // CRM
    "oportunidades abiertas",
    "leads del mes",
    "pipeline de ventas",
    
    // Contabilidad
    "facturas del mes",
    "pagos recibidos hoy",
    "cobros de la semana",
]

// Conversaciones con contexto (pregunta + follow-up)
export const CONVERSATIONAL_TESTS: ConversationalTest[] = [
    // === VENTAS CON FOLLOW-UP ===
    {
        id: 1,
        messages: [
            { role: 'user', content: 'dame las ventas de abril 2025' },
            { role: 'assistant', content: 'Las ventas de abril 2025 suman $28.957.904' },
            { role: 'user', content: 'desglosame por vendedor' }
        ],
        expectedBehavior: 'Debería mantener el filtro de abril 2025 y agregar groupBy user_id',
        category: 'context-groupby'
    },
    {
        id: 2,
        messages: [
            { role: 'user', content: 'top 10 productos más vendidos' },
            { role: 'assistant', content: '1. Producto A - $100M\n2. Producto B - $80M...' },
            { role: 'user', content: 'y el segundo?' }
        ],
        expectedBehavior: 'Debería entender que pregunta por el segundo producto del ranking',
        category: 'context-ordinal'
    },
    {
        id: 3,
        messages: [
            { role: 'user', content: 'cuánto vendimos en enero' },
            { role: 'assistant', content: 'En enero vendimos $50M' },
            { role: 'user', content: 'y en febrero?' }
        ],
        expectedBehavior: 'Debería entender que pregunta ventas de febrero',
        category: 'context-period'
    },
    {
        id: 4,
        messages: [
            { role: 'user', content: 'ventas de este año por trimestre' },
            { role: 'assistant', content: 'Q1: $100M, Q2: $120M...' },
            { role: 'user', content: 'dame más detalle del Q2' }
        ],
        expectedBehavior: 'Debería filtrar por Q2 y dar más detalle',
        category: 'context-drill-down'
    },
    {
        id: 5,
        messages: [
            { role: 'user', content: 'quién es nuestro mejor cliente' },
            { role: 'assistant', content: 'El mejor cliente es Hospital X con $49M' },
            { role: 'user', content: 'qué nos compró?' }
        ],
        expectedBehavior: 'Debería buscar productos comprados por Hospital X',
        category: 'context-entity'
    },
    
    // === DEUDA CON FOLLOW-UP ===
    {
        id: 6,
        messages: [
            { role: 'user', content: 'cuánta deuda tenemos' },
            { role: 'assistant', content: 'La deuda total es $150M' },
            { role: 'user', content: 'de más de 90 días?' }
        ],
        expectedBehavior: 'Debería filtrar deuda > 90 días',
        category: 'context-filter'
    },
    {
        id: 7,
        messages: [
            { role: 'user', content: 'top 5 morosos' },
            { role: 'assistant', content: '1. Cliente A - $50M...' },
            { role: 'user', content: 'pasame los datos del primero' }
        ],
        expectedBehavior: 'Debería dar detalle del Cliente A',
        category: 'context-detail'
    },
    
    // === PRODUCTOS CON FOLLOW-UP ===
    {
        id: 8,
        messages: [
            { role: 'user', content: 'producto más vendido de 2025' },
            { role: 'assistant', content: 'El producto más vendido es Scanner XYZ' },
            { role: 'user', content: 'cuántas unidades?' }
        ],
        expectedBehavior: 'Debería dar cantidad vendida del Scanner XYZ',
        category: 'context-metric'
    },
    {
        id: 9,
        messages: [
            { role: 'user', content: 'productos más vendidos' },
            { role: 'assistant', content: 'Top 10 productos...' },
            { role: 'user', content: 'ahora por monto, no cantidad' }
        ],
        expectedBehavior: 'Debería cambiar métrica de qty a amount',
        category: 'context-metric-change'
    },
    
    // === REFERENCIAS AMBIGUAS ===
    {
        id: 10,
        messages: [
            { role: 'user', content: 'ventas de abril' },
            { role: 'assistant', content: 'Ventas de abril: $28M' },
            { role: 'user', content: 'compará con marzo' }
        ],
        expectedBehavior: 'Debería comparar abril vs marzo',
        category: 'context-compare'
    },
    {
        id: 11,
        messages: [
            { role: 'user', content: 'cuántos clientes tenemos' },
            { role: 'assistant', content: 'Tenemos 45.000 clientes' },
            { role: 'user', content: 'activos?' }
        ],
        expectedBehavior: 'Debería filtrar solo clientes activos',
        category: 'context-filter-add'
    },
    {
        id: 12,
        messages: [
            { role: 'user', content: 'facturas pendientes' },
            { role: 'assistant', content: 'Hay 535 facturas pendientes' },
            { role: 'user', content: 'del mes pasado' }
        ],
        expectedBehavior: 'Debería filtrar facturas pendientes del mes pasado',
        category: 'context-period-add'
    },
    
    // === CONTINUACIONES SIMPLES ===
    {
        id: 13,
        messages: [
            { role: 'user', content: 'top 5 vendedores' },
            { role: 'assistant', content: '1. Juan, 2. María...' },
            { role: 'user', content: 'dame el top 10' }
        ],
        expectedBehavior: 'Debería extender a top 10',
        category: 'context-extend'
    },
    {
        id: 14,
        messages: [
            { role: 'user', content: 'ventas por cliente' },
            { role: 'assistant', content: 'Ventas agrupadas por cliente...' },
            { role: 'user', content: 'mejor por vendedor' }
        ],
        expectedBehavior: 'Debería cambiar groupBy de partner_id a user_id',
        category: 'context-groupby-change'
    },
    {
        id: 15,
        messages: [
            { role: 'user', content: 'listame las últimas 10 ventas' },
            { role: 'assistant', content: 'Últimas 10 ventas...' },
            { role: 'user', content: 'las de más de $1M' }
        ],
        expectedBehavior: 'Debería filtrar ventas > $1M',
        category: 'context-filter-amount'
    },
    
    // === PREGUNTAS CORTAS ===
    {
        id: 16,
        messages: [
            { role: 'user', content: 'ventas de hoy' },
            { role: 'assistant', content: 'Hoy vendimos $5M' },
            { role: 'user', content: 'y ayer?' }
        ],
        expectedBehavior: 'Debería dar ventas de ayer',
        category: 'context-period-relative'
    },
    {
        id: 17,
        messages: [
            { role: 'user', content: 'mejor cliente' },
            { role: 'assistant', content: 'Hospital X' },
            { role: 'user', content: 'del año pasado' }
        ],
        expectedBehavior: 'Debería dar mejor cliente de 2024',
        category: 'context-period-change'
    },
    {
        id: 18,
        messages: [
            { role: 'user', content: 'productos sin stock' },
            { role: 'assistant', content: '50 productos sin stock' },
            { role: 'user', content: 'cuáles son los más importantes?' }
        ],
        expectedBehavior: 'Debería rankear productos sin stock por importancia/ventas',
        category: 'context-rank'
    },
    
    // === CORRECCIONES ===
    {
        id: 19,
        messages: [
            { role: 'user', content: 'ventas de abril' },
            { role: 'assistant', content: 'Ventas de abril 2025...' },
            { role: 'user', content: 'no, de 2024' }
        ],
        expectedBehavior: 'Debería corregir a abril 2024',
        category: 'context-correction'
    },
    {
        id: 20,
        messages: [
            { role: 'user', content: 'clientes morosos' },
            { role: 'assistant', content: 'Top morosos...' },
            { role: 'user', content: 'solo los de Buenos Aires' }
        ],
        expectedBehavior: 'Debería filtrar por ubicación Buenos Aires',
        category: 'context-location-filter'
    },
]

// Preguntas problemáticas que suelen fallar
export const EDGE_CASES: string[] = [
    // Ambiguas
    "pasame eso",
    "dale",
    "más",
    "otro",
    "el anterior",
    
    // Muy cortas
    "ventas",
    "clientes",
    "deuda",
    "stock",
    
    // Con múltiples intenciones
    "ventas y compras del mes",
    "clientes que compran y deben",
    "productos vendidos y en stock",
    
    // Comparaciones
    "vendimos más o menos que el mes pasado?",
    "subieron las ventas?",
    "mejor o peor que 2024?",
    
    // Cálculos
    "ticket promedio",
    "margen de ganancia",
    "días promedio de cobranza",
    "rotación de inventario",
]

// Función para obtener todas las preguntas simples
export function getAllSimpleQuestions(): string[] {
    return SIMPLE_QUESTIONS
}

// Función para obtener tests conversacionales
export function getConversationalTests(): ConversationalTest[] {
    return CONVERSATIONAL_TESTS
}

// Función para obtener casos edge
export function getEdgeCases(): string[] {
    return EDGE_CASES
}

// Total de preguntas
export const TOTAL_QUESTIONS = SIMPLE_QUESTIONS.length + CONVERSATIONAL_TESTS.length + EDGE_CASES.length

console.log(`Total preguntas: ${TOTAL_QUESTIONS}`)
console.log(`- Simples: ${SIMPLE_QUESTIONS.length}`)
console.log(`- Conversacionales: ${CONVERSATIONAL_TESTS.length}`)  
console.log(`- Edge cases: ${EDGE_CASES.length}`)
