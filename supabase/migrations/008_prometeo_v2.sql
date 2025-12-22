-- Migration: Prometeo v2 - Notificaciones In-App + Alertas Condicionales
-- Run on tenant database: ancgbbzvfhoqqxiueyoz

-- ============================================================
-- 1. TABLA NOTIFICATIONS (Bandeja de entrada in-app)
-- ============================================================
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email text NOT NULL,
  agent_id uuid REFERENCES agents(id) ON DELETE SET NULL,
  task_id uuid REFERENCES prometeo_tasks(id) ON DELETE SET NULL,
  title text NOT NULL,
  body text NOT NULL,
  priority text DEFAULT 'info' CHECK (priority IN ('info', 'warning', 'critical')),
  is_read boolean DEFAULT false,
  link text,  -- opcional: /chat/agente-slug para abrir conversación
  created_at timestamptz DEFAULT now()
);

-- Índices para queries comunes
CREATE INDEX IF NOT EXISTS idx_notifications_user_email ON notifications(user_email);
CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_email, is_read) WHERE is_read = false;
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);

-- ============================================================
-- 2. NUEVAS COLUMNAS EN PROMETEO_TASKS
-- ============================================================

-- task_type: 'scheduled' (ejecuta en horario) | 'conditional' (ejecuta si condición se cumple)
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS task_type text DEFAULT 'scheduled' 
  CHECK (task_type IN ('scheduled', 'conditional'));

-- condition: condición en lenguaje natural para tareas condicionales
-- Ej: "Las ventas del día son menores a $100.000"
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS condition text;

-- check_interval: para tareas condicionales, cada cuánto verificar (cron)
-- Default: cada 15 minutos
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS check_interval text DEFAULT '*/15 * * * *';

-- priority: prioridad de la notificación generada
ALTER TABLE prometeo_tasks ADD COLUMN IF NOT EXISTS priority text DEFAULT 'info'
  CHECK (priority IN ('info', 'warning', 'critical'));

-- ============================================================
-- 3. TABLA PROMETEO_EXECUTIONS (Historial de ejecuciones)
-- ============================================================
CREATE TABLE IF NOT EXISTS prometeo_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid REFERENCES prometeo_tasks(id) ON DELETE CASCADE,
  executed_at timestamptz DEFAULT now(),
  condition_met boolean,  -- null para scheduled, true/false para conditional
  ai_response text,       -- respuesta completa de Gemini
  notification_sent boolean DEFAULT false,
  status text DEFAULT 'success' CHECK (status IN ('success', 'skipped', 'error')),
  error_message text      -- detalle si status = 'error'
);

-- Índice para consultar historial de una tarea
CREATE INDEX IF NOT EXISTS idx_prometeo_executions_task_id ON prometeo_executions(task_id);
CREATE INDEX IF NOT EXISTS idx_prometeo_executions_executed_at ON prometeo_executions(executed_at DESC);

-- ============================================================
-- 4. ACTUALIZAR NOTIFICATION_TYPE PARA INCLUIR IN_APP
-- ============================================================
-- Cambiar el check constraint para permitir 'in_app' además de push/email/both
-- Nota: En PostgreSQL no se puede modificar CHECK directamente, hay que recrear

-- Primero verificar si la columna tiene un constraint
DO $$
BEGIN
  -- Intentar eliminar constraint si existe
  BEGIN
    ALTER TABLE prometeo_tasks DROP CONSTRAINT IF EXISTS prometeo_tasks_notification_type_check;
  EXCEPTION WHEN undefined_object THEN
    -- El constraint no existe, está ok
    NULL;
  END;
END $$;

-- Agregar nuevo constraint con más opciones
-- Los valores ahora son: 'push', 'email', 'in_app', 'push_and_email', 'all'
ALTER TABLE prometeo_tasks ADD CONSTRAINT prometeo_tasks_notification_type_check 
  CHECK (notification_type IN ('push', 'email', 'in_app', 'push_and_email', 'all'));

-- Actualizar default para incluir in_app por defecto
ALTER TABLE prometeo_tasks ALTER COLUMN notification_type SET DEFAULT 'in_app';

-- ============================================================
-- 5. COMENTARIOS PARA DOCUMENTACIÓN
-- ============================================================
COMMENT ON TABLE notifications IS 'Bandeja de notificaciones in-app de Prometeo';
COMMENT ON COLUMN notifications.priority IS 'info (azul), warning (amarillo), critical (rojo)';
COMMENT ON COLUMN notifications.link IS 'URL relativa para navegar al hacer click';

COMMENT ON COLUMN prometeo_tasks.task_type IS 'scheduled: cron fijo | conditional: evalúa condición con AI';
COMMENT ON COLUMN prometeo_tasks.condition IS 'Condición en lenguaje natural para task_type=conditional';
COMMENT ON COLUMN prometeo_tasks.check_interval IS 'Cron para verificar condición (solo conditional)';
COMMENT ON COLUMN prometeo_tasks.priority IS 'Prioridad de notificaciones generadas';

COMMENT ON TABLE prometeo_executions IS 'Historial de todas las ejecuciones de tareas Prometeo';
COMMENT ON COLUMN prometeo_executions.condition_met IS 'null=scheduled, true/false=resultado evaluación conditional';
COMMENT ON COLUMN prometeo_executions.ai_response IS 'Respuesta completa del modelo para debugging';

-- ============================================================
-- 6. VERIFICAR MIGRACIÓN
-- ============================================================
SELECT 'notifications table' as check_item, 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'notifications') 
            THEN '✓ Created' ELSE '✗ Missing' END as status
UNION ALL
SELECT 'prometeo_executions table', 
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'prometeo_executions') 
            THEN '✓ Created' ELSE '✗ Missing' END
UNION ALL
SELECT 'task_type column',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'task_type')
            THEN '✓ Added' ELSE '✗ Missing' END
UNION ALL
SELECT 'condition column',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'condition')
            THEN '✓ Added' ELSE '✗ Missing' END
UNION ALL
SELECT 'priority column',
       CASE WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'prometeo_tasks' AND column_name = 'priority')
            THEN '✓ Added' ELSE '✗ Missing' END;
