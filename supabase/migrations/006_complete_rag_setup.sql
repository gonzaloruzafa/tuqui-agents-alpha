-- COMPLETE RAG SETUP
-- Run this in your TENANT database (not master!)
-- This ensures all required tables, columns and functions exist

-- First, enable pgvector if not already
CREATE EXTENSION IF NOT EXISTS vector;

-- 1. Ensure agents table has required columns
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rag_enabled BOOLEAN DEFAULT false;
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rag_strict BOOLEAN DEFAULT false;

-- 2. Ensure documents table exists with all columns
CREATE TABLE IF NOT EXISTS documents (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    name text NOT NULL,
    content text,
    type text,
    metadata jsonb DEFAULT '{}',
    agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
    is_global boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now()),
    updated_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- Add columns if they don't exist (in case table was created without them)
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_global boolean DEFAULT false;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS agent_id uuid REFERENCES agents(id) ON DELETE SET NULL;

-- 3. Ensure document_chunks table exists
CREATE TABLE IF NOT EXISTS document_chunks (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    document_id uuid REFERENCES documents(id) ON DELETE CASCADE NOT NULL,
    content text NOT NULL,
    embedding vector(768),
    chunk_index integer,
    metadata jsonb DEFAULT '{}',
    created_at timestamp with time zone DEFAULT timezone('utc'::text, now())
);

-- 4. Create agent_documents linking table
CREATE TABLE IF NOT EXISTS agent_documents (
    agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
    document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (agent_id, document_id)
);

-- 5. Create index for vector similarity search
DROP INDEX IF EXISTS document_chunks_embedding_idx;
CREATE INDEX document_chunks_embedding_idx ON document_chunks 
    USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 6. RLS Policies
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable access for all" ON documents;
CREATE POLICY "Enable access for all" ON documents FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable access for all" ON document_chunks;
CREATE POLICY "Enable access for all" ON document_chunks FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE agent_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable access for tenant" ON agent_documents;
CREATE POLICY "Enable access for tenant" ON agent_documents FOR ALL USING (true) WITH CHECK (true);

-- 7. DROP and CREATE the match_documents function
-- We need to drop ALL possible signatures
DROP FUNCTION IF EXISTS match_documents(vector(768), uuid, float, int);
DROP FUNCTION IF EXISTS match_documents(vector, uuid, float, int);

CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(768),
  match_agent_id uuid,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  similarity float
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_strict boolean;
  v_rag_enabled boolean;
BEGIN
  -- Check agent settings
  SELECT rag_enabled, COALESCE(rag_strict, false) INTO v_rag_enabled, v_strict 
  FROM agents WHERE agents.id = match_agent_id;
  
  -- If RAG not enabled for this agent, return empty
  IF v_rag_enabled IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding)::float AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
  AND (
    CASE WHEN v_strict = true THEN
      -- Strict mode: only docs assigned to this agent or linked via agent_documents
      d.agent_id = match_agent_id
      OR EXISTS (SELECT 1 FROM agent_documents ad WHERE ad.agent_id = match_agent_id AND ad.document_id = d.id)
    ELSE
      -- Normal mode: global docs + unassigned (NULL) + assigned to agent + linked
      COALESCE(d.is_global, false) = true
      OR d.agent_id IS NULL
      OR d.agent_id = match_agent_id
      OR EXISTS (SELECT 1 FROM agent_documents ad WHERE ad.agent_id = match_agent_id AND ad.document_id = d.id)
    END
  )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- 8. Verify everything works
DO $$
DECLARE
  v_has_agents boolean;
  v_has_vector boolean;
  v_func_exists boolean;
BEGIN
  -- Check agents table has columns
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'agents' AND column_name = 'rag_enabled'
  ) INTO v_has_agents;
  
  -- Check vector extension
  SELECT EXISTS (
    SELECT 1 FROM pg_extension WHERE extname = 'vector'
  ) INTO v_has_vector;
  
  -- Check function exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'match_documents'
  ) INTO v_func_exists;
  
  RAISE NOTICE 'Setup complete! agents.rag_enabled: %, vector: %, match_documents: %', 
    v_has_agents, v_has_vector, v_func_exists;
END $$;

-- Show result
SELECT 'RAG setup complete!' as status,
  (SELECT count(*) FROM pg_proc WHERE proname = 'match_documents') as function_count;
