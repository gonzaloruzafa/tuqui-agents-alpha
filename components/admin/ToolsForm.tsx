'use client'

import { useState } from 'react'
import { Save, Loader2, CheckCircle, Database, ShoppingBag, MessageSquare, Globe } from 'lucide-react'

interface ConfigField {
    name: string
    label: string
    placeholder: string
    type: string
}

interface ToolConfig {
    slug: string
    name: string
    icon: string
    description: string
    configFields: ConfigField[]
    envNote?: string
}

const TOOLS: ToolConfig[] = [
    {
        slug: 'odoo',
        name: 'Odoo ERP',
        icon: 'Database',
        description: 'Conexión XML-RPC para consultas de stock, ventas y clientes.',
        configFields: [
            { name: 'odoo_url', label: 'URL de Odoo', placeholder: 'https://tu-empresa.odoo.com', type: 'text' },
            { name: 'odoo_db', label: 'Base de datos', placeholder: 'nombre-db', type: 'text' },
            { name: 'odoo_user', label: 'Usuario', placeholder: 'admin@empresa.com', type: 'text' },
            { name: 'odoo_password', label: 'API Key / Contraseña', placeholder: '', type: 'password' },
        ]
    },
    {
        slug: 'tavily',
        name: 'Navegador Web',
        icon: 'Globe',
        description: 'Búsqueda web en tiempo real con IA (Tavily).',
        configFields: [],
        envNote: 'La API Key se configura via variable de entorno TAVILY_API_KEY'
    },
    {
        slug: 'firecrawl',
        name: 'Investigador Web',
        icon: 'Globe',
        description: 'Extrae contenido de páginas web específicas (artículos, docs).',
        configFields: [],
        envNote: 'La API Key se configura via variable de entorno FIRECRAWL_API_KEY'
    },
    {
        slug: 'ecommerce_search',
        name: 'Investigador Ecommerce',
        icon: 'ShoppingBag',
        description: 'Búsqueda de productos y precios REALES en MercadoLibre y Amazon.',
        configFields: [],
        envNote: 'Usa Tavily + Firecrawl stealth para extraer precios'
    },
    {
        slug: 'whatsapp',
        name: 'WhatsApp Business',
        icon: 'MessageSquare',
        description: 'Integración vía Twilio para respuestas automáticas.',
        configFields: []
    },
]

const IconMap: Record<string, React.ReactNode> = {
    'Database': <Database className="w-6 h-6" />,
    'ShoppingBag': <ShoppingBag className="w-6 h-6" />,
    'MessageSquare': <MessageSquare className="w-6 h-6" />,
    'Globe': <Globe className="w-6 h-6" />,
}

interface ToolFormProps {
    tool: ToolConfig
    initialConfig: Record<string, string>
    initialActive: boolean
}

export function ToolForm({ tool, initialConfig, initialActive }: ToolFormProps) {
    const [isActive, setIsActive] = useState(initialActive)
    const [config, setConfig] = useState<Record<string, string>>(initialConfig)
    const [saving, setSaving] = useState(false)
    const [saved, setSaved] = useState(false)
    const [error, setError] = useState<string | null>(null)

    const handleSave = async () => {
        setSaving(true)
        setError(null)
        setSaved(false)

        try {
            const res = await fetch('/api/integrations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: tool.slug,
                    is_active: isActive,
                    config: config
                })
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Error al guardar')
            }

            setSaved(true)
            setTimeout(() => setSaved(false), 3000)
        } catch (e: any) {
            setError(e.message)
        } finally {
            setSaving(false)
        }
    }

    const updateConfig = (field: string, value: string) => {
        setConfig(prev => ({ ...prev, [field]: value }))
    }

    return (
        <div className="bg-white rounded-3xl border border-adhoc-lavender/30 shadow-sm overflow-hidden group hover:border-adhoc-violet/30 transition-all duration-300">
            <div className="p-8 flex items-start gap-6">
                <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 transition-all duration-300 ${isActive ? 'bg-adhoc-lavender text-adhoc-violet scale-110' : 'bg-gray-50 text-gray-300'}`}>
                    {IconMap[tool.icon]}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-3">
                            <h3 className="text-xl font-bold text-gray-900 font-display">
                                {tool.name}
                            </h3>
                            {isActive && (
                                <span className="px-2 py-0.5 rounded-full bg-green-100/50 text-green-700 text-[9px] font-bold uppercase tracking-wider border border-green-100 flex items-center gap-1">
                                    <div className="w-1 h-1 rounded-full bg-green-600 animate-pulse" />
                                    Activo
                                </span>
                            )}
                        </div>
                        <label className="relative inline-flex items-center cursor-pointer select-none gap-3">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                            />
                            <div className={`
                                w-11 h-6 rounded-full transition-all duration-300 ease-in-out relative
                                ${isActive ? 'bg-adhoc-violet' : 'bg-gray-200'}
                            `}>
                                <div className={`
                                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                                    transition-transform duration-300 ease-in-out
                                    ${isActive ? 'translate-x-5' : 'translate-x-0'}
                                `} />
                            </div>
                        </label>
                    </div>
                    <p className="text-sm text-gray-500 leading-relaxed italic">{tool.description}</p>

                    {tool.envNote && (
                        <p className="text-[11px] text-adhoc-violet bg-adhoc-lavender/10 px-4 py-2 rounded-xl mt-4 font-medium flex items-center gap-2 border border-adhoc-lavender/20">
                            <span className="text-lg leading-none">⚙️</span> {tool.envNote}
                        </p>
                    )}

                    {tool.configFields.length > 0 && (
                        <div className="mt-8 grid gap-6 sm:grid-cols-2">
                            {tool.configFields.map(field => (
                                <div key={field.name}>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">{field.label}</label>
                                    <input
                                        type={field.type}
                                        value={config[field.name] || ''}
                                        onChange={(e) => updateConfig(field.name, e.target.value)}
                                        placeholder={field.placeholder}
                                        className="w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-xl text-sm focus:ring-2 focus:ring-adhoc-violet/20 focus:border-adhoc-violet outline-none transition-all"
                                    />
                                    {config[field.name] && (
                                        <div className="flex items-center gap-1 mt-1.5">
                                            <div className="w-1 h-1 rounded-full bg-green-500" />
                                            <p className="text-[10px] text-green-600 font-bold uppercase tracking-tight">
                                                {field.type === 'password' ? 'Confidencial' : 'Configurado'}
                                            </p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <div className="px-8 py-4 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between">
                <div>
                    {error && <p className="text-xs text-adhoc-coral font-semibold uppercase tracking-tight">{error}</p>}
                    {saved && <p className="text-xs text-green-600 font-bold uppercase tracking-tight flex items-center gap-2"><CheckCircle className="w-4 h-4" /> Cambios guardados</p>}
                </div>
                <button
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-adhoc-violet hover:bg-adhoc-violet/90 text-white px-6 py-2.5 rounded-xl text-sm font-bold uppercase tracking-widest transition-all shadow-md shadow-adhoc-violet/10 disabled:opacity-50 active:scale-95"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando' : 'Guardar'}
                </button>
            </div>
        </div>
    )
}

interface ToolsListProps {
    integrations: Array<{ type: string; is_active: boolean; config: Record<string, string> }>
}

export function ToolsList({ integrations }: ToolsListProps) {
    const integrationsMap = new Map(integrations.map(i => [i.type, i]))

    return (
        <div className="grid gap-6">
            {TOOLS.map(tool => {
                const existing = integrationsMap.get(tool.slug)
                return (
                    <ToolForm
                        key={tool.slug}
                        tool={tool}
                        initialConfig={existing?.config || {}}
                        initialActive={existing?.is_active || false}
                    />
                )
            })}
        </div>
    )
}
