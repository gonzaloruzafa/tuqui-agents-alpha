/**
 * MessageSources Component
 * 
 * Muestra íconos pequeños de las fuentes usadas para responder un mensaje
 * Aparece debajo del mensaje del bot después de completar
 */

'use client'

import { ThinkingSource } from '@/lib/thinking/types'

interface MessageSourcesProps {
    sources: ThinkingSource[]
}

/**
 * Logos pequeños para cada fuente
 */
const SOURCE_ICONS: Record<ThinkingSource, { icon: React.ReactNode, label: string, color: string }> = {
    odoo: {
        icon: (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <circle cx="12" cy="12" r="10" fill="#714B67" />
                <path d="M12 7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 8c-1.7 0-3-1.3-3-3s1.3-3 3-3 3 1.3 3 3-1.3 3-3 3z" fill="white" />
            </svg>
        ),
        label: 'Odoo ERP',
        color: 'bg-[#714B67]/10 text-[#714B67]'
    },
    meli: {
        icon: (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
                <circle cx="12" cy="12" r="10" fill="#FFE600" />
                <path d="M12 7c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5zm0 2c.6 0 1.1.2 1.5.5L12 12l-1.5-2.5c.4-.3.9-.5 1.5-.5z" fill="#2D3277" />
            </svg>
        ),
        label: 'Mercado Libre',
        color: 'bg-yellow-100 text-yellow-800'
    },
    web: {
        icon: (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
            </svg>
        ),
        label: 'Web',
        color: 'bg-blue-50 text-blue-600'
    },
    rag: {
        icon: (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <rect x="4" y="4" width="16" height="16" rx="2" fill="#10B981" />
                <path d="M8 8h8M8 12h8M8 16h4" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        label: 'Documentos',
        color: 'bg-emerald-50 text-emerald-600'
    },
    general: {
        icon: (
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <circle cx="12" cy="12" r="10" fill="#8B5CF6" />
                <path d="M12 8v4l3 3" stroke="white" strokeWidth="2" strokeLinecap="round" />
            </svg>
        ),
        label: 'General',
        color: 'bg-violet-50 text-violet-600'
    }
}

export function MessageSources({ sources }: MessageSourcesProps) {
    // Filter unique sources and remove 'general' if there are other sources
    const uniqueSources = [...new Set(sources)]
    const displaySources = uniqueSources.filter(s => s !== 'general' || uniqueSources.length === 1)
    
    if (displaySources.length === 0) return null

    return (
        <div className="flex items-center gap-1.5 mt-2">
            <span className="text-[10px] text-gray-400">vía</span>
            <div className="flex items-center gap-1">
                {displaySources.map(source => {
                    const { icon, label } = SOURCE_ICONS[source]
                    return (
                        <div 
                            key={source}
                            className="flex items-center gap-1 opacity-60 hover:opacity-100 transition-opacity cursor-default"
                            title={label}
                        >
                            {icon}
                        </div>
                    )
                })}
            </div>
        </div>
    )
}
