import Link from 'next/link'
import { auth } from '@/lib/auth/config'
import { getAgentsForTenant } from '@/lib/agents/service'
import { Header } from '@/components/Header'
import {
    ArrowRight, Scale, Users, Briefcase, HeadphonesIcon,
    Bot, Brain, Code, Lightbulb, MessageSquare, Sparkles,
    GraduationCap, Heart, ShoppingCart, TrendingUp, Wrench,
    FileText, Calculator, Globe, Shield, Zap, Mail, Settings,
    Database
} from 'lucide-react'

// Icon Map (duplicated from original or shared util)
const iconMap: Record<string, React.ReactNode> = {
    'Scale': <Scale className="w-6 h-6 text-adhoc-violet" />,
    'Users': <Users className="w-6 h-6 text-adhoc-violet" />,
    'Briefcase': <Briefcase className="w-6 h-6 text-adhoc-violet" />,
    'HeadphonesIcon': <HeadphonesIcon className="w-6 h-6 text-adhoc-violet" />,
    'Bot': <Bot className="w-6 h-6 text-adhoc-violet" />,
    'Brain': <Brain className="w-6 h-6 text-adhoc-violet" />,
    'Code': <Code className="w-6 h-6 text-adhoc-violet" />,
    'Lightbulb': <Lightbulb className="w-6 h-6 text-adhoc-violet" />,
    'MessageSquare': <MessageSquare className="w-6 h-6 text-adhoc-violet" />,
    'Sparkles': <Sparkles className="w-6 h-6 text-adhoc-violet" />,
    'GraduationCap': <GraduationCap className="w-6 h-6 text-adhoc-violet" />,
    'Heart': <Heart className="w-6 h-6 text-adhoc-violet" />,
    'ShoppingCart': <ShoppingCart className="w-6 h-6 text-adhoc-violet" />,
    'TrendingUp': <TrendingUp className="w-6 h-6 text-adhoc-violet" />,
    'Wrench': <Wrench className="w-6 h-6 text-adhoc-violet" />,
    'FileText': <FileText className="w-6 h-6 text-adhoc-violet" />,
    'Calculator': <Calculator className="w-6 h-6 text-adhoc-violet" />,
    'Globe': <Globe className="w-6 h-6 text-adhoc-violet" />,
    'Shield': <Shield className="w-6 h-6 text-adhoc-violet" />,
    'Zap': <Zap className="w-6 h-6 text-adhoc-violet" />,
    'Mail': <Mail className="w-6 h-6 text-adhoc-violet" />,
    'Database': <Database className="w-6 h-6 text-adhoc-violet" />,
}

const getAgentIcon = (iconName: string) => {
    return iconMap[iconName] || <Bot className="w-6 h-6 text-adhoc-violet" />
}

export const dynamic = 'force-dynamic'

export default async function HomePage() {
    const session = await auth()

    if (!session?.tenant) {
        // Should not happen if middleware works, but...
        return <div>Error de autenticación: Tenant no encontrado.</div>
    }

    const agents = await getAgentsForTenant(session.tenant.id)

    return (
        <div className="min-h-screen flex flex-col bg-gray-50 font-sans">
            <Header />

            {/* Main */}
            <main className="flex-grow flex items-center justify-center px-4 py-8">
                <div className="w-full max-w-md">

                    <div className="text-center mb-8">
                        <h1 className="text-2xl font-medium text-gray-900 mb-2 font-display">
                            Asistentes IA para tu empresa
                        </h1>
                        <p className="text-sm text-gray-500">
                            Seleccioná un agente para comenzar
                        </p>
                    </div>

                    {/* Highlighted Agent (Tuqui Chat or first one) */}
                    <Link
                        href="/chat/tuqui-chat"
                        className="flex items-center gap-4 p-5 mb-6 bg-gradient-to-r from-adhoc-violet to-purple-600 rounded-xl shadow-lg hover:shadow-xl transition-all group"
                    >
                        <div className="w-14 h-14 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
                            <Sparkles className="w-7 h-7 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                            <h3 className="text-lg font-semibold text-white">
                                Tuqui Chat
                            </h3>
                            <p className="text-sm text-white/80">
                                Asistente general
                            </p>
                        </div>
                        <ArrowRight className="w-6 h-6 text-white/70 group-hover:text-white group-hover:translate-x-1 transition-all flex-shrink-0" />
                    </Link>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex-1 h-px bg-gray-200"></div>
                        <span className="text-xs text-gray-400 font-medium">Agentes especializados</span>
                        <div className="flex-1 h-px bg-gray-200"></div>
                    </div>

                    {/* List */}
                    <div className="space-y-3">
                        {agents.filter(a => a.slug !== 'tuqui-chat').map((agent) => (
                            <Link
                                key={agent.id}
                                href={`/chat/${agent.slug}`}
                                className="flex items-center gap-4 p-4 bg-white rounded-lg border border-gray-200 hover:border-adhoc-violet hover:shadow-md transition-all group"
                            >
                                <div className="w-12 h-12 rounded-lg bg-adhoc-lavender/30 flex items-center justify-center flex-shrink-0">
                                    {getAgentIcon(agent.icon)}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-base font-medium text-gray-900 group-hover:text-adhoc-violet transition-colors">
                                        {agent.name}
                                    </h3>
                                    <p className="text-sm text-gray-500 truncate">
                                        {agent.description}
                                    </p>
                                </div>
                                <ArrowRight className="w-5 h-5 text-gray-400 group-hover:text-adhoc-violet transition-colors flex-shrink-0" />
                            </Link>
                        ))}
                    </div>

                </div>
            </main>

            <footer className="bg-white border-t border-gray-100 py-6 mt-auto">
                <div className="max-w-5xl mx-auto px-4 text-center">
                    <p className="text-xs text-gray-400">
                        © {new Date().getFullYear()} Adhoc S.A.
                    </p>
                </div>
            </footer>
        </div>
    )
}
