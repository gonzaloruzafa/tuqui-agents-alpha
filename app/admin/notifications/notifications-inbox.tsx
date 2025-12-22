'use client'

import { useState, useEffect, useCallback } from 'react'
import { 
    Bell, 
    Check, 
    CheckCheck, 
    Trash2, 
    RefreshCw,
    AlertCircle,
    AlertTriangle,
    Info,
    Filter,
    ExternalLink
} from 'lucide-react'
import Link from 'next/link'

interface Notification {
    id: string
    title: string
    body: string
    priority: 'info' | 'warning' | 'critical'
    is_read: boolean
    link?: string
    agent_name?: string
    agent_slug?: string
    created_at: string
}

type PriorityFilter = 'all' | 'info' | 'warning' | 'critical'
type ReadFilter = 'all' | 'unread' | 'read'

export default function NotificationsInbox() {
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [loading, setLoading] = useState(true)
    const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>('all')
    const [readFilter, setReadFilter] = useState<ReadFilter>('all')

    const fetchNotifications = useCallback(async () => {
        setLoading(true)
        try {
            let url = '/api/notifications?limit=50'
            if (readFilter === 'unread') url += '&unread=true'
            if (priorityFilter !== 'all') url += `&priority=${priorityFilter}`
            
            const res = await fetch(url)
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications || [])
            }
        } catch (e) {
            console.error('Failed to fetch notifications:', e)
        } finally {
            setLoading(false)
        }
    }, [priorityFilter, readFilter])

    useEffect(() => {
        fetchNotifications()
    }, [fetchNotifications])

    const markAsRead = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ is_read: true })
            })
            setNotifications(prev => 
                prev.map(n => n.id === id ? { ...n, is_read: true } : n)
            )
        } catch (e) {
            console.error('Failed to mark as read:', e)
        }
    }

    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', { method: 'POST' })
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
        } catch (e) {
            console.error('Failed to mark all as read:', e)
        }
    }

    const deleteNotification = async (id: string) => {
        try {
            await fetch(`/api/notifications/${id}`, { method: 'DELETE' })
            setNotifications(prev => prev.filter(n => n.id !== id))
        } catch (e) {
            console.error('Failed to delete notification:', e)
        }
    }

    const getPriorityStyles = (priority: string) => {
        switch (priority) {
            case 'critical':
                return {
                    icon: AlertCircle,
                    bgColor: 'bg-red-900/20',
                    borderColor: 'border-l-red-500',
                    textColor: 'text-red-400',
                    label: 'Crítica'
                }
            case 'warning':
                return {
                    icon: AlertTriangle,
                    bgColor: 'bg-yellow-900/20',
                    borderColor: 'border-l-yellow-500',
                    textColor: 'text-yellow-400',
                    label: 'Advertencia'
                }
            default:
                return {
                    icon: Info,
                    bgColor: 'bg-blue-900/20',
                    borderColor: 'border-l-blue-500',
                    textColor: 'text-blue-400',
                    label: 'Info'
                }
        }
    }

    const formatDate = (date: string) => {
        const d = new Date(date)
        const now = new Date()
        const diff = now.getTime() - d.getTime()
        
        if (diff < 60000) return 'Ahora'
        if (diff < 3600000) return `Hace ${Math.floor(diff / 60000)} min`
        if (diff < 86400000) return `Hace ${Math.floor(diff / 3600000)} horas`
        
        return d.toLocaleDateString('es-AR', { 
            day: 'numeric', 
            month: 'short',
            hour: '2-digit',
            minute: '2-digit'
        })
    }

    const unreadCount = notifications.filter(n => !n.is_read).length

    // Filter notifications client-side for read filter
    const filteredNotifications = notifications.filter(n => {
        if (readFilter === 'unread') return !n.is_read
        if (readFilter === 'read') return n.is_read
        return true
    })

    return (
        <div className="text-gray-100">
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700">
                <div className="max-w-4xl mx-auto px-4 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Bell className="w-8 h-8 text-blue-400" />
                            <div>
                                <h1 className="text-2xl font-bold">Notificaciones</h1>
                                <p className="text-sm text-gray-400">
                                    {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todas leídas'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={fetchNotifications}
                                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
                                title="Refrescar"
                            >
                                <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                            </button>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="flex items-center gap-2 px-3 py-2 text-sm bg-gray-700 hover:bg-gray-600 rounded-lg"
                                >
                                    <CheckCheck className="w-4 h-4" />
                                    Marcar todas leídas
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Filters */}
            <div className="bg-gray-800/50 border-b border-gray-700">
                <div className="max-w-4xl mx-auto px-4 py-3">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-400" />
                            <span className="text-sm text-gray-400">Filtros:</span>
                        </div>
                        
                        {/* Read filter */}
                        <div className="flex gap-1">
                            {(['all', 'unread', 'read'] as const).map(filter => (
                                <button
                                    key={filter}
                                    onClick={() => setReadFilter(filter)}
                                    className={`px-3 py-1 text-sm rounded ${
                                        readFilter === filter
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                    }`}
                                >
                                    {filter === 'all' ? 'Todas' : filter === 'unread' ? 'Sin leer' : 'Leídas'}
                                </button>
                            ))}
                        </div>

                        {/* Priority filter */}
                        <div className="flex gap-1">
                            {(['all', 'critical', 'warning', 'info'] as const).map(filter => {
                                const styles = filter !== 'all' ? getPriorityStyles(filter) : null
                                return (
                                    <button
                                        key={filter}
                                        onClick={() => setPriorityFilter(filter)}
                                        className={`px-3 py-1 text-sm rounded flex items-center gap-1 ${
                                            priorityFilter === filter
                                                ? 'bg-blue-600 text-white'
                                                : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                        }`}
                                    >
                                        {styles && <styles.icon className="w-3 h-3" />}
                                        {filter === 'all' ? 'Todas' : styles?.label}
                                    </button>
                                )
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="max-w-4xl mx-auto px-4 py-6">
                {loading ? (
                    <div className="text-center py-12">
                        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin mx-auto" />
                    </div>
                ) : filteredNotifications.length === 0 ? (
                    <div className="text-center py-16">
                        <Bell className="w-16 h-16 text-gray-600 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-400 mb-2">
                            No hay notificaciones
                        </h2>
                        <p className="text-gray-500">
                            {readFilter === 'unread' 
                                ? 'No tienes notificaciones sin leer'
                                : 'Las notificaciones de Prometeo aparecerán aquí'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {filteredNotifications.map(notification => {
                            const styles = getPriorityStyles(notification.priority)
                            const Icon = styles.icon
                            
                            return (
                                <div
                                    key={notification.id}
                                    className={`p-4 rounded-lg border-l-4 ${styles.borderColor} ${
                                        notification.is_read 
                                            ? 'bg-gray-800/50' 
                                            : `${styles.bgColor} bg-gray-800`
                                    }`}
                                >
                                    <div className="flex gap-4">
                                        <div className={`flex-shrink-0 ${styles.textColor}`}>
                                            <Icon className="w-6 h-6" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-4">
                                                <div>
                                                    <h3 className={`font-semibold ${
                                                        notification.is_read ? 'text-gray-300' : 'text-white'
                                                    }`}>
                                                        {notification.title}
                                                    </h3>
                                                    {notification.agent_name && (
                                                        <p className="text-xs text-gray-500 mt-0.5">
                                                            de {notification.agent_name}
                                                        </p>
                                                    )}
                                                </div>
                                                <span className="text-sm text-gray-500 flex-shrink-0">
                                                    {formatDate(notification.created_at)}
                                                </span>
                                            </div>
                                            <p className="text-gray-400 mt-2">
                                                {notification.body}
                                            </p>
                                            <div className="flex items-center gap-3 mt-3">
                                                {notification.link && (
                                                    <Link
                                                        href={notification.link}
                                                        onClick={() => markAsRead(notification.id)}
                                                        className="text-sm text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                        Abrir chat
                                                    </Link>
                                                )}
                                                {!notification.is_read && (
                                                    <button
                                                        onClick={() => markAsRead(notification.id)}
                                                        className="text-sm text-gray-400 hover:text-gray-300 flex items-center gap-1"
                                                    >
                                                        <Check className="w-4 h-4" />
                                                        Marcar leída
                                                    </button>
                                                )}
                                                <button
                                                    onClick={() => deleteNotification(notification.id)}
                                                    className="text-sm text-red-400 hover:text-red-300 flex items-center gap-1"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                    Eliminar
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                )}
            </div>
        </div>
    )
}
