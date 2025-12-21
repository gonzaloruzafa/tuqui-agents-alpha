import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Bot, FileText, Wrench, Brain } from 'lucide-react'
import { getTenantClient } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { Switch } from '@/components/ui/Switch'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

async function getAgentDetails(tenantId: string, slug: string) {
    const db = await getTenantClient(tenantId)
    const { data: agent, error } = await db.from('agents').select('*').eq('slug', slug).single()
    if (error || !agent) return null

    // Get linked docs
    const { data: linkedDocs } = await db.from('agent_documents').select('document_id').eq('agent_id', agent.id)
    const linkedDocIds = new Set(linkedDocs?.map((d: any) => d.document_id) || [])

    // Get tools from agent_tools table
    const { data: agentTools } = await db.from('agent_tools').select('tool_slug').eq('agent_id', agent.id).eq('enabled', true)
    const tools = agentTools?.map((t: any) => t.tool_slug) || []

    return { ...agent, linkedDocIds, tools }
}

async function getAllDocs(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const { data } = await db.from('documents').select('id, metadata').order('created_at', { ascending: false })
    return data || []
}

async function updateAgent(formData: FormData) {
    'use server'
    const slug = formData.get('slug') as string
    const name = formData.get('name') as string
    const systemPrompt = formData.get('system_prompt') as string
    const ragEnabled = formData.get('rag_enabled') === 'on'
    const isActive = formData.get('is_active') === 'on'

    // Tools handling (multi-value)
    const tools = formData.getAll('tools') as string[]

    // Docs handling
    const docIds = formData.getAll('doc_ids') as string[]

    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) return

    const db = await getTenantClient(session.tenant.id)

    // Get agent ID
    const { data: agent } = await db.from('agents').select('id').eq('slug', slug).single()
    if (!agent) return

    // Update Agent Main Fields (without tools column - use agent_tools table)
    await db.from('agents').update({
        name: name,
        system_prompt: systemPrompt,
        rag_enabled: ragEnabled,
        is_active: isActive
    }).eq('id', agent.id)

    // Update Agent Tools (Resync)
    // 1. Delete all current tools
    await db.from('agent_tools').delete().eq('agent_id', agent.id)

    // 2. Insert new ones
    if (tools.length > 0) {
        await db.from('agent_tools').insert(
            tools.map(toolSlug => ({
                agent_id: agent.id,
                tool_slug: toolSlug,
                enabled: true
            }))
        )
    }

    // Update Document Links (Resync)
    // 1. Delete all current links
    await db.from('agent_documents').delete().eq('agent_id', agent.id)

    // 2. Insert new ones
    if (docIds.length > 0) {
        await db.from('agent_documents').insert(
            docIds.map(docId => ({
                agent_id: agent.id,
                document_id: docId
            }))
        )
    }

    revalidatePath(`/admin/agents/${slug}`)
    revalidatePath('/admin/agents')
}

export default async function AgentEditorPage({ params }: { params: Promise<{ slug: string }> }) {
    const { slug } = await params
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const agent = await getAgentDetails(session.tenant!.id, slug)
    if (!agent) redirect('/admin/agents')

    const allDocs = await getAllDocs(session.tenant!.id)

    // Tools hardcoded for alpha available choices
    const AVAILABLE_TOOLS = [
        { slug: 'web_search', label: 'Búsqueda Web (Tavily)', description: 'Buscar información actualizada en internet' },
        { slug: 'odoo', label: 'Odoo ERP', description: 'Consultar ventas, contactos, productos del ERP' },
        { slug: 'meli_search', label: 'MercadoLibre', description: 'Buscar productos y analizar precios en MELI' }
    ]

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <Header />

            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin/agents" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                            <span className="text-gray-400 font-normal">/</span>
                            {agent.name}
                        </h1>
                    </div>
                </div>
            </div>

            <div className="flex-grow max-w-4xl mx-auto px-6 py-8 w-full">
                <form action={updateAgent} className="space-y-6">
                    <input type="hidden" name="slug" value={agent.slug} />

                    {/* Brain Config */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <Brain className="w-5 h-5 text-adhoc-violet" />
                                <h2 className="font-semibold text-gray-900">Configuración del Cerebro</h2>
                            </div>
                            <Switch name="is_active" defaultChecked={agent.is_active} label="Agente Activo" />
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre del Agente</label>
                                <input
                                    name="name"
                                    defaultValue={agent.name || ''}
                                    type="text"
                                    className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-adhoc-violet focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Prompt del Sistema</label>
                                <textarea
                                    name="system_prompt"
                                    defaultValue={agent.system_prompt || ''}
                                    rows={8}
                                    className="w-full border border-gray-300 rounded-lg p-3 font-mono text-sm focus:ring-2 focus:ring-adhoc-violet focus:outline-none"
                                />
                                <p className="text-xs text-gray-500 mt-2">Instrucciones base que definen el comportamiento.</p>
                            </div>
                        </div>
                    </div>

                    {/* RAG Config */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-blue-600" />
                            <h2 className="font-semibold text-gray-900">Base de Conocimiento</h2>
                        </div>
                        <div className="p-6 space-y-6">
                            <div className="flex gap-8">
                                <Switch name="rag_enabled" defaultChecked={agent.rag_enabled} label="Habilitar RAG" />
                            </div>

                            <div className="pt-2">
                                <h3 className="text-sm font-medium text-gray-700 mb-3">Documentos Disponibles</h3>
                                <div className="border border-gray-200 rounded-lg max-h-60 overflow-y-auto divide-y divide-gray-100">
                                    {allDocs.map((doc: any) => (
                                        <label key={doc.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                name="doc_ids"
                                                value={doc.id}
                                                defaultChecked={agent.linkedDocIds.has(doc.id)}
                                                className="w-4 h-4 text-adhoc-violet rounded border-gray-300 focus:ring-adhoc-violet"
                                            />
                                            <span className="text-sm text-gray-700 truncate">{(doc.metadata as any)?.filename || doc.id}</span>
                                        </label>
                                    ))}
                                    {allDocs.length === 0 && <div className="p-4 text-center text-sm text-gray-400">No hay documentos cargados.</div>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Tools Config */}
                    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                        <div className="p-5 border-b border-gray-100 bg-gray-50/50 flex items-center gap-2">
                            <Wrench className="w-5 h-5 text-green-600" />
                            <h2 className="font-semibold text-gray-900">Herramientas</h2>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {AVAILABLE_TOOLS.map(tool => (
                                    <div key={tool.slug} className="flex items-center gap-3 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition">
                                        <Switch
                                            name="tools"
                                            value={tool.slug}
                                            defaultChecked={agent.tools?.includes(tool.slug)}
                                            label={tool.label}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="flex justify-end pt-4 pb-20">
                        <button type="submit" className="flex items-center gap-2 bg-adhoc-violet hover:bg-adhoc-violet/90 text-white font-medium px-8 py-3 rounded-lg transition-colors shadow-lg shadow-adhoc-violet/20">
                            <Save className="w-5 h-5" />
                            Guardar Cambios
                        </button>
                    </div>

                </form>
            </div>

            <Footer />
        </div>
    )
}
