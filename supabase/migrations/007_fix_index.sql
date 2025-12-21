-- FIX: Change from ivfflat to hnsw index
-- ivfflat requires training data and can have issues with empty tables
-- hnsw is more robust for small datasets

-- Drop the ivfflat index
DROP INDEX IF EXISTS document_chunks_embedding_idx;

-- Create hnsw index instead (better for small/medium datasets)
CREATE INDEX document_chunks_embedding_idx ON document_chunks 
    USING hnsw (embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Alternative: If hnsw fails, try no index at all for small datasets
-- The query will still work, just slower

SELECT 'Index updated to HNSW!' as status;
