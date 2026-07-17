#!/bin/bash
echo "=== GNOME Stocks Smoke Test ==="
echo ""
PASS=0
FAIL=0

# 1. Schema compilation
echo "[1/4] Testing GSettings schema compilation..."
glib-compile-schemas schemas/ 2>/dev/null
if [ $? -eq 0 ]; then
    echo "  ✅ Schema compilation successful."
    PASS=$((PASS+1))
else
    echo "  ❌ Schema compilation failed."
    FAIL=$((FAIL+1))
fi

# 2. metadata.json
echo "[2/4] Checking metadata.json..."
if [ -f "metadata.json" ]; then
    uuid=$(grep -o '"uuid":[[:space:]]*"[^"]*"' metadata.json | cut -d'"' -f4)
    if [ "$uuid" = "gnome-stocks@harshitworkmain" ]; then
        echo "  ✅ UUID check passed."
        PASS=$((PASS+1))
    else
        echo "  ❌ UUID mismatch: $uuid"
        FAIL=$((FAIL+1))
    fi
else
    echo "  ❌ metadata.json not found."
    FAIL=$((FAIL+1))
fi

# 3. Daemon file exists
echo "[3/4] Checking daemon..."
if [ -f "../stocks-daemon/daemon.py" ]; then
    python3 -c "import ast; ast.parse(open('../stocks-daemon/daemon.py').read())" 2>/dev/null
    if [ $? -eq 0 ]; then
        echo "  ✅ daemon.py syntax valid."
        PASS=$((PASS+1))
    else
        echo "  ❌ daemon.py has syntax errors."
        FAIL=$((FAIL+1))
    fi
else
    echo "  ❌ daemon.py not found at ../stocks-daemon/"
    FAIL=$((FAIL+1))
fi

# 4. Finnhub API connectivity
echo "[4/4] Testing Finnhub API..."
CONFIG_FILE="$HOME/.config/gnome-stocks/config.json"
if [ -f "$CONFIG_FILE" ]; then
    API_KEY=$(python3 -c "import json; print(json.load(open('$CONFIG_FILE')).get('finnhub_api_key',''))" 2>/dev/null)
    if [ -n "$API_KEY" ] && [ "$API_KEY" != "" ]; then
        response=$(curl -s "https://finnhub.io/api/v1/quote?symbol=AAPL&token=$API_KEY")
        has_price=$(echo "$response" | python3 -c "import sys,json; d=json.load(sys.stdin); print('yes' if d.get('c') else 'no')" 2>/dev/null)
        if [ "$has_price" = "yes" ]; then
            echo "  ✅ Finnhub API test successful."
            PASS=$((PASS+1))
        else
            echo "  ❌ Finnhub returned invalid data."
            FAIL=$((FAIL+1))
        fi
    else
        echo "  ⚠️  No API key in config. Skipping Finnhub test."
    fi
else
    echo "  ⚠️  Config not found. Run daemon installer first."
fi

echo ""
echo "Results: $PASS passed, $FAIL failed"
if [ $FAIL -eq 0 ]; then
    echo "🚀 All smoke tests PASSED!"
else
    echo "💥 Some tests FAILED."
    exit 1
fi
