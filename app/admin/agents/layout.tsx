import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

export default async function AdminAgentsLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans flex flex-col">
            <Header />
            {children}
            <Footer />
        </div>
    )
}
