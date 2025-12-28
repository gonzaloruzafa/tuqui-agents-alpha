/**
 * Prometeo Notifier
 * 
 * Handles sending notifications through multiple channels:
 * - in_app: Saves to notifications table (always)
 * - push: Web Push notifications via VAPID
 * - email: Email notifications (TODO)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import type { 
    NotificationPayload, 
    NotificationType, 
    PushSubscriptionRecord 
} from './types'

// Configure Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@tuqui.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    )
}

export interface NotifyOptions {
    db: SupabaseClient
    recipients: string[]
    notificationType: NotificationType
    payload: NotificationPayload
    taskId?: string
}

export interface NotifyResult {
    inAppSent: number
    pushSent: number
    emailSent: number
    errors: string[]
}

/**
 * Send notifications to all recipients through configured channels
 */
export async function sendNotifications(options: NotifyOptions): Promise<NotifyResult> {
    const { db, recipients, notificationType, payload, taskId } = options
    
    console.log(`[Notifier] Starting with: type=${notificationType}, recipients=${JSON.stringify(recipients)}`)
    
    const result: NotifyResult = {
        inAppSent: 0,
        pushSent: 0,
        emailSent: 0,
        errors: []
    }
    
    const shouldSendInApp = ['in_app', 'all'].includes(notificationType)
    const shouldSendPush = ['push', 'push_and_email', 'all'].includes(notificationType)
    const shouldSendEmail = ['email', 'push_and_email', 'all'].includes(notificationType)
    
    console.log(`[Notifier] Flags: inApp=${shouldSendInApp}, push=${shouldSendPush}, email=${shouldSendEmail}`)
    
    for (const recipientEmail of recipients) {
        // 1. In-App Notification (always saved for record, optionally marked)
        if (shouldSendInApp || shouldSendPush || shouldSendEmail) {
            try {
                await saveInAppNotification(db, recipientEmail, payload, taskId)
                console.log(`[Notifier] Saved in-app notification for: ${recipientEmail}`)
                result.inAppSent++
            } catch (e) {
                const errorMsg = `[in_app] ${recipientEmail}: ${e instanceof Error ? e.message : 'Unknown error'}`
                console.error(`[Notifier] Error:`, errorMsg)
                result.errors.push(errorMsg)
            }
        }
        
        // 2. Push Notification
        if (shouldSendPush) {
            try {
                const sent = await sendPushNotification(db, recipientEmail, payload)
                if (sent) result.pushSent++
            } catch (e) {
                result.errors.push(`[push] ${recipientEmail}: ${e instanceof Error ? e.message : 'Unknown error'}`)
            }
        }
        
        // 3. Email Notification
        if (shouldSendEmail) {
            try {
                await sendEmailNotification(recipientEmail, payload)
                result.emailSent++
            } catch (e) {
                result.errors.push(`[email] ${recipientEmail}: ${e instanceof Error ? e.message : 'Unknown error'}`)
            }
        }
    }
    
    console.log(`[Notifier] Sent: ${result.inAppSent} in-app, ${result.pushSent} push, ${result.emailSent} email`)
    if (result.errors.length > 0) {
        console.warn(`[Notifier] Errors:`, result.errors)
    }
    
    return result
}

/**
 * Save notification to in-app inbox
 */
async function saveInAppNotification(
    db: SupabaseClient,
    userEmail: string,
    payload: NotificationPayload,
    taskId?: string
): Promise<void> {
    const { error } = await db.from('notifications').insert({
        user_email: userEmail,
        agent_id: payload.agentId,
        task_id: taskId,
        title: payload.title,
        body: payload.body,
        priority: payload.priority,
        link: payload.link,
        is_read: false
    })
    
    if (error) {
        throw new Error(`DB insert failed: ${error.message}`)
    }
}

/**
 * Send Web Push notification
 */
async function sendPushNotification(
    db: SupabaseClient,
    userEmail: string,
    payload: NotificationPayload
): Promise<boolean> {
    // Get user's push subscriptions
    const { data: subscriptions } = await db
        .from('push_subscriptions')
        .select('subscription')
        .eq('user_email', userEmail)
    
    if (!subscriptions || subscriptions.length === 0) {
        console.log(`[Notifier] No push subscriptions for ${userEmail}`)
        return false
    }
    
    let sent = false
    for (const record of subscriptions) {
        try {
            await webpush.sendNotification(
                record.subscription as PushSubscriptionRecord['subscription'],
                JSON.stringify({
                    title: payload.title,
                    body: payload.body,
                    icon: '/icon-192.png',
                    badge: '/icon-72.png',
                    tag: payload.taskId || 'prometeo',
                    data: {
                        agentId: payload.agentId,
                        link: payload.link,
                        priority: payload.priority
                    }
                })
            )
            sent = true
        } catch (e) {
            console.error(`[Notifier] Push failed for ${userEmail}:`, e)
            // If subscription is invalid, we might want to delete it
            // For now just log
        }
    }
    
    return sent
}

/**
 * Send Email notification
 * TODO: Implement with actual email service (Resend, SendGrid, etc.)
 */
async function sendEmailNotification(
    recipientEmail: string,
    payload: NotificationPayload
): Promise<void> {
    // TODO: Implement email sending
    console.log(`[Notifier] Would send email to ${recipientEmail}:`, {
        subject: payload.title,
        body: payload.body,
        priority: payload.priority
    })
    
    // For now, just log - implement when email service is configured
    // throw new Error('Email not implemented')
}

/**
 * Get unread notification count for a user
 */
export async function getUnreadCount(db: SupabaseClient, userEmail: string): Promise<number> {
    const { count, error } = await db
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_email', userEmail)
        .eq('is_read', false)
    
    if (error) {
        console.error('[Notifier] Error getting unread count:', error)
        return 0
    }
    
    return count || 0
}

/**
 * Mark notification as read
 */
export async function markAsRead(db: SupabaseClient, notificationId: string): Promise<void> {
    const { error } = await db
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
    
    if (error) {
        throw new Error(`Failed to mark as read: ${error.message}`)
    }
}

/**
 * Mark all notifications as read for a user
 */
export async function markAllAsRead(db: SupabaseClient, userEmail: string): Promise<void> {
    const { error } = await db
        .from('notifications')
        .update({ is_read: true })
        .eq('user_email', userEmail)
        .eq('is_read', false)
    
    if (error) {
        throw new Error(`Failed to mark all as read: ${error.message}`)
    }
}
