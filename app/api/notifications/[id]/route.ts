import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth/config'
import { getTenantClient } from '@/lib/supabase/tenant'

/**
 * PATCH /api/notifications/[id]
 * Update notification (mark as read)
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.email || !session.tenant) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const body = await request.json()
        const db = await getTenantClient(session.tenant.id)

        // Only allow updating is_read
        const updateData: { is_read?: boolean } = {}
        if (typeof body.is_read === 'boolean') {
            updateData.is_read = body.is_read
        }

        const { data, error } = await db
            .from('notifications')
            .update(updateData)
            .eq('id', id)
            .eq('user_email', session.user.email)  // Security: only own notifications
            .select()
            .single()

        if (error) {
            console.error('Error updating notification:', error)
            return NextResponse.json({ error: 'Failed to update' }, { status: 500 })
        }

        return NextResponse.json({ notification: data })

    } catch (error) {
        console.error('Notification PATCH error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

/**
 * DELETE /api/notifications/[id]
 * Delete notification
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const session = await auth()
        if (!session?.user?.email || !session.tenant) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { id } = await params
        const db = await getTenantClient(session.tenant.id)

        const { error } = await db
            .from('notifications')
            .delete()
            .eq('id', id)
            .eq('user_email', session.user.email)  // Security: only own notifications

        if (error) {
            console.error('Error deleting notification:', error)
            return NextResponse.json({ error: 'Failed to delete' }, { status: 500 })
        }

        return NextResponse.json({ success: true })

    } catch (error) {
        console.error('Notification DELETE error:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
