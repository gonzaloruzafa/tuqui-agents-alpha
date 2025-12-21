/**
 * Seed Built-in Agents to Tenant Database
 * Run this after creating a new tenant to populate default agents
 */

import { getTenantClient } from '../lib/supabase/tenant'
import { BUILTIN_AGENTS } from '../lib/agents/registry'

export async function seedAgentsForTenant(tenantId: string) {
    console.log(`[Seed] Seeding agents for tenant: ${tenantId}`)

    const db = await getTenantClient(tenantId)

    const agentsToInsert = Object.entries(BUILTIN_AGENTS).map(([slug, config]) => ({
        slug,
        name: config.name,
        description: config.description,
        icon: config.icon,
        color: 'adhoc-violet',
        is_active: true,
        rag_enabled: config.ragEnabled,
        system_prompt: config.systemPrompt,
        welcome_message: `Hola, soy ${config.name}. ¿En qué puedo ayudarte?`,
        placeholder_text: 'Escribí tu consulta...',
        tools: config.tools || []
    }))

    // Upsert: insert or update if exists
    for (const agent of agentsToInsert) {
        const { error } = await db
            .from('agents')
            .upsert(agent, { onConflict: 'slug' })

        if (error) {
            console.error(`[Seed] Error upserting agent ${agent.slug}:`, error)
        } else {
            console.log(`[Seed] ✅ Agent ${agent.slug} ready`)
        }
    }

    console.log(`[Seed] Completed seeding ${agentsToInsert.length} agents`)
}

// If run directly
if (require.main === module) {
    const tenantId = process.argv[2]
    if (!tenantId) {
        console.error('Usage: npx tsx scripts/seed-agents.ts <tenant-id>')
        process.exit(1)
    }

    require('dotenv').config({ path: '.env.local' })

    seedAgentsForTenant(tenantId)
        .then(() => {
            console.log('Done!')
            process.exit(0)
        })
        .catch(e => {
            console.error(e)
            process.exit(1)
        })
}
