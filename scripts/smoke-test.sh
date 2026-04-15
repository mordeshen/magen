#!/bin/bash
# Smoke tests — בודקים שהפיצ'רים המרכזיים עובדים לפני deploy
# שימוש:
#   bash scripts/smoke-test.sh                    # נגד http://localhost:3000 (דורש npm run dev רץ)
#   bash scripts/smoke-test.sh https://shikum.org # נגד פרודקשן
#
# יוצא עם קוד 0 אם הכל עובר, 1 אם משהו נפל.

BASE="${1:-http://localhost:3000}"
FAILED=0
PASSED=0

pass() { echo "  ✅ $1"; PASSED=$((PASSED+1)); }
fail() { echo "  ❌ $1"; FAILED=$((FAILED+1)); }

check_status() {
  local name="$1" url="$2" expected="$3"
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" --max-time 15 "$url")
  if [ "$actual" = "$expected" ]; then
    pass "$name → $actual"
  else
    fail "$name → ציפיתי $expected, קיבלתי $actual ($url)"
  fi
}

check_json() {
  local name="$1" url="$2" jq_check="$3"
  local body
  body=$(curl -s --max-time 15 "$url")
  if echo "$body" | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); process.exit($jq_check ? 0 : 1)" 2>/dev/null; then
    pass "$name"
  else
    fail "$name — JSON לא עבר בדיקה ($url)"
    echo "     body: $(echo "$body" | head -c 200)"
  fi
}

echo ""
echo "🧪 Smoke Tests — $BASE"
echo "─────────────────────────────────────────"

# ── 1. האתר עולה ──
echo ""
echo "[1] עמוד הבית"
check_status "GET /" "$BASE/" "200"

# ── 2. Health check: Supabase + Anthropic ──
echo ""
echo "[2] Health check (Supabase + Anthropic)"
check_status "GET /api/health" "$BASE/api/health" "200"
check_json "Supabase up" "$BASE/api/health" "d.services.supabase.status==='ok'"
check_json "Anthropic reachable" "$BASE/api/health" "['ok','reachable'].includes(d.services.anthropic.status)"

# ── 3. Plans (תשלומים) ──
echo ""
echo "[3] מסלולי תשלום"
check_status "GET /api/plans" "$BASE/api/plans" "200"
check_json "יש מסלולים פעילים" "$BASE/api/plans" "Array.isArray(d) && d.length>0"

# ── 4. Feature pricing ──
echo ""
echo "[4] Feature pricing"
check_status "GET /api/feature-pricing" "$BASE/api/feature-pricing" "200"

# ── 5. Chat — בלי auth צפוי 401/403 (לא 500!) ──
echo ""
echo "[5] Chat endpoint (ללא auth — לא אמור להתרסק)"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 -X POST \
  -H "Content-Type: application/json" \
  -d '{"message":"test","persona":"magen"}' "$BASE/api/chat")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "401" ] || [ "$STATUS" = "403" ] || [ "$STATUS" = "400" ]; then
  pass "Chat endpoint מגיב ($STATUS)"
else
  fail "Chat endpoint → $STATUS (צפוי 200/400/401/403)"
fi

# ── 6. WhatsApp webhook — צפוי 200/405 (לא 500) ──
echo ""
echo "[6] WhatsApp webhook"
STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE/api/whatsapp")
if [ "$STATUS" = "200" ] || [ "$STATUS" = "405" ] || [ "$STATUS" = "400" ]; then
  pass "WhatsApp webhook מגיב ($STATUS)"
else
  fail "WhatsApp webhook → $STATUS"
fi

# ── 7. Auth endpoint זמין (Supabase reachable מהצד של ה-SDK) ──
echo ""
echo "[7] קונפיג אימות"
SUPABASE_URL=$(grep -E "^NEXT_PUBLIC_SUPABASE_URL" .env.local 2>/dev/null | cut -d= -f2)
if [ -n "$SUPABASE_URL" ]; then
  # בודקים שפרויקט ה-Supabase עצמו בריא
  ANON=$(grep -E "^NEXT_PUBLIC_SUPABASE_ANON_KEY" .env.local 2>/dev/null | cut -d= -f2)
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 \
    -H "apikey: $ANON" "$SUPABASE_URL/auth/v1/settings")
  if [ "$STATUS" = "200" ]; then
    pass "Supabase Auth בריא ($SUPABASE_URL)"
  else
    fail "Supabase Auth → $STATUS ($SUPABASE_URL) — הפרויקט כנראה Unhealthy!"
  fi
else
  echo "  ⏭  אין .env.local מקומי — מדלג"
fi

# ── סיכום ──
echo ""
echo "─────────────────────────────────────────"
TOTAL=$((PASSED+FAILED))
if [ $FAILED -eq 0 ]; then
  echo "✅ כל הבדיקות עברו ($PASSED/$TOTAL)"
  exit 0
else
  echo "❌ נפלו $FAILED מתוך $TOTAL"
  exit 1
fi
