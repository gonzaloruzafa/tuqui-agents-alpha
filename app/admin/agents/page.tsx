'use client'

import { useState, useEffect } from 'react'
import { Brain, Wrench, Plus, Sparkles, X, Loader2, Lock, Pencil } from 'lucide-react'
import { AdminSubHeader } from '@/components/admin/AdminSubHeader'

interface Agent {
    id: string
    name: string
    slug: string
    description: string | null
    system_prompt: string | null
    rag_enabled: boolean
    is_active: boolean
    tools: string[]
    master_agent_id: string | null
}

export default function AdminAgentsPage() {
    const [agents, setAgents] = useState<Agent[]>([])
    const [loading, setLoading] = useState(true)
    const [showModal, setShowModal] = useState(false)
    const [creating, setCreating] = useState(false)
    const [tenantName, setTenantName] = useState<string>('')
    const [formData, setFormData] = useState({
        name: '',
        description: '',
        systemPrompt: '',
        ragEnabled: true,
        tools: ['web_search'] as string[]
    })

    const fetchAgents = async () => {
        try {
            const res = await fetch('/api/admin/agents')
            if (res.ok) {
                const data = await res.json()
                setAgents(data.agents || [])
                setTenantName(data.tenantName || '')
            }
        } catch (err) {
            console.error('Error fetching agents:', err)
        } finally {
            setLoading(false)
        }
    }

    const createAgent = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)

        try {
            const res = await fetch('/api/admin/agents', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                setShowModal(false)
                setFormData({
                    name: '',
                    description: '',
                    systemPrompt: '',
                    ragEnabled: true,
                    tools: ['web_search']
                })
                fetchAgents()
            } else {
                const data = await res.json()
                alert('Error al crear agente: ' + data.error)
            }
        } catch (error) {
            console.error('Error creating agent:', error)
            alert('Error al crear agente')
        } finally {
            setCreating(false)
        }
    }

    const toggleTool = (tool: string) => {
        setFormData(prev => ({
            ...prev,
            tools: prev.tools.includes(tool)
                ? prev.tools.filter(t => t !== tool)
                : [...prev.tools, tool]
        }))
    }

    useEffect(() => {
        fetchAgents()
    }, [])

    const availableTools = [
        { id: 'web_search', name: 'Búsqueda Web', icon: '🌐', description: 'TODO-EN-UNO: Tavily + Google Grounding' },
        { id: 'odoo_intelligent_query', name: 'Odoo ERP', icon: '📊', description: 'Consultar datos del ERP' },
    ]

    return (
        <>
            <AdminSubHeader
                title="Agentes"
                backHref="/admin"
                icon={Brain}
                tenantName={tenantName}
            />

            <div className="flex-grow max-w-5xl mx-auto px-6 py-10 w-full">
                {/* Info banner */}
                <div className="mb-8 p-4 bg-adhoc-lavender/20 rounded-xl border border-adhoc-lavender/30">
                    <div className="flex items-start gap-3">
                        <Sparkles className="w-5 h-5 text-adhoc-violet mt-0.5" />
                        <div>
                            <h3 className="font-semibold text-gray-900">Agentes internos</h3>
                            <p className="text-sm text-gray-600 mt-1">
                                Cada agente tiene su propio prompt, documentos (RAG) y herramientas. 
                                Tuqui decide automáticamente cuál usar según la consulta del usuario.
                            </p>
                        </div>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-adhoc-violet" />
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {agents.map(agent => {
                            const isBaseAgent = !!agent.master_agent_id
                            return (
                                <div key={agent.id} className="group bg-white rounded-3xl border border-adhoc-lavender/30 shadow-sm hover:shadow-xl hover:border-adhoc-violet/30 transition-all duration-300 overflow-hidden flex flex-col">
                                    <div className="p-8 border-b border-gray-50 flex justify-between items-start bg-gray-50/20">
                                        <div className="flex items-center gap-5">
                                            <div className="w-14 h-14 rounded-2xl bg-adhoc-lavender/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                                <Brain className="w-7 h-7 text-adhoc-violet" />
                                            </div>
                                            <div>
                                                <h3 className="text-xl font-bold text-gray-900 font-display">{agent.name}</h3>
                                                <div className="flex items-center gap-2 mt-1">
                                                    {isBaseAgent ? (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                                                            <Lock className="w-3 h-3" />
                                                            Base
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                            <Pencil className="w-3 h-3" />
                                                            Custom
                                                        </span>
                                                    )}
                                                    {agent.rag_enabled && (
                                                        <span className="text-[10px] text-gray-400">• 📚 RAG</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <div className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${agent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>
                                            {agent.is_active ? 'Activo' : 'Inactivo'}
                                        </div>
                                    </div>

                                    <div className="p-8 flex-1 flex flex-col justify-between gap-6">
                                        <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed">
                                            {agent.description || 'Sin descripción configurada...'}
                                        </p>

                                        <div className="flex items-center justify-end">
                                            <a href={`/admin/agents/${agent.slug}`} className="flex items-center gap-2 bg-adhoc-violet hover:bg-adhoc-violet/90 text-white font-bold px-5 py-2.5 rounded-xl transition-all shadow-md shadow-adhoc-violet/10 active:scale-95 text-sm group/btn">
                                                <Wrench className="w-4 h-4 group-hover/btn:rotate-45 transition-transform" />
                                                Configurar
                                            </a>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}

                        {/* Add Agent Button */}
                        <button 
                            onClick={() => setShowModal(true)}
                            className="border-2 border-dashed border-adhoc-lavender/40 rounded-3xl p-10 flex flex-col items-center justify-center text-gray-400 hover:border-adhoc-violet hover:text-adhoc-violet hover:bg-adhoc-lavender/10 transition-all duration-300 group"
                        >
                            <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-adhoc-violet group-hover:text-white transition-all">
                                <Plus className="w-8 h-8" />
                            </div>
                            <span className="font-bold text-sm uppercase tracking-widest font-display">Nuevo Agente</span>
                            <span className="text-xs mt-2 text-gray-400">Agregar agente personalizado</span>
                        </button>
                    </div>
                )}
            </div>

            {/* Modal crear agente */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-bold font-display">Crear Nuevo Agente</h2>
                            <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600">
                                <X className="w-6 h-6" />
                            </button>
                        </div>

                        <form onSubmit={createAgent} className="space-y-5">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">Nombre del Agente *</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-adhoc-violet focus:border-transparent"
                                    placeholder="Ej: Asistente de Ventas"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">Descripción</label>
                                <input
                                    type="text"
                                    value={formData.description}
                                    onChange={e => setFormData({ ...formData, description: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-adhoc-violet focus:border-transparent"
                                    placeholder="Breve descripción del agente"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">System Prompt</label>
                                <textarea
                                    value={formData.systemPrompt}
                                    onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
                                    rows={4}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-adhoc-violet focus:border-transparent resize-none"
                                    placeholder="Instrucciones específicas para este agente..."
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-3 text-gray-700">Herramientas</label>
                                <div className="space-y-2">
                                    {availableTools.map(tool => (
                                        <label key={tool.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-adhoc-lavender cursor-pointer transition-colors">
                                            <input
                                                type="checkbox"
                                                checked={formData.tools.includes(tool.id)}
                                                onChange={() => toggleTool(tool.id)}
                                                className="w-4 h-4 text-adhoc-violet rounded border-gray-300 focus:ring-adhoc-violet"
                                            />
                                            <span className="text-xl">{tool.icon}</span>
                                            <div className="flex-1">
                                                <p className="font-medium text-sm">{tool.name}</p>
                                                <p className="text-xs text-gray-500">{tool.description}</p>
                                            </div>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <label className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 hover:border-adhoc-lavender cursor-pointer transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={formData.ragEnabled}
                                        onChange={e => setFormData({ ...formData, ragEnabled: e.target.checked })}
                                        className="w-4 h-4 text-adhoc-violet rounded border-gray-300 focus:ring-adhoc-violet"
                                    />
                                    <span className="text-xl">📚</span>
                                    <div className="flex-1">
                                        <p className="font-medium text-sm">RAG (Documentos)</p>
                                        <p className="text-xs text-gray-500">Buscar en documentos subidos</p>
                                    </div>
                                </label>
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors font-medium"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating || !formData.name.trim()}
                                    className="flex-1 px-4 py-2.5 bg-adhoc-violet text-white rounded-lg hover:bg-adhoc-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium flex items-center justify-center gap-2"
                                >
                                    {creating ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Creando...
                                        </>
                                    ) : (
                                        'Crear Agente'
                                    )}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
