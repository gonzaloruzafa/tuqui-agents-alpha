import { getTenantClient } from '../supabase/tenant'
import { TUQUI_UNIFIED, type TuquiCapability } from './unified'

export interface Agent {
    id: string
    slug: string
    name: string
    description: string | null
    icon: string
    color: string
    is_active: boolean
    rag_enabled: boolean
    system_prompt: string | null
    welcome_message: string | null
    placeholder_text: string | null
    features?: string[]
    tools?: string[]
    capabilities?: TuquiCapability[]
}

/**
 * Get tools for an agent from agent_tools table
 */
async function getAgentTools(db: any, agentId: string): Promise<string[]> {
    const { data: toolRecords } = await db
        .from('agent_tools')
        .select('tool_slug')
        .eq('agent_id', agentId)
        .eq('enabled', true)

    return toolRecords?.map((t: any) => t.tool_slug) || []
}

/**
 * Ensure Tuqui Unified agent exists in DB
 */
async function ensureTuquiUnified(tenantId: string): Promise<void> {
    const db = await getTenantClient(tenantId)

    // Check if tuqui exists
    const { data: existingAgent } = await db
        .from('agents')
        .select('id, slug')
        .eq('slug', 'tuqui')
        .single()

    if (existingAgent) {
        console.log('[Agents] Tuqui Unified already exists')
        return
    }

    console.log(`[Agents] Creating Tuqui Unified for tenant ${tenantId}`)
    
    // Insert Tuqui Unified
    const { data: newAgent, error } = await db
        .from('agents')
        .insert({
            slug: TUQUI_UNIFIED.slug,
            name: TUQUI_UNIFIED.name,
            description: TUQUI_UNIFIED.description,
            icon: TUQUI_UNIFIED.icon,
            color: TUQUI_UNIFIED.color,
            is_active: true,
            rag_enabled: TUQUI_UNIFIED.ragEnabled,
            system_prompt: TUQUI_UNIFIED.systemPrompt,
            welcome_message: TUQUI_UNIFIED.welcomeMessage,
            placeholder_text: TUQUI_UNIFIED.placeholderText
        })
        .select('id')
        .single()

    if (error || !newAgent) {
        console.error('[Agents] Error creating Tuqui Unified:', error)
        return
    }

    // Insert tools for Tuqui
    const toolsToInsert = TUQUI_UNIFIED.tools.map(toolSlug => ({
        agent_id: newAgent.id,
        tool_slug: toolSlug,
        enabled: true
    }))

    if (toolsToInsert.length > 0) {
        await db.from('agent_tools').insert(toolsToInsert)
        console.log(`[Agents] Added ${toolsToInsert.length} tools to Tuqui`)
    }
}

/**
 * Get Tuqui Unified agent (the only agent)
 */
export async function getTuqui(tenantId: string): Promise<Agent> {
    const db = await getTenantClient(tenantId)

    // Ensure Tuqui exists
    await ensureTuquiUnified(tenantId)

    // Get Tuqui from DB
    const { data: agent, error } = await db
        .from('agents')
        .select('*')
        .eq('slug', 'tuqui')
        .single()

    if (error || !agent) {
        console.error('[Agents] Tuqui not found after ensure:', error)
        // Return default from config
        return {
            id: 'default-tuqui',
            slug: TUQUI_UNIFIED.slug,
            name: TUQUI_UNIFIED.name,
            description: TUQUI_UNIFIED.description,
            icon: TUQUI_UNIFIED.icon,
            color: TUQUI_UNIFIED.color,
            is_active: true,
            rag_enabled: TUQUI_UNIFIED.ragEnabled,
            system_prompt: TUQUI_UNIFIED.systemPrompt,
            welcome_message: TUQUI_UNIFIED.welcomeMessage,
            placeholder_text: TUQUI_UNIFIED.placeholderText,
            tools: TUQUI_UNIFIED.tools,
            capabilities: TUQUI_UNIFIED.capabilities
        }
    }

    // Get tools
    const tools = await getAgentTools(db, agent.id)

    return {
        id: agent.id,
        slug: agent.slug,
        name: agent.name,
        description: agent.description,
        icon: agent.icon || TUQUI_UNIFIED.icon,
        color: agent.color || TUQUI_UNIFIED.color,
        is_active: agent.is_active,
        rag_enabled: agent.rag_enabled ?? TUQUI_UNIFIED.ragEnabled,
        system_prompt: agent.system_prompt || TUQUI_UNIFIED.systemPrompt,
        welcome_message: agent.welcome_message || TUQUI_UNIFIED.welcomeMessage,
        placeholder_text: agent.placeholder_text || TUQUI_UNIFIED.placeholderText,
        tools: tools.length > 0 ? tools : TUQUI_UNIFIED.tools,
        capabilities: TUQUI_UNIFIED.capabilities
    }
}

/**
 * Get all agents for tenant - now returns only Tuqui
 * @deprecated Use getTuqui() instead
 */
export async function getAgentsForTenant(tenantId: string): Promise<Agent[]> {
    const tuqui = await getTuqui(tenantId)
    return [tuqui]
}

/**
 * Get agent by slug - now always returns Tuqui
 * @deprecated Use getTuqui() instead
 */
export async function getAgentBySlug(tenantId: string, slug: string): Promise<Agent | null> {
    // Always return Tuqui regardless of slug
    return getTuqui(tenantId)
}

/**
 * Update Tuqui configuration (for admin panel)
 */
export async function updateTuquiConfig(tenantId: string, updates: {
    system_prompt?: string
    welcome_message?: string
    placeholder_text?: string
}): Promise<boolean> {
    const db = await getTenantClient(tenantId)
    
    const { error } = await db
        .from('agents')
        .update(updates)
        .eq('slug', 'tuqui')

    if (error) {
        console.error('[Agents] Error updating Tuqui:', error)
        return false
    }

    return true
}
