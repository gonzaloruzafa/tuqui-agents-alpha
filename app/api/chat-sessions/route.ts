import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/client'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'

export async function GET(req: Request) {
    const session = await auth()
    if (!session?.user || !session.tenant) {
        return new Response('Unauthorized', { status: 401 })
    }

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const agentId = searchParams.get('agentId')
    const db = await getTenantClient(session.tenant.id)

    if (sessionId) {
        // Get messages for a session
        const { data: messages } = await db
            .from('chat_messages')
            .select('*')
            .eq('session_id', sessionId)
            .order('created_at', { ascending: true })
        return Response.json(messages || [])
    }

    if (agentId) {
        // Get sessions for agent
        const { data: sessions } = await db
            .from('chat_sessions')
            .select('*')
            .eq('agent_id', agentId)
            .eq('user_email', session.user.email)
            .order('updated_at', { ascending: false })
        return Response.json(sessions || [])
    }

    return new Response('Missing parameters', { status: 400 })
}

export async function POST(req: Request) {
    const session = await auth()
    if (!session?.user || !session.tenant) {
        return new Response('Unauthorized', { status: 401 })
    }

    const body = await req.json()
    const { action } = body
    const db = await getTenantClient(session.tenant.id)

    if (action === 'create-session') {
        const { agentId, title } = body
        const { data, error } = await db
            .from('chat_sessions')
            .insert({
                tenant_id: session.tenant.id,
                agent_id: agentId,
                user_email: session.user.email,
                title: title || 'Nuevo Chat'
            })
            .select()
            .single()

        if (error) return new Response(error.message, { status: 500 })
        return Response.json(data)
    }

    if (action === 'save-message') {
        const { sessionId, role, content, toolCalls } = body
        const { data, error } = await db
            .from('chat_messages')
            .insert({
                tenant_id: session.tenant.id,
                session_id: sessionId,
                role,
                content,
                tool_calls: toolCalls
            })
            .select()
            .single()

        // Update session updated_at
        await db.from('chat_sessions').update({ updated_at: new Date().toISOString() }).eq('id', sessionId)

        if (error) return new Response(error.message, { status: 500 })
        return Response.json(data)
    }

    if (action === 'generate-title') {
        const { sessionId, userMessage } = body
        const db = await getTenantClient(session.tenant.id)

        let title: string
        
        try {
            // Use Gemini to generate a concise, meaningful title
            const { text } = await generateText({
                model: google('gemini-2.0-flash'),
                prompt: `Genera un título MUY breve (máximo 6 palabras) que resuma la intención del siguiente mensaje de usuario.

Mensaje: "${userMessage}"

Reglas:
- Primera letra en mayúscula
- Sin comillas
- Sin puntos finales
- Debe ser descriptivo del tema, no una copia literal
- Ejemplos buenos: "Consulta de stock productos", "Ventas del mes", "Problema con factura"

Título:`
            })
            
            title = text.trim()
                .replace(/^["']|["']$/g, '') // Remove quotes
                .replace(/\.$/g, '') // Remove trailing period
                .substring(0, 50) // Safety limit
            
            // Capitalize first letter
            if (title.length > 0) {
                title = title.charAt(0).toUpperCase() + title.slice(1)
            }
        } catch (error) {
            console.error('Error generating title:', error)
            // Fallback to simple truncation
            title = userMessage.length > 40 
                ? userMessage.substring(0, 40).trim() + '...' 
                : userMessage.trim()
        }

        const { data, error: dbError } = await db
            .from('chat_sessions')
            .update({ title })
            .eq('id', sessionId)
            .select('title')
            .single()

        if (dbError) return new Response(dbError.message, { status: 500 })
        return Response.json(data)
    }

    return new Response('Invalid action', { status: 400 })
}

export async function DELETE(req: Request) {
    const session = await auth()
    if (!session?.user || !session.tenant) return new Response('Unauthorized', { status: 401 })

    const { searchParams } = new URL(req.url)
    const sessionId = searchParams.get('sessionId')
    const db = await getTenantClient(session.tenant.id)

    await db.from('chat_sessions').delete().eq('id', sessionId).eq('user_email', session.user.email)

    return Response.json({ ok: true })
}
