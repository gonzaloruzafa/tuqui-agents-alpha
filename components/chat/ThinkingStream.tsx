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
        <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
            <circle cx="12" cy="12" r="10" fill="#714B67" />
            <path d="M12 6c-3.3 0-6 2.7-6 6s2.7 6 6 6 6-2.7 6-6-2.7-6-6-6zm0 10c-2.2 0-4-1.8-4-4s1.8-4 4-4 4 1.8 4 4-1.8 4-4 4z" fill="white" />
        </svg>
    ),
    meli: (
        <svg viewBox="0 0 24 24" className="w-4 h-4">
            <circle cx="12" cy="12" r="10" fill="#FFE600" />
            <path d="M12 7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 2c.6 0 1.1.2 1.5.5L12 12l-1.5-2.5c.4-.3.9-.5 1.5-.5z" fill="#2D3277" />
        </svg>
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

export function ThinkingStream({ thinkingText, steps, isExpanded = true, onToggle }: ThinkingStreamProps) {
    const hasContent = thinkingText || steps.length > 0
    if (!hasContent) return null

    const completedSteps = steps.filter(s => s.status === 'done' || s.status === 'error')
    const runningStep = steps.find(s => s.status === 'running')
    
    // Determinar estado general
    const isThinking = !!thinkingText && steps.length === 0
    const isExecuting = steps.length > 0
    
    return (
        <div className="mb-3 ml-12">
            {/* Header colapsable */}
            <button 
                onClick={onToggle}
                className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-400 transition-colors mb-2"
            >
                <span className={`transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                <span className="flex items-center gap-1.5">
                    {isThinking && (
                        <>
                            <span className="animate-pulse">💭</span>
                            <span>Analizando pregunta...</span>
                        </>
                    )}
                    {isExecuting && runningStep && (
                        <>
                            <span className="animate-pulse">⚡</span>
                            <span>Ejecutando consultas...</span>
                        </>
                    )}
                    {isExecuting && !runningStep && (
                        <span>✓ {completedSteps.length} consultas completadas</span>
                    )}
                </span>
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
