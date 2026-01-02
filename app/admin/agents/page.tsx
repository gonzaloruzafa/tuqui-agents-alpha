import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { Brain, Wrench, Plus, Sparkles } from 'lucide-react'
import { getTenantClient } from '@/lib/supabase/tenant'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { AdminSubHeader } from '@/components/admin/AdminSubHeader'

async function getSubAgents(tenantId: string) {
    const db = await getTenantClient(tenantId)
    // Por ahora, los sub-agentes son los agents existentes
    // Tuqui los orquesta internamente según el intent del usuario
    const { data: agents, error } = await db
        .from('agents')
        .select('*')
        .order('name', { ascending: true })

    if (error) throw error
    return agents
}

export default async function AdminSubAgentsPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const subAgents = await getSubAgents(session.tenant!.id)

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans flex flex-col">
            <Header />

            <AdminSubHeader
                title="Agentes"
                backHref="/admin"
                icon={Brain}
                tenantName={session.tenant?.name}
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

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {subAgents.map(agent => (
                        <div key={agent.id} className="group bg-white rounded-3xl border border-adhoc-lavender/30 shadow-sm hover:shadow-xl hover:border-adhoc-violet/30 transition-all duration-300 overflow-hidden flex flex-col">
                            <div className="p-8 border-b border-gray-50 flex justify-between items-start bg-gray-50/20">
                                <div className="flex items-center gap-5">
                                    <div className="w-14 h-14 rounded-2xl bg-adhoc-lavender/30 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
                                        <Brain className="w-7 h-7 text-adhoc-violet" />
                                    </div>
                                    <div>
                                        <h3 className="text-xl font-bold text-gray-900 font-display">{agent.name}</h3>
                                        <p className="text-xs text-gray-500 mt-1">
                                            {agent.rag_enabled ? '📚 RAG activo' : ''} 
                                        </p>
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
                    ))}

                    {/* Add SubAgent Placeholder */}
                    <button className="border-2 border-dashed border-adhoc-lavender/40 rounded-3xl p-10 flex flex-col items-center justify-center text-gray-400 hover:border-adhoc-violet hover:text-adhoc-violet hover:bg-adhoc-lavender/10 transition-all duration-300 group">
                        <div className="w-16 h-16 rounded-full bg-gray-50 flex items-center justify-center mb-4 group-hover:bg-adhoc-violet group-hover:text-white transition-all">
                            <Plus className="w-8 h-8" />
                        </div>
                        <span className="font-bold text-sm uppercase tracking-widest font-display">Nuevo Agente</span>
                        <span className="text-xs mt-2 text-gray-400">Agregar agente interno</span>
                    </button>
                </div>
            </div>

            <Footer />
        </div>
    )
}
