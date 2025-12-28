import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bot, Edit, Save, Plus, Wrench, Home } from 'lucide-react'
import { getTenantClient } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'

async function getAgents(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const { data: agents, error } = await db
        .from('agents')
        .select('*')
        .order('name', { ascending: true })

    if (error) throw error
    return agents
}

async function updateAgent(formData: FormData) {
    'use server'
    const slug = formData.get('slug') as string
    const systemPrompt = formData.get('system_prompt') as string
    const isActive = formData.get('is_active') === 'on'

    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) return

    const db = await getTenantClient(session.tenant.id)

    await db.from('agents').update({
        system_prompt: systemPrompt,
        is_active: isActive
    }).eq('slug', slug)

    revalidatePath('/admin/agents')
}

export default async function AdminAgentsPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const agents = await getAgents(session.tenant!.id)

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans">
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-adhoc-lavender rounded-lg flex items-center justify-center">
                                <Bot className="w-4 h-4 text-adhoc-violet" />
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Agentes</h1>
                        </div>
                    </div>
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Ir a inicio">
                        <Home className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-8">
                <div className="grid gap-6">
                    {agents.map(agent => (
                        <div key={agent.id} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="p-6 border-b border-gray-100 flex justify-between items-start bg-gray-50/30">
                                <div className="flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-adhoc-lavender flex items-center justify-center">
                                        <Bot className="w-6 h-6 text-adhoc-violet" />
                                    </div>
                                    <div>
                                        <h3 className="text-lg font-semibold text-gray-900">{agent.name}</h3>
                                        <p className="text-xs font-mono text-gray-500 bg-gray-100 px-2 py-0.5 rounded inline-block mt-1">/agent/{agent.slug}</p>
                                    </div>
                                </div>
                                <div className={`px-2 py-1 rounded text-xs font-medium ${agent.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                                    {agent.is_active ? 'Activo' : 'Inactivo'}
                                </div>
                            </div>

                            <div className="p-6 bg-white border-t border-gray-50 flex justify-between items-center">
                                <p className="text-sm text-gray-500 line-clamp-1 flex-1 mr-4 italic">
                                    "{agent.system_prompt?.substring(0, 60)}..."
                                </p>
                                <Link href={`/admin/agents/${agent.slug}`} className="flex items-center gap-2 bg-white border border-gray-200 hover:border-adhoc-violet text-gray-700 hover:text-adhoc-violet font-medium px-4 py-2 rounded-lg transition-all text-sm shadow-sm group">
                                    <Wrench className="w-4 h-4 group-hover:rotate-45 transition-transform" />
                                    Configurar
                                </Link>
                            </div>
                        </div>
                    ))}

                    {/* Add Agent Placeholder */}
                    <button className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center text-gray-500 hover:border-adhoc-violet hover:text-adhoc-violet hover:bg-adhoc-violet/5 transition-all w-full">
                        <Plus className="w-8 h-8 mb-2" />
                        <span className="font-medium">Crear Nuevo Agente Personalizado</span>
                    </button>
                </div>
            </div>
        </div>
    )
}
