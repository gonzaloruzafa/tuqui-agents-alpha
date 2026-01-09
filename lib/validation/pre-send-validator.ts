/**
 * PreSendValidator - Validación ANTES de enviar respuesta al usuario
 *
 * Intercepta respuestas del LLM y las valida ANTES de mostrarlas.
 * Si detecta alucinaciones, rechaza la respuesta y fuerza regeneración.
 *
 * @example
 * const validation = PreSendValidator.validate(llmResponse, toolResults)
 * if (!validation.approved) {
 *   // Regenerar con prompt correctivo
 *   return regenerateWithCorrection(validation.issues)
 * }
 */

import { ResponseGuard, HallucinationWarning } from './response-guard'

// ============================================
// TYPES
// ============================================

export interface PreSendValidation {
  approved: boolean
  issues: ValidationIssue[]
  confidence: number // 0-100
  action: 'send' | 'regenerate' | 'warn'
}

export interface ValidationIssue {
  type: 'hallucination' | 'inconsistency' | 'missing_data'
  severity: 'critical' | 'high' | 'medium' | 'low'
  description: string
  suggestion: string
}

export interface ToolResult {
  success: boolean
  data?: any[]
  grouped?: Record<string, any>
  total?: number
  error?: string
}

// ============================================
// VALIDATOR CLASS
// ============================================

export class PreSendValidator {
  /**
   * Valida respuesta ANTES de enviarla al usuario
   */
  static validate(
    llmResponse: string,
    toolResults?: ToolResult[],
    context?: { userQuery: string }
  ): PreSendValidation {
    const issues: ValidationIssue[] = []
    let confidence = 100

    // 1. Detectar alucinaciones de nombres
    const hallucination = ResponseGuard.detectHallucination(llmResponse)
    if (hallucination) {
      issues.push({
        type: 'hallucination',
        severity: 'critical',
        description: `Nombre genérico detectado: ${hallucination.pattern}`,
        suggestion: 'Usar solo nombres que vienen de los tool results',
      })
      confidence -= 50
    }

    // 2. Verificar consistencia con tool results
    if (toolResults && toolResults.length > 0) {
      const consistencyIssues = this.checkConsistency(llmResponse, toolResults)
      issues.push(...consistencyIssues)
      confidence -= consistencyIssues.length * 15
    }

    // 3. Detectar montos sospechosos (números redondos inventados)
    const suspiciousNumbers = this.detectSuspiciousNumbers(llmResponse, toolResults)
    if (suspiciousNumbers.length > 0) {
      issues.push(...suspiciousNumbers)
      confidence -= suspiciousNumbers.length * 10
    }

    // 4. Verificar que usa datos del tool cuando están disponibles
    if (toolResults && this.hasRealData(toolResults)) {
      const dataUsage = this.checkDataUsage(llmResponse, toolResults)
      if (!dataUsage.used) {
        issues.push({
          type: 'missing_data',
          severity: 'high',
          description: 'Hay datos reales disponibles pero no se usaron',
          suggestion: 'Usar los datos que retornó el tool',
        })
        confidence -= 30
      }
    }

    // Determinar acción
    let action: 'send' | 'regenerate' | 'warn' = 'send'

    if (confidence < 50 || issues.some((i) => i.severity === 'critical')) {
      action = 'regenerate'
    } else if (confidence < 70) {
      action = 'warn'
    }

    return {
      approved: action === 'send',
      issues,
      confidence: Math.max(0, confidence),
      action,
    }
  }

  /**
   * Verifica consistencia entre respuesta y tool results
   */
  private static checkConsistency(response: string, toolResults: ToolResult[]): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    for (const result of toolResults) {
      // Si el tool devolvió vacío pero la respuesta tiene datos
      if (this.isEmptyResult(result) && this.hasNumericData(response)) {
        // Verificar que no sean números inventados
        const numbers = this.extractNumbers(response)
        const hasSignificantNumbers = numbers.some((n) => n > 1000)

        if (hasSignificantNumbers) {
          issues.push({
            type: 'inconsistency',
            severity: 'critical',
            description: 'Tool devolvió vacío pero respuesta tiene montos significativos',
            suggestion: 'Si no hay datos, responder "$ 0" o "No hay datos"',
          })
        }
      }

      // Si el tool tiene datos con nombres específicos
      if (result.grouped) {
        const realNames = Object.keys(result.grouped)
        const hasGenericInResponse = this.containsGenericNames(response)

        if (realNames.length > 0 && hasGenericInResponse) {
          issues.push({
            type: 'hallucination',
            severity: 'critical',
            description: 'Hay nombres reales en el tool pero se usaron nombres genéricos',
            suggestion: `Usar nombres del tool: ${realNames.slice(0, 3).join(', ')}`,
          })
        }
      }
    }

    return issues
  }

  /**
   * Detecta números sospechosos (muy redondos, probablemente inventados)
   */
  private static detectSuspiciousNumbers(
    response: string,
    toolResults?: ToolResult[]
  ): ValidationIssue[] {
    const issues: ValidationIssue[] = []

    // Si hay tool results, extraer números reales
    const realNumbers = new Set<number>()
    if (toolResults) {
      for (const result of toolResults) {
        if (result.grouped) {
          Object.values(result.grouped).forEach((item: any) => {
            if (typeof item.total === 'number') realNumbers.add(Math.round(item.total))
            if (typeof item.count === 'number') realNumbers.add(item.count)
          })
        }
        if (typeof result.total === 'number') {
          realNumbers.add(Math.round(result.total))
        }
      }
    }

    // Extraer números de la respuesta
    const responseNumbers = this.extractNumbers(response)

    // Verificar números sospechosos
    for (const num of responseNumbers) {
      if (num > 10000) {
        // Números muy redondos (terminan en muchos ceros)
        const isVeryRound = num % 100000 === 0 || num % 50000 === 0

        // No está en los números reales del tool
        const notInToolResults = realNumbers.size > 0 && !this.isCloseToAny(num, realNumbers)

        if (isVeryRound && notInToolResults) {
          issues.push({
            type: 'hallucination',
            severity: 'high',
            description: `Número sospechoso: ${num} (muy redondo y no está en tool results)`,
            suggestion: 'Usar números exactos del tool result',
          })
        }
      }
    }

    return issues
  }

  /**
   * Verifica que se usen los datos del tool
   */
  private static checkDataUsage(
    response: string,
    toolResults: ToolResult[]
  ): { used: boolean; reason?: string } {
    // Si hay nombres en grouped, verificar que aparezcan en la respuesta
    for (const result of toolResults) {
      if (result.grouped) {
        const names = Object.keys(result.grouped)
        if (names.length > 0) {
          // Al menos el 50% de los nombres deberían aparecer
          const usedCount = names.filter((name) =>
            response.toLowerCase().includes(name.toLowerCase().substring(0, 20))
          ).length

          if (usedCount / names.length < 0.3) {
            return {
              used: false,
              reason: `Solo ${usedCount}/${names.length} nombres del tool aparecen en respuesta`,
            }
          }
        }
      }
    }

    return { used: true }
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private static isEmptyResult(result: ToolResult): boolean {
    return (
      !result.success ||
      result.total === 0 ||
      (Array.isArray(result.data) && result.data.length === 0) ||
      (result.grouped && Object.keys(result.grouped).length === 0)
    )
  }

  private static hasRealData(toolResults: ToolResult[]): boolean {
    return toolResults.some((r) => !this.isEmptyResult(r))
  }

  private static hasNumericData(text: string): boolean {
    // Buscar patrones como "$ 123.456" o números > 100
    return /\$\s*[\d.]+|\b[1-9]\d{2,}\b/.test(text)
  }

  private static extractNumbers(text: string): number[] {
    // Extraer números con formato argentino: 1.234.567 o 1234567
    const matches = text.match(/\$?\s*([\d.]+)/g) || []
    return matches
      .map((m) => {
        const clean = m.replace(/[$\s.]/g, '')
        return parseInt(clean, 10)
      })
      .filter((n) => !isNaN(n) && n > 0)
  }

  private static containsGenericNames(text: string): boolean {
    const warning = ResponseGuard.detectHallucination(text)
    return warning !== null && warning.type === 'potential_hallucination'
  }

  private static isCloseToAny(num: number, set: Set<number>, tolerance: number = 0.05): boolean {
    for (const real of set) {
      const diff = Math.abs(num - real) / real
      if (diff < tolerance) return true
    }
    return false
  }

  /**
   * Genera prompt correctivo para regeneración
   */
  static generateCorrectionPrompt(validation: PreSendValidation): string {
    if (validation.approved) return ''

    const criticalIssues = validation.issues.filter((i) => i.severity === 'critical')

    let prompt = '⚠️ Tu respuesta anterior tuvo problemas. Regenerar con estas correcciones:\n\n'

    for (const issue of criticalIssues) {
      prompt += `- ${issue.description}\n`
      prompt += `  → ${issue.suggestion}\n\n`
    }

    prompt += 'REGLA ABSOLUTA: Solo usar datos que vienen del tool result. Si no hay datos, decir "$ 0" o "No hay datos".'

    return prompt
  }
}
