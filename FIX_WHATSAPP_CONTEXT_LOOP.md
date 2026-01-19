# Fix WhatsApp Context Loop - 2026-01-18

## 🔴 PROBLEMA REPORTADO

**Escenario real de WhatsApp:**

```
[20:39] User: Que productos de 3m se vendieron en diciembre?
[20:40] Bot:  Para responderte necesito saber el modelo de datos...
[20:40] User: Al reporte
[20:40] Bot:  ¿Te referís al reporte de facturación? ¿Qué te gustaría saber?
[20:40] User: Que productos 3m vendimos
[20:40] Bot:  ¿En qué período te interesa saber? ⬅️ LOOP!
[20:40] User: Diciembre 2025
[20:41] Bot:  ¿Qué te gustaría saber sobre diciembre de 2025? ⬅️ LOOP!
[20:41] User: Que productos de la categoría 3M vendimos
[20:41] Bot:  ¿En qué período te interesa saber? ⬅️ LOOP INFINITO!
```

**Comportamiento esperado:**
Después de especificar "diciembre" en el primer mensaje, el bot debería **mantener ese contexto** en las aclaraciones siguientes.

---

## 🔬 ANÁLISIS ROOT CAUSE

### **Cadena de Fallos Identificada:**

```
┌─────────────────────────────────────────────────────────────────┐
│ 1️⃣ ROUTER: Solo analiza últimos 2 mensajes (línea 339)        │
│    → "Al reporte" + "Diciembre 2025" NO tienen keywords ERP    │
│    → Score bajo → Cambia de agente 'odoo' a 'tuqui'            │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 2️⃣ ENGINE: Falta regla de contexto en WhatsApp (línea 138)    │
│    → Web tiene: "Usa historial para referencias"               │
│    → WhatsApp NO tiene esa regla                                │
└─────────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────────┐
│ 3️⃣ GEMINI PROMPT: Regla existe pero sin mecanismo (línea 261) │
│    → Prompt dice "mantén período temporal"                      │
│    → Pero no explica CÓMO extraerlo del historial               │
└─────────────────────────────────────────────────────────────────┘
```

**Archivos afectados:**
- [lib/agents/router.ts:337-350](lib/agents/router.ts#L337-L350) - Ventana de contexto demasiado corta
- [lib/chat/engine.ts:138-140](lib/chat/engine.ts#L138-L140) - Falta context persistence rule
- [lib/tools/gemini-odoo-v2.ts:261-272](lib/tools/gemini-odoo-v2.ts#L261-L272) - Regla sin mecanismo de extracción

---

## ✅ SOLUCIONES IMPLEMENTADAS

### **FIX 1: Router - Aumentar Ventana de Contexto**

**Archivo:** [lib/agents/router.ts:340-343](lib/agents/router.ts#L340-L343)

**Cambio:**
```typescript
// ANTES ❌
const historyContext = conversationHistory.slice(-2).join(' ')

// DESPUÉS ✅
// CONTEXT FIX: Aumentar ventana de contexto de 2 a 10 mensajes
// Esto previene que aclaraciones cortas ("Al reporte", "Diciembre 2025") pierdan contexto ERP
const historyContext = conversationHistory.slice(-10).join(' ')
```

**Impacto:**
- ✅ Router ahora ve últimos 10 mensajes (vs 2 anteriores)
- ✅ Keywords ERP de mensajes previos mantienen score alto
- ✅ Aclaraciones cortas no causan cambio de agente

**Tokens adicionales:** +600 tokens/conversación (~$0.000045 USD)

---

### **FIX 2: Engine - Regla de Contexto para WhatsApp**

**Archivo:** [lib/chat/engine.ts:138-141](lib/chat/engine.ts#L138-L141)

**Cambio:**
```typescript
// ANTES ❌
if (channel === 'whatsapp') {
    systemPrompt += '\n\nREGLA PARA WHATSAPP: Sé conciso...'
}

// DESPUÉS ✅
if (channel === 'whatsapp') {
    systemPrompt += '\n\nREGLA PARA WHATSAPP: Sé conciso...'
    systemPrompt += '\n\nIMPORTANTE: Estás en una conversación fluida. ' +
                    'Usa siempre los mensajes anteriores para entender ' +
                    'referencias como "él", "eso", "ahora", "Al reporte", ' +
                    '"Diciembre 2025" o "qué productos?". No pidas ' +
                    'aclaraciones si el contexto ya está en el historial.'
}
```

**Impacto:**
- ✅ WhatsApp ahora tiene misma regla que Web
- ✅ LLM instruido explícitamente a usar historial
- ✅ Ejemplos específicos del caso reportado ("Al reporte", "Diciembre 2025")

**Tokens adicionales:** +100 tokens/sesión (~$0.0000075 USD)

---

### **FIX 3: Gemini Odoo - Extractor de Contexto Temporal**

**Archivo:** [lib/tools/gemini-odoo-v2.ts:274-290](lib/tools/gemini-odoo-v2.ts#L274-L290)

**Cambio:**
```markdown
## ANTES ❌
Regla: "Mantener período temporal" (sin explicar cómo)

## DESPUÉS ✅
**🔍 CÓMO EXTRAER EL PERÍODO DEL HISTORIAL:**

Cuando el mensaje actual NO menciona un período específico, buscar en mensajes ANTERIORES:

1. Buscar fechas explícitas: "diciembre", "enero 2026", "2025", "hoy", "este mes"
2. Buscar períodos relativos: "mes pasado", "este año", "semana anterior"
3. Buscar en las ÚLTIMAS 5 RESPUESTAS DEL ASISTENTE para ver qué período se usó

EJEMPLO REAL (problema reportado):
- Turn 1: "Que productos de 3M se vendieron en diciembre?" → Período: diciembre
- Turn 2: "Al reporte" → Período: diciembre (extraer del turn 1)
- Turn 3: "Diciembre 2025" → Período: diciembre 2025 (confirmación/refinamiento)
- Turn 4: "Que productos vendimos" → Período: diciembre 2025 (extraer del turn 3)
```

**Impacto:**
- ✅ LLM ahora sabe CÓMO extraer período del historial
- ✅ Instrucciones paso a paso con ejemplos
- ✅ Incluye el caso exacto reportado

**Tokens adicionales:** +150 tokens cuando usa Odoo (~$0.00001125 USD)

---

## 🧪 TEST CASE NUEVO AGREGADO

**Archivo:** [scripts/e2e-tests/conversational-context-tests.json](scripts/e2e-tests/conversational-context-tests.json)

**Nuevo test:** `CONV_WHATSAPP_001`

```json
{
  "id": "CONV_WHATSAPP_001",
  "name": "WhatsApp: Aclaraciones cortas sin keywords (CRÍTICO - Bug Reportado)",
  "priority": "critical",
  "turns": [
    {
      "turn": 1,
      "message": "Que productos de 3M se vendieron en diciembre?",
      "expectedAgent": "odoo",
      "mustExecuteTool": "odoo_intelligent_query"
    },
    {
      "turn": 2,
      "message": "Al reporte",
      "expectedAgent": "odoo",
      "shouldNotSay": ["¿En qué período?"],
      "contextAware": true
    },
    {
      "turn": 3,
      "message": "Diciembre 2025",
      "expectedAgent": "odoo",
      "shouldNotSay": ["¿Qué te gustaría saber?"]
    },
    {
      "turn": 4,
      "message": "Que productos vendimos",
      "expectedAgent": "odoo",
      "shouldNotSay": ["¿En qué período?"],
      "mustUseContext": "periodo_refinado"
    }
  ]
}
```

**Validaciones:**
- ✅ Debe mantener agente 'odoo' en todos los turnos
- ✅ NO debe preguntar período repetidamente
- ✅ Debe usar contexto de turns anteriores

---

## 📊 IMPACTO EN TOKENS Y COSTOS

| Componente | Tokens Antes | Tokens Después | Δ Tokens | Costo/Conv |
|------------|--------------|----------------|----------|------------|
| Router context | ~150 (2 msgs) | ~750 (10 msgs) | +600 | $0.000045 |
| System prompt | 0 | ~100 | +100 | $0.0000075 |
| Gemini Odoo | ~1500 | ~1650 | +150 | $0.00001125 |
| **TOTAL** | ~1650 | ~2600 | **+950** | **$0.000071** |

**Proyección mensual:**
- 1000 conversaciones/mes × $0.000071 = **$0.071 USD/mes** (~7 centavos)
- **Evaluación:** ✅ Impacto mínimo en costos vs valor de NO perder contexto

---

## 🎯 ARCHIVOS MODIFICADOS

```
lib/agents/router.ts              ← Ventana 2→10 mensajes
lib/chat/engine.ts                ← Context rule para WhatsApp
lib/tools/gemini-odoo-v2.ts       ← Instrucciones de extracción temporal
scripts/e2e-tests/conversational-context-tests.json  ← Nuevo test CONV_WHATSAPP_001
```

---

## ✅ CHECKLIST PRE-DEPLOY

- [x] ✅ Fix 1: Router ventana de contexto aumentada (2→10)
- [x] ✅ Fix 2: Engine context rule agregada para WhatsApp
- [x] ✅ Fix 3: Gemini Odoo instrucciones de extracción temporal
- [x] ✅ Test case CONV_WHATSAPP_001 agregado
- [x] ✅ Análisis de tokens y costos completado
- [ ] ⏳ Tests E2E ejecutados y validados (SIGUIENTE)
- [ ] ⏳ Validación manual en WhatsApp con escenario real

---

## 🚀 PRÓXIMOS PASOS

### **Inmediato (HOY):**

1. **Ejecutar tests E2E:**
   ```bash
   cd /home/gonza/adhoc\ x/tuqui-agents-alpha
   npm run tsx scripts/e2e-tests/conversational-runner.ts
   ```

2. **Validar test CONV_WHATSAPP_001:**
   - Verificar que todos los 4 turnos pasan
   - Confirmar que NO pregunta "¿En qué período?" en turns 2-4
   - Validar routing consistency (debe ser 'odoo' en todos)

3. **Test manual en WhatsApp:**
   - Reproducir escenario exacto reportado
   - Verificar que el loop desapareció

### **Si tests pasan:**

```bash
git add lib/agents/router.ts lib/chat/engine.ts lib/tools/gemini-odoo-v2.ts scripts/e2e-tests/conversational-context-tests.json
git commit -m "fix: WhatsApp context loop - aumentar ventana router + context rules

- Router: 2→10 mensajes de contexto (previene pérdida en aclaraciones cortas)
- Engine: Context persistence rule para WhatsApp (igual que Web)
- Gemini Odoo: Instrucciones explícitas de extracción de período temporal
- Test: CONV_WHATSAPP_001 para validar escenario reportado

Fixes issue: Loop infinito 'En qué período?' en WhatsApp
Impact: +950 tokens/conv (~$0.000071 USD) - impacto mínimo

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>"

git push origin main
```

### **Si tests fallan:**
- Revisar logs de conversational-runner.ts
- Ajustar thresholds si es necesario
- Iterar en prompts si LLM no respeta reglas

---

## 📈 MÉTRICAS DE ÉXITO

**Antes del fix:**
- Context Preservation Rate: ~0% (loop infinito)
- Routing Consistency: Variable (cambiaba entre 'odoo' y 'tuqui')
- User Frustration: 🔴 Alta (6+ turnos para respuesta simple)

**Después del fix (esperado):**
- Context Preservation Rate: **>85%** (baseline E2E)
- Routing Consistency: **100%** (mantiene 'odoo')
- User Frustration: 🟢 Baja (2-3 turnos para respuesta)

---

## 🎓 LECCIONES APRENDIDAS

### **1. Router con ventana corta = cambios de agente espurios**
- 2 mensajes es insuficiente para conversaciones naturales
- Aclaraciones cortas ("Sí", "Dale", "Al reporte") tienen 0 keywords
- Solución: Aumentar a 10 mensajes (equilibrio contexto/tokens)

### **2. Reglas sin mecanismo = promesas vacías**
- Prompt decía "mantén período temporal" pero sin instrucciones
- LLM necesita pasos concretos: "buscar en últimos 5 mensajes"
- Solución: Agregar sección "CÓMO EXTRAER" con ejemplos

### **3. Parity Web/WhatsApp es crítica**
- Web tenía context rule, WhatsApp no
- Usuario espera mismo comportamiento en ambos canales
- Solución: Verificar que todos los canales tengan mismas reglas core

### **4. Tests E2E deben incluir escenarios de usuario real**
- Tests originales eran sintéticos (mensajes largos con keywords)
- Bug apareció con mensajes ultra-cortos naturales de WhatsApp
- Solución: Agregar CONV_WHATSAPP_001 basado en transcript real

---

**Documentación relacionada:**
- [PLAN_MEJORA_INTELIGENCIA_TUQUI.md](PLAN_MEJORA_INTELIGENCIA_TUQUI.md)
- [QUICK_WINS_IMPLEMENTADOS.md](QUICK_WINS_IMPLEMENTADOS.md)
- [scripts/e2e-tests/conversational-runner.ts](scripts/e2e-tests/conversational-runner.ts)

---

**Timestamp:** 2026-01-18
**Status:** ✅ Fixes implementados, ⏳ Esperando validación E2E
**Impacto:** 🟢 Crítico para UX de WhatsApp, mínimo en costos
