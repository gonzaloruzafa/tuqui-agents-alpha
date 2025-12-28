import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Building, Globe, AlignLeft, Home } from 'lucide-react'
import { getTenantClient } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'

async function getCompanyInfo(tenantId: string) {
    const db = await getTenantClient(tenantId)
    // Try to get info. If table doesn't exist yet (migration pending), handle gracefully?
    // We assume migration is run.
    const { data, error } = await db.from('company_info').select('*').single()
    if (error && error.code !== 'PGRST116') { // PGRST116 is no rows
        // If error is "relation does not exist", user needs to run migration.
        return null
    }
    return data || {}
}

async function updateCompany(formData: FormData) {
    'use server'
    const name = formData.get('name') as string
    const industry = formData.get('industry') as string
    const description = formData.get('description') as string
    const website = formData.get('website') as string
    const tone_of_voice = formData.get('tone_of_voice') as string

    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) return

    const db = await getTenantClient(session.tenant.id)

    // Upsert equivalent (since we might have 0 rows initially)
    // We need to check if row exists or just insert. 
    // Since we only want 1 row per tenant (in this table design), we can check first.
    // Or cleaner: company_info has ID. But for tenant-db, it's just the one row usually.
    // Let's assume we update the first row found or insert if empty.

    const { data: existing } = await db.from('company_info').select('id').single()

    if (existing) {
        await db.from('company_info').update({
            name, industry, description, website, tone_of_voice, updated_at: new Date().toISOString()
        }).eq('id', existing.id)
    } else {
        await db.from('company_info').insert({
            name, industry, description, website, tone_of_voice
        })
    }

    revalidatePath('/admin/company')
}

export default async function AdminCompanyPage() {
    const session = await auth()

    if (!session?.user || !session.isAdmin) {
        redirect('/')
    }

    const company = await getCompanyInfo(session.tenant!.id) || {}

    return (
        <div className="min-h-screen bg-gray-50/50 font-sans flex flex-col">
            <Header />

            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-gray-100 rounded-lg flex items-center justify-center">
                                <Building className="w-4 h-4 text-gray-600" />
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Configuración de Empresa</h1>
                        </div>
                    </div>
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Ir a inicio">
                        <Home className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            <div className="flex-grow max-w-3xl mx-auto px-6 py-8 w-full">
                <form action={updateCompany} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="p-6 border-b border-gray-100 bg-gray-50/30 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center text-gray-500">
                                <Building className="w-6 h-6" />
                            </div>
                            <div>
                                <h2 className="text-lg font-semibold text-gray-900">Datos del Negocio</h2>
                                <p className="text-sm text-gray-500">Información utilizzada para contextualizar a los agentes.</p>
                            </div>
                        </div>
                    </div>

                    <div className="p-8 space-y-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Nombre de la Empresa</label>
                                <input name="name" defaultValue={company.name || ''} type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-adhoc-violet focus:outline-none transition-all" placeholder="Ej: Adhoc Inc." />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-2">Industria / Sector</label>
                                <input name="industry" defaultValue={company.industry || ''} type="text" className="w-full border border-gray-300 rounded-lg px-4 py-2.5 focus:ring-2 focus:ring-adhoc-violet focus:outline-none transition-all" placeholder="Ej: Tecnología, Retail..." />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Sitio Web</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3 text-gray-400"><Globe className="w-4 h-4" /></span>
                                <input name="website" defaultValue={company.website || ''} type="url" className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-adhoc-violet focus:outline-none transition-all" placeholder="https://..." />
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Descripción del Negocio</label>
                            <textarea name="description" defaultValue={company.description || ''} rows={4} className="w-full border border-gray-300 rounded-lg px-4 py-3 focus:ring-2 focus:ring-adhoc-violet focus:outline-none transition-all resize-none" placeholder="Describe brevemente qué hace la empresa, sus productos principales y valores..." />
                            <p className="text-xs text-gray-500 mt-2">Esta descripción se inyectará en el contexto de todos los agentes.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-2">Tono de Voz</label>
                            <div className="relative">
                                <span className="absolute left-4 top-3 text-gray-400"><AlignLeft className="w-4 h-4" /></span>
                                <input name="tone_of_voice" defaultValue={company.tone_of_voice || 'Profesional y amigable'} type="text" className="w-full border border-gray-300 rounded-lg pl-10 pr-4 py-2.5 focus:ring-2 focus:ring-adhoc-violet focus:outline-none transition-all" placeholder="Ej: Formal, Cercano, Técnico..." />
                            </div>
                        </div>
                    </div>

                    <div className="px-8 py-5 bg-gray-50 border-t border-gray-100 flex justify-end">
                        <button type="submit" className="flex items-center gap-2 bg-adhoc-violet hover:bg-adhoc-violet/90 text-white font-medium px-6 py-2.5 rounded-lg transition-colors shadow-sm cursor-pointer">
                            <Save className="w-4 h-4" />
                            Guardar Cambios
                        </button>
                    </div>
                </form>
            </div>

            <Footer />
        </div>
    )
}
