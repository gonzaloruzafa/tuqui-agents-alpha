import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

// Platform admins (super-admins) that can manage all tenants
const PLATFORM_ADMIN_EMAILS = (process.env.PLATFORM_ADMIN_EMAILS || 'gr@adhoc.inc').split(',').map(e => e.trim())

export default async function SuperAdminLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const session = await auth()

    // Check if user is a platform admin
    const isPlatformAdmin = session?.user?.email && PLATFORM_ADMIN_EMAILS.includes(session.user.email)

    if (!session?.user || !isPlatformAdmin) {
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
