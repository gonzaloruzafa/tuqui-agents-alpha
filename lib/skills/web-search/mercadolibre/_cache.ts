/**
 * MLCache - Cache simple para búsquedas de MercadoLibre
 *
 * Reduce latencia evitando búsquedas repetidas (3-8s cada una).
 * Cache en memoria con TTL de 5 minutos y límite de 50 entradas.
 *
 * @example
 * const cached = MLCache.get('turbina led')
 * if (cached) return cached
 *
 * const results = await searchML('turbina led')
 * MLCache.set('turbina led', results)
 */

// ============================================
// TYPES
// ============================================

interface CacheEntry<T = any> {
  data: T
  timestamp: number
  hits: number // Contador de hits para métricas
}

interface CacheStats {
  size: number
  hits: number
  misses: number
  hitRate: number
}

// ============================================
// CACHE CLASS
// ============================================

export class MLCache {
  private static cache = new Map<string, CacheEntry>()
  private static TTL = 5 * 60 * 1000 // 5 minutos
  private static MAX_SIZE = 50 // Máximo 50 búsquedas cacheadas
  private static hits = 0
  private static misses = 0

  /**
   * Obtiene datos del cache si existen y no expiraron
   */
  static get<T = any>(query: string): T | null {
    const normalizedQuery = this.normalizeQuery(query)
    const entry = this.cache.get(normalizedQuery)

    if (!entry) {
      this.misses++
      return null
    }

    // Check if expired
    if (Date.now() - entry.timestamp > this.TTL) {
      this.cache.delete(normalizedQuery)
      this.misses++
      return null
    }

    // Cache hit!
    entry.hits++
    this.hits++
    return entry.data as T
  }

  /**
   * Guarda datos en el cache
   */
  static set<T = any>(query: string, data: T): void {
    const normalizedQuery = this.normalizeQuery(query)

    // Enforce size limit (FIFO - First In First Out)
    if (this.cache.size >= this.MAX_SIZE) {
      const firstKey = this.cache.keys().next().value
      if (firstKey) {
        this.cache.delete(firstKey)
      }
    }

    this.cache.set(normalizedQuery, {
      data,
      timestamp: Date.now(),
      hits: 0,
    })
  }

  /**
   * Invalida una entrada específica
   */
  static invalidate(query: string): boolean {
    const normalizedQuery = this.normalizeQuery(query)
    return this.cache.delete(normalizedQuery)
  }

  /**
   * Limpia todo el cache
   */
  static clear(): void {
    this.cache.clear()
    this.hits = 0
    this.misses = 0
  }

  /**
   * Obtiene estadísticas del cache
   */
  static getStats(): CacheStats {
    const total = this.hits + this.misses
    return {
      size: this.cache.size,
      hits: this.hits,
      misses: this.misses,
      hitRate: total > 0 ? (this.hits / total) * 100 : 0,
    }
  }

  /**
   * Normaliza query para mejorar hit rate
   * (trim, lowercase, normalizar espacios)
   */
  private static normalizeQuery(query: string): string {
    return query
      .trim()
      .toLowerCase()
      .replace(/\s+/g, ' ') // Normalizar múltiples espacios
      .replace(/[áàäâ]/g, 'a')
      .replace(/[éèëê]/g, 'e')
      .replace(/[íìïî]/g, 'i')
      .replace(/[óòöô]/g, 'o')
      .replace(/[úùüû]/g, 'u')
  }

  /**
   * Limpia entradas expiradas (garbage collection manual)
   */
  static cleanup(): number {
    const now = Date.now()
    let removed = 0

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.TTL) {
        this.cache.delete(key)
        removed++
      }
    }

    return removed
  }

  /**
   * Obtiene las queries más buscadas (top N)
   */
  static getTopQueries(limit: number = 10): Array<{ query: string; hits: number }> {
    const entries = Array.from(this.cache.entries())
      .map(([query, entry]) => ({ query, hits: entry.hits }))
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit)

    return entries
  }
}
