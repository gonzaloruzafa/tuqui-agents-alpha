import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'

async function checkAgent() {
    const tenantId = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2' // Correct ID
    const db = await getTenantClient(tenantId)
    
    const { data: agent, error } = await db
        .from('agents')
        .select('*')
        .eq('slug', 'tuqui-contador')
        .single()
        
    if (error) {
        console.error('Error fetching agent:', error)
        return
    }
    
    console.log('Agent found:', agent)
    
    const { data: docs, error: docsError } = await db
        .from('documents')
        .select('id, title, agent_id')
        
    if (docsError) console.error('Error fetching docs:', docsError)
    console.log('Documents in DB:', docs)
}

checkAgent()
