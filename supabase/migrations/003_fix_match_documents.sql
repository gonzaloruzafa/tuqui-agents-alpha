-- FIXED match_documents function
-- This version does NOT reference document_chunks.agent_id
-- Run in Supabase SQL Editor

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
      -- Strict mode: only docs assigned to this agent or linked
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

-- Verify it works
SELECT 'match_documents function updated!' as status;
