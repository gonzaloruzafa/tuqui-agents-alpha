import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/client'

// Utility to generate slug from name
function generateSlug(name: string): string {
    return name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/[^a-z0-9]+/g, '-')     // Replace non-alphanumeric with dashes
        .replace(/^-+|-+$/g, '')         // Trim dashes from start/end
        .substring(0, 50)                 // Limit length
}

/**
 * GET /api/admin/agents
 * List all agents for the current tenant
 */
export async function GET() {
    try {
        const session = await auth()

        if (!session?.user || !session.isAdmin) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const tenantId = session.tenant?.id
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 })
        }

        const db = await getTenantClient(tenantId)
        const { data: agents, error } = await db
            .from('agents')
            .select('*')
            .order('name', { ascending: true })

        if (error) {
            console.error('[Admin Agents API] Error fetching agents:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        return NextResponse.json({
            agents: agents || [],
            tenantName: session.tenant?.name || ''
        })

    } catch (error: any) {
        console.error('[Admin Agents API] Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}

/**
 * POST /api/admin/agents
 * Create a new custom agent for the current tenant
 */
export async function POST(request: Request) {
    try {
        const session = await auth()

        if (!session?.user || !session.isAdmin) {
            return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
        }

        const tenantId = session.tenant?.id
        if (!tenantId) {
            return NextResponse.json({ error: 'Tenant no encontrado' }, { status: 400 })
        }

        const body = await request.json()
        const { name, description, systemPrompt, ragEnabled, tools } = body

        if (!name?.trim()) {
            return NextResponse.json({ error: 'El nombre es requerido' }, { status: 400 })
        }

        // Generate unique slug
        let baseSlug = generateSlug(name)
        let slug = baseSlug
        let counter = 1

        const db = await getTenantClient(tenantId)

        // Check for existing slug and make unique if needed
        while (true) {
            const { data: existing } = await db
                .from('agents')
                .select('id')
                .eq('slug', slug)
                .single()

            if (!existing) break
            slug = `${baseSlug}-${counter++}`
        }

        // Create the agent (no master_agent_id = custom agent)
        const { data: agent, error } = await db
            .from('agents')
            .insert({
                tenant_id: tenantId,
                name: name.trim(),
                slug,
                description: description?.trim() || null,
                system_prompt: systemPrompt?.trim() || null,
                rag_enabled: ragEnabled ?? true,
                tools: tools || ['web_search', 'web_investigator'],
                is_active: true,
                master_agent_id: null // Custom agent, not synced from master
            })
            .select()
            .single()

        if (error) {
            console.error('[Admin Agents API] Error creating agent:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        console.log('[Admin Agents API] Created custom agent:', agent.id, agent.name)

        return NextResponse.json({ agent })

    } catch (error: any) {
        console.error('[Admin Agents API] Error:', error)
        return NextResponse.json({ error: error.message || 'Error interno' }, { status: 500 })
    }
}
