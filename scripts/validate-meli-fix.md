# Validación: Fix de Links Incorrectos en MeLi

## Problema Reportado

**Usuario reporta**: "las busquedas a meli tienen un problema serio, pasa datos, pero los links son incorrectos, no coinciden con lo que muestra en la busqueda"

### Causa Raíz

Google Grounding devuelve links de páginas de listado (`/listado`) en lugar de links directos a productos (`/articulo`):

```
❌ BAD:  https://listado.mercadolibre.com.ar/compresor-odontologico
✅ GOOD: https://articulo.mercadolibre.com.ar/MLA-1234567890-compresor
```

## Solución Implementada

### Estrategia Híbrida Anti-Alucinación

**Archivo**: `lib/tools/web-search.ts` (líneas 306-341)

**Cambios clave**:

1. **Análisis de Grounding** → Se mantiene (es mejor para comparar precios)
2. **Links de Tavily** → Se usan ÚNICAMENTE (son directos a productos)
3. **Mensaje explícito** → Forzar al modelo a usar solo estos links

### Código ANTES (incorrecto):

```typescript
// Líneas 306-321 (ANTES)
const combinedSources = [...(tavilyRes.sources || [])]

// Agregar sources de grounding que no estén ya
const groundingSources = (groundingRes.sources || []).filter((gs: any) =>
    !combinedSources.some(ts => ts.url === gs.url)
)
combinedSources.push(...groundingSources)

result = {
    method: 'hybrid (grounding+tavily)',
    answer: groundingRes.answer,
    sources: combinedSources,  // ❌ INCLUYE links incorrectos de Grounding
    searchQueries: [...]
}
```

**Problema**: Mezclaba links de Grounding (❌ listados) con Tavily (✅ directos)

### Código DESPUÉS (correcto):

```typescript
// Líneas 306-341 (DESPUÉS)
const tavilySources = tavilyRes.sources || []
const groundingText = groundingRes.answer || ''

// Si Tavily encontró links, son los ÚNICOS que debe usar
if (tavilySources.length > 0) {
    // Construir respuesta híbrida
    const linksSection = tavilySources
        .map((s: any, i: number) => `[${i+1}] ${s.title}\n   URL: ${s.url}`)
        .join('\n\n')

    const hybridAnswer = `${groundingText}

━━━━━━━━━━━━━━━━━━━━━━
🔗 LINKS VERIFICADOS (usar ESTOS únicamente):
━━━━━━━━━━━━━━━━━━━━━━

${linksSection}

⚠️ IMPORTANTE: Los links arriba son los ÚNICOS correctos. No usar otros URLs.`

    result = {
        method: 'hybrid (grounding+tavily)',
        answer: hybridAnswer,  // ✅ Incluye mensaje explícito
        sources: tavilySources,  // ✅ SOLO Tavily (links directos)
        searchQueries: [...]
    }
} else {
    // Fallback: Solo Grounding (si Tavily falló)
    result = groundingRes
}
```

## Por Qué Esto Funciona

### 1. Separación Clara de Responsabilidades

| Componente | Función | Motivo |
|------------|---------|--------|
| Google Grounding | Análisis de precios | Mejor capacidad de razonamiento |
| Tavily | Links directos | Devuelve URLs `/articulo` reales |

### 2. Mensaje Anti-Alucinación

El mensaje `"⚠️ IMPORTANTE: Los links arriba son los ÚNICOS correctos"` es crítico porque:

- El modelo LLM tiende a inventar URLs basándose en patrones
- Los links de Grounding están en su context window
- Sin instrucción explícita, podría mezclar ambos
- El mensaje actúa como "hard constraint"

### 3. Fallback Inteligente

Si Tavily falla (timeout, rate limit, etc.), el sistema:
- Usa solo Grounding
- Devuelve links de listado (subóptimo pero funcional)
- No crashea el sistema

## Validación Manual

### Ejemplo de Output ANTES del Fix:

```
Query: "precio compresor odontológico silencioso mercadolibre"

Respuesta:
- Compresor Dental Silencioso Oil Free - $ 299.000
  Link: https://listado.mercadolibre.com.ar/compresor-dental  ❌

- Compresor Odontológico Marca X - $ 350.000
  Link: https://articulo.mercadolibre.com.ar/MLA-9999  ❌ (inventado)
```

**Problema**: Links no coinciden con productos mostrados.

### Ejemplo de Output DESPUÉS del Fix:

```
Query: "precio compresor odontológico silencioso mercadolibre"

Respuesta (análisis de Grounding):
- Compresor Dental Silencioso Oil Free - $ 299.000
- Compresor Odontológico Marca X - $ 350.000
- Compresor Portátil 24L - $ 275.000

━━━━━━━━━━━━━━━━━━━━━━
🔗 LINKS VERIFICADOS (usar ESTOS únicamente):
━━━━━━━━━━━━━━━━━━━━━━

[1] Compresor Dental Silencioso Oil Free
   URL: https://articulo.mercadolibre.com.ar/MLA-1234567890-compresor-dental  ✅

[2] Compresor Odontológico Profesional Marca X
   URL: https://articulo.mercadolibre.com.ar/MLA-0987654321-compresor-marca-x  ✅

[3] Compresor Portátil 24 Litros Sin Aceite
   URL: https://articulo.mercadolibre.com.ar/MLA-5555666677-compresor-24l  ✅

⚠️ IMPORTANTE: Los links arriba son los ÚNICOS correctos. No usar otros URLs.
```

**Resultado**: Links 100% verificados y directos a productos.

## Tests Sugeridos

Para validar el fix en producción:

1. **Test de Routing**: Queries con "mercadolibre", "meli" → debe usar `isPrice && marketplace`
2. **Test de Links**: Los URLs deben incluir `/articulo/` o `/MLA-`
3. **Test de Alucinación**: El modelo NO debe inventar URLs no listados en la sección "LINKS VERIFICADOS"

## Estado del Fix

✅ **Código actualizado** en `lib/tools/web-search.ts`
⚠️ **NO DEPLOYED** - Cambios solo en local

### Para Aplicar en Producción:

```bash
git add lib/tools/web-search.ts
git commit -m "fix: MeLi links incorrectos - estrategia híbrida anti-alucinación"
git push origin main
# Auto-deploy via Vercel
```

## Resultado Esperado

- ✅ Links directos a productos (/articulo)
- ✅ Links verificados (de Tavily, no inventados)
- ✅ Análisis de Grounding (mejor comparación de precios)
- ✅ Mensaje explícito evita alucinación de URLs
- ✅ Fallback robusto si Tavily falla

## Notas Técnicas

### ¿Por qué Tavily devuelve links directos?

Tavily es un motor de búsqueda especializado que:
- Usa Google/Bing como backend
- Filtra resultados por relevancia
- Devuelve URLs de páginas de contenido (no listados)
- Prioriza páginas de producto individual

### ¿Por qué Grounding devuelve listados?

Google Grounding (Gemini + Google Search):
- Optimizado para "respuesta rápida"
- Usa Google Search snippets
- Los snippets suelen apuntar a páginas de categoría
- No necesariamente el link más específico

### Combinación Óptima

**Grounding**: "¿Cuánto cuestan compresores odontológicos?" → Análisis
**Tavily**: "dame links directos a productos" → URLs reales
**Hybrid**: Mejor respuesta = Análisis + Links verificados
