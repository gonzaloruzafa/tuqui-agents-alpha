'use client'

import { useState, useEffect, useCallback } from 'react'
import { Bell, Check, ExternalLink, AlertTriangle, Info, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface Notification {
    id: string
    title: string
    body: string
    priority: 'info' | 'warning' | 'critical'
    is_read: boolean
    link?: string
    agent_name?: string
    created_at: string
}

export function NotificationBell() {
    const [isOpen, setIsOpen] = useState(false)
    const [notifications, setNotifications] = useState<Notification[]>([])
    const [unreadCount, setUnreadCount] = useState(0)
    const [loading, setLoading] = useState(false)

    // Fetch unread count
    const fetchUnreadCount = useCallback(async () => {
        try {
            const res = await fetch('/api/notifications/unread-count')
            if (res.ok) {
                const data = await res.json()
                setUnreadCount(data.count || 0)
            }
        } catch (e) {
            console.error('Failed to fetch unread count:', e)
        }
    }, [])

    // Fetch recent notifications
    const fetchNotifications = useCallback(async () => {
        setLoading(true)
        try {
            const res = await fetch('/api/notifications?limit=5')
            if (res.ok) {
                const data = await res.json()
                setNotifications(data.notifications || [])
            }
        } catch (e) {
            console.error('Failed to fetch notifications:', e)
        } finally {
            setLoading(false)
        }
    }, [])

    // Poll for unread count
    useEffect(() => {
        fetchUnreadCount()
        const interval = setInterval(fetchUnreadCount, 30000) // Every 30 seconds
        return () => clearInterval(interval)
    }, [fetchUnreadCount])

    // Fetch notifications when dropdown opens
    useEffect(() => {
        if (isOpen) {
            fetchNotifications()
        }
    }, [isOpen, fetchNotifications])

    // Mark notification as read
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
            setUnreadCount(prev => Math.max(0, prev - 1))
        } catch (e) {
            console.error('Failed to mark as read:', e)
        }
    }

    // Mark all as read
    const markAllAsRead = async () => {
        try {
            await fetch('/api/notifications', { method: 'POST' })
            setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
            setUnreadCount(0)
        } catch (e) {
            console.error('Failed to mark all as read:', e)
        }
    }

    // Get priority icon and color
    const getPriorityStyles = (priority: string) => {
        switch (priority) {
            case 'critical':
                return {
                    icon: AlertCircle,
                    bgColor: 'bg-red-900/30',
                    borderColor: 'border-red-600',
                    textColor: 'text-red-400'
                }
            case 'warning':
                return {
                    icon: AlertTriangle,
                    bgColor: 'bg-yellow-900/30',
                    borderColor: 'border-yellow-600',
                    textColor: 'text-yellow-400'
                }
            default:
                return {
                    icon: Info,
                    bgColor: 'bg-blue-900/30',
                    borderColor: 'border-blue-600',
                    textColor: 'text-blue-400'
                }
        }
    }

    // Format time ago
    const timeAgo = (date: string) => {
        const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000)
        if (seconds < 60) return 'ahora'
        if (seconds < 3600) return `${Math.floor(seconds / 60)}m`
        if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`
        return `${Math.floor(seconds / 86400)}d`
    }

    return (
        <div className="relative">
            {/* Bell Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="relative p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700 transition-colors"
                title="Notificaciones"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold animate-pulse">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown */}
            {isOpen && (
                <>
                    {/* Backdrop */}
                    <div 
                        className="fixed inset-0 z-40" 
                        onClick={() => setIsOpen(false)}
                    />
                    
                    {/* Panel */}
                    <div className="absolute right-0 mt-2 w-80 bg-gray-800 border border-gray-700 rounded-xl shadow-xl z-50 overflow-hidden">
                        {/* Header */}
                        <div className="px-4 py-3 border-b border-gray-700 flex items-center justify-between">
                            <h3 className="font-semibold text-white">Notificaciones</h3>
                            {unreadCount > 0 && (
                                <button
                                    onClick={markAllAsRead}
                                    className="text-xs text-blue-400 hover:text-blue-300"
                                >
                                    Marcar todas leídas
                                </button>
                            )}
                        </div>

                        {/* Content */}
                        <div className="max-h-80 overflow-y-auto">
                            {loading ? (
                                <div className="p-4 text-center text-gray-400">
                                    Cargando...
                                </div>
                            ) : notifications.length === 0 ? (
                                <div className="p-8 text-center text-gray-400">
                                    <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                    <p className="text-sm">No hay notificaciones</p>
                                </div>
                            ) : (
                                <div className="divide-y divide-gray-700">
                                    {notifications.map(notification => {
                                        const styles = getPriorityStyles(notification.priority)
                                        const Icon = styles.icon
                                        
                                        return (
                                            <div
                                                key={notification.id}
                                                className={`p-3 hover:bg-gray-700/50 transition-colors ${
                                                    !notification.is_read ? styles.bgColor : ''
                                                }`}
                                            >
                                                <div className="flex gap-3">
                                                    <div className={`flex-shrink-0 ${styles.textColor}`}>
                                                        <Icon className="w-5 h-5" />
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start justify-between gap-2">
                                                            <p className={`font-medium text-sm ${
                                                                notification.is_read ? 'text-gray-300' : 'text-white'
                                                            }`}>
                                                                {notification.title}
                                                            </p>
                                                            <span className="text-xs text-gray-500 flex-shrink-0">
                                                                {timeAgo(notification.created_at)}
                                                            </span>
                                                        </div>
                                                        <p className="text-sm text-gray-400 mt-0.5 line-clamp-2">
                                                            {notification.body}
                                                        </p>
                                                        <div className="flex items-center gap-2 mt-2">
                                                            {notification.link && (
                                                                <Link
                                                                    href={notification.link}
                                                                    onClick={() => {
                                                                        markAsRead(notification.id)
                                                                        setIsOpen(false)
                                                                    }}
                                                                    className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1"
                                                                >
                                                                    <ExternalLink className="w-3 h-3" />
                                                                    Abrir
                                                                </Link>
                                                            )}
                                                            {!notification.is_read && (
                                                                <button
                                                                    onClick={() => markAsRead(notification.id)}
                                                                    className="text-xs text-gray-400 hover:text-gray-300 flex items-center gap-1"
                                                                >
                                                                    <Check className="w-3 h-3" />
                                                                    Leída
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )
                                    })}
                                </div>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="px-4 py-2 border-t border-gray-700">
                            <Link
                                href="/admin/notifications"
                                onClick={() => setIsOpen(false)}
                                className="block text-center text-sm text-blue-400 hover:text-blue-300"
                            >
                                Ver todas las notificaciones
                            </Link>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
