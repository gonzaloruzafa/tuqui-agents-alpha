-- Migration: Update prometeo_tasks schema to match TypeScript interfaces
-- Run this on the tenant database: ancgbbzvfhoqqxiueyoz

-- 1. Add missing columns
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS notification_type text DEFAULT 'push';
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS recipients text[] DEFAULT '{}';
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS last_result text;
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS created_by text;

-- 2. Rename columns to match TypeScript code (last_run_at -> last_run, next_run_at -> next_run)
-- First check if old columns exist and new don't
DO $$
BEGIN
    -- Rename last_run_at to last_run if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'last_run_at') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'last_run') 
    THEN
        ALTER TABLE prometeo_tasks RENAME COLUMN last_run_at TO last_run;
    END IF;
    
    -- Rename next_run_at to next_run if it exists
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'next_run_at') 
       AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'next_run') 
    THEN
        ALTER TABLE prometeo_tasks RENAME COLUMN next_run_at TO next_run;
    END IF;
END $$;

-- 3. Add last_run and next_run if they don't exist (in case table was created fresh)
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS last_run timestamp with time zone;
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS next_run timestamp with time zone;

-- 4. Make name column optional (code doesn't always use it)
ALTER TABLE prometeo_tasks ALTER COLUMN name DROP NOT NULL;

-- 5. Update constraint to allow null name
ALTER TABLE prometeo_tasks ALTER COLUMN name SET DEFAULT '';

-- 6. Verify final schema
SELECT column_name, data_type, is_nullable, column_default 
FROM information_schema.columns 
WHERE table_name = 'prometeo_tasks' 
ORDER BY ordinal_position;
