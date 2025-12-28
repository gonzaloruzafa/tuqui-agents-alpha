/**
 * Supabase Module Index
 * 
 * Re-exports for backwards compatibility
 */

export { getMasterClient } from './master'
export { getTenantClient, getTenantConfig, getTenantForUser, isUserAdmin } from './tenant'

// Alias for backwards compatibility with some modules
// supabaseAdmin is a function that returns the client (matching the expected interface)
export { getMasterClient as supabaseAdmin } from './master'
