const dotenv = require('dotenv')
const path = require('path')
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

const { getTenantClient } = require('../lib/supabase/tenant')
const { generateEmbedding } = require('../lib/rag/embeddings')

async function testMatchDocuments() {
    const tenantId = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'
    const agentId = 'a7a1c85e-1bbf-494c-a85a-1b5e3f1485af' // tuqui-contador
    const db = await getTenantClient(tenantId)
    
    console.log('Generating test embedding...')
    const embedding = await generateEmbedding('impuestos')
    
    console.log('Calling match_documents RPC...')
    const { data, error } = await db.rpc('match_documents', {
        query_embedding: embedding,
        match_agent_id: agentId,
        match_threshold: 0.1,
        match_count: 5
    })
    
    if (error) {
        console.error('RPC Error:', error)
    } else {
        console.log('RPC Success, results:', data)
    }
}

testMatchDocuments()
