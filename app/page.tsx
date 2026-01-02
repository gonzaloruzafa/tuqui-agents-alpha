import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth/config'

export const dynamic = 'force-dynamic'

export default async function HomePage() {
    const session = await auth()

    if (!session?.tenant) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center p-8 bg-white rounded-xl shadow-lg max-w-md">
                    <h1 className="text-xl font-semibold text-gray-900 mb-2">Acceso denegado</h1>
                    <p className="text-gray-500 mb-4">
                        Tu cuenta ({session?.user?.email}) no tiene un tenant asignado.
                    </p>
                    <p className="text-sm text-gray-400">
                        Contacta al administrador para obtener acceso.
                    </p>
                </div>
            </div>
        )
    }

    // Un único agente Tuqui que llama a sub-agentes según contexto
    redirect('/chat/tuqui')
}
