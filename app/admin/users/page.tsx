import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, UserPlus, Trash2, Mail, Shield, ShieldCheck, ShieldOff, Home, Users } from 'lucide-react'
import { getMasterClient } from '@/lib/supabase/master'
import { revalidatePath } from 'next/cache'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

async function getUsers(tenantId: string) {
    const master = getMasterClient()
    const { data: users, error } = await master
        .from('users')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })

    if (error) throw error
    return users
}

async function addUser(formData: FormData) {
    'use server'
    const email = formData.get('email') as string
    const isAdmin = formData.get('is_admin') === 'on'
    const session = await auth()

    if (!session?.tenant?.id || !session.isAdmin) return

    const master = getMasterClient()
    await master.from('users').upsert({
        tenant_id: session.tenant.id,
        email: email,
        name: email.split('@')[0], // Simple default name
        is_admin: isAdmin
    }, { onConflict: 'tenant_id, email' })

    revalidatePath('/admin/users')
}

async function toggleAdmin(formData: FormData) {
    'use server'
    const userId = formData.get('userId') as string
    const currentIsAdmin = formData.get('currentIsAdmin') === 'true'
    const session = await auth()

    if (!session?.tenant?.id || !session.isAdmin) return

    const master = getMasterClient()
    await master.from('users')
        .update({ is_admin: !currentIsAdmin })
        .eq('id', userId)
        .eq('tenant_id', session.tenant.id)

    revalidatePath('/admin/users')
}

async function removeUser(formData: FormData) {
    'use server'
    const userId = formData.get('userId') as string
    const session = await auth()

    if (!session?.tenant?.id || !session.isAdmin) return

    const master = getMasterClient()
    await master.from('users').delete().eq('id', userId).eq('tenant_id', session.tenant.id)

    revalidatePath('/admin/users')
}

export default async function AdminUsersPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const users = await getUsers(session.tenant!.id)

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
                            <div className="w-8 h-8 bg-adhoc-coral/10 rounded-lg flex items-center justify-center">
                                <Users className="w-4 h-4 text-adhoc-coral" />
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Usuarios</h1>
                        </div>
                    </div>
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Ir a inicio">
                        <Home className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            <div className="flex-grow max-w-4xl mx-auto px-6 py-8 w-full">

                {/* Invite Box */}
                <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-8">
                    <h2 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <UserPlus className="w-5 h-5 text-adhoc-violet" />
                        Invitar Usuario
                    </h2>
                    <form action={addUser} className="space-y-4">
                        <div className="flex gap-4">
                            <input
                                name="email"
                                type="email"
                                placeholder="nombre@empresa.com"
                                required
                                className="flex-1 border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-adhoc-violet focus:outline-none"
                            />
                            <button type="submit" className="bg-adhoc-violet hover:bg-adhoc-violet/90 text-white font-medium px-6 py-2 rounded-lg transition-colors">
                                Agregar
                            </button>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                            <input type="checkbox" name="is_admin" className="w-4 h-4 text-adhoc-violet rounded border-gray-300 focus:ring-adhoc-violet" />
                            <span className="text-sm text-gray-600">Dar permisos de administrador</span>
                        </label>
                    </form>
                </div>

                {/* Users List */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-6 py-4 border-b border-gray-200 bg-gray-50/50 flex justify-between items-center">
                        <h3 className="font-semibold text-gray-700">Miembros del Equipo ({users.length})</h3>
                    </div>

                    <ul className="divide-y divide-gray-100">
                        {users.map(user => (
                            <li key={user.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center ${user.is_admin ? 'bg-adhoc-lavender' : 'bg-gray-100'}`}>
                                        {user.is_admin ? <Shield className="w-5 h-5 text-adhoc-violet" /> : <Mail className="w-5 h-5 text-gray-500" />}
                                    </div>
                                    <div>
                                        <p className="font-medium text-gray-900">{user.email}</p>
                                        <p className="text-xs text-gray-500">{user.name || 'Sin nombre'} • {user.is_admin ? 'Admin' : 'Usuario'}</p>
                                    </div>
                                </div>

                                {session.user?.email !== user.email && (
                                    <div className="flex items-center gap-2">
                                        {/* Toggle Admin */}
                                        <form action={toggleAdmin}>
                                            <input type="hidden" name="userId" value={user.id} />
                                            <input type="hidden" name="currentIsAdmin" value={String(user.is_admin)} />
                                            <button 
                                                type="submit" 
                                                className={`p-2 rounded-lg transition-colors ${user.is_admin ? 'text-adhoc-violet hover:bg-adhoc-lavender' : 'text-gray-400 hover:text-adhoc-violet hover:bg-gray-100'}`}
                                                title={user.is_admin ? 'Quitar admin' : 'Hacer admin'}
                                            >
                                                {user.is_admin ? <ShieldCheck className="w-5 h-5" /> : <ShieldOff className="w-5 h-5" />}
                                            </button>
                                        </form>
                                        {/* Delete */}
                                        <form action={removeUser}>
                                            <input type="hidden" name="userId" value={user.id} />
                                            <button type="submit" className="text-gray-400 hover:text-red-600 p-2 rounded-lg hover:bg-red-50 transition-colors" title="Eliminar usuario">
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </form>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ul>
                </div>

            </div>

            <Footer />
        </div>
    )
}
