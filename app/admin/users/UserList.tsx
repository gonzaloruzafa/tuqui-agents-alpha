'use client'

import { Shield, ShieldCheck, Trash2 } from 'lucide-react'
import { updateUserRole, deleteUser } from './actions'
import { useState } from 'react'

interface User {
    id: string
    email: string
    is_admin: boolean
    role: string
    created_at: string
}

export function UserList({ initialUsers, currentUserEmail }: { initialUsers: User[], currentUserEmail: string }) {
    const [isLoading, setIsLoading] = useState<string | null>(null)

    const handleToggleAdmin = async (user: User) => {
        if (user.email === currentUserEmail) return
        setIsLoading(user.id)
        try {
            await updateUserRole(user.id, !user.is_admin)
        } catch (e) {
            alert('Error al actualizar rol')
        } finally {
            setIsLoading(null)
        }
    }

    const handleDelete = async (user: User) => {
        if (user.email === currentUserEmail) return
        if (!confirm(`¿Estás seguro de eliminar a ${user.email}?`)) return

        setIsLoading(user.id)
        try {
            await deleteUser(user.id)
        } catch (e) {
            alert('Error al eliminar usuario')
        } finally {
            setIsLoading(null)
        }
    }

    return (
        <div className="space-y-3">
            {initialUsers.map((u) => (
                <div key={u.id} className={`bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex items-center justify-between group hover:border-blue-200 transition-all ${isLoading === u.id ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-medium ${u.is_admin ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                            {u.email[0].toUpperCase()}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900">{u.email}</span>
                                {u.is_admin ? (
                                    <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 text-[10px] font-bold uppercase tracking-tight flex items-center gap-1">
                                        <ShieldCheck className="w-3 h-3" />
                                        Admin
                                    </span>
                                ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-gray-50 text-gray-500 text-[10px] font-bold uppercase tracking-tight">
                                        User
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-gray-400 mt-0.5">
                                Agregado el {new Date(u.created_at).toLocaleDateString('es-AR')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => handleToggleAdmin(u)}
                            disabled={u.email === currentUserEmail || isLoading !== null}
                            className={`p-2 rounded-lg transition-colors ${u.is_admin ? 'text-blue-400 hover:bg-blue-50' : 'text-gray-300 hover:bg-gray-100'}`}
                            title={u.is_admin ? "Quitar Admin" : "Hacer Admin"}
                        >
                            <Shield className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => handleDelete(u)}
                            disabled={u.email === currentUserEmail || isLoading !== null}
                            className="p-2 text-gray-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                            title="Eliminar Usuario"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    </div>
                </div>
            ))}
        </div>
    )
}
