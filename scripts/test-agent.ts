import { getAgentBySlug } from '../lib/agents/service'

async function testAgent() {
    const tenantId = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'
    const agentSlug = 'tuqui-contador'
    
    try {
        const agent = await getAgentBySlug(tenantId, agentSlug)
        console.log('Agent found:', agent.name)
        console.log('RAG Enabled:', agent.rag_enabled)
        console.log('System Prompt:', agent.system_prompt?.substring(0, 100) + '...')
    } catch (error) {
        console.error('Error getting agent:', error)
    }
}

testAgent()
