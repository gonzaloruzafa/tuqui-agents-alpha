/**
 * Agent Service - Master Agent Architecture
 * 
 * Supports:
 * - Master agents defined by developer (in DB)
 * - Tenant instances of master agents
 * - Custom instructions per tenant (merged with master prompt)
 * - Automatic sync when master is updated
 */

import { getTenantClient, getClient } from '../supabase/client'

// =============================================================================
// TYPES
// =============================================================================

export interface MasterAgent {
    id: string
    slug: string
    name: string
    description: string | null
    icon: string
    color: string
    system_prompt: string
    welcome_message: string | null
    placeholder_text: string | null
    tools: string[]
    rag_enabled: boolean
    is_published: boolean
    sort_order: number
    version: number
}

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
    tools: string[]
    // Master agent reference
    master_agent_id?: string | null
    custom_instructions?: string | null
    master_version_synced?: number
}

export interface AgentWithMergedPrompt extends Agent {
    merged_system_prompt: string  // Master prompt + custom instructions
}

// =============================================================================
// MASTER AGENTS (Developer-defined)
// =============================================================================

/**
 * Get all published master agents
 */
export async function getMasterAgents(): Promise<MasterAgent[]> {
    const db = getClient()
    
    const { data, error } = await db
        .from('master_agents')
        .select('*')
        .eq('is_published', true)
        .order('sort_order', { ascending: true })
    
    if (error) {
        console.error('[Agents] Error fetching master agents:', error)
        return []
    }
    
    return data || []
}

/**
 * Get a specific master agent by slug
 */
export async function getMasterAgentBySlug(slug: string): Promise<MasterAgent | null> {
    const db = getClient()
    
    const { data, error } = await db
        .from('master_agents')
        .select('*')
        .eq('slug', slug)
        .eq('is_published', true)
        .single()
    
    if (error) {
        console.error(`[Agents] Master agent ${slug} not found:`, error)
        return null
    }
    
    return data
}

// =============================================================================
// TENANT AGENTS (Instances)
// =============================================================================

/**
 * Ensure all master agents are instantiated for a tenant
 */
export async function ensureAgentsForTenant(tenantId: string): Promise<void> {
    const db = getClient()
    
    // Get all published master agents
    const masters = await getMasterAgents()
    
    for (const master of masters) {
        // Check if already instantiated
        const { data: existing } = await db
            .from('agents')
            .select('id, master_version_synced')
            .eq('tenant_id', tenantId)
            .eq('master_agent_id', master.id)
            .single()
        
        if (existing) {
            // Check if needs sync
            if ((existing.master_version_synced || 0) < master.version) {
                await syncAgentWithMaster(existing.id)
            }
            continue
        }
        
        // Create new instance
        console.log(`[Agents] Creating ${master.slug} for tenant ${tenantId}`)
        
        const { error } = await db
            .from('agents')
            .insert({
                tenant_id: tenantId,
                master_agent_id: master.id,
                slug: master.slug,
                name: master.name,
                description: master.description,
                icon: master.icon,
                color: master.color,
                is_active: true,
                rag_enabled: master.rag_enabled,
                system_prompt: master.system_prompt,
                welcome_message: master.welcome_message,
                placeholder_text: master.placeholder_text,
                tools: master.tools,
                master_version_synced: master.version
            })
        
        if (error) {
            console.error(`[Agents] Error creating ${master.slug}:`, error)
        }
    }
}

/**
 * Sync a tenant agent with its master (when master is updated)
 */
async function syncAgentWithMaster(agentId: string): Promise<boolean> {
    const db = getClient()
    
    // Get agent with its master
    const { data: agent } = await db
        .from('agents')
        .select('*, master_agents(*)')
        .eq('id', agentId)
        .single()
    
    if (!agent?.master_agents) {
        return false
    }
    
    const master = agent.master_agents as MasterAgent
    
    console.log(`[Agents] Syncing ${agent.slug} with master v${master.version}`)
    
    // Update agent with new master values (preserving custom_instructions)
    const { error } = await db
        .from('agents')
        .update({
            system_prompt: master.system_prompt,
            tools: master.tools,
            rag_enabled: master.rag_enabled,
            master_version_synced: master.version,
            updated_at: new Date().toISOString()
        })
        .eq('id', agentId)
    
    return !error
}

/**
 * Get all agents for a tenant
 */
export async function getAgentsForTenant(tenantId: string): Promise<Agent[]> {
    const db = await getTenantClient(tenantId)
    
    // Ensure all master agents are instantiated
    await ensureAgentsForTenant(tenantId)
    
    const { data, error } = await db
        .from('agents')
        .select('*')
        .eq('is_active', true)
        .order('name', { ascending: true })
    
    if (error) {
        console.error('[Agents] Error fetching agents:', error)
        return []
    }
    
    return (data || []).map(agent => ({
        ...agent,
        tools: agent.tools || []
    }))
}

/**
 * Get available agent slugs for a tenant (for intent routing)
 */
export async function getAvailableAgentSlugs(tenantId: string): Promise<string[]> {
    const db = await getTenantClient(tenantId)
    
    const { data, error } = await db
        .from('agents')
        .select('slug')
        .eq('is_active', true)
    
    if (error) {
        console.error('[Agents] Error fetching agent slugs:', error)
        return []
    }
    
    return (data || []).map(a => a.slug)
}

/**
 * Get a specific agent by slug for a tenant
 */
export async function getAgentBySlug(tenantId: string, slug: string): Promise<AgentWithMergedPrompt | null> {
    const db = await getTenantClient(tenantId)
    
    // Ensure agents exist
    await ensureAgentsForTenant(tenantId)
    
    const { data: agent, error } = await db
        .from('agents')
        .select('*')
        .eq('slug', slug)
        .single()
    
    if (error || !agent) {
        console.error(`[Agents] Agent ${slug} not found:`, error)
        return null
    }
    
    // Get tenant info for company context
    const { data: tenant } = await db
        .from('tenants')
        .select('name, company_context')
        .eq('id', tenantId)
        .single()
    
    // Build merged prompt
    const mergedPrompt = buildMergedPrompt(
        agent.system_prompt || '',
        agent.custom_instructions,
        tenant?.company_context,
        tenant?.name
    )
    
    return {
        ...agent,
        tools: agent.tools || [],
        merged_system_prompt: mergedPrompt
    }
}

/**
 * Build the merged system prompt
 * Master prompt + Custom instructions + Company context
 */
function buildMergedPrompt(
    masterPrompt: string,
    customInstructions?: string | null,
    companyContext?: string | null,
    companyName?: string | null
): string {
    let prompt = masterPrompt
    
    // Add custom instructions if present
    if (customInstructions?.trim()) {
        prompt += `\n\n---\n## 📋 INSTRUCCIONES ESPECÍFICAS DE ${companyName || 'LA EMPRESA'}\n${customInstructions}`
    }
    
    // Add company context if present
    if (companyContext?.trim()) {
        prompt += `\n\n---\n## 🏢 CONTEXTO DE LA EMPRESA\n${companyContext}`
    }
    
    return prompt
}

/**
 * Update custom instructions for an agent (tenant-specific)
 */
export async function updateAgentCustomInstructions(
    tenantId: string,
    agentSlug: string,
    customInstructions: string
): Promise<boolean> {
    const db = await getTenantClient(tenantId)
    
    const { error } = await db
        .from('agents')
        .update({ 
            custom_instructions: customInstructions,
            updated_at: new Date().toISOString()
        })
        .eq('slug', agentSlug)
    
    if (error) {
        console.error('[Agents] Error updating custom instructions:', error)
        return false
    }
    
    return true
}

/**
 * Toggle agent active status for a tenant
 */
export async function toggleAgentActive(
    tenantId: string,
    agentSlug: string,
    isActive: boolean
): Promise<boolean> {
    const db = await getTenantClient(tenantId)
    
    const { error } = await db
        .from('agents')
        .update({ 
            is_active: isActive,
            updated_at: new Date().toISOString()
        })
        .eq('slug', agentSlug)
    
    return !error
}

// =============================================================================
// LEGACY COMPATIBILITY
// =============================================================================

/**
 * @deprecated Use getAgentBySlug instead
 */
export async function getTuqui(tenantId: string): Promise<Agent | null> {
    return getAgentBySlug(tenantId, 'tuqui')
}
