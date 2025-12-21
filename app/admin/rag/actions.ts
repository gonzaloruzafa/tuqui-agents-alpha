'use server'

import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'
import { revalidatePath } from 'next/cache'
import { chunkDocument } from '@/lib/rag/chunker'
import { generateEmbeddings } from '@/lib/rag/embeddings'

// Simple PDF text extraction without canvas dependencies
async function extractPdfText(buffer: Buffer): Promise<string> {
    try {
        // Use require for pdf-parse to avoid ESM issues
        const pdfParse = require('pdf-parse')
        
        // Custom page render to avoid canvas issues
        const options = {
            pagerender: function(pageData: any) {
                return pageData.getTextContent().then(function(textContent: any) {
                    let text = ''
                    for (const item of textContent.items) {
                        text += (item as any).str + ' '
                    }
                    return text
                })
            }
        }
        
        const data = await pdfParse(buffer, options)
        return data.text
    } catch (e) {
        console.error('[RAG] pdf-parse error, trying fallback:', e)
        // Fallback: basic text extraction from PDF buffer
        const text = buffer.toString('utf-8')
        // Extract readable text between stream markers
        const matches = text.match(/\(([^)]+)\)/g)
        if (matches && matches.length > 10) {
            return matches.map(m => m.slice(1, -1)).join(' ')
        }
        throw new Error('Could not extract text from PDF')
    }
}

export async function uploadDocument(formData: FormData) {
    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) return { error: 'Unauthorized' }

    const file = formData.get('file') as File
    if (!file) return { error: 'No file provided' }

    console.log(`[RAG] Processing file: ${file.name} (${file.type})`)

    // 1. Read file content
    let content = ''

    try {
        if (file.type === 'application/pdf') {
            const arrayBuffer = await file.arrayBuffer()
            const buffer = Buffer.from(arrayBuffer)
            content = await extractPdfText(buffer)
        } else {
            content = await file.text()
        }
    } catch (e) {
        console.error('[RAG] Error reading file:', e)
        return { error: 'Error reading file. For PDFs, try converting to text first.' }
    }

    if (!content || content.trim().length < 50) {
        return { error: 'File content too short or empty' }
    }

    console.log(`[RAG] Content extracted: ${content.length} chars`)

    const db = await getTenantClient(session.tenant.id)

    // 2. Insert document (no agent_id = available to all agents)
    const { data: doc, error: docError } = await db.from('documents').insert({
        title: file.name,
        content: content,
        source_type: 'upload',
        metadata: { 
            filename: file.name, 
            type: file.type, 
            size: file.size,
            uploadedBy: session.user?.email,
            uploadedAt: new Date().toISOString()
        }
    }).select().single()

    if (docError || !doc) {
        console.error('[RAG] Error inserting document:', docError)
        return { error: 'Error saving document' }
    }

    console.log(`[RAG] Document saved: ${doc.id}`)

    // 3. Chunk the document
    const chunks = chunkDocument(content, doc.id, {
        chunkSize: 1000,
        chunkOverlap: 200
    })

    console.log(`[RAG] Created ${chunks.length} chunks`)

    if (chunks.length === 0) {
        return { error: 'No chunks created' }
    }

    // 4. Generate embeddings for all chunks
    try {
        const chunkTexts = chunks.map(c => c.content)
        const embeddings = await generateEmbeddings(chunkTexts)

        console.log(`[RAG] Generated ${embeddings.length} embeddings`)

        // 5. Insert chunks with embeddings
        const chunksToInsert = chunks.map((chunk, i) => ({
            document_id: doc.id,
            content: chunk.content,
            embedding: embeddings[i],
            metadata: chunk.metadata
        }))

        console.log(`[RAG] Inserting ${chunksToInsert.length} chunks...`)
        const { error: chunkError } = await db.from('document_chunks').insert(chunksToInsert)

        if (chunkError) {
            console.error('[RAG] Error inserting chunks:', chunkError)
            // Rollback document
            await db.from('documents').delete().eq('id', doc.id)
            
            // Provide more helpful error message
            if (chunkError.message?.includes('agent_id')) {
                return { error: 'Database schema issue: Run the migration SQL in supabase/migrations/002_fix_rag_schema.sql' }
            }
            return { error: `Error saving document chunks: ${chunkError.message}` }
        }

        console.log(`[RAG] Successfully indexed ${chunks.length} chunks for document ${doc.id}`)

    } catch (e) {
        console.error('[RAG] Error generating embeddings:', e)
        // Rollback document
        await db.from('documents').delete().eq('id', doc.id)
        return { error: 'Error generating embeddings' }
    }

    revalidatePath('/admin/rag')
    return { success: true, documentId: doc.id, chunks: chunks.length }
}

export async function deleteDocument(formData: FormData): Promise<void> {
    const id = formData.get('id') as string
    const session = await auth()
    if (!session?.tenant?.id || !session.isAdmin) {
        console.error('[RAG] Unauthorized delete attempt')
        return
    }

    const db = await getTenantClient(session.tenant.id)

    // Delete document (chunks will cascade delete due to FK)
    const { error } = await db.from('documents').delete().eq('id', id)

    if (error) {
        console.error('[RAG] Error deleting document:', error)
        return
    }

    console.log(`[RAG] Document ${id} deleted with all chunks`)

    revalidatePath('/admin/rag')
}
