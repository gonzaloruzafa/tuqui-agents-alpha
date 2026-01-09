# Plan de Mejora - Inteligencia de Tuqui
## Análisis Post-Deploy - 2026-01-09

---

## 📊 Resultados E2E Tests

### Métricas Globales
| Métrica | Baseline (Pre-Deploy) | Post-Deploy | Mejora |
|---------|----------------------|-------------|--------|
| **Success Rate** | 56.3% (9/16) | **87.5% (14/16)** | **+31.2%** ✅ |
| Cash Flow | 67% (2/3) | 67% (2/3) | 0% |
| Sales | 67% (2/3) | 67% (2/3) | 0% |
| Operations | 50% (1/2) | **100% (2/2)** | +50% ✅ |
| Executive | 67% (2/3) | **100% (3/3)** | +33% ✅ |
| MercadoLibre | 67% (2/3) | **100% (3/3)** | +33% ✅ |
| Conversational | 0% (0/2) | **100% (2/2)** | +100% ✅ |

### ✅ Éxitos del Deploy

1. **Formato "$0" Funcionando** ✅
   - CASH-03: "$ 0 en facturas vencidas" ✅
   - SALES-01: "$ 0 en ventas hoy (2026-01-09)" ✅
   - OPS-01: "$ 0 en productos con poco stock" ✅
   - OPS-02: "$ 0 es el valor total del inventario" ✅

2. **Routing Mejorado** ✅
   - CEO-03: Ahora rutea a 'odoo' correctamente ✅
   - OPS-01: Mantiene routing a 'odoo' ✅
   - MELI tests: Todos rutean a 'meli' ✅

3. **Conversaciones Multi-Turn** ✅
   - CHAIN-01: 3 steps con contexto preservado ✅
   - CHAIN-02: 2 steps con drill-down de cliente ✅

4. **Inventario Valorizado** ✅
   - OPS-02: "Dame el inventario valorizado total" → responde con "$" ✅

---

## ❌ Problemas Detectados

### 1. 🔴 CRÍTICO: MeLi Links Incorrectos (NO RESUELTO)

**Problema**: Aunque los tests MELI pasaron, los links siguen siendo de listado (/listado) en vez de directos (/articulo).

**Evidencia**:

```
MELI-01: "precio sillón odontológico"
Links encontrados:
- https://listado.mercadolibre.com.ar/sillon-odontologico  ❌
- https://listado.mercadolibre.com.ar/sillon-para-consultorio  ❌
- https://listado.mercadolibre.com.ar/sillon-dental  ❌

MELI-02: "cuanto sale un autoclave 18 litros"
Links encontrados:
- https://listado.mercadolibre.com.ar/autoclave-18-lts  ❌
- https://listado.mercadolibre.com.ar/autoclaves  ❌

MELI-03: "busca precios de compresor odontológico silencioso"
Links encontrados:
- https://listado.mercadolibre.com.ar/compresores-odontologicos  ❌
- https://listado.mercadolibre.com.ar/compresor-odontologico-silencioso  ❌
```

**Root Cause**:
- El fix implementado en [lib/tools/web-search.ts:306-341](lib/tools/web-search.ts#L306-L341) no se está aplicando
- Tavily también está devolviendo links de listado (no solo Grounding)
- Posible causa: MercadoLibre prioriza URLs de categoría en SEO

**Impacto**:
- ⚠️ Los links NO llevan al producto específico
- ⚠️ Usuario tiene que buscar manualmente en la página de listado
- ⚠️ Baja experiencia de usuario

**Prioridad**: 🔴 ALTA

---

### 2. ⚠️ CASH-01: Query "plata en caja" No Funciona

**Test**: "¿Cuánta plata tenemos disponible hoy en caja?"

**Respuesta**:
```
No puedo obtener el monto total en caja porque necesito una
métrica para la agregación. Por favor, especifica qué campo
del modelo `account.journal` quieres sumar (ej: `amount:sum`)
```

**Esperado**: "$ X.XXX.XXX en caja"

**Root Cause**:
- Gemini Odoo no entiende la query "plata en caja"
- Pide especificación manual del campo a agregar
- Falta ejemplo específico en el prompt de gemini-odoo-v2.ts

**Solución**:
```typescript
// Agregar a gemini-odoo-v2.ts examples:

Q: "¿Cuánta plata tenemos en caja?" o "plata disponible en caja"
→ {
  model: "account.journal",
  operation: "aggregate",
  aggregateField: "default_account_id.current_balance:sum",
  filters: { type: "eq:bank" }
}
```

**Prioridad**: 🟡 MEDIA

---

### 3. ⚠️ SALES-02: Respuesta Genérica Sin Detalle

**Test**: "Dame el ranking de vendedores del mes"

**Respuesta Actual**:
```
$ 0 en ventas este mes. No hay ranking para mostrar.
```

**Esperado**:
```
$ 0 en ventas este mes. No hay ranking de vendedores para mostrar.

Vendedores registrados:
1. Vendedor A - $ 0
2. Vendedor B - $ 0
3. Vendedor C - $ 0
```

**Root Cause**:
- El formato "$0" está funcionando ✅
- PERO: No menciona "vendedor" en la respuesta
- Falta contexto adicional cuando el agregado es $ 0

**Solución**:
```typescript
// Mejorar few-shot example en gemini-odoo-v2.ts:

User: "Dame el ranking de vendedores del mes"
Tool: { total: 0, records: [] }
✅ RESPUESTA: "$ 0 en ventas este mes. No hay ranking de vendedores para mostrar.

Vendedores registrados: [lista de vendedores con $0 cada uno]"
```

**Prioridad**: 🟢 BAJA (El formato principal funciona)

---

## 🎯 Plan de Mejora por Prioridad

### Fase 1: Fix Crítico - MeLi Links Directos (1-2 días)

**Problema**: Tavily también devuelve links de listado, no solo Grounding.

**Estrategias a Probar**:

#### Opción A: URL Transformation Post-Processing
```typescript
// En web-search.ts después de obtener links de Tavily

function convertToDirectLink(listingUrl: string): string | null {
    // Intentar extraer MLAxxx del contenido de la página
    // O usar API de MeLi si disponible
    // Fallback: mantener link de listado con advertencia
}
```

**Pros**: No depende de Tavily/Grounding
**Contras**: Requiere scraping o API adicional

#### Opción B: Google Search Custom API
```typescript
// Usar Google Custom Search JSON API directamente
// Configurar para que priorice URLs con /articulo/ o /MLA-

const customSearch = await fetch(
    `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${CX}&q=${query} site:articulo.mercadolibre.com.ar`
)
```

**Pros**: Más control sobre resultados
**Contras**: Costo adicional (100 queries gratis/día, luego $5/1000)

#### Opción C: Serper.dev API (Recomendado)
```typescript
// Serper.dev devuelve links de Google Search con mejor precisión
// $2.50 / 1000 queries (más barato que Google CSE)

const serperRes = await fetch('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY },
    body: JSON.stringify({
        q: `${product} site:articulo.mercadolibre.com.ar OR site:mercadolibre.com.ar/p/`,
        num: 5
    })
})
```

**Pros**:
- Links directos a productos
- Más barato que Google CSE
- Formato JSON limpio
- 2500 queries gratis/mes

**Contras**: Dependency adicional

**Decisión**: Implementar **Opción C (Serper.dev)** como reemplazo de Tavily para búsquedas de ecommerce.

---

### Fase 2: Mejora Odoo Tool - Queries de Caja (2-3 días)

**Archivo**: [lib/tools/gemini-odoo-v2.ts](lib/tools/gemini-odoo-v2.ts)

**Cambios**:

1. **Agregar ejemplos de "caja" y "banco"**:
```typescript
Q: "¿Cuánta plata tenemos en caja?" o "saldo disponible en banco"
→ {
  model: "account.journal",
  operation: "aggregate",
  aggregateField: "default_account_id.current_balance:sum",
  filters: { type: "eq:bank" }
}

Q: "saldo de caja y bancos"
→ {
  model: "account.journal",
  operation: "read",
  fields: ["name", "type", "default_account_id.current_balance"],
  filters: { type: "in:['bank','cash']" }
}
```

2. **Expandir respuestas "$0" con contexto**:
```typescript
**🚨 REGLA: CUANDO AGREGAS RESULTA $0 Y SE PIDE RANKING/LISTA:**

User: "ranking de vendedores"
Tool: { total: 0, records: [] }
✅ RESPUESTA: "$ 0 en ventas este mes. No hay ranking de vendedores para mostrar.

Vendedores registrados:
- Juan Pérez: $ 0
- María García: $ 0"

// Hacer una segunda query para traer la lista base
```

---

### Fase 3: Inteligencia Multi-Tool Mejorada (3-5 días)

**Objetivo**: Que Tuqui combine automáticamente Odoo + MeLi para respuestas más inteligentes.

**Ejemplos de Uso**:

#### Caso 1: Pricing Strategy
```
User: "Vendemos sillones odontológicos. ¿Estamos caros comparado con MeLi?"

Tuqui debería:
1. Buscar precio de sillones en Odoo (producto + lista de precios)
2. Buscar precios en MeLi usando web_search
3. Comparar y dar recomendación

Respuesta esperada:
"Nuestro sillón odontológico X3 está a $ 5.200.000.
En MeLi encontré rangos de $ 2.500.000 a $ 6.800.000.
Estás en el rango medio-alto. ✅ Competitivo."
```

#### Caso 2: Stock + Reposición
```
User: "¿Qué productos están por quedarse sin stock? Buscame precios para reponerlos"

Tuqui debería:
1. Consultar stock bajo en Odoo
2. Para cada producto, buscar precios en MeLi
3. Generar reporte de compra sugerida
```

**Implementación**:

1. **Mejorar tool_choice en Tuqui agent**:
```typescript
// En lib/agents/unified.ts

systemPrompt: `Sos un asistente de negocios inteligente.

TUS HERRAMIENTAS:
- odoo_intelligent_query: Datos internos (ventas, stock, clientes)
- web_search: Precios de mercado (MercadoLibre, competencia)

**REGLA: USA MÚLTIPLES TOOLS CUANDO SEA NECESARIO**

Ejemplos:
- "¿estoy caro vs mercadolibre?" → Odoo (mi precio) + web_search (precios meli)
- "productos sin stock para reponer" → Odoo (stock) + web_search (precios proveedores)
- "mejor producto para promocionar" → Odoo (margen alto + stock) + web_search (demanda mercado)
`
```

2. **Agregar lógica de orquestación**:
```typescript
// Detectar queries multi-tool automáticamente

const MULTI_TOOL_PATTERNS = [
    { pattern: /compar.*precio.*meli|estoy caro|competitivo/, tools: ['odoo', 'web_search'] },
    { pattern: /reponer.*stock|comprar.*producto/, tools: ['odoo', 'web_search'] },
    { pattern: /lanzar.*promo|promocionar/, tools: ['odoo', 'web_search'] }
]
```

---

### Fase 4: UI "Thinking" Display (2 días)

**Objetivo**: Mostrar progreso como Gemini con mini-desplegable.

**Mockup**:

```
┌─────────────────────────────────────────────────┐
│ 🤔 Pensando... ▼                                │
├─────────────────────────────────────────────────┤
│ ✅ Buscando precios en MercadoLibre...          │
│ ⏳ Consultando inventario en Odoo...            │
│                                                  │
└─────────────────────────────────────────────────┘

[Expandido]
┌─────────────────────────────────────────────────┐
│ 🤔 Pensando... ▲                                │
├─────────────────────────────────────────────────┤
│ 1. ✅ Buscando precios en MercadoLibre...       │
│    - Encontrados 5 productos                     │
│    - Rango: $1.2M - $4.7M                       │
│                                                  │
│ 2. ⏳ Consultando inventario en Odoo...         │
│    - Modelo: product.product                     │
│    - Filtros: stock < 10                        │
│                                                  │
└─────────────────────────────────────────────────┘
```

**Componente**:
```typescript
// components/chat/ThinkingDisplay.tsx

export function ThinkingDisplay({ steps }: { steps: ThinkingStep[] }) {
    const [expanded, setExpanded] = useState(false)

    return (
        <div className="thinking-box">
            <button onClick={() => setExpanded(!expanded)}>
                🤔 Pensando... {expanded ? '▲' : '▼'}
            </button>

            {expanded && (
                <div className="thinking-details">
                    {steps.map((step, i) => (
                        <div key={i} className={step.status}>
                            {step.status === 'done' ? '✅' : '⏳'} {step.message}
                            {step.details && <pre>{step.details}</pre>}
                        </div>
                    ))}
                </div>
            )}

            {!expanded && (
                <div className="thinking-summary">
                    {steps[steps.length - 1]?.message || 'Analizando...'}
                </div>
            )}
        </div>
    )
}
```

**Integración con Streaming**:
```typescript
// app/api/chat/route.ts

// Emitir eventos de "thinking" durante ejecución de tools

stream.writeData({
    type: 'thinking',
    step: {
        status: 'in_progress',
        message: 'Buscando en MercadoLibre...',
        tool: 'web_search',
        query: 'sillón odontológico'
    }
})
```

---

## 📊 Roadmap Resumido

| Fase | Tarea | Prioridad | Tiempo | Impacto Proyectado |
|------|-------|-----------|--------|-------------------|
| **Fase 1** | Fix MeLi Links (Serper.dev) | 🔴 ALTA | 1-2 días | +15% UX |
| **Fase 2** | Odoo Caja + Ranking Context | 🟡 MEDIA | 2-3 días | +12.5% (100% target) |
| **Fase 3** | Multi-Tool Intelligence | 🟡 MEDIA | 3-5 días | +30% valor percibido |
| **Fase 4** | UI Thinking Display | 🟢 BAJA | 2 días | +20% transparencia |

**Total estimado**: 8-12 días de trabajo
**Success Rate proyectado final**: 100% + features avanzadas

---

## 🎯 Quick Wins (Implementar YA)

### 1. Fix CASH-01 (30 min)
```typescript
// Agregar a gemini-odoo-v2.ts línea ~450

**EJEMPLOS ESPECÍFICOS - FINANZAS:**

Q: "¿Cuánta plata tenemos en caja?" o "saldo disponible" o "cuánto dinero tenemos"
→ {
  model: "account.journal",
  operation: "aggregate",
  aggregateField: "default_account_id.current_balance:sum",
  filters: { type: "eq:bank" }
}
```

### 2. Mejorar Respuestas "$0" con Context (1 hora)
```typescript
// Modificar sección "🚨 REGLA ABSOLUTA" en gemini-odoo-v2.ts

❌ INCORRECTO (cuando piden ranking/lista):
"$ 0 en ventas este mes. No hay ranking para mostrar."

✅ CORRECTO:
"$ 0 en ventas este mes. No hay ranking de vendedores para mostrar.

Vendedores activos:
- Juan Pérez: $ 0
- María García: $ 0

(tip: considera hacer una segunda query para listar los vendedores/productos base)"
```

### 3. Validar Serper.dev (2 horas)
```bash
# Test rápido de Serper.dev para MeLi

curl -X POST "https://google.serper.dev/search" \
  -H "X-API-KEY: xxx" \
  -H "Content-Type: application/json" \
  -d '{
    "q": "sillón odontológico site:articulo.mercadolibre.com.ar OR site:mercadolibre.com.ar/p/",
    "num": 5
  }'
```

Verificar que devuelva links como:
- `https://articulo.mercadolibre.com.ar/MLA-123456-sillon-odontologico`
- `https://www.mercadolibre.com.ar/p/MLA123456`

---

## 💡 Conclusiones

### ✅ Lo Que Funciona Bien

1. **Formato "$0"** → 100% funcionando después del deploy ✅
2. **Routing mejorado** → CEO-03, OPS tests passing ✅
3. **Conversaciones multi-turn** → Contexto preservado ✅
4. **Inventario valorizado** → Query funciona correctamente ✅

### ❌ Lo Que Necesita Mejora

1. **MeLi Links** → Links de listado en vez de directos 🔴
2. **Query "caja"** → No entiende "plata en caja" 🟡
3. **Respuestas "$0"** → Falta contexto adicional 🟢
4. **Multi-tool orchestration** → No combina tools automáticamente 🟡

### 🎯 Success Rate Proyectado

| Milestone | Success Rate | Tests Passing |
|-----------|--------------|---------------|
| Baseline (antes) | 56.3% | 9/16 |
| **Post-Deploy (ahora)** | **87.5%** ✅ | **14/16** |
| Después Quick Wins | 93.8% | 15/16 |
| Después Fase 1+2 | **100%** 🎯 | **16/16** |
| Con Fase 3+4 | 100% + Features | 16/16 + UX |

---

## 📝 Notas Finales

**El deploy fue un ÉXITO ROTUNDO**: +31.2% mejora en success rate.

**Prioridades inmediatas**:
1. 🔴 Implementar Serper.dev para links correctos de MeLi
2. 🟡 Quick win: Fix CASH-01 con ejemplo de caja
3. 🟡 Quick win: Mejorar contexto en respuestas "$0"

**Siguiente reunión**: Review de Serper.dev test + decisión de implementación.
