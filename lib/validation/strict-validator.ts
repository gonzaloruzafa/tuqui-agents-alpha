/**
 * StrictValidator - Validación ESTRICTA anti-alucinaciones
 *
 * Filosofía: Si NO está en el tool result, NO puede estar en la respuesta.
 *
 * Este validator es más agresivo que PreSendValidator:
 * 1. Extrae TODOS los nombres del tool result
 * 2. Extrae TODOS los nombres de la respuesta LLM
 * 3. Si hay nombres en la respuesta que NO están en el tool → RECHAZA
 * 4. Si hay montos en la respuesta que NO están en el tool → RECHAZA
 */

// Patrones de respuestas en inglés que indican "pensamiento" interno del LLM
const ENGLISH_THINKING_PATTERNS = [
  /^Clarify\s/i,
  /^The\s+user\s+(is|was|wants|asked|needs)/i,
  /^I\s+need\s+to\s/i,
  /^Let\s+me\s/i,
  /^Based\s+on\s+the\s/i,
  /^According\s+to\s/i,
  /^It\s+seems\s/i,
  /^I\s+should\s/i,
  /^First,?\s+I\s/i,
  /^To\s+answer\s/i,
]

// Nombres genéricos que el LLM inventa frecuentemente
const KNOWN_FAKE_NAMES = [
  'laura gómez', 'laura gomez',
  'carlos pérez', 'carlos perez',
  'maría rodríguez', 'maria rodriguez',
  'jorge lópez', 'jorge lopez',
  'ana martínez', 'ana martinez',
  'juan garcía', 'juan garcia',
  'pedro gonzález', 'pedro gonzalez',
  'sofía fernández', 'sofia fernandez',
  'diego torres',
  'valentina ramírez', 'valentina ramirez',
  'carlos rodriguez',
  'maria gimenez', 'maría giménez',
  'juan perez',
  'lucía fernández', 'lucia fernandez',
  'josé martinez', 'jose martinez',
  'roberto sánchez', 'roberto sanchez',
  'fernanda lópez', 'fernanda lopez',
  'miguel ángel', 'miguel angel',
  'gabriela torres',
  'andrés garcía', 'andres garcia',
]

export interface StrictValidation {
  isClean: boolean
  hasFakeNames: boolean
  hasWrongPeriod: boolean
  hasInventedAmounts: boolean
  hasEnglishThinking: boolean
  hasAbsurdUnassigned: boolean
  fakeNamesFound: string[]
  realNamesFromTool: string[]
  suggestedResponse: string | null
  issues: string[]
}

export interface ToolResultData {
  success: boolean
  data?: any[]
  grouped?: Record<string, any>
  total?: number
  count?: number
}

export class StrictValidator {

  /**
   * Valida respuesta contra tool results de forma ESTRICTA
   */
  static validate(
    llmResponse: string,
    toolResult: ToolResultData,
    context: { userQuery: string; expectedPeriod?: string }
  ): StrictValidation {
    const issues: string[] = []
    const fakeNamesFound: string[] = []

    // 1. Extraer nombres reales del tool result
    const realNames = this.extractNamesFromToolResult(toolResult)

    // 2. Extraer nombres de la respuesta
    const responseNames = this.extractNamesFromText(llmResponse)

    // 3. Detectar nombres falsos conocidos
    for (const name of responseNames) {
      const nameLower = name.toLowerCase()
      if (KNOWN_FAKE_NAMES.includes(nameLower)) {
        fakeNamesFound.push(name)
        issues.push(`Nombre falso detectado: "${name}"`)
      }
    }

    // 4. Detectar nombres que no están en el tool result
    if (realNames.length > 0) {
      for (const responseName of responseNames) {
        const isReal = realNames.some(realName =>
          this.namesMatch(responseName, realName)
        )
        const isFakeKnown = KNOWN_FAKE_NAMES.includes(responseName.toLowerCase())

        if (!isReal && !isFakeKnown) {
          // Nombre que no está en tool ni en lista de fakes conocidos
          // Podría ser fake nuevo
          const looksGeneric = this.looksLikeGenericName(responseName)
          if (looksGeneric) {
            fakeNamesFound.push(responseName)
            issues.push(`Nombre sospechoso no encontrado en datos: "${responseName}"`)
          }
        }
      }
    }

    // 5. Detectar respuesta en inglés (pensamiento filtrado)
    const hasEnglishThinking = this.detectEnglishThinking(llmResponse)
    if (hasEnglishThinking) {
      issues.push('Respuesta en inglés detectada (pensamiento interno filtrado)')
    }

    // 6. Detectar período incorrecto
    const hasWrongPeriod = this.detectWrongPeriod(llmResponse, context.userQuery)
    if (hasWrongPeriod) {
      issues.push('Período temporal incorrecto detectado')
    }

    // 7. Detectar montos inventados
    const hasInventedAmounts = this.detectInventedAmounts(llmResponse, toolResult)
    if (hasInventedAmounts) {
      issues.push('Montos que no corresponden con datos reales')
    }

    // 8. Detectar montos absurdos en "Sin asignar"
    const hasAbsurdUnassigned = this.detectAbsurdUnassigned(toolResult)
    if (hasAbsurdUnassigned) {
      issues.push('Monto absurdo detectado en "Sin asignar" - posible error de datos')
    }

    // 9. Generar respuesta sugerida si hay problemas
    let suggestedResponse: string | null = null
    if (fakeNamesFound.length > 0 || hasWrongPeriod || hasInventedAmounts || hasEnglishThinking || hasAbsurdUnassigned) {
      suggestedResponse = this.generateCleanResponse(toolResult, context)
    }

    return {
      isClean: issues.length === 0,
      hasFakeNames: fakeNamesFound.length > 0,
      hasWrongPeriod,
      hasInventedAmounts,
      hasEnglishThinking,
      hasAbsurdUnassigned,
      fakeNamesFound,
      realNamesFromTool: realNames,
      suggestedResponse,
      issues
    }
  }

  /**
   * Extrae nombres del tool result
   */
  private static extractNamesFromToolResult(toolResult: ToolResultData): string[] {
    const names: string[] = []

    if (toolResult.grouped) {
      names.push(...Object.keys(toolResult.grouped))
    }

    if (toolResult.data && Array.isArray(toolResult.data)) {
      for (const item of toolResult.data) {
        // Campos comunes donde hay nombres
        if (item.partner_id && Array.isArray(item.partner_id)) {
          names.push(item.partner_id[1]) // [id, name]
        }
        if (item.user_id && Array.isArray(item.user_id)) {
          names.push(item.user_id[1])
        }
        if (item.name) {
          names.push(item.name)
        }
        if (item.display_name) {
          names.push(item.display_name)
        }
      }
    }

    return [...new Set(names)]
  }

  /**
   * Extrae nombres de personas del texto
   */
  private static extractNamesFromText(text: string): string[] {
    // Patrón: Palabra capitalizada + Palabra capitalizada (nombre + apellido)
    const namePattern = /([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)+)/g
    const matches = text.match(namePattern) || []

    // Filtrar palabras comunes que no son nombres
    const excluded = [
      'Top Productos', 'Ventas Por', 'Enero De', 'Octubre De',
      'Buenos Aires', 'Santa Fe', 'Entre Ríos', 'Córdoba',
      'Single Bond', 'Bulk Fill', 'Evo Lux'
    ]

    return [...new Set(matches)].filter(name =>
      !excluded.some(ex => name.includes(ex))
    )
  }

  /**
   * Verifica si dos nombres son equivalentes
   */
  private static namesMatch(name1: string, name2: string): boolean {
    const n1 = name1.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    const n2 = name2.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

    // Match exacto
    if (n1 === n2) return true

    // Uno contiene al otro
    if (n1.includes(n2) || n2.includes(n1)) return true

    // Primer nombre igual
    const first1 = n1.split(' ')[0]
    const first2 = n2.split(' ')[0]
    if (first1 === first2 && first1.length > 3) return true

    return false
  }

  /**
   * Detecta si un nombre parece genérico/inventado
   */
  private static looksLikeGenericName(name: string): boolean {
    const genericSurnames = [
      'gómez', 'gomez', 'pérez', 'perez', 'rodríguez', 'rodriguez',
      'lópez', 'lopez', 'martínez', 'martinez', 'garcía', 'garcia',
      'gonzález', 'gonzalez', 'fernández', 'fernandez', 'torres',
      'ramírez', 'ramirez', 'sánchez', 'sanchez', 'giménez', 'gimenez'
    ]

    const nameLower = name.toLowerCase()
    return genericSurnames.some(surname => nameLower.includes(surname))
  }

  /**
   * Detecta respuestas en inglés que filtran "pensamiento interno" del LLM
   * Ejemplos: "Clarify the metric...", "The user is asking...", "I need to..."
   */
  private static detectEnglishThinking(response: string): boolean {
    const trimmed = response.trim()
    for (const pattern of ENGLISH_THINKING_PATTERNS) {
      if (pattern.test(trimmed)) {
        console.warn('[StrictValidator] English thinking detected:', trimmed.slice(0, 100))
        return true
      }
    }
    return false
  }

  /**
   * Detecta montos absurdos en "Sin asignar" o categorías vacías
   * Estos suelen indicar error de agrupación o datos corruptos
   */
  private static detectAbsurdUnassigned(toolResult: ToolResultData): boolean {
    if (!toolResult.grouped) return false

    // Umbral: si "Sin asignar" o similar tiene más de 1 billón, es sospechoso
    const ABSURD_THRESHOLD = 1_000_000_000_000 // 1 trillion
    const suspiciousKeys = ['sin asignar', 'false', 'undefined', 'null', 'n/a', '']

    for (const [key, value] of Object.entries(toolResult.grouped)) {
      const keyLower = key.toLowerCase().trim()
      const isUnassigned = suspiciousKeys.some(s => keyLower === s || keyLower.includes('sin asignar'))
      
      if (isUnassigned && typeof value === 'object' && value.total) {
        if (value.total > ABSURD_THRESHOLD) {
          console.warn(`[StrictValidator] Absurd amount in "${key}": $${value.total.toLocaleString()}`)
          return true
        }
      }
    }

    return false
  }

  /**
   * Detecta si se menciona un período incorrecto
   * Ahora también valida año (2025 vs 2026)
   */
  private static detectWrongPeriod(response: string, userQuery: string): boolean {
    const responseLower = response.toLowerCase()
    const queryLower = userQuery.toLowerCase()

    // Obtener año actual
    const currentYear = new Date().getFullYear()
    const currentMonth = new Date().getMonth() // 0 = enero

    // Si el usuario preguntó por "este mes" o "enero" y la respuesta dice otro mes
    if (queryLower.includes('este mes') || queryLower.includes('enero')) {
      // Meses que NO deberían aparecer (excepto el actual)
      const wrongMonths = ['octubre', 'noviembre', 'diciembre', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre']
      for (const month of wrongMonths) {
        if (responseLower.includes(month)) {
          return true
        }
      }
    }

    // Si preguntó por "ayer" y responde con un mes específico del pasado
    if (queryLower.includes('ayer')) {
      const pastMonths = ['octubre', 'noviembre', 'diciembre 2025']
      for (const month of pastMonths) {
        if (responseLower.includes(month)) {
          return true
        }
      }
    }

    // NUEVO: Detectar año incorrecto
    // Si estamos en 2026 y la respuesta menciona 2024 o 2025 como si fuera actual
    const yearPattern = /\b(202[0-5])\b/g
    const yearMatches = responseLower.match(yearPattern)
    
    if (yearMatches && currentYear === 2026) {
      // Si el usuario pregunta por "este mes" o "hoy" y la respuesta dice 2024/2025
      if (queryLower.includes('este mes') || queryLower.includes('hoy') || queryLower.includes('enero 2026')) {
        for (const year of yearMatches) {
          if (parseInt(year) < currentYear) {
            // Verificar que no sea una comparación legítima (ej: "comparado con 2025")
            const comparisonTerms = ['comparado', 'versus', 'vs', 'anterior', 'pasado', 'respecto']
            const hasComparison = comparisonTerms.some(term => responseLower.includes(term))
            if (!hasComparison) {
              console.warn(`[StrictValidator] Wrong year detected: ${year} (current: ${currentYear})`)
              return true
            }
          }
        }
      }
    }

    return false
  }

  /**
   * Detecta montos que no corresponden con el tool result
   */
  private static detectInventedAmounts(response: string, toolResult: ToolResultData): boolean {
    if (!toolResult.grouped && !toolResult.total) return false

    // Extraer montos del tool result
    const realAmounts = new Set<number>()

    if (toolResult.total) {
      realAmounts.add(Math.round(toolResult.total))
    }

    if (toolResult.grouped) {
      for (const value of Object.values(toolResult.grouped)) {
        if (typeof value === 'object' && value.total) {
          realAmounts.add(Math.round(value.total))
        }
      }
    }

    if (realAmounts.size === 0) return false

    // Extraer montos de la respuesta
    const amountPattern = /\$\s*([\d.]+)/g
    const matches = [...response.matchAll(amountPattern)]

    for (const match of matches) {
      const amountStr = match[1].replace(/\./g, '')
      const amount = parseInt(amountStr, 10)

      if (isNaN(amount) || amount < 1000) continue

      // Verificar si este monto está cerca de algún monto real
      let isClose = false
      for (const real of realAmounts) {
        const diff = Math.abs(amount - real) / real
        if (diff < 0.1) { // 10% de tolerancia
          isClose = true
          break
        }
      }

      if (!isClose) {
        return true // Monto inventado
      }
    }

    return false
  }

  /**
   * Genera una respuesta limpia basada solo en el tool result
   */
  private static generateCleanResponse(
    toolResult: ToolResultData,
    context: { userQuery: string }
  ): string {
    if (!toolResult.success) {
      return '❌ No se pudieron obtener los datos. Por favor, intentá de nuevo.'
    }

    // Si está vacío
    if (this.isEmptyResult(toolResult)) {
      return '$ 0 en el período consultado. No hay datos para mostrar.'
    }

    // Construir respuesta con datos reales
    let response = ''

    if (toolResult.grouped && Object.keys(toolResult.grouped).length > 0) {
      const entries = Object.entries(toolResult.grouped)
        .sort((a: any, b: any) => (b[1].total || 0) - (a[1].total || 0))
        .slice(0, 10)

      response = '*Datos del período:*\n\n'

      for (let i = 0; i < entries.length; i++) {
        const [name, data] = entries[i] as [string, any]
        const total = data.total || 0
        response += `${i + 1}. *${name}* - $ ${Math.round(total).toLocaleString('es-AR')}\n`
      }

      if (toolResult.total) {
        response += `\n*Total:* $ ${Math.round(toolResult.total).toLocaleString('es-AR')}`
      }
    } else if (toolResult.total !== undefined) {
      response = `Total: $ ${Math.round(toolResult.total).toLocaleString('es-AR')}`
    } else {
      response = 'Datos procesados correctamente.'
    }

    return response
  }

  private static isEmptyResult(result: ToolResultData): boolean {
    if (!result.success) return true
    if (result.total !== undefined && result.total === 0) return true
    if (Array.isArray(result.data) && result.data.length === 0) return true
    if (result.grouped !== undefined && Object.keys(result.grouped).length === 0) return true
    return false
  }
}
