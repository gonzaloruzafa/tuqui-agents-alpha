import { config } from 'dotenv'
config({ path: '.env.local' })

import { getTenantClient } from '../lib/supabase/tenant'

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

async function main() {
    console.log('=== Checking Prometeo Status ===\n')
    
    const db = await getTenantClient(TENANT_ID)
    
    // 1. Check if prometeo_tasks table exists
    console.log('1. Checking prometeo_tasks table...')
    const { data: tasks, error: tasksError } = await db
        .from('prometeo_tasks')
        .select('*')
        .limit(5)
    
    if (tasksError) {
        console.log('   ❌ Table error:', tasksError.message)
    } else {
        console.log('   ✅ Table exists, tasks:', tasks?.length || 0)
        if (tasks && tasks.length > 0) {
            console.log('   Sample task:', JSON.stringify(tasks[0], null, 2))
        }
    }
    
    // 2. Check push_subscriptions table
    console.log('\n2. Checking push_subscriptions table...')
    const { data: subs, error: subsError } = await db
        .from('push_subscriptions')
        .select('*')
        .limit(5)
    
    if (subsError) {
        console.log('   ❌ Table error:', subsError.message)
    } else {
        console.log('   ✅ Table exists, subscriptions:', subs?.length || 0)
    }
    
    // 3. Check Twilio integration
    console.log('\n3. Checking Twilio integration...')
    const { data: twilio, error: twilioError } = await db
        .from('integrations')
        .select('*')
        .eq('type', 'twilio')
        .single()
    
    if (twilioError && twilioError.code !== 'PGRST116') {
        console.log('   ❌ Error:', twilioError.message)
    } else if (!twilio) {
        console.log('   ⚠️ Twilio not configured')
    } else {
        console.log('   ✅ Twilio configured, active:', twilio.is_active)
        console.log('   Config keys:', Object.keys(twilio.config || {}))
    }
    
    // 4. Check env vars
    console.log('\n4. Checking environment variables...')
    console.log('   VAPID_PUBLIC_KEY:', process.env.VAPID_PUBLIC_KEY ? '✅ Set' : '❌ Missing')
    console.log('   VAPID_PRIVATE_KEY:', process.env.VAPID_PRIVATE_KEY ? '✅ Set' : '❌ Missing')
    console.log('   PROMETEO_SECRET:', process.env.PROMETEO_SECRET ? '✅ Set' : '❌ Missing')
    console.log('   TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing')
    console.log('   TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing')
    
    console.log('\n=== Check Complete ===')
}

main().catch(console.error)
