/**
 * Intent Detection & Agent Routing
 * 
 * Detecta la intención del usuario y decide qué agente usar.
 * Tuqui es el default, pero puede delegar a agentes especializados.
 */

export interface RoutingDecision {
    agentSlug: string
    reason: string
    confidence: 'high' | 'medium' | 'low'
}

// Keywords que activan el agente MeLi
const MELI_KEYWORDS = [
    'precio', 'precios', 
    'cuánto sale', 'cuanto sale', 'cuánto cuesta', 'cuanto cuesta',
    'mercadolibre', 'mercado libre', 'meli',
    'comparar precios', 'comparar precio',
    'competencia', 'productos similares',
    'más barato', 'mas barato', 'más económico', 'mas economico',
    'dónde comprar', 'donde comprar',
    'ofertas de', 'buscar producto'
]

// Keywords que fuerzan Odoo/ERP
const ODOO_KEYWORDS = [
    'vendimos', 'ventas', 'facturación', 'facturacion',
    'clientes', 'proveedores', 'deuda', 'deudas',
    'stock', 'inventario', 'pedidos',
    'facturas', 'presupuestos', 'cotizaciones',
    'cuenta corriente', 'saldo'
]

/**
 * Detecta el agente más apropiado para el mensaje
 */
export function detectIntent(message: string, availableAgents: string[]): RoutingDecision {
    const lowerMessage = message.toLowerCase()
    
    // Check MeLi keywords
    if (availableAgents.includes('meli')) {
        const meliMatch = MELI_KEYWORDS.some(kw => lowerMessage.includes(kw))
        if (meliMatch) {
            // Check it's not asking about internal data (ventas propias vs precios de mercado)
            const isInternalQuery = ODOO_KEYWORDS.some(kw => lowerMessage.includes(kw))
            if (!isInternalQuery) {
                return {
                    agentSlug: 'meli',
                    reason: 'Detected price/product search intent',
                    confidence: 'high'
                }
            }
        }
    }
    
    // Check Odoo keywords - pero solo si preguntan por datos internos
    if (availableAgents.includes('tuqui')) {
        const odooMatch = ODOO_KEYWORDS.some(kw => lowerMessage.includes(kw))
        if (odooMatch) {
            return {
                agentSlug: 'tuqui',
                reason: 'Detected ERP/internal data query',
                confidence: 'high'
            }
        }
    }
    
    // Default: Tuqui handles everything else
    return {
        agentSlug: 'tuqui',
        reason: 'Default orchestrator',
        confidence: 'medium'
    }
}

/**
 * Dado un mensaje y el historial, decide si cambiar de agente
 * Útil para conversaciones donde el contexto cambia
 */
export function shouldSwitchAgent(
    currentAgent: string,
    newMessage: string,
    messageHistory: Array<{ role: string; content: string }>,
    availableAgents: string[]
): RoutingDecision | null {
    const decision = detectIntent(newMessage, availableAgents)
    
    // Solo cambiar si el nuevo agente es diferente y tiene alta confianza
    if (decision.agentSlug !== currentAgent && decision.confidence === 'high') {
        return decision
    }
    
    return null
}

/**
 * Combina el prompt base del agente con contexto adicional
 */
export function enrichAgentPrompt(
    basePrompt: string,
    context: {
        companyContext?: string | null
        ragDocuments?: string[]
        previousAgentResponse?: string
    }
): string {
    let enrichedPrompt = basePrompt
    
    if (context.companyContext) {
        enrichedPrompt += `\n\n## CONTEXTO DE LA EMPRESA\n${context.companyContext}`
    }
    
    if (context.ragDocuments && context.ragDocuments.length > 0) {
        enrichedPrompt += `\n\n## DOCUMENTOS RELEVANTES\n${context.ragDocuments.map(d => `- ${d}`).join('\n')}`
    }
    
    if (context.previousAgentResponse) {
        enrichedPrompt += `\n\n## CONTEXTO PREVIO\nOtro agente ya procesó parte de esta consulta:\n${context.previousAgentResponse}`
    }
    
    return enrichedPrompt
}
