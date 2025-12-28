import { auth } from '@/lib/auth/config'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Trash, FileText, Database, Home } from 'lucide-react'
import { getTenantClient } from '@/lib/supabase/tenant'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { RAGUpload } from '@/components/admin/RAGUpload'
import { deleteDocument } from './actions'

async function getDocuments(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const { data } = await db.from('documents').select('*').order('created_at', { ascending: false })
    return data || []
}

export default async function RAGPage() {
    const session = await auth()
    if (!session?.user || !session.isAdmin) redirect('/')

    const documents = await getDocuments(session.tenant!.id)

    return (
        <div className="min-h-screen bg-gray-50/50 flex flex-col font-sans">
            <Header />
            <div className="bg-white border-b border-gray-200 sticky top-0 z-10 shadow-sm">
                <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Link href="/admin" className="p-1.5 hover:bg-gray-100 rounded-lg transition-colors text-gray-500">
                            <ArrowLeft className="w-5 h-5" />
                        </Link>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                <Database className="w-4 h-4 text-blue-600" />
                            </div>
                            <h1 className="text-lg font-bold text-gray-900">Base de Conocimiento RAG</h1>
                        </div>
                    </div>
                    <Link href="/" className="p-2 hover:bg-gray-100 rounded-lg transition-colors text-gray-500" title="Ir a inicio">
                        <Home className="w-5 h-5" />
                    </Link>
                </div>
            </div>

            <div className="flex-grow max-w-4xl mx-auto px-6 py-8 w-full">

                <RAGUpload />

                {/* Documents List */}
                <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                    <Database className="w-5 h-5 text-gray-400" />
                    Documentos Indexados
                </h2>

                <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    {documents.length === 0 ? (
                        <div className="p-8 text-center text-gray-500 italic">
                            No hay documentos en la base de conocimiento.
                        </div>
                    ) : (
                        <div className="divide-y divide-gray-100">
                            {documents.map((doc: any) => (
                                <div key={doc.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                                    <div className="flex items-center gap-4">
                                        <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600">
                                            <FileText className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <h4 className="font-medium text-gray-900">{(doc.metadata as any)?.filename || 'Documento sin nombre'}</h4>
                                            <p className="text-xs text-gray-500">
                                                Subido el {new Date(doc.created_at).toLocaleDateString()} • {(doc.metadata as any)?.size ? Math.round((doc.metadata as any).size / 1024) + ' KB' : 'Size unknown'}
                                            </p>
                                        </div>
                                    </div>

                                    <form action={deleteDocument}>
                                        <input type="hidden" name="id" value={doc.id} />
                                        <button type="submit" className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Eliminar documento">
                                            <Trash className="w-4 h-4" />
                                        </button>
                                    </form>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            <Footer />
        </div>
    )
}
