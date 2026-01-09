
import { getTenantClient } from '../lib/supabase/client'
import dotenv from 'dotenv'

dotenv.config({ path: '.env.local' })

const TEST_TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function fixAgentTools() {
    console.log('fixing agent tools for tenant:', TEST_TENANT_ID)
    const db = await getTenantClient(TEST_TENANT_ID)

    // Fix MeLi agent
    const { data: meli } = await db.from('agents').select('*').eq('slug', 'meli').single()
    if (meli) {
        console.log('Current meli tools:', meli.tools)
        const newTools = (meli.tools || []).filter((t: string) => t !== 'web_investigator' && t !== 'ecommerce_search')
        if (!newTools.includes('web_search')) newTools.push('web_search')
        
        await db.from('agents').update({ tools: newTools }).eq('id', meli.id)
        console.log('Updated meli tools:', newTools)
    }

    // Fix Tuqui agent
    const { data: tuqui } = await db.from('agents').select('*').eq('slug', 'tuqui').single()
    if (tuqui) {
        console.log('Current tuqui tools:', tuqui.tools)
        const newTools = (tuqui.tools || []).filter((t: string) => t !== 'web_investigator' && t !== 'ecommerce_search' && t !== 'tavily_search')
        if (!newTools.includes('web_search')) newTools.push('web_search')
        if (!newTools.includes('odoo_intelligent_query')) newTools.push('odoo_intelligent_query')

        await db.from('agents').update({ tools: newTools }).eq('id', tuqui.id)
        console.log('Updated tuqui tools:', newTools)
    }
}

fixAgentTools().catch(console.error)
