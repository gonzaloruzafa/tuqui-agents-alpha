import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'

export async function GET() {
    try {
        const session = await auth()
        
        if (!session?.user || !session.isAdmin) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const tenantId = session.tenant?.id
        if (!tenantId) {
            return NextResponse.json({ error: 'No tenant' }, { status: 400 })
        }

        const db = await getTenantClient(tenantId)
        const { data: integration, error } = await db
            .from('integrations')
            .select('*')
            .eq('type', 'odoo')
            .single()

        if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 })
        }

        if (!integration) {
            return NextResponse.json({ error: 'No Odoo integration found' }, { status: 404 })
        }

        // Don't expose password
        const config = integration.config || {}
        const safeConfig = {
            odoo_url: config.odoo_url || config.url || '(not set)',
            odoo_db: config.odoo_db || config.db || '(not set)',
            odoo_user: config.odoo_user || config.username || '(not set)',
            has_password: !!(config.odoo_password || config.api_key)
        }

        return NextResponse.json({
            tenantId,
            tenantName: session.tenant?.name,
            integrationId: integration.id,
            isActive: integration.is_active,
            config: safeConfig
        })
    } catch (error) {
        console.error('Debug Odoo error:', error)
        return NextResponse.json({ 
            error: error instanceof Error ? error.message : 'Unknown error' 
        }, { status: 500 })
    }
}
