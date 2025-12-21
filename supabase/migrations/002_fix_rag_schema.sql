-- ============================================
-- FIX RAG SCHEMA - Run in Supabase SQL Editor
-- For tenant database
-- ============================================

-- 1. Add is_global column to documents
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_global BOOLEAN DEFAULT false;

-- 2. Make agent_id nullable in documents (for global docs)
ALTER TABLE documents ALTER COLUMN agent_id DROP NOT NULL;

-- 3. Add rag_strict to agents
ALTER TABLE agents ADD COLUMN IF NOT EXISTS rag_strict BOOLEAN DEFAULT false;

-- 4. Fix document_chunks - remove agent_id column if it exists
-- The chunks relate to documents, not directly to agents
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'document_chunks' AND column_name = 'agent_id'
    ) THEN
        ALTER TABLE document_chunks DROP COLUMN agent_id;
        RAISE NOTICE 'Dropped agent_id column from document_chunks';
    ELSE
        RAISE NOTICE 'agent_id column does not exist in document_chunks - OK';
    END IF;
END $$;

-- 5. Create agent_documents junction table if not exists
CREATE TABLE IF NOT EXISTS agent_documents (
    agent_id uuid REFERENCES agents(id) ON DELETE CASCADE,
    document_id uuid REFERENCES documents(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (agent_id, document_id)
);

-- 6. Update match_documents function
DROP FUNCTION IF EXISTS match_documents(vector(768), uuid, float, int);

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
  
  -- If RAG not enabled, return empty
  IF v_rag_enabled IS NOT TRUE THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    dc.id,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM document_chunks dc
  JOIN documents d ON d.id = dc.document_id
  WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
  AND (
    CASE WHEN v_strict = true THEN
      -- Strict mode: only docs assigned to this agent
      d.agent_id = match_agent_id
      OR EXISTS (SELECT 1 FROM agent_documents ad WHERE ad.agent_id = match_agent_id AND ad.document_id = d.id)
    ELSE
      -- Normal mode: global docs + unassigned + assigned to agent
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

-- 7. Enable RLS
ALTER TABLE agent_documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable access for tenant" ON agent_documents;
CREATE POLICY "Enable access for tenant" ON agent_documents FOR ALL USING (true) WITH CHECK (true);

-- Done!
SELECT 'Migration complete!' as status;
ALTER TABLE agent_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Enable access for tenant" ON agent_documents FOR ALL USING (true) WITH CHECK (true);
