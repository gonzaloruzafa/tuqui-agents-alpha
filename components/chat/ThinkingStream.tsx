/**
 * ThinkingStream Component
 * 
 * Muestra el proceso de "thinking" del modelo:
 * 1. Chain of Thought (razonamiento previo)
 * 2. Tool execution en tiempo real
 */

'use client'

import { useState, useEffect } from 'react'
import { ThinkingStep, ThinkingSource, SOURCE_NAMES } from '@/lib/thinking/types'

interface ThinkingStreamProps {
    /** Texto del bloque <thinking>...</thinking> */
    thinkingText?: string
    /** Steps de ejecución de tools */
    steps: ThinkingStep[]
    isExpanded?: boolean
    onToggle?: () => void
}

/**
 * Logos inline como SVG para evitar dependencias de archivos
 */
const LOGOS: Record<ThinkingSource, React.ReactNode> = {
    odoo: (
        <img src="/logo-odoo.png" alt="Odoo" className="w-4 h-4 rounded-sm" />
    ),
    meli: (
        <img src="/logo-meli.png" alt="MercadoLibre" className="w-4 h-4 rounded-sm" />
    ),
    web: (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" className="text-blue-500" />
            <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" className="text-blue-500" />
        </svg>
    ),
    rag: (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <rect x="4" y="4" width="16" height="16" rx="2" fill="#10B981" />
            <path d="M8 8h8M8 12h8M8 16h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    ),
    general: (
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="#8B5CF6" />
            <path d="M12 8v4l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" />
        </svg>
    )
}

/**
 * Nombre amigable para mostrar del tool
 */
function getToolDisplayName(toolName: string): string {
    const nameMap: Record<string, string> = {
        'get_sales_total': 'Consultando ventas totales',
        'get_sales_by_customer': 'Ventas por cliente',
        'get_sales_by_product': 'Ventas por producto',
        'get_invoices_by_customer': 'Consultando facturas',
        'get_debt_by_customer': 'Consultando deudas',
        'get_overdue_invoices': 'Facturas vencidas',
        'get_accounts_receivable': 'Cuentas por cobrar',
        'get_product_stock': 'Consultando stock',
        'get_low_stock_products': 'Productos con bajo stock',
        'search_customers': 'Buscando clientes',
        'search_products': 'Buscando productos',
        'get_customer_balance': 'Saldo del cliente',
        'get_payments_received': 'Pagos recibidos',
        'get_purchase_orders': 'Órdenes de compra',
        'web_search': 'Buscando en la web',
        'get_top_products': 'Productos más vendidos',
        'get_top_customers': 'Mejores clientes',
        'compare_sales_periods': 'Comparando períodos',
    }
    return nameMap[toolName] || toolName.replace(/_/g, ' ').replace(/^get /, '')
}

/**
 * Formatea duración en ms a texto legible
 */
function formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`
    return `${(ms / 1000).toFixed(1)}s`
}

export function ThinkingStream({ thinkingText, steps, isExpanded = false, onToggle }: ThinkingStreamProps) {
    const hasContent = thinkingText || steps.length > 0
    if (!hasContent) return null

    const completedSteps = steps.filter(s => s.status === 'done' || s.status === 'error')
    const runningStep = steps.find(s => s.status === 'running')
    
    // Determinar estado general
    const isThinking = !!thinkingText && steps.length === 0
    const isExecuting = steps.length > 0
    const allDone = isExecuting && !runningStep
    
    // Get unique sources for summary
    const uniqueSources = [...new Set(steps.map(s => s.source))]
    
    // Get first line of thinking for summary
    const thinkingSummary = thinkingText?.split('\n')[0]?.slice(0, 60) || ''
    
    return (
        <div className="mb-3 ml-11">
            {/* Header colapsable */}
            <button 
                onClick={onToggle}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors mb-2 group"
            >
                <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                <span className="flex items-center gap-1.5">
                    {isThinking && (
                        <>
                            <span className="animate-pulse">💭</span>
                            <span className="text-gray-400">Analizando...</span>
                            {!isExpanded && thinkingSummary && (
                                <span className="text-gray-400 italic truncate max-w-[200px]">{thinkingSummary}...</span>
                            )}
                        </>
                    )}
                    {isExecuting && runningStep && (
                        <>
                            <span className="animate-pulse">⚡</span>
                            {/* Show source icon with label */}
                            <span className="flex items-center gap-1.5">
                                <span className="opacity-80">{LOGOS[runningStep.source]}</span>
                                <span className="text-gray-400">{SOURCE_NAMES[runningStep.source]}</span>
                            </span>
                        </>
                    )}
                    {allDone && (
                        <>
                            <span className="text-green-500">✓</span>
                            <span className="text-gray-400">vía</span>
                            {/* Show source icons with labels */}
                            <span className="flex items-center gap-2">
                                {uniqueSources.map(source => (
                                    <span key={source} className="flex items-center gap-1 opacity-80">
                                        {LOGOS[source]}
                                        <span className="text-gray-400 text-[10px]">{SOURCE_NAMES[source]}</span>
                                    </span>
                                ))}
                            </span>
                        </>
                    )}
                </span>
                {!isExpanded && <span className="text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity text-[10px]">ver más</span>}
            </button>
            
            {isExpanded && (
                <div className="space-y-2 border-l-2 border-gray-200 dark:border-gray-700 pl-3">
                    {/* Chain of Thought text */}
                    {thinkingText && (
                        <div className="text-sm text-gray-500 dark:text-gray-400 italic whitespace-pre-line bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3">
                            {thinkingText}
                        </div>
                    )}
                    
                    {/* Tool execution steps */}
                    {steps.length > 0 && (
                        <div className="space-y-1.5 pt-1">
                            {steps.map((step, index) => (
                                <div 
                                    key={`${step.tool}-${step.startedAt}`}
                                    className={`flex items-center gap-2 text-sm transition-opacity duration-300 ${
                                        step.status === 'running' ? 'opacity-100' : 'opacity-70'
                                    }`}
                                >
                                    {/* Logo del agente */}
                                    <div className="flex-shrink-0">
                                        {LOGOS[step.source]}
                                    </div>
                                    
                                    {/* Nombre del tool */}
                                    <span className={`flex-1 ${
                                        step.status === 'error' ? 'text-red-400' : 'text-gray-600 dark:text-gray-300'
                                    }`}>
                                        {getToolDisplayName(step.tool)}
                                    </span>
                                    
                                    {/* Estado / Duración */}
                                    <span className="text-xs text-gray-500 flex-shrink-0">
                                        {step.status === 'running' && (
                                            <span className="flex items-center gap-1">
                                                <span className="animate-pulse text-amber-500">●</span>
                                            </span>
                                        )}
                                        {step.status === 'done' && step.duration && (
                                            <span className="text-green-500">
                                                ✓ {formatDuration(step.duration)}
                                            </span>
                                        )}
                                        {step.status === 'error' && (
                                            <span className="text-red-400">✗</span>
                                        )}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    )
}
