import { config } from 'dotenv'
import { resolve } from 'path'
config({ path: resolve(__dirname, '../.env.local') })

import { createClient } from '@supabase/supabase-js'

const tenant = createClient(
  process.env.INITIAL_TENANT_URL!,
  process.env.INITIAL_TENANT_SERVICE_KEY!
)

async function main() {
  // Agents schema
  console.log('\n📋 AGENTS SCHEMA:')
  const { data: agents } = await tenant.from('agents').select('*').limit(1)
  if (agents && agents[0]) {
    console.log('Columns:', Object.keys(agents[0]))
  }
  
  // Try insert with minimal fields
  console.log('\n📋 TEST INSERT PROMETEO_TASKS:')
  const { data: insertTest, error: insertErr } = await tenant
    .from('prometeo_tasks')
    .insert({
      agent_id: '42921302-87af-4405-ab32-dbbeda4aa428',
      prompt: 'test prompt',
      schedule: '* * * * *',
      user_email: 'test@test.com' // Adding user_email
    })
    .select()
  
  if (insertErr) {
    console.log('Insert error:', insertErr)
  } else {
    console.log('Inserted successfully!')
    console.log('Row columns:', Object.keys(insertTest[0]))
    console.log('Full row:', insertTest[0])
    // Cleanup
    await tenant.from('prometeo_tasks').delete().eq('id', insertTest[0].id)
    console.log('Cleaned up test row')
  }
}

main().catch(console.error)
