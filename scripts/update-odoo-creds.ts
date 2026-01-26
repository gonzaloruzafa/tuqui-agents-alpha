import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

const TENANT_ID = 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2'

// New Odoo credentials
const NEW_CREDS = {
  odoo_url: 'https://trainp-cedent-26-01-1.adhoc.ar',
  odoo_db: 'odoo',
  odoo_user: 'fdelpazo',
  api_key: 'ff049e91b06a83036bc9ae136c3a46d833c5e5f9'
}

// Encrypt function (same as lib/crypto.ts)
function encrypt(text: string): string {
  return `enc:${Buffer.from(text).toString('base64')}`
}

async function main() {
  console.log('🔄 Updating Odoo credentials for tenant:', TENANT_ID)
  
  // Check current integration
  const { data: existing, error: fetchError } = await supabase
    .from('integrations')
    .select('*')
    .eq('tenant_id', TENANT_ID)
    .eq('type', 'odoo')
    .single()
  
  if (fetchError && fetchError.code !== 'PGRST116') {
    console.error('Error fetching:', fetchError)
    return
  }
  
  const encryptedKey = encrypt(NEW_CREDS.api_key)
  
  const config = {
    odoo_url: NEW_CREDS.odoo_url,
    odoo_db: NEW_CREDS.odoo_db,
    odoo_user: NEW_CREDS.odoo_user,
    odoo_password: encryptedKey
  }
  
  if (existing) {
    console.log('📝 Updating existing integration...')
    const { error } = await supabase
      .from('integrations')
      .update({ config, is_active: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id)
    
    if (error) {
      console.error('Update error:', error)
    } else {
      console.log('✅ Updated successfully')
    }
  } else {
    console.log('➕ Creating new integration...')
    const { error } = await supabase
      .from('integrations')
      .insert({
        tenant_id: TENANT_ID,
        type: 'odoo',
        name: 'Odoo ERP (Facu Test)',
        config,
        is_active: true
      })
    
    if (error) {
      console.error('Insert error:', error)
    } else {
      console.log('✅ Created successfully')
    }
  }
  
  // Verify
  const { data: verify } = await supabase
    .from('integrations')
    .select('id, type, name, is_active, config')
    .eq('tenant_id', TENANT_ID)
    .eq('type', 'odoo')
    .single()
  
  console.log('\n📋 Current config:', JSON.stringify(verify, null, 2))
}

main().catch(console.error)
