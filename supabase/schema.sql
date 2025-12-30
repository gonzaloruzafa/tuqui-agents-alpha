-- ===========================================
-- SCHEMA PARA TUQUI AGENTS ALPHA
-- Ejecutar en Supabase SQL Editor
-- https://supabase.com/dashboard/project/zwtvnxhjypomldokssbt/sql
-- ===========================================

-- Tenants table
CREATE TABLE IF NOT EXISTS tenants (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  schema_name TEXT UNIQUE, -- New column for Schema isolation
  supabase_url TEXT,
  supabase_anon_key TEXT,
  supabase_service_key TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Users table  
CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  tenant_id UUID REFERENCES tenants(id),
  role TEXT DEFAULT 'user',
  is_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON users(tenant_id);

-- ===========================================
-- DATOS INICIALES
-- ===========================================

-- Tenant de Adhoc (usando la misma Supabase por ahora)
INSERT INTO tenants (id, name, slug, supabase_url, supabase_anon_key, supabase_service_key) 
VALUES (
  'de7ef34a-12bd-4fe9-9d02-3d876a9393c2',
  'Adhoc',
  'adhoc',
  'https://zwtvnxhjypomldokssbt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dHZueGhqeXBvbWxkb2tzc2J0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ1MjYxNjIsImV4cCI6MjA4MDEwMjE2Mn0.yPMKtJVwwpnQ9daNqLsLt5rjsafHlxUY4AE2NMZDZV4',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3dHZueGhqeXBvbWxkb2tzc2J0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2NDUyNjE2MiwiZXhwIjoyMDgwMTAyMTYyfQ.E0_My45lH0xMmFvNmdjk8l9pxyEvK3gceMLfUDtUg4A'
) ON CONFLICT (slug) DO NOTHING;

-- Usuario admin gr@adhoc.inc
INSERT INTO users (email, tenant_id, role, is_admin)
VALUES (
  'gr@adhoc.inc',
  'de7ef34a-12bd-4fe9-9d02-3d876a9393c2',
  'admin',
  true
) ON CONFLICT (email) DO UPDATE SET 
  tenant_id = EXCLUDED.tenant_id,
  role = EXCLUDED.role,
  is_admin = EXCLUDED.is_admin;

-- Usuario gonzalo
INSERT INTO users (email, tenant_id, role, is_admin)
VALUES (
  'gonzalo@adhoc.com.ar',
  'de7ef34a-12bd-4fe9-9d02-3d876a9393c2',
  'admin',
  true
) ON CONFLICT (email) DO NOTHING;
