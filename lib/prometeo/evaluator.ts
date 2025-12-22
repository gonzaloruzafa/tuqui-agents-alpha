/**
 * Prometeo Evaluator
 * 
 * Evaluates conditions for conditional tasks using AI (Gemini).
 * The AI uses the agent's system prompt and tools to check if a condition is met.
 */

import { generateText } from 'ai'
import { google } from '@ai-sdk/google'
import type { ConditionEvaluation } from './types'

export interface EvaluateConditionOptions {
    agentSystemPrompt: string
    agentName: string
    condition: string
    taskPrompt: string
}

/**
 * Evaluate if a condition is met using AI
 * 
 * The AI will analyze the condition in natural language and determine
 * if it should trigger a notification.
 * 
 * @returns ConditionEvaluation with shouldNotify, reason, and optional data
 */
export async function evaluateCondition(
    options: EvaluateConditionOptions
): Promise<ConditionEvaluation> {
    const { agentSystemPrompt, agentName, condition, taskPrompt } = options
    
    console.log(`[Evaluator] Checking condition for ${agentName}: "${condition}"`)
    
    try {
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            system: `${agentSystemPrompt}

---
MODO EVALUACIÓN DE CONDICIÓN:
Sos un evaluador de alertas. Tu trabajo es determinar si una condición se cumple o no.

INSTRUCCIONES:
1. Analiza la condición que te dan
2. Usa tu conocimiento y contexto para evaluar si se cumple
3. Responde ESTRICTAMENTE en este formato JSON:
{
  "shouldNotify": true/false,
  "reason": "explicación breve de por qué sí o no se cumple",
  "data": { /* datos relevantes que encontraste, opcional */ }
}

IMPORTANTE: 
- Si la condición se cumple, shouldNotify = true
- Si la condición NO se cumple, shouldNotify = false
- Si no puedes evaluar (falta información), shouldNotify = false con razón explicada
- SOLO responde con el JSON, sin texto adicional`,
            prompt: `CONDICIÓN A EVALUAR: ${condition}

CONTEXTO ADICIONAL: ${taskPrompt}

Evalúa si esta condición se cumple y responde con el JSON.`
        })
        
        // Parse AI response
        const evaluation = parseEvaluationResponse(text)
        
        console.log(`[Evaluator] Result: shouldNotify=${evaluation.shouldNotify}, reason="${evaluation.reason}"`)
        
        return evaluation
        
    } catch (error) {
        console.error('[Evaluator] Error evaluating condition:', error)
        
        // On error, don't notify but log the issue
        return {
            shouldNotify: false,
            reason: `Error evaluating condition: ${error instanceof Error ? error.message : 'Unknown error'}`
        }
    }
}

/**
 * Parse the AI response into a ConditionEvaluation
 */
function parseEvaluationResponse(text: string): ConditionEvaluation {
    try {
        // Try to extract JSON from the response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (!jsonMatch) {
            throw new Error('No JSON found in response')
        }
        
        const parsed = JSON.parse(jsonMatch[0])
        
        return {
            shouldNotify: Boolean(parsed.shouldNotify),
            reason: String(parsed.reason || 'No reason provided'),
            data: parsed.data || undefined
        }
    } catch (e) {
        console.warn('[Evaluator] Failed to parse JSON response, analyzing text:', text)
        
        // Fallback: analyze text for yes/no indicators
        const lowerText = text.toLowerCase()
        const positiveIndicators = ['sí', 'si', 'yes', 'true', 'cumple', 'alerta', 'notificar']
        const shouldNotify = positiveIndicators.some(ind => lowerText.includes(ind))
        
        return {
            shouldNotify,
            reason: text.substring(0, 200)  // Use first 200 chars as reason
        }
    }
}

/**
 * Generate notification content based on evaluation
 */
export async function generateNotificationContent(
    options: {
        agentSystemPrompt: string
        agentName: string
        condition: string
        taskPrompt: string
        evaluationData?: Record<string, unknown>
    }
): Promise<{ title: string; body: string }> {
    const { agentSystemPrompt, agentName, condition, taskPrompt, evaluationData } = options
    
    try {
        const { text } = await generateText({
            model: google('gemini-2.5-flash'),
            system: `${agentSystemPrompt}

---
MODO GENERACIÓN DE NOTIFICACIÓN:
Genera una notificación concisa y clara para alertar al usuario.`,
            prompt: `Se activó la siguiente alerta:
CONDICIÓN: ${condition}
CONTEXTO: ${taskPrompt}
${evaluationData ? `DATOS: ${JSON.stringify(evaluationData)}` : ''}

Genera una notificación con:
1. Un título corto (máximo 50 caracteres)
2. Un cuerpo informativo (máximo 150 caracteres)

Responde en formato JSON:
{"title": "...", "body": "..."}`
        })
        
        // Parse response
        const jsonMatch = text.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            return {
                title: String(parsed.title || `Alerta: ${agentName}`).substring(0, 60),
                body: String(parsed.body || condition).substring(0, 200)
            }
        }
        
        // Fallback
        return {
            title: `Alerta: ${agentName}`,
            body: condition.substring(0, 200)
        }
        
    } catch (error) {
        console.error('[Evaluator] Error generating notification content:', error)
        
        return {
            title: `Alerta: ${agentName}`,
            body: condition.substring(0, 200)
        }
    }
}
