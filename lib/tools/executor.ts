import { getOdooClient } from './odoo/client'
import { meliTools } from './mercadolibre/tools'
import { tavilySearchTool } from './tavily'
import { tool } from 'ai'
import { z } from 'zod'

export async function getToolsForAgent(tenantId: string, agentTools: string[]) {
    const tools: Record<string, any> = {}

    // 1. Tavily Web Search
    if (agentTools.includes('web_search') || agentTools.includes('tavily')) {
        tools.web_search = tavilySearchTool
    }

    // 2. Odoo Tools (single 'odoo' enables all odoo capabilities)
    if (agentTools.includes('odoo') || agentTools.some(t => t.startsWith('odoo_'))) {
        try {
            const odoo = await getOdooClient(tenantId)

            // @ts-expect-error - AI SDK v5 type issue
            tools.odoo_search = tool({
                description: 'Buscar registros en Odoo ERP (ventas, contactos, productos, facturas, etc)',
                parameters: z.object({
                    model: z.string().describe('Modelo de Odoo: sale.order (ventas), res.partner (contactos), product.template (productos), account.move (facturas)'),
                    domain: z.array(z.array(z.any())).describe('Dominio de búsqueda. Ej: [["name", "ilike", "juan"]] o [["state", "=", "sale"]]'),
                    fields: z.array(z.string()).optional().describe('Campos a retornar. Si no se especifica, retorna campos básicos.'),
                    limit: z.number().optional().default(10)
                }),
                execute: async ({ model, domain, fields, limit }: any) => {
                    return await odoo.searchRead(model, domain, fields, limit)
                }
            })
        } catch (e) {
            console.warn('[Tools] Failed to load Odoo tools:', e)
        }
    }

    // 3. MercadoLibre Tools (single 'meli_search' enables all meli capabilities)
    if (agentTools.includes('meli_search') || agentTools.some(t => t.startsWith('meli_'))) {
        tools.meli_search = meliTools.meli_search
        tools.meli_price_analysis = meliTools.meli_price_analysis
    }

    return tools
}
