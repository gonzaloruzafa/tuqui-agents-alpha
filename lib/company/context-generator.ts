import { google } from '@ai-sdk/google'
import { generateText } from 'ai'

export interface CompanyConfig {
    company_name?: string | null
    company_cuit?: string | null
    company_industry?: string | null
    company_description?: string | null
    company_location?: string | null
    company_employees_count?: string | null
    company_products_services?: string | null
    company_target_customers?: string | null
    company_special_instructions?: string | null
}

export async function generateCompanyContext(config: CompanyConfig): Promise<string> {
    // If no meaningful data, return empty
    const hasData = Object.values(config).some(v => v && v.trim().length > 0)
    if (!hasData) {
        return ''
    }

    const prompt = `Basándote en la siguiente información de una empresa, generá un párrafo de contexto conciso (máximo 200 palabras) que sirva como instrucción para un agente de IA. El contexto debe permitir al agente personalizar sus respuestas conociendo el negocio del usuario.

INFORMACIÓN DE LA EMPRESA:
${config.company_name ? `- Nombre: ${config.company_name}` : ''}
${config.company_cuit ? `- CUIT: ${config.company_cuit}` : ''}
${config.company_industry ? `- Industria/Rubro: ${config.company_industry}` : ''}
${config.company_description ? `- Descripción: ${config.company_description}` : ''}
${config.company_location ? `- Ubicación: ${config.company_location}` : ''}
${config.company_employees_count ? `- Empleados: ${config.company_employees_count}` : ''}
${config.company_products_services ? `- Productos/Servicios: ${config.company_products_services}` : ''}
${config.company_target_customers ? `- Clientes objetivo: ${config.company_target_customers}` : ''}
${config.company_special_instructions ? `- Instrucciones especiales: ${config.company_special_instructions}` : ''}

GENERA un contexto en formato de instrucción para el agente, comenzando con "El usuario pertenece a..." o "Estás asistiendo a un usuario de...". Incluí los datos relevantes de forma natural. NO incluyas información que no se haya proporcionado.`

    try {
        const { text } = await generateText({
            model: google('gemini-3-flash-preview'),
            prompt,
        })

        return text.trim()
    } catch (error) {
        console.error('Error generating company context:', error)
        // Fallback: generate a simple context manually
        return generateFallbackContext(config)
    }
}

function generateFallbackContext(config: CompanyConfig): string {
    const parts: string[] = []
    
    if (config.company_name) {
        parts.push(`El usuario pertenece a ${config.company_name}`)
    }
    
    if (config.company_industry) {
        parts.push(`una empresa del sector ${config.company_industry}`)
    }
    
    if (config.company_location) {
        parts.push(`ubicada en ${config.company_location}`)
    }
    
    if (config.company_description) {
        parts.push(`. ${config.company_description}`)
    }
    
    if (config.company_products_services) {
        parts.push(`. Sus principales productos/servicios son: ${config.company_products_services}`)
    }
    
    if (config.company_target_customers) {
        parts.push(`. Sus clientes objetivo son: ${config.company_target_customers}`)
    }
    
    if (config.company_special_instructions) {
        parts.push(`. Instrucciones especiales: ${config.company_special_instructions}`)
    }
    
    if (parts.length === 0) return ''
    
    return parts.join(', ').replace(/, \./g, '.')
}
