import { getTenantClient } from '@/lib/supabase/tenant'
import { getMasterClient } from '@/lib/supabase/master'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import webpush from 'web-push'
import { CronExpressionParser } from 'cron-parser'
import type { PrometeoTask } from './types'

// Configure Web Push (should be done once)
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || 'mailto:admin@tuqui.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    )
}

export async function runPendingTasks() {
    console.log('[Prometeo] Starting run...')
    const master = getMasterClient()

    // 1. Get all active tenants
    const { data: tenants } = await master.from('tenants').select('id, slug').eq('is_active', true)
    if (!tenants) return

    for (const tenant of tenants) {
        console.log(`[Prometeo] Checking tenant: ${tenant.slug}`)
        try {
            await processTenantTasks(tenant.id)
        } catch (e) {
            console.error(`[Prometeo] Error processing tenant ${tenant.slug}:`, e)
        }
    }
    console.log('[Prometeo] Run complete.')
}

async function processTenantTasks(tenantId: string) {
    const db = await getTenantClient(tenantId)

    // 2. Get pending tasks
    // Logic: next_run <= now AND is_active = true
    const now = new Date().toISOString()
    const { data: tasks } = await db
        .from('prometeo_tasks')
        .select('*')
        .eq('is_active', true)
        .lte('next_run', now)

    if (!tasks || tasks.length === 0) return

    console.log(`[Prometeo] Found ${tasks.length} tasks for tenant ${tenantId}`)

    for (const task of tasks) {
        await executeTask(tenantId, task as PrometeoTask)
    }
}

async function executeTask(tenantId: string, task: PrometeoTask) {
    console.log(`[Prometeo] Executing task: ${task.id}`)
    const db = await getTenantClient(tenantId)

    try {
        // 1. Run Agent Logic
        // Fetch agent system prompt + task prompt
        const { data: agent } = await db.from('agents').select('*').eq('id', task.agent_id).single()
        if (!agent) throw new Error('Agent not found')

        // Generate content
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            system: agent.system_prompt || 'Sos un asistente útil.',
            prompt: `TASK CONTEXT: This is a scheduled task.
USER PROMPT: ${task.prompt}
Please generate a concise notification/summary based on this request. max 200 chars if possible.`
        })

        // 2. Send Push Notification to all recipients
        for (const recipientEmail of task.recipients) {
            if (task.notification_type === 'push' || task.notification_type === 'both') {
                // Get user subscription
                const { data: subs } = await db
                    .from('push_subscriptions')
                    .select('*')
                    .eq('user_email', recipientEmail)

                if (subs && subs.length > 0) {
                    for (const sub of subs) {
                        try {
                            await webpush.sendNotification(sub.subscription, JSON.stringify({
                                title: `Tuqui: ${agent.name}`,
                                body: text,
                                icon: '/icon-192.png',
                                data: { agentId: task.agent_id }
                            }))
                        } catch (e) {
                            console.error('Push failed for', recipientEmail, e)
                        }
                    }
                }
            }
            
            // TODO: Add email notification support
            if (task.notification_type === 'email' || task.notification_type === 'both') {
                console.log(`[Prometeo] Would send email to ${recipientEmail}: ${text}`)
            }
        }

        // 3. Calculate next run using cron-parser
        let nextRun: Date
        try {
            const interval = CronExpressionParser.parse(task.schedule)
            nextRun = interval.next().toDate()
        } catch {
            // Fallback to 24h from now
            nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000)
        }

        await db.from('prometeo_tasks').update({
            last_run: new Date().toISOString(),
            next_run: nextRun.toISOString(),
            last_result: 'success'
        }).eq('id', task.id)

        return { success: true, message: text }

    } catch (error) {
        console.error(`[Prometeo] Task failed: ${task.id}`, error)
        
        // Update with error status
        await db.from('prometeo_tasks').update({
            last_run: new Date().toISOString(),
            last_result: 'error'
        }).eq('id', task.id)
        
        return { success: false, message: error instanceof Error ? error.message : 'Unknown error' }
    }
}

// Export for manual execution from API
export async function executePrometeoTask(
    tenantId: string, 
    task: PrometeoTask
): Promise<{ success: boolean; message: string }> {
    return executeTask(tenantId, task)
}
