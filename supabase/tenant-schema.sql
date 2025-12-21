-- TENANT DB SCHEMA
-- Ejecutar en CADA proyecto Supabase de cliente

-- Habilitar extensión pgvector para RAG
create extension if not exists vector;

-- ===========================================
-- CONFIGURACIÓN INTEGRACIONES
-- ===========================================
create table if not exists integrations (
  id uuid default gen_random_uuid() primary key,
  type text not null, -- 'odoo', 'mercadolibre', 'twilio', 'stripe'
  config jsonb default '{}', -- credenciales encriptadas
  is_active boolean default true,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(type)
);

-- ===========================================
-- SISTEMA DE AGENTES
-- ===========================================
create table if not exists agents (
  id uuid default gen_random_uuid() primary key,
  slug text unique not null,
  name text not null,
  description text,
  icon text default 'Bot',
  color text default 'blue',
  is_active boolean default true,
  rag_enabled boolean default false,
  system_prompt text, -- prompt base actual
  welcome_message text,
  placeholder_text text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists agent_tools (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references agents(id) on delete cascade not null,
  tool_slug text not null,
  enabled boolean default true,
  unique(agent_id, tool_slug)
);

-- ===========================================
-- RAG & DOCUMENTOS
-- ===========================================
create table if not exists documents (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references agents(id) on delete cascade, -- NULLABLE: null = global doc
  title text not null,
  content text not null,
  source_type text default 'manual',
  source_url text,
  is_global boolean default false, -- true = available to all agents
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists document_chunks (
  id uuid default gen_random_uuid() primary key,
  document_id uuid references documents(id) on delete cascade not null,
  content text not null,
  embedding vector(768), -- Gemini text-embedding-004
  metadata jsonb default '{}',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_document_chunks_embedding on document_chunks using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- Buscador RAG
-- Busca documentos relevantes: globales + asignados al agente + linked via agent_documents
create or replace function match_documents(
  query_embedding vector(768),
  match_agent_id uuid,
  match_threshold float default 0.5,
  match_count int default 5
)
returns table (
  id uuid,
  content text,
  similarity float
)
language plpgsql
as $$
declare
  v_strict boolean;
  v_rag_enabled boolean;
begin
  -- Check agent settings
  select rag_enabled, rag_strict into v_rag_enabled, v_strict 
  from agents where id = match_agent_id;
  
  -- If RAG not enabled, return empty
  if v_rag_enabled is not true then
    return;
  end if;

  return query
  select
    document_chunks.id,
    document_chunks.content,
    1 - (document_chunks.embedding <=> query_embedding) as similarity
  from document_chunks
  join documents on documents.id = document_chunks.document_id
  where 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  and (
    -- Strict mode: only docs assigned to this agent or linked
    case when v_strict = true then
      documents.agent_id = match_agent_id
      OR exists (select 1 from agent_documents where agent_id = match_agent_id and document_id = documents.id)
    -- Normal mode: global docs + assigned + linked
    else
      documents.is_global = true
      OR documents.agent_id = match_agent_id
      OR exists (select 1 from agent_documents where agent_id = match_agent_id and document_id = documents.id)
    end
  )
  order by document_chunks.embedding <=> query_embedding
  limit match_count;
end;
$$;

-- ===========================================
-- NEW TABLES FOR CONFIGURATION
-- ===========================================

-- Company Settings
create table if not exists company_info (
    id uuid default gen_random_uuid() primary key,
    name text,
    industry text,
    description text,
    tone_of_voice text,
    website text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Agent Documents Link
create table if not exists agent_documents (
    agent_id uuid references agents(id) on delete cascade,
    document_id uuid references documents(id) on delete cascade,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    primary key (agent_id, document_id)
);

-- Agent Extensions
alter table agents add column if not exists rag_strict boolean default false;
alter table agents add column if not exists tools text[] default '{}';

-- Enable RLS
alter table company_info enable row level security;
create policy "Enable access for tenant" on company_info for all using (true) with check (true);

alter table agent_documents enable row level security;
create policy "Enable access for tenant" on agent_documents for all using (true) with check (true);


-- ===========================================
-- CHAT HISTORY
-- ===========================================
create table if not exists chat_sessions (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references agents(id) on delete cascade not null,
  user_email text, -- email del usuario next-auth o guest
  title text,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create table if not exists chat_messages (
  id uuid default gen_random_uuid() primary key,
  session_id uuid references chat_sessions(id) on delete cascade not null,
  role text not null, -- 'user', 'assistant'
  content text not null,
  tool_calls jsonb, -- info si se usó tool
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ===========================================
-- PROMETEO TASKS
-- ===========================================
create table if not exists prometeo_tasks (
  id uuid default gen_random_uuid() primary key,
  agent_id uuid references agents(id) on delete cascade not null,
  user_email text not null,
  name text not null,
  prompt text not null,
  schedule text not null, -- cron
  is_active boolean default true,
  last_run_at timestamp with time zone,
  next_run_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- ===========================================
-- BILLING & USAGE
-- ===========================================
create table if not exists usage_stats (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  year_month text not null, -- '2025-12'
  total_tokens int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(user_email, year_month)
);

create or replace function increment_usage(
  p_user_email text,
  p_tokens int
)
returns void
language plpgsql
as $$
begin
  insert into usage_stats (user_email, year_month, total_tokens, updated_at)
  values (p_user_email, to_char(now(), 'YYYY-MM'), p_tokens, now())
  on conflict (user_email, year_month)
  do update set 
    total_tokens = usage_stats.total_tokens + p_tokens,
    updated_at = now();
end;
$$;
