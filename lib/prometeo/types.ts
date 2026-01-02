// ============================================================
// Prometeo v2 Types
// ============================================================

// Task Types
export type TaskType = 'scheduled' | 'conditional'

// Notification Priority
export type NotificationPriority = 'info' | 'warning' | 'critical'

// Notification Channels
export type NotificationType = 'push' | 'email' | 'in_app' | 'push_and_email' | 'all'

// ============================================================
// Prometeo Task
// ============================================================
export interface PrometeoTask {
    id: string
    agent_id: string
    user_email?: string  // Legacy field, use created_by instead
    created_by?: string
    name?: string  // Optional task name
    prompt: string
    schedule: string  // Cron expression (for scheduled tasks)
    is_active: boolean
    
    // v2 fields
    task_type: TaskType
    condition?: string  // Natural language condition (for conditional tasks)
    check_interval?: string  // Cron for checking condition (for conditional tasks)
    priority: NotificationPriority
    
    notification_type: NotificationType
    recipients: string[]  // Array of email addresses
    last_run?: string | null
    next_run: string
    last_result?: 'success' | 'error' | 'skipped' | null
    created_at?: string
}

// ============================================================
// In-App Notification
// ============================================================
export interface Notification {
    id: string
    user_email: string
    agent_id?: string
    task_id?: string
    title: string
    body: string
    priority: NotificationPriority
    is_read: boolean
    link?: string  // e.g., /chat/agent-slug
    created_at: string
    
    // Joined fields (optional, from queries)
    agent_name?: string
}

// ============================================================
// Execution Log
// ============================================================
export interface PrometeoExecution {
    id: string
    tenant_id: string
    task_id: string
    executed_at: string
    condition_met?: boolean | null  // null for scheduled, true/false for conditional
    ai_response?: string
    notification_sent: boolean
    status: 'success' | 'skipped' | 'error'
    error_message?: string
}

// ============================================================
// Push Subscription (unchanged)
// ============================================================
export interface PushSubscription {
    endpoint: string
    expirationTime?: number | null
    keys: {
        p256dh: string
        auth: string
    }
}

export interface PushSubscriptionRecord {
    id: string
    user_email: string
    subscription: PushSubscription
    created_at: string
    updated_at: string
}

// ============================================================
// Evaluation Result (from Gemini)
// ============================================================
export interface ConditionEvaluation {
    shouldNotify: boolean
    reason: string
    data?: Record<string, unknown>  // Any data fetched during evaluation
}

// ============================================================
// Notification Payload (for sending)
// ============================================================
export interface NotificationPayload {
    title: string
    body: string
    priority: NotificationPriority
    agentId?: string
    agentName?: string
    taskId?: string
    link?: string
}
