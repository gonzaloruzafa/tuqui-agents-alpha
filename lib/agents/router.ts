/**
 * Sub-Agent Router
 * 
 * Analiza el mensaje del usuario y decide qué especialidad usar.
 * El routing es invisible al usuario - siempre habla con "Tuqui".
 */

import { getTenantClient } from '@/lib/supabase/tenant'

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
        'venta', 'ventas', 'vendimos', 'factura', 'facturas', 'facturamos',
        'cliente', 'clientes', 'proveedor', 'proveedores', 
        'producto', 'productos', 'stock', 'inventario',
        'compra', 'compras', 'compramos', 'pedido', 'pedidos',
        'cobro', 'cobros', 'cobramos', 'pago', 'pagos', 'pagamos',
        'deuda', 'deudas', 'saldo', 'cuenta corriente',
        'vendedor', 'vendedores', 'trimestre', 'mes pasado', 'este año',
        'odoo', 'erp', 'sistema'
    ],
    'mercado': [
        'mercadolibre', 'meli', 'publicacion', 'publicaciones',
        'precio de', 'precios de', 'buscar producto', 'cuanto cuesta',
        'cuanto sale', 'comparar precio', 'marketplace', 'mercado libre'
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
        const { data: tools } = await db
            .from('agent_tools')
            .select('tool_slug')
            .eq('agent_id', agent.id)
            .eq('enabled', true)

        // Inferir keywords del slug/nombre
        const slug = agent.slug.replace('tuqui-', '')
        const inferredKeywords = SPECIALTY_KEYWORDS[slug] || []

        subAgents.push({
            id: agent.id,
            slug: agent.slug,
            name: agent.name,
            description: agent.description,
            system_prompt: agent.system_prompt,
            tools: tools?.map(t => t.tool_slug) || [],
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

    // 2. Analizar mensaje actual + historial reciente
    const fullContext = [...conversationHistory.slice(-3), message].join(' ')
    const scores = analyzeMessage(fullContext)

    console.log('[Router] Message scores:', scores)

    // 3. Si no hay scores claros, usar agente principal (Tuqui)
    if (Object.keys(scores).length === 0) {
        const mainAgent = subAgents.find(a => a.slug === 'tuqui') || subAgents[0]
        return {
            selectedAgent: mainAgent,
            confidence: 'low',
            reason: 'Sin keywords específicos, usando agente principal',
            scores
        }
    }

    // 4. Encontrar la especialidad con mayor score
    const sortedScores = Object.entries(scores).sort((a, b) => b[1] - a[1])
    const topSpecialty = sortedScores[0][0]
    const topScore = sortedScores[0][1]

    // Mapeo de especialidad a slug de agente
    const specialtyToSlug: Record<string, string> = {
        'erp': 'tuqui-odoo',
        'mercado': 'tuqui-mercadolibre',
        'legal': 'tuqui-legal',
        'contador': 'tuqui-contador',
        'documentos': 'tuqui',  // RAG se maneja en el agente principal
        'web': 'tuqui'  // Web search también
    }

    const targetSlug = specialtyToSlug[topSpecialty] || 'tuqui'
    const selectedAgent = subAgents.find(a => a.slug === targetSlug) || 
                          subAgents.find(a => a.slug === 'tuqui') ||
                          subAgents[0]

    // 5. Determinar confianza basada en el score
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
