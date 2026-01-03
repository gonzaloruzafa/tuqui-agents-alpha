import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { supabaseAdmin } from '@/lib/supabase'
import { createTenant, syncAgentsFromMasters } from '@/lib/tenants/service'

// Platform admins - use env var or hardcode for now
const PLATFORM_ADMINS = (process.env.PLATFORM_ADMIN_EMAILS || 'gr@adhoc.inc').split(',').map(e => e.trim().toLowerCase())

function isPlatformAdmin(email?: string | null): boolean {
    if (!email) return false
    return PLATFORM_ADMINS.includes(email.toLowerCase())
}

export async function GET() {
    console.log('[SuperAdmin API] GET request received')
    
    const session = await auth()
    console.log('[SuperAdmin API] Session email:', session?.user?.email)
    console.log('[SuperAdmin API] Platform admins:', PLATFORM_ADMINS)

    if (!isPlatformAdmin(session?.user?.email)) {
        console.log('[SuperAdmin API] Unauthorized - email not in platform admins')
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    console.log('[SuperAdmin API] Authorized, fetching tenants...')
    
    try {
        const supabase = supabaseAdmin()
        
        // First try simple query to debug
        console.log('[SuperAdmin API] Testing simple tenants query...')
        const { data: simpleTenants, error: simpleError } = await supabase
            .from('tenants')
            .select('id, name, created_at')
            .order('created_at', { ascending: false })
        
        console.log('[SuperAdmin API] Simple query result:', { 
            count: simpleTenants?.length, 
            error: simpleError?.message 
        })

        if (simpleError) {
            console.error('[SuperAdmin API] Simple query error:', simpleError)
            return NextResponse.json({ error: simpleError.message }, { status: 500 })
        }

        // Now try with users join (left join to not exclude tenants without users)
        const { data: tenants, error } = await supabase
            .from('tenants')
            .select(`
                id,
                name,
                created_at,
                users(email, is_admin)
            `)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[SuperAdmin API] Supabase error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        console.log('[SuperAdmin API] Found tenants:', tenants?.length || 0)
        return NextResponse.json(tenants || [])
    } catch (err: any) {
        console.error('[SuperAdmin API] Unexpected error:', err)
        return NextResponse.json({ error: err.message }, { status: 500 })
    }
}

export async function POST(req: Request) {
    const session = await auth()

    if (!isPlatformAdmin(session?.user?.email)) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    try {
        const body = await req.json()
        const { name, adminEmail, adminPassword, action } = body

        // Handle sync action
        if (action === 'sync_masters') {
            await syncAgentsFromMasters()
            return NextResponse.json({ success: true, message: 'Agents synced from masters' })
        }

        // Handle create tenant
        if (!name || !adminEmail || !adminPassword) {
            return NextResponse.json(
                { error: 'Missing required fields: name, adminEmail, adminPassword' },
                { status: 400 }
            )
        }

        const result = await createTenant({ name, adminEmail, adminPassword })
        return NextResponse.json(result)

    } catch (error: any) {
        console.error('[API] Tenant operation error:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
    }
}
