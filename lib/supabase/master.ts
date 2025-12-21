import { createClient } from '@supabase/supabase-js'

export function getMasterClient() {
    const MASTER_URL = process.env.NEXT_PUBLIC_MASTER_SUPABASE_URL
    const MASTER_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!MASTER_URL || !MASTER_KEY) {
        throw new Error('Missing Master Supabase environment variables')
    }
    return createClient(MASTER_URL, MASTER_KEY)
}
