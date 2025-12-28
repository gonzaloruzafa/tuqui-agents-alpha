import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Bell, Home } from 'lucide-react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import NotificationsInbox from './notifications-inbox'

export default async function NotificationsPage() {
    const session = await auth()

    if (!session?.user) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans">
            <Header />
            
            {/* Sub-header */}
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Bell className="w-4 h-4 text-blue-600" />
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Notificaciones</h1>
                        </div>
                    </div>
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Ir a inicio">
                        <Home className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            <main className="flex-1 max-w-5xl mx-auto px-6 py-8 w-full">
                <NotificationsInbox />
            </main>
            <Footer />
        </div>
    )
}
