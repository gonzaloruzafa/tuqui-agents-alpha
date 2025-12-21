import dotenv from 'dotenv'
import path from 'path'
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') })

import { getMasterClient } from '../lib/supabase/master'

async function listTenants() {
    const db = getMasterClient()
    const { data, error } = await db.from('tenants').select('*')
    if (error) {
        console.error('Error:', error)
        return
    }
    console.log('Tenants:', data)
}

listTenants()
