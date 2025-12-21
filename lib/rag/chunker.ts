/**
 * Document Chunker for RAG
 * Splits text into overlapping chunks for better semantic search
 */

export interface ChunkOptions {
    chunkSize?: number      // Target size of each chunk in characters
    chunkOverlap?: number   // Overlap between chunks
    separator?: string      // Primary separator to split on
}

const DEFAULT_OPTIONS: Required<ChunkOptions> = {
    chunkSize: 1000,
    chunkOverlap: 200,
    separator: '\n\n'
}

/**
 * Split text into chunks with overlap
 */
export function chunkText(text: string, options: ChunkOptions = {}): string[] {
    const opts = { ...DEFAULT_OPTIONS, ...options }
    const { chunkSize, chunkOverlap, separator } = opts

    // Clean and normalize text
    const cleanedText = text
        .replace(/\r\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim()

    if (cleanedText.length <= chunkSize) {
        return [cleanedText]
    }

    const chunks: string[] = []

    // First, try to split by paragraphs
    const paragraphs = cleanedText.split(separator).filter(p => p.trim())

    let currentChunk = ''

    for (const paragraph of paragraphs) {
        const trimmedParagraph = paragraph.trim()

        // If adding this paragraph exceeds chunk size
        if (currentChunk.length + trimmedParagraph.length + 2 > chunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk.trim())

                // Start new chunk with overlap from previous
                const overlapText = getOverlapText(currentChunk, chunkOverlap)
                currentChunk = overlapText + (overlapText ? '\n\n' : '') + trimmedParagraph
            } else {
                // Paragraph itself is too large, split by sentences
                const subChunks = splitLargeParagraph(trimmedParagraph, chunkSize, chunkOverlap)
                chunks.push(...subChunks.slice(0, -1))
                currentChunk = subChunks[subChunks.length - 1] || ''
            }
        } else {
            currentChunk += (currentChunk ? '\n\n' : '') + trimmedParagraph
        }
    }

    // Don't forget the last chunk
    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
    }

    return chunks.filter(chunk => chunk.length > 50) // Filter out tiny chunks
}

/**
 * Get overlap text from the end of a chunk
 */
function getOverlapText(text: string, overlapSize: number): string {
    if (text.length <= overlapSize) return text

    // Try to break at a sentence boundary
    const lastPart = text.slice(-overlapSize)
    const sentenceBreak = lastPart.search(/[.!?]\s/)

    if (sentenceBreak > 0) {
        return lastPart.slice(sentenceBreak + 2).trim()
    }

    // Otherwise break at word boundary
    const wordBreak = lastPart.indexOf(' ')
    if (wordBreak > 0) {
        return lastPart.slice(wordBreak + 1).trim()
    }

    return lastPart
}

/**
 * Split a large paragraph that exceeds chunk size
 */
function splitLargeParagraph(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = []

    // Try to split by sentences first
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text]

    let currentChunk = ''

    for (const sentence of sentences) {
        const trimmedSentence = sentence.trim()

        if (currentChunk.length + trimmedSentence.length + 1 > chunkSize) {
            if (currentChunk) {
                chunks.push(currentChunk.trim())
                const overlapText = getOverlapText(currentChunk, overlap)
                currentChunk = overlapText + (overlapText ? ' ' : '') + trimmedSentence
            } else {
                // Single sentence too large, force split by characters
                const forceSplit = forceChunkBySize(trimmedSentence, chunkSize, overlap)
                chunks.push(...forceSplit.slice(0, -1))
                currentChunk = forceSplit[forceSplit.length - 1] || ''
            }
        } else {
            currentChunk += (currentChunk ? ' ' : '') + trimmedSentence
        }
    }

    if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
    }

    return chunks
}

/**
 * Force split text by size (last resort)
 */
function forceChunkBySize(text: string, chunkSize: number, overlap: number): string[] {
    const chunks: string[] = []
    let start = 0

    while (start < text.length) {
        let end = start + chunkSize

        // Try to break at word boundary
        if (end < text.length) {
            const lastSpace = text.lastIndexOf(' ', end)
            if (lastSpace > start) {
                end = lastSpace
            }
        }

        chunks.push(text.slice(start, end).trim())
        start = end - overlap

        // Avoid infinite loop
        if (start <= 0 || start >= text.length) break
    }

    return chunks
}

/**
 * Chunk a document and return metadata for each chunk
 */
export function chunkDocument(content: string, documentId: string, options: ChunkOptions = {}) {
    const chunks = chunkText(content, options)

    return chunks.map((chunk, index) => ({
        content: chunk,
        metadata: {
            documentId,
            chunkIndex: index,
            totalChunks: chunks.length,
            charCount: chunk.length
        }
    }))
}
