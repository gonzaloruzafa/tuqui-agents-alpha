import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { Brain, Users, Database, ArrowLeft, Wrench, Building, Clock } from 'lucide-react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default async function AdminPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const cards = [
        {
            title: 'Agentes',
            description: 'Configurar agentes y sus capacidades.',
            icon: Brain,
            href: '/admin/agents',
            color: 'text-adhoc-violet',
            bg: 'bg-adhoc-violet/10',
            action: 'Configurar'
        },
        {
            title: 'Base de Conocimiento',
            description: 'Documentos y fuentes de datos para RAG.',
            icon: Database,
            href: '/admin/rag',
            color: 'text-blue-600',
            bg: 'bg-blue-100',
            action: 'Gestionar Archivos'
        },
        {
            title: 'Prometeo',
            description: 'Tareas programadas y notificaciones push.',
            icon: Clock,
            href: '/admin/prometeo',
            color: 'text-purple-600',
            bg: 'bg-purple-100',
            action: 'Programar'
        },
        {
            title: 'Usuarios',
            description: 'Administrar acceso y roles del equipo.',
            icon: Users,
            href: '/admin/users',
            color: 'text-adhoc-coral',
            bg: 'bg-adhoc-coral/10',
            action: 'Ver Usuarios'
        },
        {
            title: 'Herramientas',
            description: 'Integraciones (Odoo, MercadoLibre, etc).',
            icon: Wrench,
            href: '/admin/tools',
            color: 'text-green-600',
            bg: 'bg-green-100',
            action: 'Integraciones'
        },
        {
            title: 'Empresa',
            description: 'Datos de facturación y configuración general.',
            icon: Building,
            href: '/admin/company',
            color: 'text-gray-600',
            bg: 'bg-gray-100',
            action: 'Ajustes'
        }
    ]

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            <Header />

            {/* Sub-header / Breadcrumb equivalent */}
            <div className="bg-white border-b border-adhoc-lavender/30 sticky top-0 z-10 shadow-sm">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/" className="p-1.5 hover:bg-adhoc-lavender/20 rounded-lg transition-colors text-gray-500 hover:text-adhoc-violet">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <h1 className="text-lg font-bold text-gray-900 font-display">Panel de Administración</h1>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">Tenant</span>
                        <span className="text-sm font-medium text-adhoc-violet px-3 py-1 bg-adhoc-lavender/30 rounded-full border border-adhoc-lavender/50">
                            {session.tenant?.name || 'Cliente Adhoc'}
                        </span>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="flex-grow max-w-5xl mx-auto px-6 py-10 w-full">
                <div className="text-center mb-8">
                    <h2 className="text-2xl font-medium text-gray-900 font-display">¿Qué quieres configurar hoy?</h2>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {cards.map((card, i) => (
                        <Link key={i} href={card.href} className="group bg-white p-6 rounded-2xl border border-gray-100 shadow-sm hover:shadow-lg hover:border-adhoc-violet/30 hover:-translate-y-1 transition-all duration-300 flex flex-col h-full relative overflow-hidden">
                            {/* Decorative background circle */}
                            <div className={`absolute top-0 right-0 w-24 h-24 ${card.bg} rounded-bl-full opacity-20 -mr-4 -mt-4 transition-transform group-hover:scale-110`}></div>

                            <div className={`w-12 h-12 ${card.bg} rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300 relative z-10`}>
                                <card.icon className={`w-6 h-6 ${card.color}`} />
                            </div>

                            <h3 className="font-bold text-gray-900 text-lg mb-2 group-hover:text-adhoc-violet transition-colors">{card.title}</h3>
                            <p className="text-sm text-gray-500 mb-6 flex-1 leading-relaxed">{card.description}</p>

                            <div className="flex items-center justify-between mt-auto pt-4 border-t border-gray-50">
                                <span className="text-xs font-semibold text-gray-400 group-hover:text-adhoc-violet transition-colors uppercase tracking-wider">Acción</span>
                                <div className="w-8 h-8 rounded-full bg-gray-50 flex items-center justify-center group-hover:bg-adhoc-violet group-hover:text-white transition-all transform rotate-0 group-hover:rotate-45">
                                    <ArrowLeft className="w-4 h-4 rotate-180" />
                                </div>
                            </div>
                        </Link>
                    ))}
                </div>

                <div className="mt-12 text-center">
                    <p className="text-xs text-gray-400">Tuqui Agents Alpha v0.1.0 • Built by Adhoc</p>
                </div>
            </div>

            <Footer />
        </div>
    )
}
