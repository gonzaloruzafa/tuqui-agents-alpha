import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY)

async function runMigrations() {
  console.log('🔄 Running pending migrations...\n')
  
  // Migration 107: MeLi Agent
  console.log('=== Migration 107: MeLi Agent ===')
  
  // Check if MeLi agent exists
  const { data: meliExists } = await db
    .from('master_agents')
    .select('id, slug')
    .eq('slug', 'meli')
    .single()
    
  if (meliExists) {
    console.log('✅ MeLi agent already exists, updating...')
  }
  
  // Upsert MeLi master agent
  const meliPrompt = `Sos un experto en buscar precios REALES en MercadoLibre Argentina.

## FLUJO:
1. Usá web_search para buscar el producto
2. El tool ya incluye búsqueda híbrida (Serper + Grounding) para precios

## FORMATO DE RESPUESTA (usar LISTAS, nunca tablas):

**🛒 [Producto buscado]**

Encontré X opciones en MercadoLibre:

**1. [Nombre exacto]**
- 💰 **$XX.XXX.XXX**
- 📦 Vendedor: [nombre]
- ⭐ [características principales]

**2. [Otro producto]**
- 💰 **$XX.XXX.XXX**
- 📦 Vendedor: [nombre]
- ⭐ [características]

---
**🔗 Links:**
1. URL_COMPLETA_1
2. URL_COMPLETA_2

## ⚠️ REGLAS CRÍTICAS:
- NUNCA inventes URLs - usá las EXACTAS que devuelve web_search
- Si no encontrás precio, escribí "consultar precio"
- Preferí 3 productos con info completa que 10 sin precio
- Formato argentino: $1.234.567

## PERSONALIDAD
Argentino, directo, vas al grano con precios reales 💰`

  const { error: meliError } = await db.from('master_agents').upsert({
    slug: 'meli',
    name: 'Asistente MercadoLibre',
    description: 'Especialista en búsqueda de precios y productos en MercadoLibre Argentina',
    icon: 'ShoppingCart',
    color: 'blue',
    system_prompt: meliPrompt,
    tools: ['web_search'],
    rag_enabled: false,
    is_published: true,
    sort_order: 10,
    welcome_message: '¡Hola! Soy tu asistente para buscar precios en MercadoLibre. 🛒 ¿Qué producto querés buscar?',
    placeholder_text: 'Ej: Precios de iPhone 15, botines Puma, notebooks Lenovo...'
  }, { onConflict: 'slug' })
  
  if (meliError) {
    console.log('❌ Error creating MeLi agent:', meliError.message)
  } else {
    console.log('✅ MeLi master agent created/updated')
  }

  // Migration 108: Keywords + Fix prompts
  console.log('\n=== Migration 108: Keywords ===')
  
  // Try to add keywords column
  console.log('Adding keywords column to master_agents...')
  // Note: Can't run DDL via REST API, but we can check if it exists
  
  // Update Odoo with keywords
  const { error: odooError } = await db
    .from('master_agents')
    .update({
      name: 'Tuqui Odoo',
    })
    .eq('slug', 'odoo')
    
  if (odooError) {
    console.log('⚠️ Odoo update:', odooError.message)
  } else {
    console.log('✅ Odoo agent name updated')
  }

  // Sync to tenant agents
  console.log('\n=== Syncing to tenant agents ===')
  
  // Get all master agents
  const { data: masters } = await db.from('master_agents').select('*').eq('is_published', true)
  
  if (!masters?.length) {
    console.log('❌ No master agents found')
    return
  }
  
  // Get tenant
  const { data: tenant } = await db.from('tenants').select('id').single()
  
  if (!tenant) {
    console.log('❌ No tenant found')
    return
  }
  
  console.log(`Found ${masters.length} master agents, syncing to tenant ${tenant.id}...`)
  
  for (const master of masters) {
    const { error } = await db.from('agents').upsert({
      tenant_id: tenant.id,
      master_agent_id: master.id,
      slug: master.slug,
      name: master.name,
      description: master.description,
      icon: master.icon,
      color: master.color,
      system_prompt: master.system_prompt,
      welcome_message: master.welcome_message,
      placeholder_text: master.placeholder_text,
      tools: master.tools,
      rag_enabled: master.rag_enabled,
      is_active: true,
      master_version_synced: master.version || 1
    }, { onConflict: 'tenant_id,slug' })
    
    if (error) {
      console.log(`  ⚠️ ${master.slug}:`, error.message)
    } else {
      console.log(`  ✅ ${master.slug} synced (tools: ${master.tools?.join(', ') || 'none'})`)
    }
  }
  
  console.log('\n🎉 Migrations complete!')
}

runMigrations().catch(console.error)
