import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import NotificationsInbox from './notifications-inbox'

export default async function NotificationsPage() {
    const session = await auth()

    if (!session?.user) {
        redirect('/login')
    }

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            <Header />
            <main className="flex-1">
                <NotificationsInbox />
            </main>
            <Footer />
        </div>
    )
}
