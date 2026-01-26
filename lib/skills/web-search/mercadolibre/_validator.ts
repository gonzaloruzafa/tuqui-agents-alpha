/**
 * MLLinkValidator - Validación de URLs de MercadoLibre
 *
 * Problema: El scraping a veces retorna URLs de listado en vez de producto
 * Solución: Validar y filtrar solo URLs de producto válidas
 *
 * @example
 * const isValid = MLLinkValidator.isProductURL(url)
 * const productId = MLLinkValidator.extractProductId(url)
 * const validated = await MLLinkValidator.validateLinks([url1, url2])
 */

// ============================================
// TYPES
// ============================================

export interface ValidationResult {
  url: string
  valid: boolean
  isProduct: boolean
  productId: string | null
  httpOk?: boolean
  error?: string
}

export interface BatchValidationResult {
  valid: ValidationResult[]
  invalid: ValidationResult[]
  totalChecked: number
  validCount: number
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Patrones de URLs de producto por país
 * Formato: /MLA-123456 (publicación) o /p/MLA123456 (catálogo)
 */
const PRODUCT_ID_PATTERNS = [
  /\/(MLA-?\d+)/i, // Argentina (con o sin guión)
  /\/(MLB-?\d+)/i, // Brasil
  /\/(MLM-?\d+)/i, // México
  /\/(MLC-?\d+)/i, // Chile
  /\/(MCO-?\d+)/i, // Colombia
  /\/(MLU-?\d+)/i, // Uruguay
  /\/(MPE-?\d+)/i, // Perú
  /\/(MLV-?\d+)/i, // Venezuela
]

/**
 * Palabras que indican URL de listado/búsqueda (no producto)
 */
const LISTING_KEYWORDS = [
  'listado',
  'busca',
  'search',
  'resultados',
  'categoria',
  'category',
  '/s/',
  '/ofertas',
]

// ============================================
// MAIN VALIDATOR CLASS
// ============================================

export class MLLinkValidator {
  /**
   * Verifica si es URL de producto (no de listado)
   */
  static isProductURL(url: string): boolean {
    // Must contain product ID
    const hasProductId = PRODUCT_ID_PATTERNS.some((pattern) => pattern.test(url))
    if (!hasProductId) return false

    // Must NOT contain listing keywords
    const urlLower = url.toLowerCase()
    const isListing = LISTING_KEYWORDS.some((keyword) => urlLower.includes(keyword))
    if (isListing) return false

    // Must be from mercadolibre domain
    return this.isMercadoLibreDomain(url)
  }

  /**
   * Extrae ID de producto de la URL
   * Ejemplo: "https://articulo.mercadolibre.com.ar/MLA-123456-turbina" → "MLA-123456"
   */
  static extractProductId(url: string): string | null {
    for (const pattern of PRODUCT_ID_PATTERNS) {
      const match = url.match(pattern)
      if (match) {
        return match[1] // Retorna MLA-123456
      }
    }
    return null
  }

  /**
   * Normaliza URL a formato canónico de producto
   * Convierte cualquier URL de ML a formato /articulo/ si es producto
   */
  static normalizeURL(url: string): string {
    const productId = this.extractProductId(url)
    if (!productId) return url

    // Detectar país del producto ID
    const countryCode = productId.substring(0, 3).toLowerCase()
    const domain = this.getDomainForCountry(countryCode)

    return `https://articulo.${domain}/${productId}`
  }

  /**
   * Verifica si es dominio de MercadoLibre
   */
  static isMercadoLibreDomain(url: string): boolean {
    const domains = [
      'mercadolibre.com.ar',
      'mercadolibre.com.mx',
      'mercadolibre.com.br',
      'mercadolibre.cl',
      'mercadolibre.com.co',
      'mercadolibre.com.uy',
      'mercadolibre.com.pe',
      'mercadolibre.com.ve',
      'mercadolivre.com.br',
      'articulo.mercadolibre.com.ar',
      'articulo.mercadolibre.com.mx',
      'produto.mercadolivre.com.br',
    ]

    const urlLower = url.toLowerCase()
    return domains.some((domain) => urlLower.includes(domain))
  }

  /**
   * Valida links HTTP (chequea que respondan 200)
   * Con timeout de 3 segundos para no bloquear
   */
  static async validateLinks(
    urls: string[],
    checkHTTP: boolean = false
  ): Promise<BatchValidationResult> {
    const results: ValidationResult[] = []

    for (const url of urls) {
      const isProduct = this.isProductURL(url)
      const productId = this.extractProductId(url)

      let httpOk: boolean | undefined
      let error: string | undefined

      // Opcional: verificar HTTP
      if (checkHTTP && isProduct) {
        try {
          httpOk = await this.checkHTTP(url)
          if (!httpOk) {
            error = 'HTTP check failed (not 200)'
          }
        } catch (e: any) {
          httpOk = false
          error = `HTTP error: ${e.message}`
        }
      }

      const valid = checkHTTP ? isProduct && httpOk === true : isProduct

      results.push({
        url,
        valid,
        isProduct,
        productId,
        httpOk,
        error,
      })
    }

    const valid = results.filter((r) => r.valid)
    const invalid = results.filter((r) => !r.valid)

    return {
      valid,
      invalid,
      totalChecked: results.length,
      validCount: valid.length,
    }
  }

  /**
   * Chequea que un link responda con 200 (HEAD request)
   * Timeout de 3 segundos
   */
  private static async checkHTTP(url: string): Promise<boolean> {
    try {
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 3000)

      const res = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      })

      clearTimeout(timeoutId)
      return res.ok // 200-299
    } catch (error) {
      return false
    }
  }

  /**
   * Helper: Obtiene dominio según código de país
   */
  private static getDomainForCountry(countryCode: string): string {
    const domains: Record<string, string> = {
      mla: 'mercadolibre.com.ar',
      mlb: 'mercadolivre.com.br',
      mlm: 'mercadolibre.com.mx',
      mlc: 'mercadolibre.cl',
      mco: 'mercadolibre.com.co',
      mlu: 'mercadolibre.com.uy',
      mpe: 'mercadolibre.com.pe',
      mlv: 'mercadolibre.com.ve',
    }

    return domains[countryCode] || 'mercadolibre.com.ar'
  }

  /**
   * Filtra array de URLs y retorna solo las válidas
   */
  static filterValidURLs(urls: string[]): string[] {
    return urls.filter((url) => this.isProductURL(url))
  }

  /**
   * Extrae todos los product IDs de un array de URLs
   */
  static extractAllProductIds(urls: string[]): string[] {
    return urls.map((url) => this.extractProductId(url)).filter((id): id is string => id !== null)
  }
}
