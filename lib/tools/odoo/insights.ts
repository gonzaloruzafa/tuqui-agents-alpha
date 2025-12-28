/**
 * Odoo Insights Generator - Automatic lateral insights from query results
 * Generates actionable insights without being explicitly asked
 */

import { QueryResult } from './query-builder'
import { 
    calculateVariation, 
    detectDecreasing, 
    detectLost, 
    detectNew,
    analyzeTrend,
    ComparisonResult
} from './comparisons'

// ============================================
// TYPES
// ============================================

export interface Insight {
    type: 'alert' | 'info' | 'success' | 'warning'
    icon: string
    title: string
    description: string
    priority: number  // 1-5, higher = more important
    actionable?: string  // Suggested action
}

export interface InsightContext {
    queryType: 'sales' | 'invoices' | 'customers' | 'products' | 'crm' | 'users' | 'activities' | 'general'
    model: string
    hasComparison: boolean
    comparisonType?: 'mom' | 'yoy'
}

// ============================================
// INSIGHT GENERATORS
// ============================================

/**
 * Generate insights from query results
 */
export function generateInsights(
    context: InsightContext,
    results: QueryResult[],
    comparisons?: Record<string, ComparisonResult<{ count: number; total: number }>>
): Insight[] {
    const insights: Insight[] = []
    
    for (const result of results) {
        if (!result.success) continue
        
        // Generate context-specific insights
        switch (context.queryType) {
            case 'sales':
            case 'invoices':
                insights.push(...generateFinancialInsights(result, context, comparisons))
                break
            case 'customers':
                insights.push(...generateCustomerInsights(result, context, comparisons))
                break
            case 'crm':
                insights.push(...generateCRMInsights(result, context))
                break
            case 'users':
                insights.push(...generateUserInsights(result, context))
                break
            case 'activities':
                insights.push(...generateActivityInsights(result, context))
                break
            default:
                insights.push(...generateGeneralInsights(result, context))
        }
    }
    
    // Sort by priority (highest first) and limit to top 5
    return insights.sort((a, b) => b.priority - a.priority).slice(0, 5)
}

/**
 * Financial insights for sales and invoices
 */
function generateFinancialInsights(
    result: QueryResult,
    context: InsightContext,
    comparisons?: Record<string, ComparisonResult<{ count: number; total: number }>>
): Insight[] {
    const insights: Insight[] = []
    
    // Top 3 customers insight
    if (result.grouped) {
        const entries = Object.entries(result.grouped)
        if (entries.length >= 3) {
            const top3 = entries.slice(0, 3)
            const top3Total = top3.reduce((sum, [, { total }]) => sum + total, 0)
            const totalAmount = result.total || entries.reduce((sum, [, { total }]) => sum + total, 0)
            const concentration = totalAmount > 0 ? (top3Total / totalAmount) * 100 : 0
            
            if (concentration > 50) {
                insights.push({
                    type: 'warning',
                    icon: '⚠️',
                    title: 'Alta concentración de ingresos',
                    description: `Los 3 principales clientes representan el ${concentration.toFixed(0)}% del total: ${top3.map(([name]) => name).join(', ')}`,
                    priority: 4,
                    actionable: 'Considerar diversificar la cartera de clientes para reducir riesgo'
                })
            } else {
                insights.push({
                    type: 'info',
                    icon: '📊',
                    title: 'Top 3 clientes',
                    description: `${top3.map(([name, { total }]) => `${name}: $${formatNumber(total)}`).join(' | ')}`,
                    priority: 2
                })
            }
        }
        
        // Check for outliers (one customer much larger than others)
        if (entries.length >= 2) {
            const [first, second] = entries
            if (first[1].total > second[1].total * 3) {
                insights.push({
                    type: 'info',
                    icon: '👑',
                    title: 'Cliente dominante',
                    description: `${first[0]} representa ${((first[1].total / (result.total || 1)) * 100).toFixed(0)}% del total`,
                    priority: 3
                })
            }
        }
    }
    
    // Comparison insights
    if (comparisons && Object.keys(comparisons).length > 0) {
        const trend = analyzeTrend(comparisons)
        
        // Overall trend
        if (trend.overallVariation.percent > 10) {
            insights.push({
                type: 'success',
                icon: '📈',
                title: 'Crecimiento positivo',
                description: `Las ventas ${trend.overallVariation.label} ($${formatNumber(trend.totalCurrent)} vs $${formatNumber(trend.totalPrevious)})`,
                priority: 5
            })
        } else if (trend.overallVariation.percent < -10) {
            insights.push({
                type: 'alert',
                icon: '📉',
                title: 'Caída en ventas',
                description: `Las ventas ${trend.overallVariation.label} ($${formatNumber(trend.totalCurrent)} vs $${formatNumber(trend.totalPrevious)})`,
                priority: 5,
                actionable: 'Revisar causas de la caída y tomar acciones correctivas'
            })
        }
        
        // Declining customers alert
        const currentGrouped: Record<string, { count: number; total: number }> = {}
        const previousGrouped: Record<string, { count: number; total: number }> = {}
        
        for (const [name, comp] of Object.entries(comparisons)) {
            currentGrouped[name] = comp.current
            previousGrouped[name] = comp.previous
        }
        
        const declining = detectDecreasing(currentGrouped, previousGrouped, 30)
        if (declining.length > 0) {
            const topDeclining = declining.slice(0, 3)
            insights.push({
                type: 'warning',
                icon: '⚡',
                title: `${declining.length} cliente${declining.length > 1 ? 's' : ''} comprando menos`,
                description: topDeclining.map(d => `${d.name}: ${d.variation.label}`).join(' | '),
                priority: 4,
                actionable: 'Contactar a estos clientes para retenerlos'
            })
        }
        
        // Lost customers
        const lost = detectLost(currentGrouped, previousGrouped, 1000)
        if (lost.length > 0) {
            insights.push({
                type: 'alert',
                icon: '🚨',
                title: `${lost.length} cliente${lost.length > 1 ? 's' : ''} sin actividad`,
                description: `Clientes que compraron antes pero no este período: ${lost.slice(0, 3).map(l => l.name).join(', ')}`,
                priority: 5,
                actionable: 'Reactivar relación con estos clientes'
            })
        }
        
        // New customers
        const newCustomers = detectNew(currentGrouped, previousGrouped, 1000)
        if (newCustomers.length > 0) {
            insights.push({
                type: 'success',
                icon: '🌟',
                title: `${newCustomers.length} cliente${newCustomers.length > 1 ? 's' : ''} nuevo${newCustomers.length > 1 ? 's' : ''}`,
                description: `Nuevos este período: ${newCustomers.slice(0, 3).map(n => `${n.name} ($${formatNumber(n.value)})`).join(', ')}`,
                priority: 3
            })
        }
    }
    
    return insights
}

/**
 * Customer-specific insights
 */
function generateCustomerInsights(
    result: QueryResult,
    context: InsightContext,
    comparisons?: Record<string, ComparisonResult<{ count: number; total: number }>>
): Insight[] {
    const insights: Insight[] = []
    
    if (result.count !== undefined) {
        insights.push({
            type: 'info',
            icon: '👥',
            title: 'Total de clientes',
            description: `${result.count} clientes en el sistema`,
            priority: 1
        })
    }
    
    // Check for incomplete customer data
    if (result.data) {
        const missingEmail = result.data.filter((c: any) => !c.email).length
        const missingPhone = result.data.filter((c: any) => !c.phone).length
        
        if (missingEmail > result.data.length * 0.3) {
            insights.push({
                type: 'warning',
                icon: '📧',
                title: 'Datos incompletos',
                description: `${missingEmail} clientes sin email (${((missingEmail / result.data.length) * 100).toFixed(0)}%)`,
                priority: 2,
                actionable: 'Completar información de contacto de clientes'
            })
        }
    }
    
    return insights
}

/**
 * CRM insights
 */
function generateCRMInsights(result: QueryResult, context: InsightContext): Insight[] {
    const insights: Insight[] = []
    
    if (result.data && result.data.length > 0) {
        // Calculate pipeline value
        const totalPipeline = result.data.reduce((sum: number, lead: any) => 
            sum + (lead.expected_revenue || 0), 0
        )
        
        if (totalPipeline > 0) {
            insights.push({
                type: 'info',
                icon: '💰',
                title: 'Valor del pipeline',
                description: `$${formatNumber(totalPipeline)} en oportunidades activas`,
                priority: 3
            })
        }
        
        // Check for stale opportunities
        const today = new Date()
        const staleLeads = result.data.filter((lead: any) => {
            if (!lead.create_date) return false
            const created = new Date(lead.create_date)
            const daysSinceCreation = Math.floor((today.getTime() - created.getTime()) / (1000 * 60 * 60 * 24))
            return daysSinceCreation > 30 && lead.probability < 100
        })
        
        if (staleLeads.length > 0) {
            insights.push({
                type: 'warning',
                icon: '⏰',
                title: 'Oportunidades estancadas',
                description: `${staleLeads.length} oportunidades sin movimiento hace más de 30 días`,
                priority: 4,
                actionable: 'Revisar y actualizar estas oportunidades'
            })
        }
        
        // Check probability distribution
        const highProbability = result.data.filter((l: any) => l.probability >= 70 && l.probability < 100)
        if (highProbability.length > 0) {
            const highValue = highProbability.reduce((sum: number, l: any) => sum + (l.expected_revenue || 0), 0)
            insights.push({
                type: 'success',
                icon: '🎯',
                title: 'Oportunidades calientes',
                description: `${highProbability.length} oportunidades con >70% probabilidad ($${formatNumber(highValue)})`,
                priority: 4
            })
        }
    }
    
    if (result.grouped) {
        // Distribution by stage or user
        const entries = Object.entries(result.grouped)
        if (entries.length > 0) {
            insights.push({
                type: 'info',
                icon: '📊',
                title: 'Distribución CRM',
                description: entries.slice(0, 4).map(([name, { count }]) => `${name}: ${count}`).join(' | '),
                priority: 2
            })
        }
    }
    
    return insights
}

/**
 * User activity insights
 */
function generateUserInsights(result: QueryResult, context: InsightContext): Insight[] {
    const insights: Insight[] = []
    
    if (result.data && result.data.length > 0) {
        const today = new Date()
        
        // Inactive users (haven't logged in for 30+ days)
        const inactiveUsers = result.data.filter((user: any) => {
            if (!user.login_date) return true
            const lastLogin = new Date(user.login_date)
            const daysSinceLogin = Math.floor((today.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24))
            return daysSinceLogin > 30
        })
        
        if (inactiveUsers.length > 0) {
            insights.push({
                type: 'warning',
                icon: '👤',
                title: 'Usuarios inactivos',
                description: `${inactiveUsers.length} usuario${inactiveUsers.length > 1 ? 's' : ''} sin conectarse hace más de 30 días: ${inactiveUsers.slice(0, 3).map((u: any) => u.name).join(', ')}`,
                priority: 3,
                actionable: 'Verificar si estos usuarios siguen activos en la empresa'
            })
        }
        
        // Recently active
        const recentlyActive = result.data.filter((user: any) => {
            if (!user.login_date) return false
            const lastLogin = new Date(user.login_date)
            const daysSinceLogin = Math.floor((today.getTime() - lastLogin.getTime()) / (1000 * 60 * 60 * 24))
            return daysSinceLogin <= 7
        })
        
        insights.push({
            type: 'info',
            icon: '✅',
            title: 'Usuarios activos',
            description: `${recentlyActive.length} usuarios conectados en los últimos 7 días`,
            priority: 2
        })
    }
    
    return insights
}

/**
 * Activity insights (mail.activity)
 */
function generateActivityInsights(result: QueryResult, context: InsightContext): Insight[] {
    const insights: Insight[] = []
    
    if (result.data && result.data.length > 0) {
        const today = new Date()
        today.setHours(0, 0, 0, 0)
        
        // Overdue activities
        const overdue = result.data.filter((act: any) => {
            if (!act.date_deadline) return false
            const deadline = new Date(act.date_deadline)
            return deadline < today
        })
        
        if (overdue.length > 0) {
            insights.push({
                type: 'alert',
                icon: '🚨',
                title: 'Actividades vencidas',
                description: `${overdue.length} actividad${overdue.length > 1 ? 'es' : ''} pasada${overdue.length > 1 ? 's' : ''} de fecha`,
                priority: 5,
                actionable: 'Completar o reprogramar estas actividades urgentemente'
            })
        }
        
        // Due today
        const dueToday = result.data.filter((act: any) => {
            if (!act.date_deadline) return false
            const deadline = new Date(act.date_deadline)
            deadline.setHours(0, 0, 0, 0)
            return deadline.getTime() === today.getTime()
        })
        
        if (dueToday.length > 0) {
            insights.push({
                type: 'warning',
                icon: '📅',
                title: 'Actividades para hoy',
                description: `${dueToday.length} actividad${dueToday.length > 1 ? 'es' : ''} vence${dueToday.length > 1 ? 'n' : ''} hoy`,
                priority: 4
            })
        }
    }
    
    if (result.grouped) {
        // Distribution by user or type
        insights.push({
            type: 'info',
            icon: '📋',
            title: 'Distribución de actividades',
            description: Object.entries(result.grouped)
                .slice(0, 4)
                .map(([name, { count }]) => `${name}: ${count}`)
                .join(' | '),
            priority: 2
        })
    }
    
    return insights
}

/**
 * General insights for any data
 */
function generateGeneralInsights(result: QueryResult, context: InsightContext): Insight[] {
    const insights: Insight[] = []
    
    if (result.count !== undefined) {
        insights.push({
            type: 'info',
            icon: '📊',
            title: 'Registros encontrados',
            description: `${result.count} registros`,
            priority: 1
        })
    }
    
    if (result.total !== undefined) {
        insights.push({
            type: 'info',
            icon: '💵',
            title: 'Total',
            description: `$${formatNumber(result.total)}`,
            priority: 2
        })
    }
    
    return insights
}

// ============================================
// HELPERS
// ============================================

function formatNumber(num: number): string {
    if (num >= 1000000) {
        return (num / 1000000).toFixed(1) + 'M'
    } else if (num >= 1000) {
        return (num / 1000).toFixed(1) + 'K'
    }
    return num.toLocaleString('es-AR', { maximumFractionDigits: 0 })
}

/**
 * Format insights as readable text for AI response
 */
export function formatInsightsAsText(insights: Insight[]): string {
    if (insights.length === 0) return ''
    
    const lines = ['\n\n**💡 Insights adicionales:**']
    
    for (const insight of insights) {
        lines.push(`\n${insight.icon} **${insight.title}**: ${insight.description}`)
        if (insight.actionable) {
            lines.push(`   → _${insight.actionable}_`)
        }
    }
    
    return lines.join('\n')
}
