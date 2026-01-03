-- Migration 106: Standardize tool names
-- Run this to update DB tool names from tavily/firecrawl to web_search/web_investigator

-- Update master_agents
UPDATE master_agents
SET tools = ARRAY['web_search', 'web_investigator']
WHERE 'tavily' = ANY(tools) OR 'firecrawl' = ANY(tools);

-- Update agents (tenant-specific)
UPDATE agents
SET tools = ARRAY['web_search', 'web_investigator']
WHERE 'tavily' = ANY(tools) OR 'firecrawl' = ANY(tools);

-- Verify
SELECT 'master_agents' as table_name, id, name, tools 
FROM master_agents 
WHERE 'web_search' = ANY(tools) OR 'web_investigator' = ANY(tools);

SELECT 'agents' as table_name, id, name, tools 
FROM agents 
WHERE 'web_search' = ANY(tools) OR 'web_investigator' = ANY(tools);
