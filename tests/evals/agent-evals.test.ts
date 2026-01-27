/**
 * Agent Evaluations - End-to-End Testing
 * 
 * Tests the agent against real Odoo data using the internal chat endpoint.
 * Validates that the agent:
 * 1. Understands user questions correctly
 * 2. Selects appropriate skills
 * 3. Returns relevant, accurate responses
 * 
 * Run with: npx vitest run tests/evals/agent-evals.test.ts
 * 
 * Requirements:
 * - GEMINI_API_KEY
 * - NEXT_PUBLIC_SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - TEST_TENANT_ID (optional, uses default if not set)
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { ALL_TEST_CASES, TEST_CASES_BY_CATEGORY, PASSING_THRESHOLD, type EvalTestCase } from './test-cases';

// ============================================
// CONFIGURATION
// ============================================

const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';
const INTERNAL_KEY = process.env.INTERNAL_TEST_KEY || 'test-key-change-in-prod';
const TENANT_ID = process.env.TEST_TENANT_ID || 'de7ef34a-12bd-4fe9-9d02-3d876a9393c2';
const AGENT_SLUG = process.env.TEST_AGENT_SLUG || 'tuqui';
const DEFAULT_TIMEOUT = 45000; // 45s per test (LLM can be slow)

// Skip if no API key
const SKIP_EVALS = !process.env.GEMINI_API_KEY;

if (SKIP_EVALS) {
  console.warn('⚠️  GEMINI_API_KEY not set - skipping agent evals');
}

// ============================================
// TYPES
// ============================================

interface ChatTestResponse {
  testId: string;
  success: boolean;
  latencyMs: number;
  routing: {
    selectedAgent: string | null;
    confidence: string;
    reason: string;
  };
  agent: {
    slug: string;
    name: string;
    ragEnabled: boolean;
  };
  toolsAvailable: string[];
  toolsUsed: string[];
  response: string;
  responseLength: number;
  quality: {
    hasNumericData: boolean;
    hasList: boolean;
    hasError: boolean;
    usedContext: boolean;
  };
  error?: string;
}

interface EvalResult {
  testCase: EvalTestCase;
  passed: boolean;
  response: ChatTestResponse | null;
  failures: string[];
  latencyMs: number;
}

// ============================================
// EVALUATION HELPERS
// ============================================

async function callAgent(question: string): Promise<ChatTestResponse> {
  const response = await fetch(`${BASE_URL}/api/internal/chat-test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-key': INTERNAL_KEY,
    },
    body: JSON.stringify({
      tenantId: TENANT_ID,
      agentSlug: AGENT_SLUG,
      messages: [{ role: 'user', content: question }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`API error ${response.status}: ${errorText}`);
  }

  return response.json();
}

function evaluateResponse(testCase: EvalTestCase, response: ChatTestResponse): EvalResult {
  const failures: string[] = [];
  const text = response.response || '';

  // Check expected patterns
  for (const pattern of testCase.expectedPatterns) {
    if (!pattern.test(text)) {
      failures.push(`Missing expected pattern: ${pattern.source}`);
    }
  }

  // Check forbidden patterns
  if (testCase.forbiddenPatterns) {
    for (const pattern of testCase.forbiddenPatterns) {
      if (pattern.test(text)) {
        failures.push(`Found forbidden pattern: ${pattern.source}`);
      }
    }
  }

  // Check numeric data requirement
  if (testCase.requiresNumericData && !response.quality.hasNumericData) {
    failures.push('Expected numeric data but none found');
  }

  // Check list requirement
  if (testCase.requiresList && !response.quality.hasList) {
    failures.push('Expected list format but none found');
  }

  // Check for error in response
  if (response.quality.hasError && !testCase.category.includes('edge')) {
    failures.push('Response contains error message');
  }

  // Check if API call failed
  if (!response.success) {
    failures.push(`API call failed: ${response.error || 'unknown error'}`);
  }

  return {
    testCase,
    passed: failures.length === 0,
    response,
    failures,
    latencyMs: response.latencyMs,
  };
}

// ============================================
// RESULTS TRACKING
// ============================================

const evalResults: EvalResult[] = [];
let totalPassed = 0;
let totalFailed = 0;
let totalSkipped = 0;

// ============================================
// TESTS
// ============================================

describe('🤖 Agent Evaluations (E2E)', { timeout: DEFAULT_TIMEOUT * 2 }, () => {
  beforeAll(() => {
    console.log('\n' + '='.repeat(70));
    console.log('🚀 Starting Agent Evaluations');
    console.log('='.repeat(70));
    console.log(`   Base URL: ${BASE_URL}`);
    console.log(`   Tenant: ${TENANT_ID}`);
    console.log(`   Agent: ${AGENT_SLUG}`);
    console.log(`   Test Cases: ${ALL_TEST_CASES.length}`);
    console.log(`   Pass Threshold: ${PASSING_THRESHOLD * 100}%`);
    console.log('='.repeat(70) + '\n');
  });

  afterAll(() => {
    // Print summary report
    console.log('\n' + '='.repeat(70));
    console.log('📊 EVALUATION SUMMARY');
    console.log('='.repeat(70));

    const passRate = totalPassed / (totalPassed + totalFailed);
    const passRatePct = (passRate * 100).toFixed(1);

    console.log(`\n   ✅ Passed: ${totalPassed}`);
    console.log(`   ❌ Failed: ${totalFailed}`);
    console.log(`   ⏭️  Skipped: ${totalSkipped}`);
    console.log(`   📈 Pass Rate: ${passRatePct}%`);
    console.log(`   🎯 Threshold: ${PASSING_THRESHOLD * 100}%`);
    console.log(`   ${passRate >= PASSING_THRESHOLD ? '✅ PASSED' : '❌ FAILED'}`);

    // Category breakdown
    console.log('\n   By Category:');
    for (const [category, cases] of Object.entries(TEST_CASES_BY_CATEGORY)) {
      const categoryResults = evalResults.filter(r => r.testCase.category === category);
      const categoryPassed = categoryResults.filter(r => r.passed).length;
      const categoryTotal = categoryResults.length;
      const categoryPct = categoryTotal > 0 ? ((categoryPassed / categoryTotal) * 100).toFixed(0) : 'N/A';
      const icon = categoryPassed === categoryTotal ? '✅' : categoryPassed === 0 ? '❌' : '⚠️';
      console.log(`      ${icon} ${category}: ${categoryPassed}/${categoryTotal} (${categoryPct}%)`);
    }

    // Failed tests details
    const failedResults = evalResults.filter(r => !r.passed);
    if (failedResults.length > 0) {
      console.log('\n   Failed Tests:');
      for (const result of failedResults) {
        console.log(`      ❌ ${result.testCase.id}: "${result.testCase.question}"`);
        for (const failure of result.failures) {
          console.log(`         - ${failure}`);
        }
      }
    }

    // Performance stats
    const latencies = evalResults.map(r => r.latencyMs).filter(l => l > 0);
    if (latencies.length > 0) {
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      const minLatency = Math.min(...latencies);
      console.log('\n   Performance:');
      console.log(`      Avg Latency: ${avgLatency.toFixed(0)}ms`);
      console.log(`      Min Latency: ${minLatency}ms`);
      console.log(`      Max Latency: ${maxLatency}ms`);
    }

    console.log('\n' + '='.repeat(70) + '\n');
  });

  // Create test suites by category
  for (const [category, cases] of Object.entries(TEST_CASES_BY_CATEGORY)) {
    describe(`📁 ${category.toUpperCase()}`, () => {
      for (const testCase of cases) {
        test.skipIf(SKIP_EVALS)(
          `${testCase.id}: "${testCase.question}"`,
          async () => {
            console.log(`\n🗣️  Testing: "${testCase.question}"`);

            // Add delay between tests to avoid Gemini rate limits
            await new Promise(resolve => setTimeout(resolve, 1500));

            try {
              const response = await callAgent(testCase.question);
              const result = evaluateResponse(testCase, response);
              evalResults.push(result);

              // Log response preview
              const preview = response.response?.substring(0, 200) || '';
              console.log(`   📝 Response: ${preview}${response.response?.length > 200 ? '...' : ''}`);
              console.log(`   ⏱️  Latency: ${response.latencyMs}ms`);
              console.log(`   🛠️  Tools: ${response.toolsAvailable?.join(', ') || 'none'}`);

              if (result.passed) {
                console.log(`   ✅ PASSED`);
                totalPassed++;
              } else {
                console.log(`   ❌ FAILED:`);
                for (const failure of result.failures) {
                  console.log(`      - ${failure}`);
                }
                totalFailed++;
              }

              expect(result.passed, `Failures: ${result.failures.join(', ')}`).toBe(true);
            } catch (error: any) {
              console.log(`   ❌ ERROR: ${error.message}`);
              totalFailed++;
              evalResults.push({
                testCase,
                passed: false,
                response: null,
                failures: [error.message],
                latencyMs: 0,
              });
              throw error;
            }
          },
          testCase.timeout || DEFAULT_TIMEOUT
        );
      }
    });
  }

  // Final threshold check
  test.skipIf(SKIP_EVALS)('📊 Overall pass rate meets threshold', () => {
    const passRate = totalPassed / (totalPassed + totalFailed);
    console.log(`\n🎯 Final Pass Rate: ${(passRate * 100).toFixed(1)}% (threshold: ${PASSING_THRESHOLD * 100}%)`);
    expect(passRate).toBeGreaterThanOrEqual(PASSING_THRESHOLD);
  });
});
