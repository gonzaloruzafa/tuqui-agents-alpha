import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'
import { NextResponse } from 'next/server'

export async function GET() {
    const session = await auth()
    if (!session?.user || !session.tenant) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const db = await getTenantClient(session.tenant.id)
    const { data, error } = await db.from('integrations').select('*')

    if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data || [])
}

export async function POST(req: Request) {
    const session = await auth()
    if (!session?.user || !session.tenant || !session.isAdmin) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { slug, is_active, config } = body

    if (!slug) {
        return NextResponse.json({ error: 'Missing slug' }, { status: 400 })
    }

    const db = await getTenantClient(session.tenant.id)

    // Check if integration exists
    const { data: existing } = await db
        .from('integrations')
        .select('id, config')
        .eq('slug', slug)
        .single()

    if (existing) {
        // Merge config to preserve password if not provided
        const mergedConfig = { ...(existing.config || {}) }
        if (config) {
            for (const [key, value] of Object.entries(config)) {
                if (value && (value as string).trim()) {
                    mergedConfig[key] = (value as string).trim()
                }
            }
        }

        const { error } = await db
            .from('integrations')
            .update({ 
                is_active, 
                config: mergedConfig
            })
            .eq('slug', slug)

        if (error) {
            console.error('Update error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
    } else {
        // Insert new
        const { error } = await db
            .from('integrations')
            .insert({ 
                slug, 
                type: slug, 
                is_active: is_active || false, 
                config: config || {} 
            })

        if (error) {
            console.error('Insert error:', error)
            return NextResponse.json({ error: error.message }, { status: 500 })
        }
    }

    return NextResponse.json({ success: true })
}
