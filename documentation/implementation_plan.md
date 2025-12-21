# Tuqui Agents Alpha - Plan de Implementación

## Estado Actual (Diciembre 2025)

### ✅ COMPLETADO (100% Funcional)

#### Core Platform
- **Autenticación**: NextAuth con Google, roles (admin/user)
- **Multi-tenant**: Schema por tenant, row-level security
- **Base de datos**: Supabase PostgreSQL con pgvector
- **Chat Streaming**: Server-sent events, markdown rendering

#### Agentes
- **CRUD Agentes**: Crear, editar, eliminar agentes
- **Configuración**: Modelos, prompts, herramientas
- **RAG Pipeline**: Embeddings con nomic-embed-text, HNSW index
- **Documentos**: Upload PDF/TXT, procesamiento, búsqueda semántica

#### Integraciones
- **Odoo**: ✅ FUNCIONANDO con wrapper nativo Google SDK
  - Productos, clientes, pedidos, facturas
  - Bypass del bug de AI SDK v5 con Gemini
- **MercadoLibre**: Tools disponibles
- **Tavily**: Búsqueda web

#### Tests & Build
- **Build**: ✅ Compila correctamente
- **Deploy**: Vercel ready

---

### 🔄 PROMETEO - EN PROGRESO (90% Listo)

Sistema de tareas programadas con notificaciones push.

| Componente | Estado | Detalles |
|------------|--------|----------|
| `lib/prometeo/runner.ts` | ✅ Listo | Task runner implementado |
| `app/admin/prometeo/` | ✅ Listo | UI de administración |
| `app/api/prometeo/tasks/` | ✅ Listo | CRUD de tareas |
| `app/api/push/subscribe/` | ✅ Listo | Suscripciones push |
| `lib/hooks/use-push-notifications.ts` | ✅ Listo | Hook cliente |
| `public/sw.js` | ✅ Listo | Service worker |
| `prometeo_tasks` table | ✅ Existe | Vacía, lista para tareas |
| `push_subscriptions` table | ❌ Falta | **EJECUTAR SQL ABAJO** |
| PROMETEO_SECRET | ✅ Configurado | En .env.local |
| NEXT_PUBLIC_VAPID_PUBLIC_KEY | ✅ Configurado | En .env.local |

**SQL para crear tabla faltante:**
```sql
create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  subscription jsonb not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index if not exists idx_push_subscriptions_user_email 
  on push_subscriptions(user_email);
```

URL: https://ancgbbzvfhoqqxiueyoz.supabase.co/project/ancgbbzvfhoqqxiueyoz/sql/new

---

### 🔄 TWILIO/WHATSAPP - Código Listo (Pendiente Config)

| Componente | Estado | Detalles |
|------------|--------|----------|
| `lib/twilio/client.ts` | ✅ Listo | Cliente Twilio |
| `app/api/whatsapp/webhook/route.ts` | ✅ Listo | Webhook handler |
| TWILIO_ACCOUNT_SID | ⚠️ Vacío | Agregar credenciales |
| TWILIO_AUTH_TOKEN | ⚠️ Vacío | Agregar credenciales |
| Integration en DB | ❌ Falta | Configurar en tenant |

**Para activar Twilio:**
1. Obtener credenciales de Twilio Console
2. Agregar a .env.local:
   ```
   TWILIO_ACCOUNT_SID=ACxxxxxxx
   TWILIO_AUTH_TOKEN=xxxxxxx
   ```
3. Configurar webhook en Twilio: `https://tuqui.vercel.app/api/whatsapp/webhook`

---

## 📋 ROADMAP DE IMPLEMENTACIÓN

### Fase 1: Prometeo (Push Notifications)

#### 1.1 Crear migración push_subscriptions
```sql
-- supabase/migrations/YYYYMMDD_push_subscriptions.sql
create table if not exists push_subscriptions (
  id uuid default gen_random_uuid() primary key,
  user_email text not null,
  subscription jsonb not null,
  created_at timestamp with time zone default now()
);

create index idx_push_user on push_subscriptions(user_email);
```

#### 1.2 Variables de entorno
```bash
# .env.local
PROMETEO_SECRET=<generar-secret-aleatorio>
```

#### 1.3 Service Worker (public/sw.js)
- Registrar para recibir push notifications
- Mostrar notificaciones del sistema

#### 1.4 UI Admin para Prometeo
- `/app/[tenant]/admin/prometeo/page.tsx`
- Listar tareas programadas
- Crear/editar/eliminar tareas
- Seleccionar agente y destinatarios
- Configurar cron schedule

#### 1.5 Endpoint de suscripción
- `/api/push/subscribe` - Guardar subscription
- `/api/push/unsubscribe` - Eliminar subscription

---

### Fase 2: Twilio/WhatsApp

#### 2.1 Configurar credenciales
```bash
# .env.local
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

#### 2.2 Registrar integración en tenant DB
```sql
INSERT INTO integrations (tenant_id, type, name, credentials, is_active)
VALUES (
  '<tenant-uuid>',
  'whatsapp',
  'WhatsApp Business',
  '{"phone": "+1234567890"}',
  true
);
```

#### 2.3 Actualizar master DB
```sql
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS twilio_phone text;
UPDATE tenants SET twilio_phone = '+1234567890' WHERE id = '<tenant-uuid>';
```

#### 2.4 Configurar webhook en Twilio
- URL: `https://tuqui-agents-alpha.vercel.app/api/whatsapp/webhook`
- Método: POST
- Eventos: Incoming messages

---

### Fase 3: UI de Configuración

#### 3.1 Página de Integraciones
- `/app/[tenant]/settings/integrations/page.tsx`
- Ver estado de integraciones
- Configurar Odoo, Twilio, MercadoLibre

#### 3.2 Página de Prometeo Admin
- Gestión visual de tareas programadas
- Preview de próximas ejecuciones

---

## 🔧 Esquema de Base de Datos

### Tablas Existentes (tenant schema)
```
✅ agents
✅ documents  
✅ embeddings
✅ conversations
✅ messages
✅ integrations
✅ odoo_sync_state
✅ prometeo_tasks
```

### Tablas Faltantes
```
❌ push_subscriptions
```

### Master DB
```
✅ tenants (falta: twilio_phone column)
✅ user_tenants
```

---

## 🚀 Próximos Pasos (En Orden)

### Inmediato
1. [ ] Crear migración `push_subscriptions`
2. [ ] Ejecutar migración en tenant DB
3. [ ] Generar y agregar PROMETEO_SECRET

### Corto Plazo
4. [ ] Crear service worker para push
5. [ ] Implementar endpoint `/api/push/subscribe`
6. [ ] Crear UI básica de Prometeo admin

### Mediano Plazo
7. [ ] Obtener credenciales Twilio
8. [ ] Configurar integración WhatsApp
9. [ ] Probar flujo completo Twilio

---

## 📝 Notas Técnicas

### Bug AI SDK v5 + Gemini
El Vercel AI SDK v5 tiene un bug que impide convertir schemas Zod a function declarations de Gemini. La solución implementada es usar el SDK nativo de Google para Odoo:

```typescript
// lib/tools/gemini-odoo.ts
import { GoogleGenerativeAI } from '@google/generative-ai';
// Wrapper nativo que bypasea AI SDK
```

### Modelo Recomendado
- ✅ `gemini-2.5-flash` - Funciona con tools
- ❌ `gemini-2.0-flash` - Falla con tools

### Tenant Activo
- ID: `de7ef34a-12bd-4fe9-9d02-3d876a9393c2`
- Odoo: Configurado y funcionando
