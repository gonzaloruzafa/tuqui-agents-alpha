'use client';

import { useState, useEffect, useCallback } from 'react';
import { 
  Clock, 
  Play, 
  Pause, 
  Trash2, 
  Plus, 
  RefreshCw,
  Bell,
  Calendar,
  Bot,
  Mail,
  AlertCircle
} from 'lucide-react';

interface PrometeoTask {
  id: string;
  agent_id: string;
  agent_name?: string;
  prompt: string;
  schedule: string;
  next_run: string;
  is_active: boolean;
  notification_type: 'push' | 'email' | 'both';
  recipients: string[];
  created_at: string;
  last_run?: string;
  last_result?: string;
}

interface Agent {
  id: string;
  name: string;
}

interface Props {
  tenantId: string;
}

export default function PrometeoAdmin({ tenantId }: Props) {
  const [tasks, setTasks] = useState<PrometeoTask[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Fetch tasks
      const tasksRes = await fetch('/api/prometeo/tasks');
      if (!tasksRes.ok) {
        const err = await tasksRes.json();
        throw new Error(err.error || 'Error al cargar tareas');
      }
      const tasksData = await tasksRes.json();
      setTasks(tasksData.tasks || []);

      // Fetch agents for the dropdown
      const agentsRes = await fetch('/api/agents');
      if (agentsRes.ok) {
        const agentsData = await agentsRes.json();
        setAgents(agentsData || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const toggleTask = async (taskId: string, isActive: boolean) => {
    try {
      const res = await fetch(`/api/prometeo/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !isActive }),
      });
      
      if (!res.ok) throw new Error('Error al actualizar tarea');
      
      setTasks(tasks.map(t => 
        t.id === taskId ? { ...t, is_active: !isActive } : t
      ));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const deleteTask = async (taskId: string) => {
    if (!confirm('¿Eliminar esta tarea programada?')) return;
    
    try {
      const res = await fetch(`/api/prometeo/tasks/${taskId}`, {
        method: 'DELETE',
      });
      
      if (!res.ok) throw new Error('Error al eliminar tarea');
      
      setTasks(tasks.filter(t => t.id !== taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  const runTaskNow = async (taskId: string) => {
    try {
      const res = await fetch(`/api/prometeo/tasks/${taskId}/run`, {
        method: 'POST',
      });
      
      if (!res.ok) throw new Error('Error al ejecutar tarea');
      
      const result = await res.json();
      alert(`Tarea ejecutada: ${result.message || 'OK'}`);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    }
  };

  if (loading) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8 flex items-center justify-center">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="text-gray-100">
      {/* Header */}
      <div className="bg-gray-800 border-b border-gray-700">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-8 h-8 text-purple-500" />
              <div>
                <h1 className="text-2xl font-bold">Prometeo</h1>
                <p className="text-sm text-gray-400">Tareas Programadas</p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={fetchData}
                className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-gray-700"
                title="Refrescar"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                Nueva Tarea
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {error && (
          <div className="mb-6 p-4 bg-red-900/50 border border-red-700 rounded-lg flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-500" />
            <span>{error}</span>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-300">
              ×
            </button>
          </div>
        )}

        {tasks.length === 0 ? (
          <div className="text-center py-16">
            <Clock className="w-16 h-16 text-gray-600 mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-gray-400 mb-2">
              No hay tareas programadas
            </h2>
            <p className="text-gray-500 mb-6">
              Crea tu primera tarea para ejecutar agentes automáticamente
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-3 bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors"
            >
              Crear Primera Tarea
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                onToggle={() => toggleTask(task.id, task.is_active)}
                onDelete={() => deleteTask(task.id)}
                onRunNow={() => runTaskNow(task.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <CreateTaskModal
          agents={agents}
          onClose={() => setShowCreateModal(false)}
          onCreated={() => {
            setShowCreateModal(false);
            fetchData();
          }}
        />
      )}
    </div>
  );
}

function TaskCard({ 
  task, 
  onToggle, 
  onDelete, 
  onRunNow 
}: { 
  task: PrometeoTask;
  onToggle: () => void;
  onDelete: () => void;
  onRunNow: () => void;
}) {
  return (
    <div className={`p-5 rounded-lg border ${
      task.is_active 
        ? 'bg-gray-800 border-gray-700' 
        : 'bg-gray-800/50 border-gray-700/50 opacity-60'
    }`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 mb-2">
            <Bot className="w-5 h-5 text-purple-400" />
            <h3 className="font-semibold">{task.agent_name || 'Agente'}</h3>
            <span className={`px-2 py-0.5 rounded text-xs ${
              task.is_active 
                ? 'bg-green-900/50 text-green-400' 
                : 'bg-gray-700 text-gray-400'
            }`}>
              {task.is_active ? 'Activa' : 'Pausada'}
            </span>
          </div>
          
          <p className="text-gray-300 mb-3">{task.prompt}</p>
          
          <div className="flex flex-wrap gap-4 text-sm text-gray-400">
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              <span>{task.schedule}</span>
            </div>
            <div className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              <span>Próxima: {new Date(task.next_run).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-1">
              {task.notification_type === 'push' || task.notification_type === 'both' ? (
                <Bell className="w-4 h-4" />
              ) : (
                <Mail className="w-4 h-4" />
              )}
              <span>{task.recipients.length} destinatarios</span>
            </div>
          </div>
          
          {task.last_run && (
            <p className="mt-2 text-xs text-gray-500">
              Última ejecución: {new Date(task.last_run).toLocaleString()}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2 ml-4">
          <button
            onClick={onRunNow}
            className="p-2 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded"
            title="Ejecutar ahora"
          >
            <Play className="w-5 h-5" />
          </button>
          <button
            onClick={onToggle}
            className={`p-2 rounded ${
              task.is_active 
                ? 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-900/30' 
                : 'text-green-400 hover:text-green-300 hover:bg-green-900/30'
            }`}
            title={task.is_active ? 'Pausar' : 'Activar'}
          >
            {task.is_active ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
          </button>
          <button
            onClick={onDelete}
            className="p-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 rounded"
            title="Eliminar"
          >
            <Trash2 className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateTaskModal({ 
  agents, 
  onClose, 
  onCreated 
}: { 
  agents: Agent[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [formData, setFormData] = useState({
    agent_id: '',
    prompt: '',
    schedule: '0 9 * * *', // Default: every day at 9am
    notification_type: 'push' as 'push' | 'email' | 'both',
    recipients: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const schedulePresets = [
    { label: 'Cada hora', value: '0 * * * *' },
    { label: 'Diario 9am', value: '0 9 * * *' },
    { label: 'Diario 6pm', value: '0 18 * * *' },
    { label: 'Lun-Vie 9am', value: '0 9 * * 1-5' },
    { label: 'Lunes 9am', value: '0 9 * * 1' },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/prometeo/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          recipients: formData.recipients.split(',').map(r => r.trim()).filter(Boolean),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al crear tarea');
      }

      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-800 rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-700">
          <h2 className="text-xl font-semibold">Nueva Tarea Programada</h2>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-900/50 border border-red-700 rounded text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Agente
            </label>
            <select
              value={formData.agent_id}
              onChange={(e) => setFormData({ ...formData, agent_id: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              required
            >
              <option value="">Seleccionar agente...</option>
              {agents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  {agent.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Prompt / Instrucción
            </label>
            <textarea
              value={formData.prompt}
              onChange={(e) => setFormData({ ...formData, prompt: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              rows={3}
              placeholder="Ej: Genera un resumen de ventas del día anterior"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Programación (Cron)
            </label>
            <div className="flex gap-2 mb-2 flex-wrap">
              {schedulePresets.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => setFormData({ ...formData, schedule: preset.value })}
                  className={`px-2 py-1 text-xs rounded ${
                    formData.schedule === preset.value
                      ? 'bg-purple-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={formData.schedule}
              onChange={(e) => setFormData({ ...formData, schedule: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-mono text-sm"
              placeholder="0 9 * * *"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Formato: minuto hora día mes día_semana
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Tipo de Notificación
            </label>
            <div className="flex gap-4">
              {(['push', 'email', 'both'] as const).map((type) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="notification_type"
                    value={type}
                    checked={formData.notification_type === type}
                    onChange={(e) => setFormData({ ...formData, notification_type: e.target.value as 'push' | 'email' | 'both' })}
                    className="text-purple-600"
                  />
                  <span className="text-sm capitalize">{type === 'both' ? 'Ambos' : type}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">
              Destinatarios (emails separados por coma)
            </label>
            <input
              type="text"
              value={formData.recipients}
              onChange={(e) => setFormData({ ...formData, recipients: e.target.value })}
              className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              placeholder="user@example.com, otro@example.com"
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-300 hover:text-white"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded-lg disabled:opacity-50"
            >
              {saving ? 'Creando...' : 'Crear Tarea'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
