import { getTenantClient, getClient } from './client'

export interface Message {
    role: 'user' | 'assistant'
    content: string
}

export async function getOrCreateWhatsAppSession(tenantId: string, agentId: string, userEmail: string) {
    const db = await getTenantClient(tenantId)

    // Find last active session for this agent and user
    const { data: session, error } = await db
        .from('chat_sessions')
        .select('id')
        .eq('agent_id', agentId)
        .eq('user_email', userEmail)
        .order('updated_at', { ascending: false })
        .limit(1)
        .single()

    if (session) return session.id

    // Create new session
    const { data: newSession, error: createError } = await db
        .from('chat_sessions')
        .insert({
            tenant_id: tenantId,
            agent_id: agentId,
            user_email: userEmail,
            title: 'WhatsApp Conversation'
        })
        .select('id')
        .single()

    if (createError || !newSession) {
        console.error('[ChatHistory] Error creating session:', createError)
        throw new Error('Failed to create chat session')
    }

    return newSession.id
}

export async function getSessionMessages(tenantId: string, sessionId: string, limit = 20): Promise<Message[]> {
    const db = await getTenantClient(tenantId)
    const { data: messages, error } = await db
        .from('chat_messages')
        .select('role, content')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true })
        .limit(limit)

    if (error) {
        console.error('[ChatHistory] Error fetching messages:', error)
        return []
    }

    return messages as Message[]
}

/**
 * Get recent messages across all agents for a user (for context-aware routing)
 * This is useful for WhatsApp where we need to maintain context across agent switches
 */
export async function getRecentUserMessages(tenantId: string, userEmail: string, limit = 10): Promise<Message[]> {
    const db = await getTenantClient(tenantId)
    
    // Get recent messages from all sessions for this user
    const { data: messages, error } = await db
        .from('chat_messages')
        .select(`
            role,
            content,
            chat_sessions!inner(user_email)
        `)
        .eq('chat_sessions.user_email', userEmail)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        console.error('[ChatHistory] Error fetching recent messages:', error)
        return []
    }

    // Return in chronological order
    return (messages as any[])?.reverse().map(m => ({
        role: m.role,
        content: m.content
    })) || []
}

export interface ToolCallRecord {
    name: string
    args?: Record<string, any>
    result_summary?: string
}

export async function saveMessage(
    tenantId: string, 
    sessionId: string, 
    role: 'user' | 'assistant', 
    content: string,
    toolCalls?: ToolCallRecord[]
) {
    const db = await getTenantClient(tenantId)

    // Save message with optional tool_calls
    const { error: msgError } = await db
        .from('chat_messages')
        .insert({
            tenant_id: tenantId,
            session_id: sessionId,
            role,
            content,
            tool_calls: toolCalls ? JSON.stringify(toolCalls) : null
        })

    // Update session timestamp
    await db
        .from('chat_sessions')
        .update({ updated_at: new Date().toISOString() })
        .eq('id', sessionId)

    if (msgError) {
        console.error('[ChatHistory] Error saving message:', msgError)
    }
}
