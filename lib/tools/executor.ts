import { meliTools } from './mercadolibre/tools'
import { tavilySearchTool } from './tavily'

/**
 * Get tools for an agent based on its configured tool list.
 * 
 * Note: Odoo tools are handled separately using the native Google SDK wrapper
 * due to compatibility issues with the Vercel AI SDK's Zod-to-Gemini conversion.
 * See lib/tools/odoo/wrapper.ts for Odoo tool implementation.
 */
export async function getToolsForAgent(tenantId: string, agentTools: string[]) {
    const tools: Record<string, any> = {}

    // 1. Tavily Web Search
    if (agentTools.includes('web_search') || agentTools.includes('tavily')) {
        tools.web_search = tavilySearchTool
    }

    // 2. Odoo Tools - Handled separately via native Google SDK wrapper
    // See app/api/chat/route.ts for Odoo-specific handling

    // 3. MercadoLibre Tools
    if (agentTools.includes('meli_search') || agentTools.some(t => t.startsWith('meli_'))) {
        tools.meli_search = meliTools.meli_search
        tools.meli_price_analysis = meliTools.meli_price_analysis
    }

    return tools
}
