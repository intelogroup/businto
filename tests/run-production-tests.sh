#!/bin/bash

echo "🚀 Running Production Readiness Tests"
echo "======================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track results
FAILED_TESTS=()

# Test 1: Payment Routing Fee
echo "📋 Test 1: Payment Routing Fee ($1.99 Model)"
if npx vitest run tests/payment-routing-fee.test.ts --reporter=verbose 2>&1 | grep -q "✓"; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED_TESTS+=("Payment Routing Fee")
fi
echo ""

# Test 2: Marketplace Integrity
echo "📋 Test 2: Marketplace Integrity (Final Acceptance)"
if npx vitest run tests/marketplace-integrity.test.ts --reporter=verbose 2>&1 | grep -q "✓"; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED_TESTS+=("Marketplace Integrity")
fi
echo ""

# Test 3: Metadata Security
echo "📋 Test 3: Metadata Security (PII Protection)"
if npx vitest run tests/metadata-security.test.ts --reporter=verbose 2>&1 | grep -q "✓"; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED_TESTS+=("Metadata Security")
fi
echo ""

# Test 4: API Response Security
echo "📋 Test 4: API Response Security (No Data Leaks)"
if npx vitest run tests/api-response-security.test.ts --reporter=verbose 2>&1 | grep -q "✓"; then
    echo -e "${GREEN}✅ PASSED${NC}"
else
    echo -e "${RED}❌ FAILED${NC}"
    FAILED_TESTS+=("API Response Security")
fi
echo ""

# Summary
echo "======================================="
echo "📊 Test Summary"
echo "======================================="

if [ ${#FAILED_TESTS[@]} -eq 0 ]; then
    echo -e "${GREEN}✅ ALL TESTS PASSED - Ready for Production!${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Run database migrations: supabase db reset"
    echo "2. Set environment variables"
    echo "3. Configure Stripe webhook"
    echo "4. Test payment flow manually"
    exit 0
else
    echo -e "${RED}❌ ${#FAILED_TESTS[@]} TEST SUITE(S) FAILED${NC}"
    echo ""
    echo "Failed tests:"
    for test in "${FAILED_TESTS[@]}"; do
        echo -e "  ${RED}• $test${NC}"
    done
    echo ""
    echo -e "${YELLOW}⚠️  DO NOT DEPLOY TO PRODUCTION${NC}"
    exit 1
fi
