#!/bin/bash
# E2E Test Runner for Tuqui Odoo Queries
# 
# Usage:
#   ./scripts/test-e2e.sh          # Run all E2E tests
#   ./scripts/test-e2e.sh ventas   # Run only ventas tests
#   ./scripts/test-e2e.sh chat     # Run chat flow tests (requires server running)

set -e

echo "🧪 Tuqui E2E Tests"
echo "=================="

# Check if vitest is available
if ! npx vitest --version > /dev/null 2>&1; then
    echo "❌ Vitest not found. Installing..."
    npm install -D vitest
fi

# Parse arguments
TEST_FILTER=""
if [ "$1" == "ventas" ]; then
    TEST_FILTER="--grep 'Ventas'"
elif [ "$1" == "compras" ]; then
    TEST_FILTER="--grep 'Compras'"
elif [ "$1" == "chat" ]; then
    TEST_FILTER="--grep 'Chat'"
    echo "⚠️  Chat tests require the server to be running on localhost:3000"
    echo "   Run 'npm run dev' in another terminal first"
fi

# Run tests
echo ""
echo "Running E2E tests..."
npx vitest run tests/e2e/odoo-queries.test.ts $TEST_FILTER --reporter verbose

echo ""
echo "✅ E2E tests completed"
