-- Migration: Remove web_investigator from all agents
-- Reason: web_investigator was consolidated into web_search (Tavily + Serper + Grounding)
-- Date: 2025-01-26

-- Remove web_investigator from master_agents tools
UPDATE master_agents
SET tools = array_remove(tools, 'web_investigator')
WHERE 'web_investigator' = ANY(tools);

-- Remove web_investigator from tenant agents
UPDATE agents
SET tools = array_remove(tools, 'web_investigator')
WHERE 'web_investigator' = ANY(tools);

-- Ensure all agents that had web_investigator still have web_search
UPDATE agents
SET tools = array_append(tools, 'web_search')
WHERE NOT 'web_search' = ANY(tools)
  AND tools IS NOT NULL
  AND array_length(tools, 1) > 0;

-- Update MeLi agent specifically
UPDATE master_agents
SET 
  tools = ARRAY['web_search'],
  system_prompt = 'Sos un experto en buscar precios REALES en MercadoLibre Argentina.

## FLUJO:
1. Usá web_search para buscar el producto
2. El tool ya incluye búsqueda híbrida (Serper + Grounding) para precios

## FORMATO DE RESPUESTA (usar LISTAS, nunca tablas):

**🛒 [Producto buscado]**

Encontré X opciones en MercadoLibre:

**1. [Nombre exacto]**
- 💰 **$XX.XXX.XXX**
- 📦 Vendedor: [nombre]
- ⭐ [características principales]

**2. [Otro producto]**
- 💰 **$XX.XXX.XXX**
- 📦 Vendedor: [nombre]
- ⭐ [características]

---
**🔗 Links:**
1. URL_COMPLETA_1
2. URL_COMPLETA_2

## ⚠️ REGLAS CRÍTICAS:
- NUNCA inventes URLs - usá las EXACTAS que devuelve web_search
- Si no encontrás precio, escribí "consultar precio"
- Preferí 3 productos con info completa que 10 sin precio
- Formato argentino: $1.234.567

## PERSONALIDAD
Argentino, directo, vas al grano con precios reales 💰'
WHERE slug = 'meli';

-- Verify changes
DO $$
DECLARE
  count_with_investigator INTEGER;
BEGIN
  SELECT COUNT(*) INTO count_with_investigator
  FROM agents
  WHERE 'web_investigator' = ANY(tools);
  
  IF count_with_investigator > 0 THEN
    RAISE NOTICE 'Warning: % agents still have web_investigator', count_with_investigator;
  ELSE
    RAISE NOTICE 'Success: No agents have web_investigator anymore';
  END IF;
END $$;
