import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'

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

        // Simple logic for Alpha: first 40 chars of user message
        // In the future, this could use Gemini to summarize
        const title = userMessage.length > 40 
            ? userMessage.substring(0, 40).trim() + '...' 
            : userMessage.trim()

        const { data, error } = await db
            .from('chat_sessions')
            .update({ title })
            .eq('id', sessionId)
            .select('title')
            .single()

        if (error) return new Response(error.message, { status: 500 })
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
