# Skills System - Status y Documentación

## ✅ **MIGRACIÓN COMPLETADA - GOD TOOL ELIMINADO** ✅

La migración de God Tools a Skills está **100% completa**:
- ✅ 12 Skills implementados y testeados
- ✅ God Tool eliminado (`gemini-odoo.ts`, `gemini-odoo-v2.ts`)
- ✅ Todos los flujos (Web, WhatsApp, Internal Test) usan Skills
- ✅ Build exitoso sin errores
- ✅ Código más limpio y mantenible

## ✅ Fase 1 y 2: COMPLETADAS

### 🎯 Implementación Base

#### 1. Sistema de Tipos (`lib/skills/types.ts`)
- ✅ `Skill<TInput, TOutput>` interface con Zod schemas
- ✅ `SkillContext` para multi-tenant isolation
- ✅ `SkillResult<T>` tipo union para éxito/error
- ✅ Esquemas comunes: `PeriodSchema`, `DocumentStateSchema`, `PaginationSchema`

#### 2. Error Handling (`lib/skills/errors.ts`)
- ✅ Clases de error específicas: `SkillExecutionError`, `AuthenticationError`, `ValidationError`, `ApiError`
- ✅ Helper `errorToResult()` para conversión consistente
- ✅ Retry logic con exponential backoff

#### 3. Odoo Client (`lib/skills/odoo/_client.ts`)
- ✅ `SkillOdooClient` wrapper sobre JSON-RPC
- ✅ Type-safe methods: `searchRead()`, `readGroup()`, `searchCount()`
- ✅ Helpers: `dateRange()`, `stateFilter()`, `combineDomains()`

#### 4. Registry (`lib/skills/registry.ts`)
- ✅ `SkillRegistry` class para gestión de skills
- ✅ `loadSkillsForTenant()` - filtra por tools habilitados
- ✅ `skillsToAITools()` - conversión a formato Vercel AI SDK
- ✅ Global registry `globalRegistry`

#### 5. Loader (`lib/skills/loader.ts`)
- ✅ `loadOdooCredentials()` - carga y desencripta desde integrations table
- ✅ `createSkillContext()` - construye contexto con tenant credentials
- ✅ `loadSkillsForAgent()` - entry point principal
- ✅ `shouldUseSkills()` - feature flag (actualmente true para todos)

### 🛠️ Skills Implementados (12/20+) - 60% Cobertura

#### Odoo Skills
1. ✅ **`get_sales_by_customer`** - Ventas agrupadas por cliente
   - Input: período, límite, estado, monto mínimo
   - Output: clientes con totales, órdenes, promedios

2. ✅ **`get_sales_total`** - Total de ventas
   - Input: período, estado, groupBy
   - Output: total general y subtotales por grupo

3. ✅ **`get_debt_by_customer`** - Deuda por cliente
   - Input: período, límite, solo vencido
   - Output: clientes con deuda, días vencidos

4. ✅ **`get_product_stock`** - Stock de productos
   - Input: productId, búsqueda, límite
   - Output: productos con stock disponible y virtual

5. ✅ **`get_payments_received`** - Pagos recibidos
   - Input: período, límite, groupBy
   - Output: pagos con totales por grupo

6. ✅ **`get_sales_by_product`** - Ventas por producto
   - Input: período, límite, estado, categoría
   - Output: productos con cantidad vendida, totales, órdenes

7. ✅ **`get_invoices_by_customer`** - Facturas por cliente
   - Input: período, límite, estado, tipo
   - Output: clientes con total facturado, cantidad

8. ✅ **`get_overdue_invoices`** - Facturas vencidas
   - Input: límite, días mínimos vencido, agrupar por cliente
   - Output: facturas vencidas con días de atraso

9. ✅ **`get_low_stock_products`** - Productos con stock bajo
   - Input: umbral, límite, solo stockables
   - Output: productos bajo umbral de stock

10. ✅ **`get_purchase_orders`** - Órdenes de compra
    - Input: período, estado, groupBy
    - Output: total de compras, agrupadas por proveedor

11. ✅ **`search_customers`** - Buscar clientes
    - Input: query, límite, solo activos
    - Output: clientes que coinciden con búsqueda

12. ✅ **`search_products`** - Buscar productos
    - Input: query, límite, incluir stock
    - Output: productos que coinciden con búsqueda

### 🧪 Testing

#### Unit Tests: ✅ 27/27 pasando
- ✅ Input validation (Zod schemas)
- ✅ Authentication (credenciales faltantes)
- ✅ Multi-tenant isolation (contextos separados)
- ✅ Query execution (dominio correcto)
- ✅ Result transformation (mapeo de datos)
- ✅ Error handling (fallos de API)
- ✅ Skill metadata (nombre, descripción, tags)

#### Integration Tests: ✅ 3/3 pasando
- ✅ Detection de Odoo tools
- ✅ Feature flag (shouldUseSkills)
- ✅ Loading sin credenciales (empty object)

### 🔌 Integración con Chat Route

#### Archivos Modificados
1. **`lib/tools/executor.ts`**
   ```typescript
   export async function getToolsForAgent(
     tenantId: string,
     agentTools: string[],
     userId?: string  // NUEVO
   ) {
     // ... web_search existente ...

     if (hasOdooTools(agentTools) && userId) {
       const useSkills = await shouldUseSkills(tenantId)
       if (useSkills) {
         const skillTools = await loadSkillsForAgent(tenantId, userId, agentTools)
         Object.assign(tools, skillTools)
       }
     }
     return tools
   }
   ```

2. **`app/api/chat/route.ts`** (línea 218)
   ```typescript
   tools = await getToolsForAgent(tenantId, effectiveTools, session.user.email!)
   ```

3. **`lib/skills/index.ts`**
   - Exporta loader functions para uso en chat route

### 📊 Build Status
- ✅ TypeScript compilation: SUCCESS
- ✅ Next.js build: SUCCESS (28 routes)
- ✅ No type errors
- ✅ No runtime errors

---

## 🚀 Cómo Usar

### Para Desarrolladores

#### 1. Agregar un Nuevo Skill

```typescript
// lib/skills/odoo/my-new-skill.ts
import { z } from 'zod';
import type { Skill, SkillContext, SkillResult } from '../types';
import { success, authError } from '../types';
import { createOdooClient } from './_client';

export const MyNewSkillInputSchema = z.object({
  // Define inputs con Zod
  customerId: z.number().int().positive(),
});

export const myNewSkill: Skill<
  typeof MyNewSkillInputSchema,
  MyOutput
> = {
  name: 'my_new_skill',
  description: 'Descripción clara para el LLM sobre cuándo usar este skill',
  tool: 'odoo',
  tags: ['sales', 'customers'],
  inputSchema: MyNewSkillInputSchema,

  async execute(input, context) {
    if (!context.credentials.odoo) {
      return authError('Odoo');
    }

    const odoo = createOdooClient(context.credentials.odoo);
    // ... lógica del skill ...

    return success(data);
  }
};
```

#### 2. Registrar el Skill

```typescript
// lib/skills/odoo/index.ts
import { myNewSkill } from './my-new-skill';

export const odooSkills = [
  getSalesByCustomer,
  getSalesTotal,
  // ...
  myNewSkill,  // AGREGAR AQUÍ
];
```

#### 3. Escribir Tests

```typescript
// lib/skills/odoo/__tests__/my-new-skill.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { myNewSkill } from '../my-new-skill';
import type { SkillContext } from '../../types';
import * as clientModule from '../_client';

vi.mock('../_client', () => ({
  createOdooClient: vi.fn(),
}));

describe('Skill: my_new_skill', () => {
  const mockContext: SkillContext = {
    userId: 'user-123',
    tenantId: 'tenant-456',
    credentials: {
      odoo: {
        url: 'https://test.odoo.com',
        db: 'test_db',
        username: 'admin',
        apiKey: 'test-api-key',
      },
    },
  };

  const mockOdooClient = {
    searchRead: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(clientModule.createOdooClient).mockReturnValue(mockOdooClient as any);
  });

  it('should execute successfully', async () => {
    mockOdooClient.searchRead.mockResolvedValue([]);

    const result = await myNewSkill.execute(
      { customerId: 123 },
      mockContext
    );

    expect(result.success).toBe(true);
  });
});
```

### Para Usuarios (Testing Manual)

Los Skills se cargan automáticamente cuando:
1. El agente tiene tools que comienzan con `odoo` (ej: `['odoo', 'web_search']`)
2. El tenant tiene una integración Odoo activa en la tabla `integrations`
3. El usuario tiene sesión válida

#### Queries que Ahora Usan Skills

**Antes** (God Tool con LLM query generation):
```
User: "¿Cuánto vendimos a Distribuidora del Sur este mes?"
→ LLM genera query Odoo → ejecuta → responde
```

**Ahora** (Skills):
```
User: "¿Cuánto vendimos a Distribuidora del Sur este mes?"
→ LLM selecciona skill: get_sales_by_customer
→ Skill ejecuta query determinista
→ LLM recibe data estructurada
→ LLM responde en lenguaje natural
```

**Ventajas**:
- ✅ Queries deterministas (siempre la misma query para la misma pregunta)
- ✅ Testeable (unit tests sin LLM)
- ✅ Type-safe (TypeScript end-to-end)
- ✅ Más rápido (no query generation)
- ✅ Más confiable (sin errores de sintaxis en queries)

---

## 📋 Próximos Pasos

### Pendientes de Fase 1 (Skills adicionales)
- [ ] `get_invoices_by_customer` - Facturas por cliente
- [ ] `get_invoice_status` - Estado de facturación
- [ ] `get_purchase_orders` - Órdenes de compra
- [ ] `get_vendor_spending` - Gasto por proveedor
- [ ] `search_customers` - Buscar clientes
- [ ] `search_products` - Buscar productos
- [ ] `get_customer_credit_limit` - Límite de crédito
- [ ] `get_product_sales_history` - Historial de ventas de producto

### ✅ Fase 2: Transición - COMPLETADA
1. ✅ Skills integrados en flujos de producción (Web, WhatsApp)
2. ✅ Todos los agentes usan el mismo flujo con Skills
3. ✅ 60% cobertura de queries comunes

### ✅ Fase 3: Deprecación - COMPLETADA
1. ✅ God Tool eliminado completamente
   - ❌ `lib/tools/gemini-odoo.ts` - ELIMINADO
   - ❌ `lib/tools/gemini-odoo-v2.ts` - ELIMINADO (1,050 líneas)
2. ✅ Chat route actualizado para usar solo Skills
3. ✅ Chat engine (WhatsApp) actualizado para usar solo Skills
4. ✅ Internal test route actualizado para usar solo Skills
5. ✅ Build exitoso sin errores

### Archivos Eliminados
```
lib/tools/gemini-odoo.ts          (23 líneas)
lib/tools/gemini-odoo-v2.ts       (1,050 líneas)
Total: 1,073 líneas eliminadas
```

### Archivos Modificados
```
app/api/chat/route.ts              - Eliminada ruta especial Odoo
app/api/internal/chat-test/route.ts - Unificado con Skills
lib/chat/engine.ts                  - Eliminada ruta especial Odoo
```

---

## 🔍 Debugging

### Ver qué Skills se Cargan

En los logs del servidor (development):
```
[Chat] Loading tools: ['odoo', 'web_search']
[Skills/Loader] Loading skills for tenant: { tenantId: 'xxx', agentTools: ['odoo'], enabledTools: ['odoo'], hasOdoo: true }
[Skills/Loader] Loaded skills: ['get_sales_by_customer', 'get_sales_total', ...]
[Chat] Tools loaded: ['get_sales_by_customer', 'get_sales_total', ..., 'web_search']
```

### Ver qué Skill Ejecuta el LLM

Cuando el LLM usa un skill, en los logs verás:
```
[Chat] Tool call: get_sales_by_customer({ period: { start: '2026-01-01', end: '2026-01-31' } })
```

### Ejecutar Tests Específicos

```bash
# Solo unit tests de skills
npm test -- lib/skills/odoo/__tests__/get-sales-by-customer.test.ts

# Solo integration tests
npm test -- tests/skills-integration.test.ts

# Todos los tests de skills
npm test -- lib/skills
```

---

## 📚 Referencias

- **Arquitectura**: Ver `PLAN_SKILLS_REFACTOR.md` para diseño completo
- **Type System**: Ver `lib/skills/types.ts` para tipos base
- **Ejemplos**: Ver `lib/skills/odoo/get-sales-by-customer.ts` como referencia
- **Tests**: Ver `lib/skills/odoo/__tests__/get-sales-by-customer.test.ts` como template
