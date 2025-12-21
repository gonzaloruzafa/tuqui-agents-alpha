import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import PrometeoAdmin from './prometeo-admin'

export default async function PrometeoPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    return (
        <div className="min-h-screen bg-gray-900 flex flex-col">
            <Header />
            <main className="flex-1">
                <PrometeoAdmin tenantId={session.tenant?.id || ''} />
            </main>
            <Footer />
        </div>
    )
}
