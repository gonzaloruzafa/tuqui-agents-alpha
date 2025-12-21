# Tuqui Agents Alpha

**Plataforma de Agentes de IA Multi-Tenant para Empresas**

> 🤖 **Nota para Agentes de IA:** Este proyecto utiliza una arquitectura multi-tenant estricta con aislamiento de base de datos. Lee atentamente la sección de Arquitectura antes de realizar cambios.

## 🌟 Descripción

Tuqui Agents Alpha es una plataforma SaaS que permite a empresas ("Tenants") tener sus propios asistentes de IA personalizados. Cada tenant tiene su propia base de datos Supabase aislada, mientras que una Master DB gestiona el enrutamiento y la autenticación.

## 🏗 Arquitectura

### Multi-Tenancy (Database per Tenant)
El sistema utiliza el patrón "Database per Tenant" para máximo aislamiento y seguridad.
*   **Master DB**: Contiene la tabla `tenants` (registro de clientes y sus credenciales de conexión) y `users` (mapeo global de emails a tenants).
*   **Tenant DB**: Cada cliente tiene su propia instancia de Supabase. Aquí viven los datos sensibles: `vectors` (RAG), `chat_history`, configuración de integraciones, etc.

**Client Factory (`lib/supabase/tenant.ts`)**:
Es el componente crítico que, dado un `tenantId`, consulta la Master DB, obtiene las credenciales (URL + Service Key) y devuelve una instancia de `SupabaseClient` conectada a esa base específica.

### Autenticación
*   **NextAuth.js**: Maneja el login con Google.
*   **Tenant Injection**: Al iniciar sesión, el sistema busca en la Master DB a qué tenant pertenece el usuario e inyecta el objeto `tenant` en la sesión de NextAuth.
*   **Middleware**: Protege todas las rutas (excepto `/login` y `/api/auth`) y asegura que exista una sesión válida.

### AI & Tools
*   **SDK**: Vercel AI SDK (`ai` + `@ai-sdk/google`).
*   **Model**: Gemini 2.5 Flash (backend) y `text-embedding-004` (RAG).
*   **Agent Runtime**: `app/api/chat/route.ts` es el orquestador. En cada request:
    1.  Verifica Límite de Billing (tokens).
    2.  Carga el Agente (desde DB + Registry).
    3.  Construye Contexto RAG (si aplica).
    4.  Carga Tools (dinámicamente según config).
    5.  Ejecuta Streaming.

## 🚀 Setup para Desarrollo

### 1. Prerrequisitos
*   Node.js 18+
*   2 Proyectos Supabase (uno para Master, uno para Tenant de prueba)
*   Google Cloud Console (OAuth Credentials)
*   Gemini API Key

### 2. Variables de Entorno
Copia `.env.example` a `.env.local` y completa:
*   Credenciales Master DB
*   Credenciales Initial Tenant (para el seed)
*   Keys de Google y AI

### 3. Base de Datos
Ejecuta los scripts SQL en las consolas de Supabase respectivas:
*   `supabase/master-schema.sql` -> En Master Project
*   `supabase/tenant-schema.sql` -> En Tenant Project

**Para habilitar RAG (búsqueda de documentos):**
Ejecuta el script de migración RAG en tu **Tenant Project**:
```
supabase/migrations/006_complete_rag_setup.sql
```
Este script crea:
- Tablas: `documents`, `document_chunks`, `agent_documents`
- Función: `match_documents` para búsqueda vectorial
- Índice: `ivfflat` para búsquedas eficientes

### 4. Inicialización
Corre el script de setup para crear el tenant de demostración y tu usuario admin:
```bash
npx tsx scripts/setup.ts
```

### 5. Ejecución
```bash
npm run dev
```

## 📁 Estructura del Proyecto

```
/
├── app/
│   ├── api/
│   │   ├── chat/          # Endpoint principal de chat
│   │   ├── agents/        # API de agentes
│   │   ├── prometeo/      # Trigger de tareas programadas
│   │   └── whatsapp/      # Webhook de Twilio
│   ├── chat/[slug]/       # Interfaz de chat (Page)
│   └── login/             # Página de login custom
├── lib/
│   ├── agents/            # Lógica de agentes (Service + Registry)
│   ├── auth/              # Config de NextAuth
│   ├── billing/           # Tracker de uso y límites
│   ├── prometeo/          # Runner de tareas (Push Notifications)
│   ├── rag/               # Embeddings y Vector Search
│   ├── supabase/          # Clientes Master y Tenant (Factory)
│   └── tools/             # Implementación de Tools (Odoo, MeLi)
├── supabase/              # SQL Migrations/Schemas
└── scripts/               # Scripts de utilidad (setup, standalone runner)
```

## 📚 Documentación Adicional
Revisa la carpeta `documentation/` para más detalles:
- [Implementation Plan](documentation/implementation_plan.md)
- [Walkthrough](documentation/walkthrough.md)
