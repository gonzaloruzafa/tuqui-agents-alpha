import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getTenantClient } from '../lib/supabase/tenant'

async function checkTableSchema() {
    const tenantId = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2' // Cliente Adhoc
    const db = await getTenantClient(tenantId)
    
    console.log('Checking document_chunks table...')
    const { data: chunkData, error: chunkError } = await db.from('document_chunks').select('*').limit(1)
    if (chunkError) {
        console.error('Error selecting from document_chunks:', chunkError)
    } else if (chunkData && chunkData.length > 0) {
        console.log('Chunk columns:', Object.keys(chunkData[0]))
    } else {
        console.log('No chunks found.')
    }
}

checkTableSchema()
