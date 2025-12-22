import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'

/**
 * GET /api/notifications/unread-count
 * Get count of unread notifications
 */
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.email || !session.tenant) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const db = await getTenantClient(session.tenant.id)

        const { count, error } = await db
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_email', session.user.email)
            .eq('is_read', false)

        if (error) {
            console.error('Error getting unread count:', error)
            return NextResponse.json({ error: 'Failed to get count' }, { status: 500 })
        }

        return NextResponse.json({ count: count || 0 })

    } catch (error) {
        console.error('Unread count error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
