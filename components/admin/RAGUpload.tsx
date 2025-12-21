'use client'

import { Upload, Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import { uploadDocument } from '@/app/admin/rag/actions'
import { useRef, useState } from 'react'

export function RAGUpload() {
    const formRef = useRef<HTMLFormElement>(null)
    const [status, setStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle')
    const [message, setMessage] = useState('')

    const handleUpload = async (formData: FormData) => {
        setStatus('uploading')
        setMessage('Procesando documento...')
        
        try {
            const result = await uploadDocument(formData)
            
            if (result.error) {
                setStatus('error')
                setMessage(result.error)
            } else {
                setStatus('success')
                setMessage(`Documento indexado: ${result.chunks} chunks creados`)
                formRef.current?.reset()
            }
        } catch (e: any) {
            setStatus('error')
            setMessage(e.message || 'Error desconocido')
        }
        
        // Reset status after a delay
        setTimeout(() => {
            setStatus('idle')
            setMessage('')
        }, 5000)
    }

    return (
        <div className="bg-white rounded-xl border border-dashed border-gray-300 p-8 text-center mb-8 hover:border-adhoc-violet transition-colors group">
            <form
                ref={formRef}
                action={handleUpload}
                className="flex flex-col items-center justify-center cursor-pointer relative"
            >
                <div className="w-16 h-16 bg-adhoc-lavender/30 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    {status === 'uploading' ? (
                        <Loader2 className="w-8 h-8 text-adhoc-violet animate-spin" />
                    ) : status === 'success' ? (
                        <CheckCircle className="w-8 h-8 text-green-600" />
                    ) : status === 'error' ? (
                        <AlertCircle className="w-8 h-8 text-red-600" />
                    ) : (
                        <Upload className="w-8 h-8 text-adhoc-violet" />
                    )}
                </div>
                
                {status === 'idle' ? (
                    <>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">Subir nuevos documentos</h3>
                        <p className="text-sm text-gray-500 mb-4">Soporta .pdf, .txt, .md, .csv</p>
                    </>
                ) : (
                    <p className={`text-sm mb-4 ${
                        status === 'error' ? 'text-red-600' : 
                        status === 'success' ? 'text-green-600' : 
                        'text-gray-600'
                    }`}>
                        {message}
                    </p>
                )}

                <input
                    name="file"
                    type="file"
                    accept=".txt,.md,.csv,.json,.pdf"
                    className="absolute inset-0 opacity-0 cursor-pointer w-full h-full"
                    onChange={(e) => e.target.form?.requestSubmit()}
                    disabled={status === 'uploading'}
                />
                <button 
                    className={`px-4 py-2 rounded-lg text-sm font-medium pointer-events-none ${
                        status === 'uploading' 
                            ? 'bg-gray-300 text-gray-500' 
                            : 'bg-adhoc-violet text-white hover:bg-adhoc-violet/90'
                    }`}
                    disabled={status === 'uploading'}
                >
                    {status === 'uploading' ? 'Procesando...' : 'Seleccionar Archivo'}
                </button>
            </form>
        </div>
    )
}
