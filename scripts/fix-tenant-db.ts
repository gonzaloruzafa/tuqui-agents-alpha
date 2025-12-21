import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'

async function fixTenantDb() {
    const tenantId = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2' // Cliente Adhoc
    const db = await getTenantClient(tenantId)
    
    console.log('Fixing documents table...')
    
    // 1. Make agent_id nullable
    const { error: err1 } = await db.rpc('exec_sql', { 
        sql_query: 'ALTER TABLE documents ALTER COLUMN agent_id DROP NOT NULL;' 
    })
    if (err1) console.error('Error dropping NOT NULL on agent_id:', err1)
    else console.log('agent_id is now nullable')

    // 2. Add is_global column if it doesn't exist
    const { error: err2 } = await db.rpc('exec_sql', { 
        sql_query: 'ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;' 
    })
    if (err2) console.error('Error adding is_global column:', err2)
    else console.log('is_global column added')

    // 3. Add rag_strict to agents if it doesn't exist
    const { error: err3 } = await db.rpc('exec_sql', { 
        sql_query: 'ALTER TABLE agents ADD COLUMN IF NOT EXISTS rag_strict BOOLEAN DEFAULT false;' 
    })
    if (err3) console.error('Error adding rag_strict column to agents:', err3)
    else console.log('rag_strict column added to agents')
}

fixTenantDb()
