import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'
import { markAllAsRead } from '@/lib/prometeo/notifier'

/**
 * GET /api/notifications
 * List notifications for current user
 * 
 * Query params:
 * - unread: boolean - filter only unread
 * - priority: 'info' | 'warning' | 'critical' - filter by priority
 * - limit: number - max results (default 20)
 * - offset: number - pagination offset
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.email || !session.tenant) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const searchParams = request.nextUrl.searchParams
        const unreadOnly = searchParams.get('unread') === 'true'
        const priority = searchParams.get('priority')
        const limit = parseInt(searchParams.get('limit') || '20')
        const offset = parseInt(searchParams.get('offset') || '0')

        const db = await getTenantClient(session.tenant.id)

        let query = db
            .from('notifications')
            .select(`
                *,
                agents:agent_id (name, slug)
            `)
            .eq('user_email', session.user.email)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1)

        if (unreadOnly) {
            query = query.eq('is_read', false)
        }

        if (priority) {
            query = query.eq('priority', priority)
        }

        const { data: notifications, error } = await query

        if (error) {
            console.error('Error fetching notifications:', error)
            return NextResponse.json({ error: 'Failed to fetch notifications' }, { status: 500 })
        }

        // Format response
        const formatted = (notifications || []).map((n: any) => ({
            ...n,
            agent_name: n.agents?.name,
            agent_slug: n.agents?.slug,
            agents: undefined
        }))

        return NextResponse.json({ notifications: formatted })

    } catch (error) {
        console.error('Notifications GET error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * POST /api/notifications/mark-all-read
 * Mark all notifications as read for current user
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth()
        if (!session?.user?.email || !session.tenant) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const db = await getTenantClient(session.tenant.id)
        
        await markAllAsRead(db, session.user.email)

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Notifications POST error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
