-- DEBUG: Check what the RPC is actually returning
-- Run this in Supabase SQL Editor

-- First, let's check the raw distance
DO $$
DECLARE
    v_doc_id uuid;
    v_chunk_id uuid;
    v_agent_id uuid := 'ec9dfcd6-25c3-49c8-aa70-2b9f57ad97b5'; -- Replace with actual agent ID
BEGIN
    RAISE NOTICE 'Testing...';
END $$;

-- Create test function to see raw values
CREATE OR REPLACE FUNCTION debug_match(
    query_embedding vector(768),
    match_agent_id uuid
)
RETURNS TABLE (
    chunk_id uuid,
    doc_id uuid,
    doc_agent_id uuid,
    is_global boolean,
    raw_distance double precision,
    similarity double precision,
    content text
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT
        dc.id as chunk_id,
        d.id as doc_id,
        d.agent_id as doc_agent_id,
        COALESCE(d.is_global, false) as is_global,
        (dc.embedding <=> query_embedding)::double precision as raw_distance,
        (1 - (dc.embedding <=> query_embedding))::double precision as similarity,
        LEFT(dc.content, 50) as content
    FROM document_chunks dc
    JOIN documents d ON d.id = dc.document_id
    WHERE d.agent_id = match_agent_id 
       OR d.agent_id IS NULL 
       OR COALESCE(d.is_global, false) = true
    ORDER BY dc.embedding <=> query_embedding
    LIMIT 10;
END;
$$;

SELECT 'debug_match function created' as status;
