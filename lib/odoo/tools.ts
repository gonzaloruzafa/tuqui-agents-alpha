/**
 * Odoo Intelligent Tools for Vercel AI SDK
 * 
 * Tools con IA para consultar Odoo de manera inteligente:
 * - search_records: Para búsquedas puntuales (últimos pedidos, datos de cliente)
 * - analyze_data: Para reportes y agregaciones (ventas por mes, top productos)
 * 
 * ARQUITECTURA:
 * - Usa domainJson como strings JSON para compatibilidad con Gemini
 * - read_group para BI sin traer miles de registros
 * - Validación de modelos y campos contra el schema
 */

import { z } from 'zod'
import { tool } from 'ai'
import { getOdooClient } from './client'
import { isValidModel, getValidFields } from './schema'

// ============================================================================
// UTILIDADES DE FORMATO
// ============================================================================

/**
 * Formatea números enteros con separador de miles (punto)
 * Ejemplo: 25820 → "25.820"
 */
function formatInteger(num: number | string): string {
  const n = typeof num === 'string' ? parseFloat(num) : num
  if (isNaN(n)) return String(num)
  return Math.round(n).toLocaleString('es-AR', { useGrouping: true })
}

/**
 * Formatea montos en pesos argentinos
 * Ejemplo: 3619891.7 → "$3.619.891,70"
 */
function formatCurrency(amount: number | string): string {
  const n = typeof amount === 'string' ? parseFloat(amount) : amount
  if (isNaN(n)) return String(amount)
  return n.toLocaleString('es-AR', {
    style: 'currency',
    currency: 'ARS',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

/**
 * Formatea decimales no monetarios
 * Ejemplo: 118.8 → "118,80"
 */
function formatDecimal(num: number | string, decimals: number = 2): string {
  const n = typeof num === 'string' ? parseFloat(num) : num
  if (isNaN(n)) return String(num)
  return n.toLocaleString('es-AR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })
}

/**
 * Extrae el nombre de un Many2one [id, "Nombre"]
 */
function extractMany2oneName(field: any): string {
  if (Array.isArray(field) && field.length === 2) {
    return String(field[1])
  }
  return String(field)
}

/**
 * Formatea una fecha ISO a DD/MM/YYYY
 */
function formatDate(dateStr: string): string {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  if (isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString('es-AR')
}

// ============================================================================
// TIPOS
// ============================================================================

interface OdooToolResult {
  success: boolean
  error?: string
  model?: string
  count?: number
  data?: any
  metadata?: {
    type: 'search' | 'aggregate'
    groups?: number
    records?: number
  }
}

// ============================================================================
// SCHEMAS ZOD
// ============================================================================

/**
 * Schema para search_records (búsquedas puntuales)
 */
const SearchRecordsSchema = z.object({
  model: z.string()
    .describe('Modelo Odoo: sale.order, res.partner, product.product, account.move, stock.quant, purchase.order, crm.lead, hr.employee, project.task, helpdesk.ticket, mrp.production, pos.order, etc.'),
  
  domainJson: z.string()
    .describe('Filtros JSON. Ej: \'[["state","in",["sale","done"]]]\', \'[["name","ilike","%texto%"]]\', \'[["date_order",">=","2025-12-01"]]\'. Vacío: "[]"'),
  
  fieldsJson: z.string()
    .default('[]')
    .describe('Campos a traer JSON. Ej: \'["name","amount_total","partner_id"]\'. Vacío = todos'),
  
  limit: z.number()
    .min(1)
    .max(100)
    .default(20)
    .describe('Límite de registros (1-100)'),
  
  order: z.string()
    .optional()
    .describe('Orden: "campo desc" o "campo asc". Ej: "date_order desc", "amount_total desc"')
})

/**
 * Schema para analyze_data (agregaciones BI)
 * TOOL CLAVE para reportes sin traer todos los datos
 */
const AnalyzeDataSchema = z.object({
  model: z.string()
    .describe('Modelo a analizar: sale.order (ventas), sale.order.line (líneas), product.product (productos), account.move (facturas), pos.order (POS), etc.'),
  
  domainJson: z.string()
    .describe('Filtros para acotar análisis. Ej: \'[["state","=","sale"]]\' para ventas confirmadas, \'[["date_order",">=","2025-01-01"]]\' para año actual'),
  
  fieldsJson: z.string()
    .describe(`Campos a AGREGAR con función en JSON. FORMATO CRÍTICO: '["campo:funcion"]'

FUNCIONES: sum (sumar), count (contar), avg (promedio), max (máximo), min (mínimo)

EJEMPLOS:
- Ventas totales: '["amount_total:sum"]'
- Cantidad órdenes: '["id:count"]'  
- Ticket promedio: '["amount_total:avg"]'
- Varios: '["amount_total:sum","id:count","amount_total:avg"]'`),
  
  groupbyJson: z.string()
    .describe(`Agrupar por en JSON. SINTAXIS ESPECIAL FECHAS:

PARA FECHAS usar :month, :year, :quarter, :week, :day
Ej: '["date_order:month"]' = ventas por mes
    '["create_date:year"]' = por año
    '["invoice_date:quarter"]' = por trimestre

PARA RELACIONES usar campo directo:
Ej: '["partner_id"]' = por cliente
    '["product_id"]' = por producto
    '["user_id"]' = por vendedor
    
MÚLTIPLES: '["date_order:month","user_id"]' = ventas por mes y vendedor`),
  
  limit: z.number()
    .min(1)
    .max(100)
    .default(20)
    .describe('Límite de grupos (top N)'),
  
  orderby: z.string()
    .optional()
    .describe('Ordenar grupos. Ej: "amount_total desc" para top ventas, "id desc" para más recientes')
})

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function parseJsonSafe(jsonStr: string, defaultValue: any[] = []): any[] {
  try {
    const parsed = JSON.parse(jsonStr || '[]')
    return Array.isArray(parsed) ? parsed : defaultValue
  } catch (e) {
    console.warn('[OdooTools] Error parsing JSON:', jsonStr, e)
    return defaultValue
  }
}

// ============================================================================
// TOOLS IMPLEMENTATIONS
// ============================================================================

/**
 * search_records: Búsquedas puntuales (últimos pedidos, detalle cliente)
 * 
 * CUÁNDO USAR:
 * - "Últimos 10 pedidos de cliente X"
 * - "Productos en stock bajo mínimo"
 * - "Facturas pendientes de cobro"
 * - "Empleados del departamento Y"
 * 
 * CUÁNDO NO USAR:
 * - "Ventas totales del mes" → usar analyze_data
 * - "Top 10 productos vendidos" → usar analyze_data
 * - Cualquier cosa con agregación (suma, promedio, contar)
 */
export const searchRecordsTool = tool({
  description: `Busca registros PUNTUALES en Odoo (últimos pedidos, datos cliente, productos, stock).

CUÁNDO USAR ESTA TOOL:
✅ Consultas específicas: "últimos 10 pedidos", "cliente con nombre X"
✅ Detalles: "datos del pedido #123", "productos categoría Y"
✅ Listas: "facturas sin pagar", "empleados departamento X"

CUÁNDO NO USAR (usar analyze_data):
❌ Agregaciones: "ventas totales", "suma de X", "promedio Y"
❌ Top N: "productos más vendidos", "mejores clientes"
❌ Por período: "ventas por mes", "ingresos por trimestre"

MODELOS:
Ventas: sale.order, sale.order.line
Productos: product.product, product.template, product.category
Clientes: res.partner
Contabilidad: account.move, account.payment, account.move.line
Stock: stock.quant, stock.picking, stock.move
Compras: purchase.order, purchase.order.line
CRM: crm.lead, crm.stage
RRHH: hr.employee, hr.attendance, hr.leave, hr.expense
Proyectos: project.project, project.task
Soporte: helpdesk.ticket
Producción: mrp.production, mrp.bom
Marketing: mailing.mailing
Mantenimiento: maintenance.equipment, maintenance.request
Flota: fleet.vehicle
POS: pos.order, pos.session

DOMAINS: Operadores =, !=, >, <, >=, <=, ilike, in, not in
Fechas: "YYYY-MM-DD" (ej: "2025-12-01")`,
  
  inputSchema: SearchRecordsSchema,
  
  execute: async (params): Promise<OdooToolResult> => {
    console.log('[Tool:search_records] Executing:', params)

    // Validar modelo
    if (!isValidModel(params.model)) {
      return {
        success: false,
        error: `Modelo '${params.model}' no válido. Revisar schema de Odoo.`
      }
    }

    // Parsear JSONs
    const domain = parseJsonSafe(params.domainJson)
    const fields = parseJsonSafe(params.fieldsJson)

    // Validar campos
    if (fields.length > 0) {
      const validFields = getValidFields(params.model)
      const invalidFields = fields.filter(f => !validFields.includes(f))
      if (invalidFields.length > 0) {
        return {
          success: false,
          error: `Campos inválidos para ${params.model}: ${invalidFields.join(', ')}`
        }
      }
    }

    // Cliente Odoo
    const client = await getOdooClient()
    if (!client) {
      return {
        success: false,
        error: 'No se pudo conectar con Odoo. Revisar configuración.'
      }
    }

    // Ejecutar searchRead
    const result = await client.searchRead({
      model: params.model,
      domain: domain,
      fields: fields.length > 0 ? fields : undefined,
      limit: params.limit,
      order: params.order
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error en búsqueda Odoo'
      }
    }

    return {
      success: true,
      model: params.model,
      count: result.count,
      data: result.data,
      metadata: {
        type: 'search',
        records: result.count
      }
    }
  }
})

/**
 * analyze_data: Agregaciones BI (ventas por mes, top productos, sumas)
 * 
 * TOOL CRÍTICA para Business Intelligence sin traer miles de registros.
 * USA read_group de Odoo para hacer agregaciones server-side.
 * 
 * CUÁNDO USAR:
 * - "Ventas totales del mes"
 * - "Top 10 productos más vendidos"
 * - "Ingresos por trimestre"
 * - "Promedio de ticket"
 * - "Cantidad de pedidos por cliente"
 * 
 * CUÁNDO NO USAR:
 * - "Dame los últimos 10 pedidos" → usar search_records
 * - "Detalle del pedido #123" → usar search_records
 */
export const analyzeDataTool = tool({
  description: `Analiza datos con AGREGACIONES (suma, promedio, contar) - TOOL BI.

CUÁNDO USAR ESTA TOOL:
✅ Totales: "ventas totales", "suma de X"
✅ Promedios: "ticket promedio", "días promedio"
✅ Conteos: "cantidad de pedidos", "cuántos clientes"
✅ Rankings: "top 10 productos", "mejores clientes"
✅ Por período: "ventas por mes", "ingresos por año"

CUÁNDO NO USAR (usar search_records):
❌ Registros específicos: "últimos 10 pedidos"
❌ Detalles: "datos de cliente X"
❌ Sin agregación: "productos de categoría Y"

FUNCIONES AGREGACIÓN (fieldsJson):
- :sum → Sumar (amount_total:sum)
- :count → Contar (id:count)
- :avg → Promedio (amount_total:avg)
- :max → Máximo (amount_total:max)
- :min → Mínimo (create_date:min)

AGRUPAMIENTOS TIEMPO (groupbyJson):
- :month → Por mes (date_order:month)
- :year → Por año (create_date:year)
- :quarter → Por trimestre (invoice_date:quarter)
- :week → Por semana (date:week)
- :day → Por día (create_date:day)

EJEMPLOS REALES:
1. "Ventas por mes 2025":
   model: sale.order
   domain: '[["state","=","sale"],["date_order",">=","2025-01-01"]]'
   fields: '["amount_total:sum","id:count"]'
   groupby: '["date_order:month"]'

2. "Top 10 productos vendidos":
   model: sale.order.line
   domain: '[]'
   fields: '["product_uom_qty:sum"]'
   groupby: '["product_id"]'
   limit: 10
   orderby: 'product_uom_qty desc'

3. "Ticket promedio por vendedor":
   model: sale.order
   domain: '[["state","in",["sale","done"]]]'
   fields: '["amount_total:avg","id:count"]'
   groupby: '["user_id"]'`,
  
  inputSchema: AnalyzeDataSchema,
  
  execute: async (params): Promise<OdooToolResult> => {
    console.log('[Tool:analyze_data] Executing:', params)

    // Validar modelo
    if (!isValidModel(params.model)) {
      return {
        success: false,
        error: `Modelo '${params.model}' no válido.`
      }
    }

    // Parsear JSONs
    const domain = parseJsonSafe(params.domainJson)
    const fields = parseJsonSafe(params.fieldsJson)
    const groupby = parseJsonSafe(params.groupbyJson)

    // Validar que haya fields y groupby
    if (fields.length === 0) {
      return {
        success: false,
        error: 'fieldsJson no puede estar vacío para agregaciones. Ejemplo: \'["amount_total:sum"]\''
      }
    }

    if (groupby.length === 0) {
      return {
        success: false,
        error: 'groupbyJson no puede estar vacío. Ejemplo: \'["date_order:month"]\' o \'["partner_id"]\''
      }
    }

    // Cliente Odoo
    const client = await getOdooClient()
    if (!client) {
      return {
        success: false,
        error: 'No se pudo conectar con Odoo'
      }
    }

    // Ejecutar readGroup (agregación server-side)
    const result = await client.readGroup({
      model: params.model,
      domain: domain,
      fields: fields,
      groupby: groupby,
      limit: params.limit,
      orderby: params.orderby,
      lazy: true // Por defecto lazy para mejor performance
    })

    if (!result.success) {
      return {
        success: false,
        error: result.error || 'Error en análisis Odoo'
      }
    }

    return {
      success: true,
      model: params.model,
      count: result.count,
      data: result.data,
      metadata: {
        type: 'aggregate',
        groups: Array.isArray(result.data) ? result.data.length : 0
      }
    }
  }
})

// ============================================================================
// CACHE DE SCHEMAS
// ============================================================================

interface FieldInfo {
  name: string
  type: string
  string: string  // Label en Odoo
  required?: boolean
  readonly?: boolean
  relation?: string  // Para Many2one/Many2many
}

interface SchemaCache {
  fields: Record<string, FieldInfo>
  timestamp: number
  summary: string  // Resumen legible para el prompt
}

const schemaCache = new Map<string, SchemaCache>()
const SCHEMA_CACHE_TTL = 60 * 60 * 1000 // 1 hora

function getFieldSummary(fields: Record<string, any>): string {
  const fieldList: string[] = []
  
  for (const [name, info] of Object.entries(fields)) {
    // Filtrar campos técnicos
    if (name.startsWith('__') || name === 'id') continue
    
    const type = info.type || 'unknown'
    const label = info.string || name
    
    // Formato compacto: campo (tipo) - etiqueta
    let entry = `${name} (${type})`
    if (info.relation) {
      entry += ` → ${info.relation}`
    }
    fieldList.push(entry)
  }
  
  return fieldList.slice(0, 50).join('\n') // Max 50 campos
}

// ============================================================================
// DISCOVER MODEL TOOL
// ============================================================================

const DiscoverModelSchema = z.object({
  model: z.string()
    .describe('Modelo Odoo a descubrir. Ej: "sale.order", "stock.move", "crm.lead"')
})

/**
 * discover_model: Descubre campos disponibles de un modelo ANTES de consultar
 * 
 * WORKFLOW RECOMENDADO:
 * 1. Usuario pregunta sobre un modelo desconocido
 * 2. Usar discover_model para ver qué campos existen
 * 3. Construir query con campos reales (no inventados)
 */
export const discoverModelTool = tool({
  description: `Descubre campos disponibles de un modelo Odoo ANTES de consultarlo.

CUÁNDO USAR:
✅ Cuando no conocés los campos exactos de un modelo
✅ Antes de hacer una consulta a un modelo nuevo
✅ Cuando el usuario pregunta por algo que no conocés

WORKFLOW:
1. discover_model("stock.move") → Ver campos disponibles
2. Usar los campos REALES en search_records o analyze_data

IMPORTANTE: NUNCA inventar nombres de campos. SIEMPRE descubrir primero.`,
  
  inputSchema: DiscoverModelSchema,
  
  execute: async (params): Promise<OdooToolResult> => {
    console.log('[Tool:discover_model] Discovering:', params.model)
    
    // Verificar cache
    const cached = schemaCache.get(params.model)
    if (cached && Date.now() - cached.timestamp < SCHEMA_CACHE_TTL) {
      console.log('[Tool:discover_model] Cache hit for', params.model)
      return {
        success: true,
        model: params.model,
        data: {
          fields: cached.fields,
          summary: cached.summary,
          cached: true
        }
      }
    }
    
    // Cliente Odoo
    const client = await getOdooClient()
    if (!client) {
      return {
        success: false,
        error: 'No se pudo conectar con Odoo'
      }
    }
    
    // Llamar a fields_get
    const result = await client.getModelFields(params.model)
    
    if (!result.success || !result.data) {
      return {
        success: false,
        error: result.error || `No se pudo descubrir el modelo ${params.model}`
      }
    }
    
    // Procesar campos
    const fields: Record<string, FieldInfo> = {}
    for (const [name, info] of Object.entries(result.data as Record<string, any>)) {
      fields[name] = {
        name,
        type: info.type,
        string: info.string,
        required: info.required,
        readonly: info.readonly,
        relation: info.relation
      }
    }
    
    const summary = getFieldSummary(result.data)
    
    // Guardar en cache
    schemaCache.set(params.model, {
      fields,
      timestamp: Date.now(),
      summary
    })
    
    console.log('[Tool:discover_model] Discovered', Object.keys(fields).length, 'fields for', params.model)
    
    return {
      success: true,
      model: params.model,
      count: Object.keys(fields).length,
      data: {
        fields,
        summary,
        cached: false
      }
    }
  }
})

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * Tools inteligentes de Odoo para Vercel AI SDK
 * 
 * USO:
 * - discover_model: Descubrir campos ANTES de consultar (estilo Odoo Enterprise)
 * - search_records: Búsquedas puntuales (últimos pedidos, cliente X)
 * - analyze_data: Agregaciones BI (ventas por mes, top productos)
 */
export const odooTools = {
  discover_model: discoverModelTool,
  search_records: searchRecordsTool,
  analyze_data: analyzeDataTool
}

/**
 * Tipos exportados para uso externo
 */
export type DiscoverModelParams = z.infer<typeof DiscoverModelSchema>
export type SearchRecordsParams = z.infer<typeof SearchRecordsSchema>
export type AnalyzeDataParams = z.infer<typeof AnalyzeDataSchema>
