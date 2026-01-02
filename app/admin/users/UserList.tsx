'use client'

import { Shield, ShieldCheck, Trash2, Phone, Check, X } from 'lucide-react'
import { updateUserRole, deleteUser, updateUserPhone } from './actions'
import { useState } from 'react'

interface User {
    id: string
    email: string
    is_admin: boolean
    role: string
    whatsapp_phone?: string
    created_at: string
}

export function UserList({ initialUsers, currentUserEmail }: { initialUsers: User[], currentUserEmail: string }) {
    const [isLoading, setIsLoading] = useState<string | null>(null)
    const [editingPhone, setEditingPhone] = useState<{ id: string, value: string } | null>(null)

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

    const handleSavePhone = async (userId: string) => {
        if (!editingPhone) return
        setIsLoading(userId)
        try {
            await updateUserPhone(userId, editingPhone.value)
            setEditingPhone(null)
        } catch (e) {
            alert('Error al actualizar teléfono')
        } finally {
            setIsLoading(null)
        }
    }

    return (
        <div className="space-y-3">
            {initialUsers.map((u) => (
                <div key={u.id} className={`bg-white p-4 rounded-2xl border border-adhoc-lavender/20 shadow-sm flex items-center justify-between group hover:border-adhoc-violet/30 transition-all ${isLoading === u.id ? 'opacity-50' : ''}`}>
                    <div className="flex items-center gap-4 flex-grow">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${u.is_admin ? 'bg-adhoc-lavender text-adhoc-violet' : 'bg-gray-100 text-gray-400'}`}>
                            {u.email[0].toUpperCase()}
                        </div>
                        <div className="flex-grow min-w-0">
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-semibold text-gray-900 leading-none truncate">{u.email}</span>
                                {u.is_admin ? (
                                    <span className="px-2 py-0.5 rounded-full bg-adhoc-lavender/40 text-adhoc-violet text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 border border-adhoc-lavender/50 shrink-0">
                                        <ShieldCheck className="w-2.5 h-2.5" />
                                        Admin
                                    </span>
                                ) : (
                                    <span className="px-2 py-0.5 rounded-full bg-gray-50 text-gray-400 text-[9px] font-bold uppercase tracking-wider border border-gray-100 shrink-0">
                                        Standard
                                    </span>
                                )}
                            </div>

                            {/* WhatsApp Phone Field */}
                            <div className="mt-2 flex items-center gap-2 group/phone">
                                <Phone className="w-3 h-3 text-gray-400" />
                                {editingPhone?.id === u.id ? (
                                    <div className="flex items-center gap-1">
                                        <input
                                            type="text"
                                            value={editingPhone.value}
                                            onChange={(e) => setEditingPhone({ ...editingPhone, value: e.target.value })}
                                            placeholder="whatsapp:+123456789"
                                            className="text-[11px] font-medium text-adhoc-violet bg-adhoc-lavender/20 border-b border-adhoc-violet outline-none w-32 px-1"
                                            autoFocus
                                        />
                                        <button onClick={() => handleSavePhone(u.id)} className="text-green-500 hover:text-green-600 transition-colors">
                                            <Check className="w-3 h-3" />
                                        </button>
                                        <button onClick={() => setEditingPhone(null)} className="text-gray-400 hover:text-gray-600 transition-colors">
                                            <X className="w-3 h-3" />
                                        </button>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <span
                                            onClick={() => setEditingPhone({ id: u.id, value: u.whatsapp_phone || '' })}
                                            className={`text-[11px] font-medium cursor-pointer hover:text-adhoc-violet transition-colors ${u.whatsapp_phone ? 'text-gray-600' : 'text-gray-300 italic'}`}
                                        >
                                            {u.whatsapp_phone || 'Sin teléfono WhatsApp'}
                                        </span>
                                    </div>
                                )}
                            </div>

                            <p className="text-[10px] text-gray-400 font-medium uppercase tracking-tight mt-1 leading-none">
                                Miembro desde {new Date(u.created_at).toLocaleDateString('es-AR')}
                            </p>
                        </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
                        <button
                            onClick={() => handleToggleAdmin(u)}
                            disabled={u.email === currentUserEmail || isLoading !== null}
                            className={`p-2 rounded-lg transition-colors ${u.is_admin ? 'text-adhoc-violet hover:bg-adhoc-lavender/30' : 'text-gray-300 hover:bg-gray-100 hover:text-adhoc-violet'}`}
                            title={u.is_admin ? "Quitar Admin" : "Hacer Admin"}
                        >
                            <Shield className="w-4 h-4" />
                        </button>

                        <button
                            onClick={() => handleDelete(u)}
                            disabled={u.email === currentUserEmail || isLoading !== null}
                            className="p-2 text-gray-300 hover:text-adhoc-coral hover:bg-adhoc-coral/5 rounded-lg transition-colors"
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
