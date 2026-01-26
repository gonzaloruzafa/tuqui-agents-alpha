# Configuración de GitHub Secrets para Evals

## Secrets Requeridos

Para que el workflow de evaluaciones (`agent-evals.yml`) funcione, necesitás configurar los siguientes secrets en GitHub:

### Pasos para configurar:

1. Ir a **Settings → Secrets and variables → Actions → Secrets**
2. Click en **New repository secret**
3. Agregar cada secret:

| Secret Name | Descripción | Dónde obtenerlo |
|-------------|-------------|-----------------|
| `INTERNAL_TEST_KEY` | API key interna para tests | Generar un UUID o string random seguro |
| `GEMINI_API_KEY` | API key de Google Gemini | [Google AI Studio](https://aistudio.google.com/app/apikey) |
| `TEST_TENANT_ID` | ID del tenant de prueba | `de7ef34a-12bd-4fe9-9d02-3d876a9393c2` (test tenant) |
| `NEXT_PUBLIC_SUPABASE_URL` | URL de Supabase | Dashboard de Supabase → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key de Supabase | Dashboard de Supabase → Settings → API |

### Opcional:

| Secret Name | Descripción | Default |
|-------------|-------------|---------|
| `EVAL_BASE_URL` | URL base para las evals | `https://tuqui-agents-alpha.vercel.app` |

## Seguridad

- ✅ Los secrets están **encriptados** en GitHub
- ✅ Los secrets **nunca se muestran** en logs (se enmascaran con `***`)
- ✅ Los secrets solo están disponibles para GitHub Actions, no para forks
- ✅ Los secrets no se pueden ver después de guardarlos (solo editar/borrar)

## Variables de Entorno en Vercel

También necesitás configurar en Vercel (para que el endpoint `/api/internal/chat-test` funcione):

1. Ir a **Vercel Dashboard → Project → Settings → Environment Variables**
2. Agregar:

| Variable | Valor |
|----------|-------|
| `INTERNAL_TEST_KEY` | El mismo valor que en GitHub |

## Verificar Configuración

Para verificar que todo está configurado:

```bash
# Ejecutar evals manualmente desde GitHub Actions
# Settings → Actions → Agent Evaluations → Run workflow
```

O localmente:

```bash
# Copiar .env.example a .env.local y completar los valores
TEST_TENANT_ID=de7ef34a-12bd-4fe9-9d02-3d876a9393c2 npm run test:evals
```

## Troubleshooting

### Error: "Unauthorized"
- Verificar que `INTERNAL_TEST_KEY` coincida en GitHub y Vercel

### Error: "No Odoo credentials"
- El TEST_TENANT_ID debe tener credenciales de Odoo configuradas en Supabase

### Error: "Rate limited"
- Gemini tiene límites de rate. Esperar o usar otra API key.
