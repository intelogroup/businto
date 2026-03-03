#!/bin/bash

# Quick Resend Test Setup
# This script helps you set up and run Resend email tests

echo "🚀 Businto Resend Email Testing Setup"
echo "═══════════════════════════════════════════"

# Check if RESEND_API_KEY is set
if grep -q "RESEND_API_KEY" .env.local 2>/dev/null; then
    echo "✅ RESEND_API_KEY found in .env.local"
else
    echo "⚠️  RESEND_API_KEY not found in .env.local"
    echo ""
    echo "To set up:"
    echo "1. Sign up at: https://resend.com"
    echo "2. Get your API key (starts with 're_')"
    echo "3. Add to .env.local:"
    echo "   RESEND_API_KEY=re_your_key_here"
    echo ""
    read -p "Do you have a Resend API key? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        read -p "Enter your RESEND_API_KEY: " api_key
        echo "RESEND_API_KEY=$api_key" >> .env.local
        echo "✅ Added to .env.local"
    else
        echo "Please get a key from https://resend.com and try again"
        exit 1
    fi
fi

echo ""
echo "📧 Available Tests:"
echo "───────────────────"
echo ""
echo "1. Quick Test (single email):"
echo "   npm run test:resend-simple"
echo ""
echo "2. Comprehensive Tests (3 scenarios):"
echo "   npm run test:resend"
echo ""
echo "To proceed, run one of the above commands"
