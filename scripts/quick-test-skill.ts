/**
 * Quick test for Odoo skills
 */
import { loadSkillsForAgent, createSkillContext } from '../lib/skills/loader'

async function test() {
  const tenantId = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'
  
  console.log('Creating skill context...')
  const ctx = await createSkillContext(tenantId, 'test@test.com')
  
  console.log('Has Odoo credentials:', !!ctx.credentials.odoo)
  
  if (!ctx.credentials.odoo) {
    console.log('No Odoo credentials found!')
    return
  }
  
  console.log('Odoo URL:', ctx.credentials.odoo.url)
  console.log('Odoo User:', ctx.credentials.odoo.username)
  
  console.log('\nLoading skills...')
  const skills = await loadSkillsForAgent(tenantId, ['odoo_intelligent_query'], 'test@test.com')
  
  console.log('Skills loaded:', Object.keys(skills).length)
  console.log('Skill names:', Object.keys(skills).slice(0, 5))
  
  if (skills.get_sales_total) {
    console.log('\nExecuting get_sales_total...')
    const result = await skills.get_sales_total.execute({}, ctx)
    console.log('Result:', JSON.stringify(result, null, 2))
  }
}

test().catch(e => console.error('Error:', e.message, e.stack))
