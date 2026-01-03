'use client'

import { useState, useEffect } from 'react'
import { Building, Plus, RefreshCw, Loader2 } from 'lucide-react'

interface Tenant {
    id: string
    name: string
    created_at: string
    users: Array<{ email: string; is_admin: boolean }>
}

export default function SuperAdminTenantsPage() {
    const [tenants, setTenants] = useState<Tenant[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [syncing, setSyncing] = useState(false)
    const [formData, setFormData] = useState({
        name: '',
        adminEmail: '',
        adminPassword: ''
    })
    const [creating, setCreating] = useState(false)

    const fetchTenants = async () => {
        setLoading(true)
        setError(null)
        console.log('[SuperAdmin Page] Fetching tenants...')
        try {
            const res = await fetch('/api/super-admin/tenants')
            console.log('[SuperAdmin Page] Response status:', res.status)
            const data = await res.json()
            console.log('[SuperAdmin Page] Response data:', data)
            if (res.ok) {
                setTenants(Array.isArray(data) ? data : [])
            } else {
                console.error('[SuperAdmin Page] Error:', data.error)
                setError(data.error || 'Error desconocido')
            }
        } catch (err: any) {
            console.error('[SuperAdmin Page] Fetch error:', err)
            setError(err.message || 'Error de conexión')
        } finally {
            setLoading(false)
        }
    }

    const createTenant = async (e: React.FormEvent) => {
        e.preventDefault()
        setCreating(true)

        try {
            const res = await fetch('/api/super-admin/tenants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            })

            if (res.ok) {
                setShowModal(false)
                setFormData({ name: '', adminEmail: '', adminPassword: '' })
                fetchTenants()
            } else {
                const data = await res.json()
                alert('Error al crear tenant: ' + data.error)
            }
        } catch (error) {
            console.error('Error creating tenant:', error)
            alert('Error al crear tenant')
        }

        setCreating(false)
    }

    const syncMasters = async () => {
        if (!confirm('¿Sincronizar todos los agentes desde master_agents? Esto actualizará todos los tenants.')) return

        setSyncing(true)
        try {
            const res = await fetch('/api/super-admin/tenants', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'sync_masters' })
            })

            if (res.ok) {
                alert('✅ Agents sincronizados correctamente')
            } else {
                const data = await res.json()
                alert('❌ Error al sincronizar: ' + data.error)
            }
        } catch (error) {
            console.error('Error syncing:', error)
            alert('❌ Error al sincronizar')
        }

        setSyncing(false)
    }

    useEffect(() => { fetchTenants() }, [])

    return (
        <>
            <div className="flex-grow max-w-7xl mx-auto px-6 py-10 w-full">
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-2 font-display">
                            <Building className="w-8 h-8 text-adhoc-violet" />
                            Gestión de Tenants
                        </h1>
                    <p className="text-gray-500 mt-1">Panel Super Admin - Provisioning Multi-Tenant</p>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={syncMasters}
                        disabled={syncing}
                        className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
                        {syncing ? 'Sincronizando...' : 'Sync Masters'}
                    </button>

                    <button
                        onClick={() => setShowModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-adhoc-violet text-white rounded-lg hover:bg-adhoc-violet/90 shadow-sm"
                    >
                            <Plus className="w-4 h-4" />
                            Nuevo Tenant
                        </button>
                    </div>
                </div>

                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader2 className="w-8 h-8 animate-spin text-adhoc-violet" />
                    </div>
                ) : error ? (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
                        <p className="text-red-600 font-medium">Error: {error}</p>
                        <button 
                            onClick={fetchTenants}
                            className="mt-4 px-4 py-2 bg-red-100 hover:bg-red-200 rounded-lg text-red-700"
                        >
                            Reintentar
                        </button>
                    </div>
                ) : (
                    <div className="bg-white rounded-2xl border border-adhoc-lavender/30 shadow-sm overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-50/50 border-b border-adhoc-lavender/30">
                                <tr>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Nombre</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Admin Email</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Creado</th>
                                    <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Estado</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-adhoc-lavender/20">
                                {tenants.map(t => (
                                    <tr key={t.id} className="hover:bg-gray-50/50 transition-colors">
                                        <td className="px-6 py-4 font-medium text-gray-900">{t.name}</td>
                                        <td className="px-6 py-4 text-gray-600">{t.users?.[0]?.email || '-'}</td>
                                        <td className="px-6 py-4 text-gray-600 text-sm">
                                            {new Date(t.created_at).toLocaleDateString('es-AR', {
                                                year: 'numeric',
                                                month: 'short',
                                                day: 'numeric'
                                            })}
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-3 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                                                Activo
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {tenants.length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center text-gray-500">
                                            No hay tenants creados. Crea el primero con el botón de arriba.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal crear tenant */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl">
                        <h2 className="text-2xl font-bold mb-6 font-display">Crear Nuevo Tenant</h2>

                        <form onSubmit={createTenant} className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">Nombre del Tenant</label>
                                <input
                                    type="text"
                                    required
                                    value={formData.name}
                                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-adhoc-violet focus:border-transparent"
                                    placeholder="Ej: Empresa ABC"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">Email Admin</label>
                                <input
                                    type="email"
                                    required
                                    value={formData.adminEmail}
                                    onChange={e => setFormData({ ...formData, adminEmail: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-adhoc-violet focus:border-transparent"
                                    placeholder="admin@empresa.com"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium mb-2 text-gray-700">Contraseña Admin</label>
                                <input
                                    type="password"
                                    required
                                    value={formData.adminPassword}
                                    onChange={e => setFormData({ ...formData, adminPassword: e.target.value })}
                                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-adhoc-violet focus:border-transparent"
                                    placeholder="Mínimo 8 caracteres"
                                    minLength={8}
                                />
                            </div>

                            <div className="flex gap-3 pt-4">
                                <button
                                    type="button"
                                    onClick={() => setShowModal(false)}
                                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={creating}
                                    className="flex-1 px-4 py-2 bg-adhoc-violet text-white rounded-lg hover:bg-adhoc-violet/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {creating ? 'Creando...' : 'Crear Tenant'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </>
    )
}
