/**
 * Internal Test API
 * 
 * Runs automated tests after each deploy to verify:
 * - Routing works correctly
 * - Tools are accessible
 * - Agents load properly
 * - Database connections work
 * 
 * Usage: GET /api/internal/test?key=INTERNAL_TEST_KEY
 */

import { NextRequest } from 'next/server'
import { getClient } from '@/lib/supabase/client'
import { routeMessage, getSubAgents } from '@/lib/agents/router'
import { getToolsForAgent } from '@/lib/tools/executor'

const INTERNAL_TEST_KEY = process.env.INTERNAL_TEST_KEY || 'test-key-change-me'

interface TestResult {
    name: string
    passed: boolean
    duration: number
    error?: string
    details?: any
}

interface TestSuite {
    timestamp: string
    environment: string
    totalTests: number
    passed: number
    failed: number
    duration: number
    results: TestResult[]
}

// Test tenant ID (use a real one from your DB or create a test tenant)
const TEST_TENANT_ID = process.env.TEST_TENANT_ID || ''

async function runTest(name: string, fn: () => Promise<any>): Promise<TestResult> {
    const start = Date.now()
    try {
        const details = await fn()
        return {
            name,
            passed: true,
            duration: Date.now() - start,
            details
        }
    } catch (error: any) {
        return {
            name,
            passed: false,
            duration: Date.now() - start,
            error: error.message
        }
    }
}

// =============================================================================
// TEST CASES
// =============================================================================

async function testDatabaseConnection(): Promise<any> {
    const db = getClient()
    const { data, error } = await db.from('tenants').select('id').limit(1)
    if (error) throw new Error(`DB Error: ${error.message}`)
    return { connected: true, tenantFound: !!data?.length }
}

async function testAgentsExist(): Promise<any> {
    const db = getClient()
    const { data: masters, error } = await db
        .from('master_agents')
        .select('slug, name, tools')
        .eq('is_published', true)
    
    if (error) throw new Error(`DB Error: ${error.message}`)
    if (!masters?.length) throw new Error('No master agents found')
    
    return {
        count: masters.length,
        agents: masters.map(a => ({ slug: a.slug, name: a.name, tools: a.tools }))
    }
}

async function testRoutingMeli(): Promise<any> {
    if (!TEST_TENANT_ID) return { skipped: true, reason: 'No TEST_TENANT_ID configured' }
    
    const result = await routeMessage(TEST_TENANT_ID, 'cuanto cuestan los botines puma en mercadolibre?', [])
    
    if (!result.selectedAgent) throw new Error('No agent selected')
    
    // Should route to meli or mercado-related agent
    const isMeliRelated = result.selectedAgent.slug.includes('meli') || 
                          result.scores['mercado'] > 0
    
    return {
        selectedAgent: result.selectedAgent.slug,
        confidence: result.confidence,
        reason: result.reason,
        scores: result.scores,
        isMeliRelated
    }
}

async function testRoutingOdoo(): Promise<any> {
    if (!TEST_TENANT_ID) return { skipped: true, reason: 'No TEST_TENANT_ID configured' }
    
    const result = await routeMessage(TEST_TENANT_ID, 'cuanto vendimos en diciembre 2025?', [])
    
    if (!result.selectedAgent) throw new Error('No agent selected')
    
    // Should route to odoo/erp-related agent
    const isErpRelated = result.selectedAgent.slug.includes('odoo') || 
                         result.selectedAgent.slug.includes('erp') ||
                         result.scores['erp'] > 0
    
    return {
        selectedAgent: result.selectedAgent.slug,
        confidence: result.confidence,
        reason: result.reason,
        scores: result.scores,
        isErpRelated
    }
}

async function testRoutingGeneral(): Promise<any> {
    if (!TEST_TENANT_ID) return { skipped: true, reason: 'No TEST_TENANT_ID configured' }
    
    const result = await routeMessage(TEST_TENANT_ID, 'hola como estas?', [])
    
    if (!result.selectedAgent) throw new Error('No agent selected')
    
    return {
        selectedAgent: result.selectedAgent.slug,
        confidence: result.confidence,
        reason: result.reason,
        scores: result.scores
    }
}

async function testSubAgentsLoad(): Promise<any> {
    if (!TEST_TENANT_ID) return { skipped: true, reason: 'No TEST_TENANT_ID configured' }
    
    const agents = await getSubAgents(TEST_TENANT_ID)
    
    if (!agents.length) throw new Error('No sub-agents loaded')
    
    return {
        count: agents.length,
        agents: agents.map(a => ({ slug: a.slug, name: a.name, toolsCount: a.tools.length }))
    }
}

async function testToolsLoad(): Promise<any> {
    if (!TEST_TENANT_ID) return { skipped: true, reason: 'No TEST_TENANT_ID configured' }
    
    // Test loading web tools
    const webTools = await getToolsForAgent(TEST_TENANT_ID, ['web_search'])
    const webToolNames = Object.keys(webTools)
    
    // Test loading odoo tools
    const odooTools = await getToolsForAgent(TEST_TENANT_ID, ['odoo_intelligent_query'])
    const odooToolNames = Object.keys(odooTools)
    
    return {
        webTools: webToolNames,
        odooTools: odooToolNames,
        webToolsLoaded: webToolNames.length > 0,
        odooToolsLoaded: odooToolNames.length > 0
    }
}

async function testTavilyConfigured(): Promise<any> {
    const hasKey = !!process.env.TAVILY_API_KEY
    if (!hasKey) throw new Error('TAVILY_API_KEY not configured')
    return { configured: true }
}

async function testFirecrawlConfigured(): Promise<any> {
    const hasKey = !!process.env.FIRECRAWL_API_KEY
    if (!hasKey) throw new Error('FIRECRAWL_API_KEY not configured')
    return { configured: true }
}

async function testGeminiConfigured(): Promise<any> {
    const hasKey = !!process.env.GEMINI_API_KEY
    if (!hasKey) throw new Error('GEMINI_API_KEY not configured')
    return { configured: true }
}

// =============================================================================
// MAIN HANDLER
// =============================================================================

export async function GET(req: NextRequest) {
    // Auth check
    const key = req.nextUrl.searchParams.get('key')
    if (key !== INTERNAL_TEST_KEY) {
        return new Response('Unauthorized', { status: 401 })
    }

    const startTime = Date.now()
    const results: TestResult[] = []

    // Run all tests
    results.push(await runTest('Database Connection', testDatabaseConnection))
    results.push(await runTest('Master Agents Exist', testAgentsExist))
    results.push(await runTest('Gemini API Configured', testGeminiConfigured))
    results.push(await runTest('Tavily API Configured', testTavilyConfigured))
    results.push(await runTest('Firecrawl API Configured', testFirecrawlConfigured))
    results.push(await runTest('Sub-Agents Load', testSubAgentsLoad))
    results.push(await runTest('Tools Load', testToolsLoad))
    results.push(await runTest('Routing: MeLi Query', testRoutingMeli))
    results.push(await runTest('Routing: Odoo Query', testRoutingOdoo))
    results.push(await runTest('Routing: General Query', testRoutingGeneral))

    const suite: TestSuite = {
        timestamp: new Date().toISOString(),
        environment: process.env.VERCEL_ENV || 'development',
        totalTests: results.length,
        passed: results.filter(r => r.passed).length,
        failed: results.filter(r => !r.passed).length,
        duration: Date.now() - startTime,
        results
    }

    // Log summary
    console.log(`[Tests] ${suite.passed}/${suite.totalTests} passed in ${suite.duration}ms`)
    results.filter(r => !r.passed).forEach(r => {
        console.error(`[Tests] FAILED: ${r.name} - ${r.error}`)
    })

    const status = suite.failed === 0 ? 200 : 500

    return new Response(JSON.stringify(suite, null, 2), {
        status,
        headers: { 'Content-Type': 'application/json' }
    })
}
