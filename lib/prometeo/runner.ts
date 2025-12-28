/**
 * Prometeo Runner v2
 * 
 * Orchestrates the execution of scheduled and conditional tasks:
 * 1. Fetches pending tasks (next_run <= now)
 * 2. For conditional tasks: evaluates condition with AI
 * 3. Sends notifications through configured channels
 * 4. Logs execution in prometeo_executions
 * 5. Updates next_run based on schedule/check_interval
 */

import { getTenantClient } from '@/lib/supabase/tenant'
import { getMasterClient } from '@/lib/supabase/master'
import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import { CronExpressionParser } from 'cron-parser'
import { sendNotifications } from './notifier'
import { evaluateCondition, generateNotificationContent } from './evaluator'
import type { 
    PrometeoTask, 
    PrometeoExecution,
    NotificationPayload,
    NotificationType 
} from './types'

/**
 * Main entry point: run all pending tasks across all tenants
 */
export async function runPendingTasks() {
    console.log('[Prometeo] Starting run...')
    const master = getMasterClient()

    // 1. Get all active tenants
    const { data: tenants } = await master
        .from('tenants')
        .select('id, slug')
        .eq('is_active', true)
    
    if (!tenants) {
        console.log('[Prometeo] No active tenants found')
        return
    }

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

/**
 * Process all pending tasks for a specific tenant
 */
async function processTenantTasks(tenantId: string) {
    const db = await getTenantClient(tenantId)
    const now = new Date().toISOString()

    // Get pending tasks (next_run <= now AND is_active = true)
    const { data: tasks } = await db
        .from('prometeo_tasks')
        .select('*')
        .eq('is_active', true)
        .lte('next_run', now)

    if (!tasks || tasks.length === 0) {
        return
    }

    console.log(`[Prometeo] Found ${tasks.length} pending tasks for tenant ${tenantId}`)

    for (const task of tasks) {
        await executeTask(tenantId, task as PrometeoTask)
    }
}

/**
 * Execute a single task
 */
async function executeTask(tenantId: string, task: PrometeoTask) {
    console.log(`[Prometeo] Executing task: ${task.id} (${task.task_type || 'scheduled'})`)
    const db = await getTenantClient(tenantId)

    const execution: Partial<PrometeoExecution> = {
        task_id: task.id,
        executed_at: new Date().toISOString(),
        status: 'success',
        notification_sent: false
    }

    try {
        // 1. Fetch agent info
        const { data: agent } = await db
            .from('agents')
            .select('id, name, slug, system_prompt')
            .eq('id', task.agent_id)
            .single()
        
        if (!agent) {
            throw new Error('Agent not found')
        }

        let shouldNotify = true
        let notificationContent: { title: string; body: string } | undefined

        // 2. Handle based on task type
        if (task.task_type === 'conditional' && task.condition) {
            // Evaluate condition
            const evaluation = await evaluateCondition({
                agentSystemPrompt: agent.system_prompt || 'Sos un asistente útil.',
                agentName: agent.name,
                condition: task.condition,
                taskPrompt: task.prompt
            })
            
            execution.condition_met = evaluation.shouldNotify
            execution.ai_response = evaluation.reason
            shouldNotify = evaluation.shouldNotify

            if (shouldNotify) {
                // Generate notification content
                notificationContent = await generateNotificationContent({
                    agentSystemPrompt: agent.system_prompt || 'Sos un asistente útil.',
                    agentName: agent.name,
                    condition: task.condition,
                    taskPrompt: task.prompt,
                    evaluationData: evaluation.data
                })
            } else {
                execution.status = 'skipped'
                console.log(`[Prometeo] Condition not met for task ${task.id}: ${evaluation.reason}`)
            }
        } else {
            // Scheduled task: always generate content
            const { text } = await generateText({
                model: google('gemini-2.5-flash'),
                system: agent.system_prompt || 'Sos un asistente útil.',
                prompt: `TAREA PROGRAMADA:
${task.prompt}

Genera una notificación concisa (máximo 200 caracteres) con la información solicitada.`
            })
            
            execution.ai_response = text
            notificationContent = {
                title: `${agent.name}`,
                body: text.substring(0, 200)
            }
        }

        // 3. Send notifications if condition met (or scheduled)
        if (shouldNotify && notificationContent) {
            const payload: NotificationPayload = {
                title: notificationContent.title,
                body: notificationContent.body,
                priority: task.priority || 'info',
                agentId: agent.id,
                agentName: agent.name,
                taskId: task.id,
                link: `/chat/${agent.slug}`
            }

            console.log(`[Prometeo] Sending notifications to recipients:`, task.recipients)
            console.log(`[Prometeo] Notification type:`, task.notification_type)
            
            const result = await sendNotifications({
                db,
                recipients: task.recipients,
                notificationType: (task.notification_type || 'in_app') as NotificationType,
                payload,
                taskId: task.id
            })

            console.log(`[Prometeo] Notification result:`, result)
            execution.notification_sent = result.inAppSent > 0 || result.pushSent > 0 || result.emailSent > 0
        }

        // 4. Calculate next run
        const scheduleExpression = task.task_type === 'conditional' 
            ? (task.check_interval || '*/15 * * * *')  // Default: every 15 min
            : task.schedule
        
        let nextRun: Date
        try {
            const interval = CronExpressionParser.parse(scheduleExpression)
            nextRun = interval.next().toDate()
        } catch {
            // Fallback: 1 hour from now
            nextRun = new Date(Date.now() + 60 * 60 * 1000)
        }

        // 5. Update task
        await db.from('prometeo_tasks').update({
            last_run: new Date().toISOString(),
            next_run: nextRun.toISOString(),
            last_result: execution.status
        }).eq('id', task.id)

        // 6. Log execution
        await db.from('prometeo_executions').insert(execution)

        return { 
            success: true, 
            message: execution.ai_response || 'Task executed',
            notificationSent: execution.notification_sent
        }

    } catch (error) {
        console.error(`[Prometeo] Task failed: ${task.id}`, error)
        
        execution.status = 'error'
        execution.error_message = error instanceof Error ? error.message : 'Unknown error'
        
        // Update task with error
        await db.from('prometeo_tasks').update({
            last_run: new Date().toISOString(),
            last_result: 'error'
        }).eq('id', task.id)

        // Log execution with error
        try {
            await db.from('prometeo_executions').insert(execution)
        } catch (logError) {
            console.error('[Prometeo] Failed to log execution:', logError)
        }
        
        return { 
            success: false, 
            message: execution.error_message,
            notificationSent: false
        }
    }
}

/**
 * Execute a specific task manually (from API)
 */
export async function executePrometeoTask(
    tenantId: string, 
    task: PrometeoTask
): Promise<{ success: boolean; message: string; notificationSent?: boolean }> {
    return executeTask(tenantId, task)
}

/**
 * Get execution history for a task
 */
export async function getTaskExecutions(
    tenantId: string,
    taskId: string,
    limit: number = 10
): Promise<PrometeoExecution[]> {
    const db = await getTenantClient(tenantId)
    
    const { data } = await db
        .from('prometeo_executions')
        .select('*')
        .eq('task_id', taskId)
        .order('executed_at', { ascending: false })
        .limit(limit)
    
    return (data || []) as PrometeoExecution[]
}
