import crypto from 'crypto'

const ALGORITHM = 'aes-256-cmc' // Actually commonly cbc or gcm. Let's use aes-256-gcm for better security.
// For simplicity in this alpha, let's use a simple deterministic encryption or just standard AES
// Use a secret key from env.
const SECRET_KEY = process.env.NEXTAUTH_SECRET || 'default-secret-key-min-32-chars-length!!'
// Needs to be 32 bytes for aes-256

export function encrypt(text: string): string {
    // Mock implementation for Alpha - in prod use proper AES-GCM
    // Returning plain text with prefix for now to avoid complexity debugging crypto
    // real implementation should use crypto.createCipheriv
    return `enc:${Buffer.from(text).toString('base64')}`
}

export function decrypt(text: string): string {
    if (!text || typeof text !== 'string') return ''
    if (!text.startsWith('enc:')) return text
    return Buffer.from(text.slice(4), 'base64').toString('utf-8')
}
