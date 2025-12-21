import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { getTenantClient } from '@/lib/supabase/tenant'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { ToolsList } from '@/components/admin/ToolsForm'

async function getIntegrations(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const { data, error } = await db.from('integrations').select('*')
    if (error) {
        console.error('Error fetching integrations:', error)
        return []
    }
    return data || []
}

export default async function AdminToolsPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const integrations = await getIntegrations(session.tenant!.id)

    return (
        <div className="min-h-screen bg-gray-50 font-sans flex flex-col">
            <Header />

            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center gap-3">
                    <Link href="/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                        <ArrowLeft className="w-5 h-5" />
                    </Link>
                    <h1 className="text-lg font-bold text-gray-900">Integraciones y Herramientas</h1>
                </div>
            </div>

            <div className="flex-grow max-w-4xl mx-auto px-6 py-8 w-full">
                <ToolsList integrations={integrations} />
            </div>

            <Footer />
        </div>
    )
}
