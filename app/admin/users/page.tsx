import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus, Users, Mail, Home } from 'lucide-react'
import { getMasterClient } from '@/lib/supabase/master'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { addUser } from './actions'
import { UserList } from './UserList'

async function getTenantUsers(tenantId: string) {
    const db = getMasterClient()
    const { data, error } = await db
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

    if (error) {
        console.error('Error fetching users:', error)
        return []
    }
    return data || []
}

export default async function AdminUsersPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const users = await getTenantUsers(session.tenant!.id)

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans flex flex-col">
            <Header />

            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Users className="w-4 h-4 text-blue-600" />
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Gestión de Usuarios</h1>
                        </div>
                    </div>
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Ir a inicio">
                        <Home className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            <div className="flex-grow max-w-4xl mx-auto px-6 py-8 w-full">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">

                    {/* Add User Sidebar */}
                    <div className="md:col-span-1">
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-24">
                            <div className="p-5 border-b border-gray-100 bg-gray-50/30">
                                <h2 className="font-semibold text-gray-900 flex items-center gap-2">
                                    <UserPlus className="w-4 h-4 text-blue-600" />
                                    Invitar Usuario
                                </h2>
                            </div>
                            <div className="p-5">
                                <form action={addUser} className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Email del Usuario
                                        </label>
                                        <div className="relative">
                                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                            <input
                                                name="email"
                                                type="email"
                                                required
                                                placeholder="usuario@empresa.com"
                                                className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all"
                                            />
                                        </div>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1.5">
                                            Rol Inicial
                                        </label>
                                        <select
                                            name="role"
                                            className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                                        >
                                            <option value="user">Usuario Estándar</option>
                                            <option value="admin">Administrador</option>
                                        </select>
                                    </div>
                                    <button
                                        type="submit"
                                        className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                                    >
                                        Agregar al Equipo
                                    </button>
                                </form>
                                <p className="mt-4 text-xs text-gray-400 leading-relaxed">
                                    El usuario podrá ingresar directamente con su cuenta de Google una vez que lo agregues.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Users List */}
                    <div className="md:col-span-2 space-y-4">
                        <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider px-1">
                            Usuarios Activos ({users.length})
                        </h3>

                        <UserList initialUsers={users} currentUserEmail={session.user?.email || ''} />
                    </div>
                </div>
            </div>

            <Footer />
        </div>
    )
}
