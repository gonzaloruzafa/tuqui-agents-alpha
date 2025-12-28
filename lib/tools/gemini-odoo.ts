/**
 * Odoo BI Agent - Re-export from v2
 * 
 * This file re-exports the new Odoo BI Agent v2 implementation
 * which includes:
 * - Single intelligent tool (odoo_intelligent_query)
 * - Multiple sub-queries in parallel
 * - Automatic temporal comparisons
 * - Lateral insights
 * - Chart data for visualizations
 * - 5-minute cache
 * 
 * Legacy tools (odoo_search, odoo_summary) are still supported for backward compatibility
 */

export { 
    chatWithOdoo, 
    streamChatWithOdoo, 
    executeIntelligentQuery,
    BI_ANALYST_PROMPT,
    type GeminiOdooResponse,
    type OdooToolResult
} from './gemini-odoo-v2'
