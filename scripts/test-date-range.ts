/**
 * Debug: Ver qué rango de fechas genera el LLM para "primera semana diciembre"
 */
import { config as dotenvConfig } from 'dotenv'
dotenvConfig({ path: '.env.local' })

import { buildDomain, MODEL_CONFIG } from '../lib/tools/odoo/query-builder'

// Simular lo que haría el LLM
const filters = "primera semana diciembre 2025"
const model = "sale.order"

const modelConfig = MODEL_CONFIG[model]
const domain = buildDomain(filters, model)

console.log('Filtro:', filters)
console.log('Dominio generado:', JSON.stringify(domain, null, 2))

// Verificar qué fechas incluye
const dateFilters = domain.filter(d => d[0].includes('date'))
console.log('\nFiltros de fecha:', dateFilters)
