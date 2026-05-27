#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
# FocusRunner SEO Monitor — GSC + GA4 weekly data pull
# ─────────────────────────────────────────────────────────────
# Purpose: Pull GSC and GA4 metrics, write to Obsidian vault.
# Cron: Weekly via Paperclip routine (Paperclip invokes this).
# Requires: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN
#           GSC_SITE_URL (default: https://focusrunner.io)
#           GA4_PROPERTY_ID (default: 458617613)
# ─────────────────────────────────────────────────────────────

set -euo pipefail

OBSIDIAN_VAULT="${OBSIDIAN_VAULT:-$HOME/Documents/Obsidian Vault}"
OUTPUT_DIR="$OBSIDIAN_VAULT/03-Knowledge/SEO/reports"
GSC_SITE_URL="${GSC_SITE_URL:-https://focusrunner.io}"
GA4_PROPERTY_ID="${GA4_PROPERTY_ID:-458617613}"
WEEK_START=$(date -d '7 days ago' +%Y-%m-%d)
WEEK_END=$(date +%Y-%m-%d)
TODAY=$(date +%Y-%m-%d)
REPORT_FILE="$OUTPUT_DIR/seo-weekly-${TODAY}.md"

mkdir -p "$OUTPUT_DIR"

# ─────────────────────────────────────────────────────────────
# Helper: Google OAuth2 token refresh
# Priority: 1) gcloud ADC  2) GOOGLE_REFRESH_TOKEN + client creds
# ─────────────────────────────────────────────────────────────
get_google_token() {
  # Method 1: gcloud Application Default Credentials (fastest if configured)
  if command -v gcloud &>/dev/null; then
    local gcloud_token
    gcloud_token=$(gcloud auth application-default print-access-token 2>/dev/null || echo "")
    if [ -n "$gcloud_token" ] && [ "$gcloud_token" != "ERROR:" ]; then
      echo "$gcloud_token"
      return 0
    fi
  fi

  # Method 2: Direct OAuth refresh token
  if [ -n "${GOOGLE_REFRESH_TOKEN:-}" ] && [ -n "${GOOGLE_CLIENT_ID:-}" ] && [ -n "${GOOGLE_CLIENT_SECRET:-}" ]; then
    curl -s -X POST https://oauth2.googleapis.com/token \
      -H "Content-Type: application/x-www-form-urlencoded" \
      -d "client_id=${GOOGLE_CLIENT_ID}" \
      -d "client_secret=${GOOGLE_CLIENT_SECRET}" \
      -d "refresh_token=${GOOGLE_REFRESH_TOKEN}" \
      -d "grant_type=refresh_token" | jq -r '.access_token'
    return 0
  fi

  echo "⚠️  Google auth not configured — skipping GSC/GA4 API calls" >&2
  echo "⚠️  Run: python3 scripts/google-oauth-setup.py" >&2
  return 1
}

# ─────────────────────────────────────────────────────────────
# GSC: Search Analytics (impressions, clicks, position, queries)
# ─────────────────────────────────────────────────────────────
pull_gsc_data() {
  local token="$1"
  echo "📊 Pulling GSC search analytics..." >&2

  curl -s -X POST "https://www.googleapis.com/webmasters/v3/sites/${GSC_SITE_URL}/searchAnalytics/query" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{
      \"startDate\": \"${WEEK_START}\",
      \"endDate\": \"${WEEK_END}\",
      \"dimensions\": [\"query\"],
      \"rowLimit\": 25,
      \"aggregationType\": \"auto\"
    }" | jq -r '
      if .rows then
        .rows | map({
          query: .keys[0],
          clicks: .clicks,
          impressions: .impressions,
          ctr: ((.ctr // 0) * 100 | floor / 100),
          position: ((.position // 100) * 100 | round / 100)
        })
      else [] end
    '
}

# ─────────────────────────────────────────────────────────────
# GSC: Indexed pages count
# ─────────────────────────────────────────────────────────────
pull_gsc_sitemap() {
  local token="$1"
  echo "📊 Pulling GSC sitemap status..." >&2

  curl -s "https://www.googleapis.com/webmasters/v3/sites/${GSC_SITE_URL}/sitemaps" \
    -H "Authorization: Bearer $token" | jq -r '
      if .sitemap then
        .sitemap | map({
          path: .path,
          lastSubmitted: .lastSubmitted,
          isPending: .isPending,
          warnings: (.warnings // 0),
          errors: (.errors // 0)
        })
      else [] end
    '
}

# ─────────────────────────────────────────────────────────────
# GA4: Blog traffic + social referral + conversions (last 7 days)
# ─────────────────────────────────────────────────────────────
pull_ga4_data() {
  local token="$1"
  echo "📊 Pulling GA4 traffic data..." >&2

  # Page views for /blog/*
  local blog_data
  blog_data=$(curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{
      \"dateRanges\": [{\"startDate\": \"${WEEK_START}\", \"endDate\": \"${WEEK_END}\"}],
      \"dimensions\": [{\"name\": \"pagePath\"}],
      \"metrics\": [
        {\"name\": \"screenPageViews\"},
        {\"name\": \"averageSessionDuration\"}
      ],
      \"dimensionFilter\": {
        \"filter\": {
          \"fieldName\": \"pagePath\",
          \"stringFilter\": {
            \"matchType\": \"BEGINS_WITH\",
            \"value\": \"/blog/\"
          }
        }
      },
      \"limit\": 25
    }" | jq -c '.rows // []')

  # Social referrals
  local social_data
  social_data=$(curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{
      \"dateRanges\": [{\"startDate\": \"${WEEK_START}\", \"endDate\": \"${WEEK_END}\"}],
      \"dimensions\": [{\"name\": \"sessionSource\"}],
      \"metrics\": [
        {\"name\": \"sessions\"},
        {\"name\": \"screenPageViews\"}
      ],
      \"dimensionFilter\": {
        \"filter\": {
          \"fieldName\": \"sessionDefaultChannelGrouping\",
          \"stringFilter\": {
            \"matchType\": \"EXACT\",
            \"value\": \"Organic Social\"
          }
        }
      },
      \"limit\": 10
    }" | jq -c '.rows // []')

  # Conversions (key events)
  local conversion_data
  conversion_data=$(curl -s -X POST "https://analyticsdata.googleapis.com/v1beta/properties/${GA4_PROPERTY_ID}:runReport" \
    -H "Authorization: Bearer $token" \
    -H "Content-Type: application/json" \
    -d "{
      \"dateRanges\": [{\"startDate\": \"${WEEK_START}\", \"endDate\": \"${WEEK_END}\"}],
      \"dimensions\": [{\"name\": \"eventName\"}],
      \"metrics\": [{\"name\": \"eventCount\"}],
      \"dimensionFilter\": {
        \"filter\": {
          \"fieldName\": \"isKeyEvent\",
          \"stringFilter\": {\"matchType\": \"EXACT\", \"value\": \"true\"}
        }
      },
      \"limit\": 10
    }" | jq -c '.rows // []')

  echo "{\"blog\": $blog_data, \"social\": $social_data, \"conversions\": $conversion_data}"
}

# ─────────────────────────────────────────────────────────────
# Edge Config Verification (HTTP headers)
# ─────────────────────────────────────────────────────────────
verify_edge() {
  echo "🌐 Checking edge config..." >&2

  local headers
  headers=$(curl -sI -H 'Accept-Encoding: br' "$GSC_SITE_URL" 2>&1)

  local http2=$(echo "$headers" | grep -c "HTTP/2" || true)
  local brotli=$(echo "$headers" | grep -c "content-encoding: br" || true)
  local hsts=$(echo "$headers" | grep -c "strict-transport-security" || true)
  local cache_hit=$(echo "$headers" | grep -c "x-vercel-cache: HIT" || true)
  local cache_control=$(echo "$headers" | grep "cache-control:" | tr -d '\r')

  echo "{\"http2\": $([ "$http2" -gt 0 ] && echo true || echo false), \"brotli\": $([ "$brotli" -gt 0 ] && echo true || echo false), \"hsts\": $([ "$hsts" -gt 0 ] && echo true || echo false), \"cache_hit\": $([ "$cache_hit" -gt 0 ] && echo true || echo false), \"cache_control\": \"$cache_control\"}"
}

# ─────────────────────────────────────────────────────────────
# Build Obsidian Report
# ─────────────────────────────────────────────────────────────
build_report() {
  local gsc_json="$1"
  local ga4_json="$2"
  local sitemap_json="$3"
  local edge_json="$4"
  local has_token="$5"

  cat > "$REPORT_FILE" <<MD
---
tags: [seo, report, weekly, monitoring]
date: ${TODAY}
period: ${WEEK_START} to ${WEEK_END}
source: automated-gsc-ga4-pull
---

# SEO Weekly Report — ${WEEK_START} to ${WEEK_END}

## 🔍 Google Search Console

### Top Queries (by clicks)

| Query | Clicks | Impressions | CTR | Avg Position |
|-------|--------|-------------|-----|--------------|
MD

  if [ "$has_token" = true ] && [ "$gsc_json" != "[]" ] && [ "$gsc_json" != "null" ]; then
    echo "$gsc_json" | jq -r '.[] | "| \(.query // "N/A") | \(.clicks // 0) | \(.impressions // 0) | \((.ctr // 0)*100 | floor)% | \(.position // "-") |"' >> "$REPORT_FILE"
  else
    echo "| ⚠️ No GSC data — credentials not configured | - | - | - | - |" >> "$REPORT_FILE"
  fi

  cat >> "$REPORT_FILE" <<MD

### Sitemap Status
MD

  if [ "$has_token" = true ] && [ "$sitemap_json" != "[]" ] && [ "$sitemap_json" != "null" ]; then
    echo "$sitemap_json" | jq -r '.[] | "- **\(.path // "N/A")** — submitted: \(.lastSubmitted // "N/A"), pending: \(.isPending // false), warnings: \(.warnings // 0), errors: \(.errors // 0)"' >> "$REPORT_FILE"
  else
    echo "- ⚠️ No sitemap data — credentials not configured" >> "$REPORT_FILE"
  fi

  cat >> "$REPORT_FILE" <<MD

## 📈 Google Analytics 4 (GA4)

### Blog Traffic (Top Pages)

| Page | Views | Avg Session |
|------|-------|-------------|
MD

  if [ "$has_token" = true ] && [ "$ga4_json" != "null" ]; then
    echo "$ga4_json" | jq -r '.blog // [] | .[] | "| \(.dimensionValues[0].value // "N/A") | \(.metricValues[0].value // 0) | \(.metricValues[1].value // 0)s |"' >> "$REPORT_FILE" 2>/dev/null || echo "| ⚠️ Error parsing GA4 blog data | - | - |" >> "$REPORT_FILE"
  else
    echo "| ⚠️ No GA4 data — credentials not configured | - | - |" >> "$REPORT_FILE"
  fi

  cat >> "$REPORT_FILE" <<MD

### Social Referral Traffic

| Source | Sessions | Page Views |
|--------|----------|------------|
MD

  if [ "$has_token" = true ] && [ "$ga4_json" != "null" ]; then
    echo "$ga4_json" | jq -r '.social // [] | .[] | "| \(.dimensionValues[0].value // "N/A") | \(.metricValues[0].value // 0) | \(.metricValues[1].value // 0) |"' >> "$REPORT_FILE" 2>/dev/null || echo "| ⚠️ Error parsing GA4 social data | - | - |" >> "$REPORT_FILE"
  else
    echo "| ⚠️ No GA4 data — credentials not configured | - | - |" >> "$REPORT_FILE"
  fi

  # Pre-generate edge table via jq to avoid heredoc escaping issues
  local edge_table
  edge_table=$(echo "$edge_json" | jq -r '
    "| Check | Status |",
    "|-------|--------|",
    "| HTTP/2 | \(if .http2 then "✅" else "❌" end) |",
    "| Brotli | \(if .brotli then "✅" else "❌" end) |",
    "| HSTS | \(if .hsts then "✅" else "❌" end) |",
    "| CDN Cache Hit | \(if .cache_hit then "✅" else "❌" end) |",
    "| Cache-Control | \(.cache_control // "N/A") |"
  ')

  cat >> "$REPORT_FILE" <<MD

## 🌐 Vercel Edge Config

${edge_table}

---

*Generated by FocusRunner SEO Monitor — $(date -u +%Y-%m-%dT%H:%M:%SZ)*
MD

  echo "$REPORT_FILE"
}

# ─────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────

echo "=== FocusRunner SEO Monitor ==="
echo "Period: $WEEK_START → $WEEK_END"
echo ""

# Edge check always runs (no credentials needed)
EDGE_JSON=$(verify_edge)
echo "✅ Edge check complete"

# Attempt GSC/GA4 if credentials exist
TOKEN=""
HAS_TOKEN=false
GSC_JSON="[]"
GA4_JSON="null"
SITEMAP_JSON="[]"

TOKEN=$(get_google_token 2>/dev/null || echo "")
if [ -n "$TOKEN" ] && [ "$TOKEN" != "null" ]; then
  HAS_TOKEN=true
  echo "🔑 Google OAuth token obtained"

  GSC_JSON=$(pull_gsc_data "$TOKEN" 2>/dev/null || echo "[]")
  echo "✅ GSC data pulled"

  SITEMAP_JSON=$(pull_gsc_sitemap "$TOKEN" 2>/dev/null || echo "[]")
  echo "✅ Sitemap status pulled"

  GA4_JSON=$(pull_ga4_data "$TOKEN" 2>/dev/null || echo "null")
  echo "✅ GA4 data pulled"
else
  echo "⚠️  Skipping GSC/GA4 — Google OAuth not configured"
fi

# Build and write report
REPORT=$(build_report "$GSC_JSON" "$GA4_JSON" "$SITEMAP_JSON" "$EDGE_JSON" "$HAS_TOKEN")

echo ""
echo "📄 Report: $REPORT"
echo "=== Done ==="
