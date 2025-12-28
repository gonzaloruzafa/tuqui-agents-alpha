/**
 * Odoo JSON-RPC Client
 * 
 * Cliente robusto para comunicarse con Odoo via JSON-RPC.
 * Maneja autenticación, sesiones y ejecuta operaciones de lectura.
 * 
 * Nota: No usamos XML-RPC porque JSON-RPC es más simple y funciona igual de bien.
 */

import { supabaseAdmin } from '@/lib/supabase'

// ============================================================================
// TIPOS
// ============================================================================

export interface OdooConfig {
  url: string      // URL base de Odoo (ej: https://demo.odoo.com)
  db: string       // Nombre de la base de datos
  username: string // Usuario de Odoo
  apiKey: string   // API Key o password
}

export interface OdooSearchReadParams {
  model: string
  domain?: any[][]
  fields?: string[]
  limit?: number
  offset?: number
  order?: string
}

export interface OdooResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  count?: number
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id: number
  result?: any
  error?: {
    code: number
    message: string
    data?: {
      name: string
      debug: string
      message: string
      arguments: string[]
      exception_type: string
    }
  }
}

// ============================================================================
// CLIENTE ODOO
// ============================================================================

export class OdooClient {
  private config: OdooConfig
  private uid: number | null = null
  private sessionId: string | null = null

  constructor(config: OdooConfig) {
    this.config = {
      ...config,
      url: config.url.replace(/\/+$/, '') // Quitar trailing slashes
    }
  }

  /**
   * Construye URL del endpoint JSON-RPC
   */
  private get jsonRpcUrl(): string {
    return `${this.config.url}/jsonrpc`
  }

  /**
   * Ejecuta una llamada JSON-RPC genérica
   */
  private async jsonRpc(
    service: string,
    method: string,
    args: any[]
  ): Promise<JsonRpcResponse> {
    const body = {
      jsonrpc: '2.0',
      method: 'call',
      id: Date.now(),
      params: {
        service,
        method,
        args
      }
    }

    const response = await fetch(this.jsonRpcUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body)
    })

    if (!response.ok) {
      throw new Error(`HTTP error ${response.status}: ${response.statusText}`)
    }

    return response.json()
  }

  /**
   * Autentica con Odoo y obtiene el UID del usuario
   */
  async authenticate(): Promise<boolean> {
    try {
      console.log('[OdooClient] Authenticating...', {
        url: this.config.url,
        db: this.config.db,
        username: this.config.username
      })

      const result = await this.jsonRpc('common', 'authenticate', [
        this.config.db,
        this.config.username,
        this.config.apiKey,
        {}
      ])

      console.log('[OdooClient] Raw auth response:', JSON.stringify(result, null, 2))

      if (result.error) {
        console.error('[OdooClient] Auth error:', result.error)
        return false
      }

      if (!result.result || typeof result.result !== 'number') {
        console.error('[OdooClient] Invalid UID:', result.result)
        console.error('[OdooClient] Full response:', JSON.stringify(result, null, 2))
        return false
      }

      this.uid = result.result
      console.log('[OdooClient] Authenticated, UID:', this.uid)
      return true
    } catch (error) {
      console.error('[OdooClient] Authentication failed:', error)
      return false
    }
  }

  /**
   * Verifica si está autenticado, si no intenta autenticar
   */
  private async ensureAuthenticated(): Promise<void> {
    if (!this.uid) {
      const success = await this.authenticate()
      if (!success) {
        throw new Error('No se pudo autenticar con Odoo. Verificá las credenciales.')
      }
    }
  }

  /**
   * Ejecuta una operación en un modelo de Odoo
   */
  private async execute<T = any>(
    model: string,
    method: string,
    args: any[] = [],
    kwargs: Record<string, any> = {}
  ): Promise<T> {
    await this.ensureAuthenticated()

    const result = await this.jsonRpc('object', 'execute_kw', [
      this.config.db,
      this.uid!,
      this.config.apiKey,
      model,
      method,
      args,
      kwargs
    ])

    if (result.error) {
      const errorMsg = result.error.data?.message || result.error.message || 'Error desconocido'
      throw new Error(`Odoo Error: ${errorMsg}`)
    }

    return result.result
  }

  /**
   * Ejecuta search_read en un modelo
   * Este es el método principal que usará la tool
   */
  async searchRead(params: OdooSearchReadParams): Promise<OdooResponse> {
    try {
      console.log('[OdooClient] search_read:', {
        model: params.model,
        domain: params.domain,
        fields: params.fields?.slice(0, 5),
        limit: params.limit
      })

      const domain = params.domain || []
      const kwargs: Record<string, any> = {}

      if (params.fields && params.fields.length > 0) {
        kwargs.fields = params.fields
      }
      if (params.limit !== undefined) {
        kwargs.limit = params.limit
      }
      if (params.offset !== undefined) {
        kwargs.offset = params.offset
      }
      if (params.order) {
        kwargs.order = params.order
      }

      const data = await this.execute(
        params.model,
        'search_read',
        [domain],
        kwargs
      )

      console.log('[OdooClient] Got', Array.isArray(data) ? data.length : 0, 'records')

      return {
        success: true,
        data,
        count: Array.isArray(data) ? data.length : 0
      }
    } catch (error: any) {
      console.error('[OdooClient] search_read error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Cuenta registros que coinciden con un dominio
   */
  async searchCount(model: string, domain: any[][] = []): Promise<OdooResponse<number>> {
    try {
      const count = await this.execute<number>(
        model,
        'search_count',
        [domain]
      )

      return {
        success: true,
        data: count
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * READ_GROUP - Método CRÍTICO para Business Intelligence
   * Permite hacer agregaciones (SUM, COUNT, AVG) sin traer todos los registros.
   * 
   * @example
   * // Ventas totales por mes
   * readGroup('sale.order', [['state','=','sale']], ['amount_total:sum'], ['date_order:month'])
   * 
   * // Top 5 productos más vendidos
   * readGroup('sale.order.line', [], ['product_uom_qty:sum'], ['product_id'], 5, 'product_uom_qty desc')
   * 
   * @param model - Modelo de Odoo
   * @param domain - Filtros (igual que search_read)
   * @param fields - Campos a agregar con función: 'campo:funcion' (sum, count, avg, max, min)
   * @param groupby - Lista de campos por los que agrupar (soporta :month, :year, :quarter, :week, :day)
   * @param limit - Límite de grupos a devolver
   * @param orderby - Ordenamiento (ej: 'amount_total desc')
   * @param lazy - Si true, agrupa solo por el primer campo (default: true en Odoo)
   */
  async readGroup(params: {
    model: string
    domain?: any[][]
    fields: string[]  // Ej: ['amount_total:sum', 'id:count']
    groupby: string[] // Ej: ['date_order:month', 'partner_id']
    limit?: number
    offset?: number
    orderby?: string
    lazy?: boolean
  }): Promise<OdooResponse> {
    try {
      console.log('[OdooClient] read_group:', {
        model: params.model,
        fields: params.fields,
        groupby: params.groupby,
        limit: params.limit
      })

      const domain = params.domain || []
      const kwargs: Record<string, any> = {
        fields: params.fields,
        groupby: params.groupby,
        lazy: params.lazy !== undefined ? params.lazy : true
      }

      if (params.limit !== undefined) {
        kwargs.limit = params.limit
      }
      if (params.offset !== undefined) {
        kwargs.offset = params.offset
      }
      if (params.orderby) {
        kwargs.orderby = params.orderby
      }

      // read_group en Odoo acepta: (domain, fields, groupby, offset, limit, orderby, lazy)
      // Solo pasamos domain como argumento posicional, el resto como kwargs
      const data = await this.execute(
        params.model,
        'read_group',
        [domain],
        kwargs
      )

      console.log('[OdooClient] read_group returned', Array.isArray(data) ? data.length : 0, 'groups')

      return {
        success: true,
        data,
        count: Array.isArray(data) ? data.length : 0
      }
    } catch (error: any) {
      console.error('[OdooClient] read_group error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Lee registros específicos por ID
   */
  async read(model: string, ids: number[], fields?: string[]): Promise<OdooResponse> {
    try {
      const kwargs: Record<string, any> = {}
      if (fields) {
        kwargs.fields = fields
      }

      const data = await this.execute(
        model,
        'read',
        [ids],
        kwargs
      )

      return {
        success: true,
        data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * Obtiene metadatos de un modelo (útil para debugging)
   */
  async getModelFields(model: string): Promise<OdooResponse> {
    try {
      const data = await this.execute(
        model,
        'fields_get',
        [],
        { attributes: ['string', 'type', 'required', 'readonly'] }
      )

      return {
        success: true,
        data
      }
    } catch (error: any) {
      return {
        success: false,
        error: error.message
      }
    }
  }
}

// ============================================================================
// FACTORY - Crea cliente con config desde Supabase
// ============================================================================

let clientCache: OdooClient | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutos

/**
 * Obtiene configuración de Odoo desde la base de datos
 */
async function getOdooConfigFromDB(): Promise<Omit<OdooConfig, 'apiKey'> | null> {
  try {
    const supabase = supabaseAdmin()
    const { data, error } = await supabase
      .from('tuqui_tool_configs')
      .select('config')
      .eq('tool_slug', 'odoo')
      .single()

    if (error || !data?.config) {
      console.log('[OdooClient] No config found in DB')
      return null
    }

    const config = data.config as any
    if (!config.odoo_url || !config.odoo_db || !config.odoo_user) {
      console.log('[OdooClient] Incomplete config in DB')
      return null
    }

    return {
      url: config.odoo_url,
      db: config.odoo_db,
      username: config.odoo_user
    }
  } catch (error) {
    console.error('[OdooClient] Error loading config:', error)
    return null
  }
}

/**
 * Factory function para obtener un cliente Odoo configurado
 * Usa cache para evitar re-autenticación constante
 */
export async function getOdooClient(): Promise<OdooClient | null> {
  // Verificar cache
  if (clientCache && Date.now() - cacheTimestamp < CACHE_TTL) {
    return clientCache
  }

  // Obtener configuración
  const dbConfig = await getOdooConfigFromDB()
  if (!dbConfig) {
    return null
  }

  const apiKey = process.env.ODOO_API_KEY
  if (!apiKey) {
    console.error('[OdooClient] Missing ODOO_API_KEY env var')
    return null
  }

  // Crear nuevo cliente
  const client = new OdooClient({
    ...dbConfig,
    apiKey
  })

  // Pre-autenticar
  const success = await client.authenticate()
  if (!success) {
    return null
  }

  // Actualizar cache
  clientCache = client
  cacheTimestamp = Date.now()

  return client
}

/**
 * Invalida el cache del cliente (útil después de cambiar config)
 */
export function invalidateOdooClientCache(): void {
  clientCache = null
  cacheTimestamp = 0
}
