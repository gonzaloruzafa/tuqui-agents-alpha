export interface PrometeoTask {
    id: string
    agent_id: string
    user_email?: string  // Legacy field, use created_by instead
    created_by?: string
    name?: string  // Optional task name
    prompt: string
    schedule: string  // Cron expression
    is_active: boolean
    notification_type: 'push' | 'email' | 'both'
    recipients: string[]  // Array of email addresses
    last_run?: string | null
    next_run: string
    last_result?: 'success' | 'error' | null
    created_at?: string
}

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
