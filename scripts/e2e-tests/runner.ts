/**
 * E2E Test Runner for Tuqui Agents
 * 
 * Executes test suite against the chat API and generates detailed reports.
 * 
 * Usage:
 *   npx tsx scripts/e2e-tests/runner.ts                    # Run all tests against prod
 *   npx tsx scripts/e2e-tests/runner.ts --env local        # Run against localhost
 *   npx tsx scripts/e2e-tests/runner.ts --suite odoo       # Run only odoo tests
 *   npx tsx scripts/e2e-tests/runner.ts --subset critical  # Run critical subset for CI
 */

import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'

// =============================================================================
// CONFIGURATION
// =============================================================================

const CONFIG = {
    prodUrl: 'https://tuqui-agents-alpha.vercel.app',
    localUrl: 'http://localhost:3000',
    testEndpoint: '/api/internal/chat-test',
    internalKey: process.env.INTERNAL_TEST_KEY || 'test-key-change-in-prod',
    tenantId: process.env.TEST_TENANT_ID || '', // Will be loaded from suite or env
    delayBetweenTests: 1500,    // ms between tests to avoid rate limits
    delayBetweenSuites: 3000,   // ms between test suites
    maxRetries: 2,
    timeoutMs: 60000
}

// =============================================================================
// TYPES
// =============================================================================

interface TestMessage {
    role: 'user' | 'assistant'
    content: string
}

interface TestExpectations {
    shouldRouteToAgent?: string
    shouldHaveData?: boolean
    shouldContain?: string[]
    shouldNotContain?: string[]
    shouldUseContext?: boolean
    shouldHaveError?: boolean
    maxLatencyMs?: number
}

interface Test {
    id: string
    messages: TestMessage[]
    expectations: TestExpectations
    description?: string
    critical?: boolean
}

interface TestSuite {
    id: string
    name: string
    category: string
    description?: string
    tests: Test[]
}

interface TestResult {
    testId: string
    suiteId: string
    passed: boolean
    latencyMs: number
    response: string
    routing: {
        selectedAgent: string | null
        confidence: string
    }
    quality: {
        hasNumericData: boolean
        hasList: boolean
        hasError: boolean
        usedContext: boolean
    }
    failures: string[]
    apiError?: string
}

interface SuiteResult {
    suiteId: string
    suiteName: string
    category: string
    passed: number
    failed: number
    totalLatencyMs: number
    avgLatencyMs: number
    tests: TestResult[]
}

// =============================================================================
// UTILITIES
// =============================================================================

function parseArgs(): { env: string; suite?: string; subset?: string; verbose: boolean; concurrent: number } {
    const args = process.argv.slice(2)
    const result = { env: 'prod', suite: undefined as string | undefined, subset: undefined as string | undefined, verbose: false, concurrent: 1 }
    
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--env' && args[i + 1]) {
            result.env = args[i + 1]
            i++
        } else if (args[i] === '--suite' && args[i + 1]) {
            result.suite = args[i + 1]
            i++
        } else if (args[i] === '--subset' && args[i + 1]) {
            result.subset = args[i + 1]
            i++
        } else if (args[i] === '--concurrent' && args[i + 1]) {
            result.concurrent = parseInt(args[i + 1], 10) || 1
            i++
        } else if (args[i] === '--verbose' || args[i] === '-v') {
            result.verbose = true
        }
    }
    
    return result
}

function sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
}

function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str
    return str.slice(0, maxLen - 3) + '...'
}

// =============================================================================
// TEST EXECUTION
// =============================================================================

async function runTest(
    baseUrl: string,
    tenantId: string,
    suiteId: string,
    test: Test,
    verbose: boolean
): Promise<TestResult> {
    const startTime = Date.now()
    const failures: string[] = []
    
    const sessionId = `e2e-${suiteId}-${test.id}-${Date.now()}`
    
    try {
        const response = await fetch(`${baseUrl}${CONFIG.testEndpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Internal-Key': CONFIG.internalKey
            },
            body: JSON.stringify({
                tenantId,
                messages: test.messages,
                sessionId,
                streaming: false
            }),
            signal: AbortSignal.timeout(CONFIG.timeoutMs)
        })
        
        if (!response.ok) {
            const errorText = await response.text()
            return {
                testId: test.id,
                suiteId,
                passed: false,
                latencyMs: Date.now() - startTime,
                response: '',
                routing: { selectedAgent: null, confidence: 'none' },
                quality: { hasNumericData: false, hasList: false, hasError: true, usedContext: false },
                failures: [`HTTP ${response.status}: ${errorText}`],
                apiError: errorText
            }
        }
        
        const result = await response.json()
        
        // Validate expectations
        const exp = test.expectations
        
        // Routing check
        if (exp.shouldRouteToAgent && result.routing?.selectedAgent !== exp.shouldRouteToAgent) {
            failures.push(`Routing: expected ${exp.shouldRouteToAgent}, got ${result.routing?.selectedAgent || 'none'}`)
        }
        
        // Data check
        if (exp.shouldHaveData && !result.quality?.hasNumericData) {
            failures.push('Expected numeric data in response')
        }
        
        // Content contains
        if (exp.shouldContain) {
            for (const keyword of exp.shouldContain) {
                if (!result.response?.toLowerCase().includes(keyword.toLowerCase())) {
                    failures.push(`Response should contain "${keyword}"`)
                }
            }
        }
        
        // Content not contains
        if (exp.shouldNotContain) {
            for (const keyword of exp.shouldNotContain) {
                if (result.response?.toLowerCase().includes(keyword.toLowerCase())) {
                    failures.push(`Response should NOT contain "${keyword}"`)
                }
            }
        }
        
        // Context usage
        if (exp.shouldUseContext && !result.quality?.usedContext) {
            // Check manually if response seems to understand context
            const hasContextClue = !/(?:¿(?:a qué|cuál|qué)\s+te\s+refer|no\s+entiendo|especific)/i.test(result.response || '')
            if (!hasContextClue) {
                failures.push('Expected response to use conversation context')
            }
        }
        
        // Error expected
        if (exp.shouldHaveError && !result.quality?.hasError && result.success) {
            failures.push('Expected an error response')
        }
        
        // Latency check
        if (exp.maxLatencyMs && result.latencyMs > exp.maxLatencyMs) {
            failures.push(`Latency ${result.latencyMs}ms exceeded max ${exp.maxLatencyMs}ms`)
        }
        
        return {
            testId: test.id,
            suiteId,
            passed: failures.length === 0,
            latencyMs: result.latencyMs || (Date.now() - startTime),
            response: result.response || '',
            routing: result.routing || { selectedAgent: null, confidence: 'none' },
            quality: result.quality || { hasNumericData: false, hasList: false, hasError: false, usedContext: false },
            failures
        }
        
    } catch (error: any) {
        return {
            testId: test.id,
            suiteId,
            passed: false,
            latencyMs: Date.now() - startTime,
            response: '',
            routing: { selectedAgent: null, confidence: 'none' },
            quality: { hasNumericData: false, hasList: false, hasError: true, usedContext: false },
            failures: [`Exception: ${error.message}`],
            apiError: error.message
        }
    }
}

async function runSuite(
    baseUrl: string,
    tenantId: string,
    suite: TestSuite,
    verbose: boolean,
    concurrent: number = 1
): Promise<SuiteResult> {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`📦 Suite: ${suite.name}`)
    console.log(`   Category: ${suite.category} | Tests: ${suite.tests.length}${concurrent > 1 ? ` | Concurrent: ${concurrent}` : ''}`)
    console.log(`${'─'.repeat(60)}`)
    
    const results: TestResult[] = []
    let passed = 0
    let failed = 0
    let totalLatency = 0
    
    if (concurrent > 1) {
        // Parallel execution with batching
        for (let i = 0; i < suite.tests.length; i += concurrent) {
            const batch = suite.tests.slice(i, i + concurrent)
            const batchPromises = batch.map(test => runTest(baseUrl, tenantId, suite.id, test, verbose))
            const batchResults = await Promise.all(batchPromises)
            
            for (let j = 0; j < batchResults.length; j++) {
                const result = batchResults[j]
                const test = batch[j]
                results.push(result)
                totalLatency += result.latencyMs
                
                if (result.passed) {
                    passed++
                    console.log(`   ${test.id}: ✅ (${result.latencyMs}ms) → ${result.routing.selectedAgent || 'base'}`)
                } else {
                    failed++
                    console.log(`   ${test.id}: ❌ (${result.latencyMs}ms)`)
                    for (const failure of result.failures) {
                        console.log(`      ⚠️  ${failure}`)
                    }
                    if (verbose && result.response) {
                        console.log(`      📝 Response: "${truncate(result.response, 100)}"`)
                    }
                }
            }
            
            // Small delay between batches
            if (i + concurrent < suite.tests.length) {
                await sleep(CONFIG.delayBetweenTests)
            }
        }
    } else {
        // Sequential execution (original behavior)
        for (const test of suite.tests) {
            process.stdout.write(`   ${test.id}: `)
            
            const result = await runTest(baseUrl, tenantId, suite.id, test, verbose)
            results.push(result)
            totalLatency += result.latencyMs
            
            if (result.passed) {
                passed++
                console.log(`✅ (${result.latencyMs}ms) → ${result.routing.selectedAgent || 'base'}`)
            } else {
                failed++
                console.log(`❌ (${result.latencyMs}ms)`)
                for (const failure of result.failures) {
                    console.log(`      ⚠️  ${failure}`)
                }
                if (verbose && result.response) {
                    console.log(`      📝 Response: "${truncate(result.response, 100)}"`)
                }
            }
            
            await sleep(CONFIG.delayBetweenTests)
        }
    }
    
    return {
        suiteId: suite.id,
        suiteName: suite.name,
        category: suite.category,
        passed,
        failed,
        totalLatencyMs: totalLatency,
        avgLatencyMs: Math.round(totalLatency / suite.tests.length),
        tests: results
    }
}

// =============================================================================
// REPORTING
// =============================================================================

function printSummary(results: SuiteResult[]): void {
    console.log(`\n${'═'.repeat(60)}`)
    console.log(`📊 TEST RESULTS SUMMARY`)
    console.log(`${'═'.repeat(60)}`)
    
    let totalPassed = 0
    let totalFailed = 0
    let totalLatency = 0
    
    // By category
    const byCategory: Record<string, { passed: number; failed: number }> = {}
    
    for (const suite of results) {
        totalPassed += suite.passed
        totalFailed += suite.failed
        totalLatency += suite.totalLatencyMs
        
        if (!byCategory[suite.category]) {
            byCategory[suite.category] = { passed: 0, failed: 0 }
        }
        byCategory[suite.category].passed += suite.passed
        byCategory[suite.category].failed += suite.failed
        
        const status = suite.failed === 0 ? '✅' : '❌'
        console.log(`\n${status} ${suite.suiteName}`)
        console.log(`   Passed: ${suite.passed}/${suite.passed + suite.failed} | Avg Latency: ${suite.avgLatencyMs}ms`)
    }
    
    console.log(`\n${'─'.repeat(60)}`)
    console.log(`📈 BY CATEGORY:`)
    for (const [category, stats] of Object.entries(byCategory)) {
        const pct = ((stats.passed / (stats.passed + stats.failed)) * 100).toFixed(0)
        console.log(`   ${category}: ${stats.passed}/${stats.passed + stats.failed} (${pct}%)`)
    }
    
    console.log(`\n${'═'.repeat(60)}`)
    const totalTests = totalPassed + totalFailed
    const successRate = ((totalPassed / totalTests) * 100).toFixed(1)
    console.log(`🎯 TOTAL: ${totalPassed}/${totalTests} passed (${successRate}%)`)
    console.log(`⏱️  Total time: ${(totalLatency / 1000).toFixed(1)}s | Avg per test: ${Math.round(totalLatency / totalTests)}ms`)
    console.log(`${'═'.repeat(60)}\n`)
}

function saveResults(results: SuiteResult[], resultsDir: string): void {
    // Ensure results directory exists
    if (!fs.existsSync(resultsDir)) {
        fs.mkdirSync(resultsDir, { recursive: true })
    }
    
    const totalPassed = results.reduce((acc, s) => acc + s.passed, 0)
    const totalFailed = results.reduce((acc, s) => acc + s.failed, 0)
    const total = totalPassed + totalFailed
    const totalLatencyMs = results.reduce((acc, s) => acc + s.totalLatencyMs, 0)
    
    const report = {
        timestamp: new Date().toISOString(),
        passed: totalPassed,
        failed: totalFailed,
        total,
        passRate: total > 0 ? Math.round((totalPassed / total) * 100) : 0,
        avgLatency: total > 0 ? Math.round(totalLatencyMs / total) : 0,
        totalLatencyMs,
        suites: results
    }
    
    // Save timestamped file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('T')[0]
    const timestampedFile = path.join(resultsDir, `results-${timestamp}.json`)
    fs.writeFileSync(timestampedFile, JSON.stringify(report, null, 2))
    console.log(`📁 Results saved to: ${timestampedFile}`)
    
    // Save latest.json for CI
    const latestFile = path.join(resultsDir, 'latest.json')
    fs.writeFileSync(latestFile, JSON.stringify(report, null, 2))
    console.log(`📁 Latest saved to: ${latestFile}`)
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
    const args = parseArgs()
    const baseUrl = args.env === 'local' ? CONFIG.localUrl : CONFIG.prodUrl
    
    console.log(`\n🧪 TUQUI AGENTS E2E TEST RUNNER`)
    console.log(`${'═'.repeat(60)}`)
    console.log(`🌐 Environment: ${args.env} (${baseUrl})`)
    if (args.concurrent > 1) {
        console.log(`⚡ Concurrent mode: ${args.concurrent} tests per batch`)
    }
    
    // Load test suite
    const suitePath = path.join(__dirname, 'cedent-test-suite.json')
    const suiteData = JSON.parse(fs.readFileSync(suitePath, 'utf8'))
    
    // Get tenant ID
    const tenantId = CONFIG.tenantId || suiteData.tenantId
    if (!tenantId || tenantId === 'REPLACE_WITH_ADHOC_TENANT_ID') {
        console.error('\n❌ ERROR: No tenant ID configured!')
        console.error('   Set TEST_TENANT_ID env var or update cedent-test-suite.json')
        process.exit(1)
    }
    console.log(`🏢 Tenant ID: ${tenantId}`)
    
    // Filter suites if requested
    let suites: TestSuite[] = suiteData.suites
    
    if (args.suite) {
        suites = suites.filter(s => s.id.includes(args.suite!) || s.category === args.suite)
        console.log(`🔍 Filtered to suites matching: ${args.suite}`)
    }
    
    if (args.subset === 'critical') {
        // Run only tests marked as critical: true
        suites = suites.map(s => ({
            ...s,
            tests: s.tests.filter(t => t.critical === true)
        })).filter(s => s.tests.length > 0)
        console.log(`⚡ Critical subset: only tests with critical: true`)
    }
    
    const totalTests = suites.reduce((acc, s) => acc + s.tests.length, 0)
    console.log(`📋 Suites: ${suites.length} | Tests: ${totalTests}`)
    
    // Run all suites
    const results: SuiteResult[] = []
    
    for (const suite of suites) {
        const result = await runSuite(baseUrl, tenantId, suite, args.verbose, args.concurrent)
        results.push(result)
        await sleep(CONFIG.delayBetweenSuites)
    }
    
    // Print summary
    printSummary(results)
    
    // Save results
    const resultsDir = path.join(__dirname, 'results')
    saveResults(results, resultsDir)
    
    // Exit with error code if any tests failed
    const totalFailed = results.reduce((acc, s) => acc + s.failed, 0)
    process.exit(totalFailed > 0 ? 1 : 0)
}

main().catch(console.error)
