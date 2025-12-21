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
        slug: 'mercadolibre', 
        name: 'MercadoLibre', 
        icon: 'ShoppingBag', 
        description: 'Búsqueda de productos, precios y análisis de competencia.',
        configFields: []
    },
    { 
        slug: 'whatsapp', 
        name: 'WhatsApp Business', 
        icon: 'MessageSquare', 
        description: 'Integración vía Twilio para respuestas automáticas.',
        configFields: []
    },
    { 
        slug: 'tavily', 
        name: 'Tavily Web Search', 
        icon: 'Globe', 
        description: 'Búsqueda web en tiempo real con IA.',
        configFields: [],
        envNote: 'La API Key se configura via variable de entorno TAVILY_API_KEY'
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
                    slug: tool.slug,
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
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="p-6 flex items-start gap-4">
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${isActive ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-400'}`}>
                    {IconMap[tool.icon]}
                </div>
                <div className="flex-1">
                    <div className="flex items-center justify-between">
                        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                            {tool.name}
                            {isActive && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Activo</span>}
                        </h3>
                        <label className="relative inline-flex items-center cursor-pointer select-none gap-3">
                            <input
                                type="checkbox"
                                className="sr-only peer"
                                checked={isActive}
                                onChange={(e) => setIsActive(e.target.checked)}
                            />
                            <div className={`
                                w-11 h-6 rounded-full transition-colors duration-200 ease-in-out relative
                                ${isActive ? 'bg-adhoc-violet' : 'bg-gray-200'}
                            `}>
                                <div className={`
                                    absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-sm
                                    transition-transform duration-200 ease-in-out
                                    ${isActive ? 'translate-x-5' : 'translate-x-0'}
                                `} />
                            </div>
                            <span className="text-sm font-medium text-gray-700">
                                {isActive ? 'Habilitado' : 'Deshabilitado'}
                            </span>
                        </label>
                    </div>
                    <p className="text-sm text-gray-500 mt-1">{tool.description}</p>
                    
                    {tool.envNote && (
                        <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg mt-3">
                            ⚙️ {tool.envNote}
                        </p>
                    )}
                    
                    {tool.configFields.length > 0 && (
                        <div className="mt-4 grid gap-3 sm:grid-cols-2">
                            {tool.configFields.map(field => (
                                <div key={field.name}>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{field.label}</label>
                                    <input
                                        type={field.type}
                                        value={config[field.name] || ''}
                                        onChange={(e) => updateConfig(field.name, e.target.value)}
                                        placeholder={field.placeholder}
                                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-adhoc-violet focus:border-adhoc-violet"
                                    />
                                    {config[field.name] && field.type !== 'password' && (
                                        <p className="text-xs text-green-600 mt-1">✓ Configurado</p>
                                    )}
                                    {config[field.name] && field.type === 'password' && (
                                        <p className="text-xs text-green-600 mt-1">✓ ••••••••</p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
            
            <div className="px-6 py-3 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
                <div>
                    {error && <p className="text-sm text-red-600">{error}</p>}
                    {saved && <p className="text-sm text-green-600 flex items-center gap-1"><CheckCircle className="w-4 h-4" /> Guardado correctamente</p>}
                </div>
                <button 
                    onClick={handleSave}
                    disabled={saving}
                    className="flex items-center gap-2 bg-adhoc-violet hover:bg-adhoc-violet/90 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {saving ? 'Guardando...' : 'Guardar'}
                </button>
            </div>
        </div>
    )
}

interface ToolsListProps {
    integrations: Array<{ slug: string; is_active: boolean; config: Record<string, string> }>
}

export function ToolsList({ integrations }: ToolsListProps) {
    const integrationsMap = new Map(integrations.map(i => [i.slug, i]))

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
