import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'
import { getAgentsForTenant } from '@/lib/agents/service'
import Link from 'next/link'
import { 
    Sparkles, Calculator, Scale, ShoppingCart, Database, 
    Bot, MessageSquare, Globe, Users, FileText 
} from 'lucide-react'

export const dynamic = 'force-dynamic'

const iconMap: Record<string, React.ReactNode> = {
    'Sparkles': <Sparkles className="w-8 h-8" />,
    'Calculator': <Calculator className="w-8 h-8" />,
    'Scale': <Scale className="w-8 h-8" />,
    'ShoppingCart': <ShoppingCart className="w-8 h-8" />,
    'Database': <Database className="w-8 h-8" />,
    'Bot': <Bot className="w-8 h-8" />,
    'MessageSquare': <MessageSquare className="w-8 h-8" />,
    'Globe': <Globe className="w-8 h-8" />,
    'Users': <Users className="w-8 h-8" />,
    'FileText': <FileText className="w-8 h-8" />,
}

const colorMap: Record<string, string> = {
    'violet': 'bg-adhoc-violet text-white',
    'green': 'bg-emerald-500 text-white',
    'blue': 'bg-blue-500 text-white',
    'yellow': 'bg-amber-500 text-white',
    'purple': 'bg-purple-600 text-white',
    'red': 'bg-red-500 text-white',
    'orange': 'bg-orange-500 text-white',
}

export default async function HomePage() {
    const session = await auth()

    if (!session?.tenant) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Acceso denegado</h1>
                    <p className="text-gray-500 mb-4">
                        Tu cuenta ({session?.user?.email}) no tiene un tenant asignado.
                    </p>
                    <p className="text-sm text-gray-400">
                        Contacta al administrador para obtener acceso.
                    </p>
                </div>
            </div>
        )
    }

    const agents = await getAgentsForTenant(session.tenant.id)

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-adhoc-lavender/20">
            <div className="max-w-6xl mx-auto px-4 py-12">
                {/* Header */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-3">
                        ¡Hola, {session.user?.name?.split(' ')[0] || 'Usuario'}! 👋
                    </h1>
                    <p className="text-xl text-gray-600">
                        ¿Con qué asistente querés hablar hoy?
                    </p>
                </div>

                {/* Agents Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {agents.map((agent) => (
                        <Link
                            key={agent.id}
                            href={`/chat/${agent.slug}`}
                            className="group bg-white rounded-2xl p-6 shadow-sm border border-gray-100 hover:shadow-lg hover:border-adhoc-violet/30 transition-all duration-300 hover:-translate-y-1"
                        >
                            <div className="flex items-start gap-4">
                                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center flex-shrink-0 ${colorMap[agent.color] || colorMap.violet} group-hover:scale-110 transition-transform`}>
                                    {iconMap[agent.icon] || <Bot className="w-8 h-8" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h2 className="text-lg font-bold text-gray-900 group-hover:text-adhoc-violet transition-colors">
                                        {agent.name}
                                    </h2>
                                    <p className="text-sm text-gray-500 line-clamp-2 mt-1">
                                        {agent.description || 'Asistente de IA'}
                                    </p>
                                </div>
                            </div>
                            
                            {/* Quick stats/tags */}
                            <div className="flex flex-wrap gap-2 mt-4">
                                {agent.rag_enabled && (
                                    <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs font-medium rounded-full">
                                        📚 Documentos
                                    </span>
                                )}
                                {agent.tools?.includes('odoo_intelligent_query') && (
                                    <span className="px-2 py-1 bg-purple-50 text-purple-600 text-xs font-medium rounded-full">
                                        📊 ERP
                                    </span>
                                )}
                                {agent.tools?.includes('meli_search') && (
                                    <span className="px-2 py-1 bg-yellow-50 text-yellow-600 text-xs font-medium rounded-full">
                                        🛒 MercadoLibre
                                    </span>
                                )}
                                {agent.tools?.includes('web_search') && (
                                    <span className="px-2 py-1 bg-green-50 text-green-600 text-xs font-medium rounded-full">
                                        🌐 Web
                                    </span>
                                )}
                            </div>
                        </Link>
                    ))}
                </div>

                {/* Footer hint */}
                <div className="text-center mt-12 text-gray-400 text-sm">
                    Powered by Tuqui AI • {session.tenant.name}
                </div>
            </div>
        </div>
    )
}
