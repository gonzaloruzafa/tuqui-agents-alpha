// Mock functions to avoid DB dependency for logic verification
async function getAgentMock(slug: string): Promise<any> {
    if (slug === 'juridico') {
        return {
            slug: 'juridico',
            system_prompt: 'Sos un asistente legal experto en Argentina.',
            tools: ['legal_search'],
            rag_enabled: true
        }
    }
    if (slug === 'odoo-bi') {
        return {
            slug: 'odoo-bi',
            system_prompt: 'Sos un experto en inteligencia de negocios y Odoo.',
            tools: ['odoo_search_read', 'odoo_read_group'],
            rag_enabled: false
        }
    }
    return null
}

async function getCompanyContextMock(): Promise<string | null> {
    return "Adhoc es una empresa de software experta en Odoo."
}

async function verifyContext(agentSlug: string, messages: any[]) {
    console.log(`\n--- VERIFYING CONTEXT FOR AGENT: ${agentSlug} ---`)

    // 1. Get Agent (Mocked)
    const agent = await getAgentMock(agentSlug)
    if (!agent) {
        console.error(`Agent ${agentSlug} not found`)
        return
    }

    // 2. Build System Prompt
    let systemSystem = agent.system_prompt || 'Sos un asistente útil.'
    const companyContext = await getCompanyContextMock()
    if (companyContext) {
        systemSystem += `\n\nCONTEXTO DE LA EMPRESA:\n${companyContext}`
        console.log('[LOG] Company context injected')
    }
    systemSystem += '\n\nIMPORTANTE: Estás en una conversación fluida. Usa siempre los mensajes anteriores para entender referencias como "él", "eso", "ahora", o "qué productos?". No pidas aclaraciones si el contexto ya está en el historial.'

    console.log('\nSYSTEM PROMPT RESULT:')
    console.log(systemSystem)

    // 3. Process History Logic (Replicating route.ts)
    const hasOdooTools = agent.tools?.some((t: string) => t.startsWith('odoo'))

    if (hasOdooTools) {
        console.log('\n[PATH: ODOO NATIVE SDK LOGIC]')
        const MAX_HISTORY = 20
        const historyMessages = messages.slice(
            Math.max(0, messages.length - 1 - MAX_HISTORY),
            -1
        )
        const history = historyMessages.map((m: any) => {
            let content = m.content
            if (m.role === 'assistant' && m.tool_calls) {
                try {
                    const tools = typeof m.tool_calls === 'string' ? JSON.parse(m.tool_calls) : m.tool_calls
                    if (Array.isArray(tools) && tools.length > 0) {
                        content = `🔧 [Búsqueda Odoo: ${tools.map((t: any) => t.name).join(', ')}]\n\n${content}`
                    }
                } catch (e) { }
            }
            return {
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: content }]
            }
        })
        console.log('HISTORY BEING PASSED TO GEMINI SDK:')
        console.log(JSON.stringify(history, null, 2))
    } else {
        console.log('\n[PATH: AI SDK STREAMTEXT LOGIC]')
        const history = messages.map((m: any) => ({
            role: m.role,
            content: m.content
        }))
        console.log('MESSAGES ARRAY BEING PASSED TO AI SDK:')
        console.log(JSON.stringify(history, null, 2))
    }
}

async function runTests() {
    // 1. Legal Agent Case (Simulation of chained query)
    await verifyContext('juridico', [
        { role: 'user', content: 'Qué es una SAS?' },
        { role: 'assistant', content: 'Una SAS es una Sociedad por Acciones Simplificada...' },
        { role: 'user', content: 'Se puede abrir en Argentina?' },
        { role: 'assistant', content: 'Sí, en Argentina es muy fácil...' },
        { role: 'user', content: 'Ahora mismo?' }
    ])

    // 2. Odoo Agent Case (Simulation of tool history enrichment)
    await verifyContext('odoo-bi', [
        { role: 'user', content: 'Ventas de diciembre' },
        { role: 'assistant', content: 'Aquí tienes las ventas...', tool_calls: '[{"name": "odoo_search_read"}]' },
        { role: 'user', content: 'Ventas de Martin' }
    ])
}

runTests().catch(console.error)
