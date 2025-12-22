-- Migration: Fix prometeo schema issues
-- Run this on tenant database: ancgbbzvfhoqqxiueyoz

-- 1. Add unique constraint to push_subscriptions user_email
-- First drop if exists to avoid duplicate constraints
DROP INDEX IF EXISTS idx_push_subscriptions_user_email_unique;

-- Create unique index on user_email
CREATE UNIQUE INDEX IF NOT EXISTS idx_push_subscriptions_user_email_unique 
  ON push_subscriptions(user_email);

-- 2. Make user_email nullable in prometeo_tasks (optional - to make it more flexible)
-- Actually, let's keep it NOT NULL since we now populate it from session

-- 3. Verify the schema
SELECT 'push_subscriptions indexes:' as info;
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename = 'push_subscriptions';

SELECT 'prometeo_tasks columns:' as info;
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'prometeo_tasks'
ORDER BY ordinal_position;
