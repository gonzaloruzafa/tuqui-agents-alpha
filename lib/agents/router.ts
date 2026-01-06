/**
 * Sub-Agent Router
 * 
 * Analiza el mensaje del usuario y decide qué especialidad usar.
 * El routing es invisible al usuario - siempre habla con "Tuqui".
 */

import { getTenantClient } from '@/lib/supabase/client'

export interface SubAgent {
    id: string
    slug: string
    name: string
    description: string | null
    system_prompt: string | null
    tools: string[]
    rag_enabled: boolean
    keywords: string[]  // Para matching rápido
    priority: number    // Mayor = más prioritario
}

// Keywords predefinidos para cada tipo de especialidad
const SPECIALTY_KEYWORDS: Record<string, string[]> = {
    'erp': [
        // Ventas
        'venta', 'ventas', 'vendimos', 'factura', 'facturas', 'facturamos',
        'cliente', 'clientes', 'proveedor', 'proveedores', 
        'compra', 'compras', 'compramos', 'pedido', 'pedidos',
        'cobro', 'cobros', 'cobramos', 'pago', 'pagos', 'pagamos',
        'deuda', 'deudas', 'saldo', 'cuenta corriente',
        'vendedor', 'vendedores', 'trimestre', 'mes pasado', 'este año',
        'odoo', 'erp', 'sistema',
        // CRM / Pipeline
        'pipeline', 'oportunidad', 'oportunidades', 'lead', 'leads',
        'prospectos', 'prospecto', 'crm', 'etapa', 'etapas del pipeline',
        'cerró', 'cerramos', 'ganamos', 'perdimos', 'won', 'lost',
        // Notas de crédito / débito
        'nota de crédito', 'notas de crédito', 'nota de débito',
        'nc', 'nd', 'refund', 'reembolso',
        // Stock adicional
        'transferencia', 'transferencias', 'picking', 'pickings',
        'recepción', 'recepciones', 'despacho', 'despachos', 'almacén',
        // Términos generales ERP
        'este mes', 'el mes', 'total de',
        // Métricas / análisis
        'margen bruto', 'rentabilidad', 'ticket promedio',
        'porcentaje', 'pareto', 'top 10', 'top 5', 'ranking'
    ],
    'mercado': [
        // Explícitos MercadoLibre (alta prioridad)
        'mercadolibre', 'meli', 'mercado libre', 'en meli', 'en mercadolibre',
        // Búsqueda de precios de mercado
        'precio de mercado', 'precios de mercado', 'precio mercado', 
        'en el mercado', 'del mercado', 'vs mercado', 'versus mercado',
        // Acciones de búsqueda
        'buscame', 'buscá', 'busca', 'chequeame', 'chequeá', 'chequea', 
        'fijate', 'fijá', 'validame', 'validá',
        // Comparación de precios
        'comparar precio', 'comparar precios', 'comparar con',
        'caro', 'barato', 'competitivo', 'competencia',
        'estoy caro', 'estoy barato', 'bien de precio',
        // Intención de pricing
        'puedo subir', 'puedo bajar', 'espacio en el mercado',
        'hay espacio', 'rango de precios', 'precio mínimo', 'precio máximo',
        // Preguntas de precio
        'cuanto cuesta', 'cuánto cuesta', 'cuanto sale', 'cuánto sale',
        'cuanto vale', 'cuánto vale', 'a cuánto', 'a cuanto',
        'cuanto piden', 'cuánto piden'
    ],
    'legal': [
        'ley', 'leyes', 'legal', 'contrato', 'contratos',
        'demanda', 'abogado', 'juicio', 'indemnización',
        'despido', 'sociedad', 'sas', 'srl', 'sa',
        'estatuto', 'acta', 'poder', 'representación'
    ],
    'contador': [
        'iva', 'impuesto', 'impuestos', 'monotributo', 'afip',
        'ddjj', 'declaración jurada', 'ganancias', 'bienes personales',
        'contador', 'contable', 'balance', 'asiento', 'libro diario',
        'factura electrónica', 'cae', 'régimen'
    ],
    'documentos': [
        'documento', 'documentos', 'manual', 'manuales',
        'procedimiento', 'procedimientos', 'política', 'políticas',
        'protocolo', 'instructivo', 'guía', 'proceso interno'
    ],
    'web': [
        'buscar en internet', 'buscar en google', 'noticias',
        'cotización', 'dólar', 'dolar', 'actualidad',
        'información actualizada', 'qué pasó con', 'últimas noticias'
    ]
}

// Patterns que indican intención de COMPARAR con mercado (cross-agent)
const CROSS_AGENT_PATTERNS = [
    /comparar.*(precio|precios).*(mercado|meli)/i,
    /precio.*(mercado|meli|competencia)/i,
    /(mercado|meli).*(precio|precios)/i,
    /comparar.*(con|contra).*(mercado|meli)/i,
    /cuanto.*(cuesta|sale|vale).*(mercado|meli)/i,
    /sus precios.*(mercado|meli)/i,
    /precios.*(sus|esos|estos).*(mercado|meli)/i,
    /buscame.*(en|precio)/i,
    /chequeame.*(precio|mercado)/i,
    /fijate.*(en|precio|mercado)/i
]

// Keywords que SIEMPRE indican MeLi (override de contexto)
const MELI_OVERRIDE_KEYWORDS = [
    'mercadolibre', 'meli', 'mercado libre',
    'buscame en', 'buscá en', 'chequeame en', 'fijate en',
    'en el mercado', 'vs mercado', 'vs la competencia',
    'estoy caro', 'estoy barato', 'bien de precio',
    'puedo subir', 'hay espacio', 'caro comparado', 'barato comparado'
]

/**
 * Analiza el mensaje y retorna scores por especialidad
 */
function analyzeMessage(message: string): Record<string, number> {
    const msgLower = message.toLowerCase()
    const scores: Record<string, number> = {}

    for (const [specialty, keywords] of Object.entries(SPECIALTY_KEYWORDS)) {
        let score = 0
        for (const keyword of keywords) {
            if (msgLower.includes(keyword)) {
                // Keyword más largo = más específico = más puntos
                score += keyword.split(' ').length
            }
        }
        if (score > 0) {
            scores[specialty] = score
        }
    }

    return scores
}

/**
 * Obtiene sub-agentes configurados para el tenant
 */
export async function getSubAgents(tenantId: string): Promise<SubAgent[]> {
    const db = await getTenantClient(tenantId)

    const { data: agents, error } = await db
        .from('agents')
        .select('*')
        .eq('is_active', true)
        .order('name')

    if (error || !agents) {
        console.error('[Router] Error fetching sub-agents:', error)
        return []
    }

    // Obtener tools de cada agente
    const subAgents: SubAgent[] = []

    for (const agent of agents) {
        // Primary: use tools from agents.tools column (synced from master_agents)
        let agentTools = agent.tools || []
        
        // Fallback: if no tools in column, check agent_tools table
        if (agentTools.length === 0) {
            const { data: toolsFromTable } = await db
                .from('agent_tools')
                .select('tool_slug')
                .eq('agent_id', agent.id)
                .eq('enabled', true)
            agentTools = toolsFromTable?.map(t => t.tool_slug) || []
        }

        // Inferir keywords del slug/nombre
        const slug = agent.slug.replace('tuqui-', '')
        const inferredKeywords = SPECIALTY_KEYWORDS[slug] || []

        subAgents.push({
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
            description: agent.description,
            system_prompt: agent.system_prompt,
            tools: agentTools,
            rag_enabled: agent.rag_enabled || false,
            keywords: inferredKeywords,
            priority: agent.slug === 'tuqui' ? 0 : 1  // Tuqui principal tiene prioridad más baja (fallback)
        })
    }

    return subAgents
}

export interface RoutingResult {
    selectedAgent: SubAgent | null
    confidence: 'high' | 'medium' | 'low'
    reason: string
    scores: Record<string, number>
}

/**
 * Router principal - decide qué sub-agente usar
 */
export async function routeMessage(
    tenantId: string,
    message: string,
    conversationHistory: string[] = []
): Promise<RoutingResult> {
    // 1. Obtener sub-agentes del tenant
    const subAgents = await getSubAgents(tenantId)

    if (subAgents.length === 0) {
        return {
            selectedAgent: null,
            confidence: 'low',
            reason: 'No hay sub-agentes configurados',
            scores: {}
        }
    }

    // 2. PRIMERO: Chequear si el mensaje actual tiene keywords de override MeLi
    const msgLower = message.toLowerCase()
    const hasMeliOverride = MELI_OVERRIDE_KEYWORDS.some(kw => msgLower.includes(kw))
    
    if (hasMeliOverride) {
        console.log('[Router] MeLi override keyword detected in current message:', message.substring(0, 50))
        const meliAgent = subAgents.find(a => a.slug === 'meli')
        if (meliAgent) {
            return {
                selectedAgent: meliAgent,
                confidence: 'high',
                reason: 'Override: keyword MeLi explícito en mensaje actual',
                scores: { mercado: 10 }
            }
        }
    }

    // 3. Analizar mensaje actual con más peso que historial
    const currentMessageScores = analyzeMessage(message)
    const historyContext = conversationHistory.slice(-2).join(' ')
    const historyScores = analyzeMessage(historyContext)
    
    // Mensaje actual pesa 3x más que historial
    const scores: Record<string, number> = {}
    for (const [specialty, score] of Object.entries(currentMessageScores)) {
        scores[specialty] = (scores[specialty] || 0) + score * 3
    }
    for (const [specialty, score] of Object.entries(historyScores)) {
        scores[specialty] = (scores[specialty] || 0) + score
    }

    console.log('[Router] Message scores:', { current: currentMessageScores, history: historyScores, combined: scores })

    // 4. Detectar pattern cross-agent (comparar con mercado)
    const isCrossAgentRequest = CROSS_AGENT_PATTERNS.some(pattern => pattern.test(message))
    if (isCrossAgentRequest) {
        console.log('[Router] Cross-agent pattern detected: prioritizing meli')
        scores['mercado'] = (scores['mercado'] || 0) + 15  // Boost muy significativo
    }

    // 5. Si no hay scores claros, usar agente principal (Tuqui)
    if (Object.keys(scores).length === 0) {
        const mainAgent = subAgents.find(a => a.slug === 'tuqui') || subAgents[0]
        return {
            selectedAgent: mainAgent,
            confidence: 'low',
            reason: 'Sin keywords específicos, usando agente principal',
            scores
        }
    }

    // 6. Encontrar la especialidad con mayor score
    const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1])
    const topSpecialty = sortedScores[0][0]
    const topScore = sortedScores[0][1]

    // Mapeo de especialidad a slug de agente (actualizado para nuevos agentes)
    const specialtyToSlug: Record<string, string> = {
        'erp': 'odoo',           // Agente Odoo para consultas ERP
        'mercado': 'meli',       // Agente MeLi para precios/productos
        'legal': 'tuqui-legal',
        'contador': 'tuqui-contador',
        'documentos': 'tuqui',   // RAG se maneja en el agente principal
        'web': 'meli'            // Búsquedas web van a meli
    }

    const targetSlug = specialtyToSlug[topSpecialty] || 'tuqui'
    const selectedAgent = subAgents.find(a => a.slug === targetSlug) || 
                          subAgents.find(a => a.slug === 'tuqui') ||
                          subAgents[0]

    // 7. Determinar confianza basada en el score
    const confidence: 'high' | 'medium' | 'low' = 
        topScore >= 3 ? 'high' :
        topScore >= 2 ? 'medium' : 'low'

    console.log(`[Router] Selected: ${selectedAgent.slug} (${confidence} confidence, score: ${topScore})`)

    return {
        selectedAgent,
        confidence,
        reason: `Detectado intent "${topSpecialty}" con score ${topScore}`,
        scores
    }
}

/**
 * Combinar prompts: prompt del sub-agente + prompt base de Tuqui
 */
export function buildCombinedPrompt(
    basePrompt: string,
    subAgentPrompt: string | null,
    specialty: string
): string {
    if (!subAgentPrompt) {
        return basePrompt
    }

    return `${basePrompt}

## 🎯 ESPECIALIDAD ACTIVA: ${specialty.toUpperCase()}
${subAgentPrompt}

IMPORTANTE: Usá el conocimiento especializado de arriba para esta consulta.`
}
