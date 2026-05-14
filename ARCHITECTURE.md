# FocusRunner Analytics Architecture

## Current State (as of 2026-05-14)

### Endpoints
| Path | Purpose | Status |
|------|---------|--------|
| `POST /api/chat` | AI lead qualification via DeepSeek | Working |
| `POST /api/webhook` | Lead forwarding to GoHighLevel | Working |
| `GET /api/analytics/:clientId/*` | Analytics data retrieval | Partially broken |
| `GET /api/config/:clientId` | Public widget config | Working |
| `GET /api/verify` | KV connectivity diagnostics | Working |
| `* /api/admin/client*` | CRUD for multi-tenant configs | Working |

### Data Layer (Vercel KV)
```
config:{clientId}             → JSON client config
analytics:{clientId}:events   → List of lead events (logAnalyticsEvent writes to this)
analytics:{clientId}:daily:{YYYYMMDD} → Daily aggregate hash (defined but unused)
ratelimit:{clientId}:{slot}   → Rate counter
```

### Issues Found

1. **BROKEN IMPORT**: `webhook.js` and `chat.js` both import `{ logAnalyticsEvent } from './analytics.js'`, but `analytics.js` only exports a `default handler` function — it has **no named export** called `logAnalyticsEvent`. This causes a runtime import error in Vercel Edge Runtime.

2. **kv.js path mismatch in admin subdirectory**: `api/admin/client.js` imports from `'./kv.js'` but lives in a subdirectory — needs `'../kv.js'`.

3. **No source attribution analytics**: The analytics layer tracks `lead_captured` and `lead_submitted` events but doesn't track which marketing channel drove the lead (UTM params, referral, direct).

4. **Chat prompt targets patients instead of med spa owners**: Issue FOC-46 already flagged this — the system prompt treats the user as a patient seeking treatment. Partial fix at line 84 comments "this is their OWN practice name" but the prompt above still says "med spa patient concierge for a premium aesthetics practice."

### Data Flow
```
Visitor → index.html
  ├── Lead Form overlay → POST /api/webhook → GHL CRM
  └── Chat widget → POST /api/chat → DeepSeek → POST /api/webhook → GHL CRM
                      (logAnalyticsEvent)           (logAnalyticsEvent)
```

Both paths call `logAnalyticsEvent` which is **a non-existent function** — events are never actually persisted.

## Proposed Fix Plan

### Phase 1 (Urgent — Broken Imports)

1. **Extract library from analytics.js**: Split analytics.js into:
   - `api/lib/analytics-lib.js` — exports `logAnalyticsEvent` (the write function)
   - `api/analytics.js` — remains as the GET endpoint handler, imports from lib

2. **Fix admin/client.js import path**: Change `'./kv.js'` → `'../kv.js'`

3. **Wire up imports in webhook.js and chat.js**: Point to the new `'./lib/analytics-lib.js'`

### Phase 2 (Feature — Source Attribution + Dashboard)

4. **Add UTM/source tracking**: Pass `source`, `utm_source`, `utm_medium`, `utm_campaign` through the chat widget and lead form into analytics events

5. **Add conversion funnel tracking**: Track `visit → chat_started → qualified → submitted → booked` as a funnel with conversion rates

6. **Add daily aggregate writes**: Replace the current N+1 scan pattern in timeline query with actual daily hash writes (the `daily:{YYYYMMDD}` key pattern that's already defined but unused)

7. **Dashboard widget**: Create `dashboard.html` — an admin dashboard that calls `GET /api/analytics/summary` and renders source attribution + funnel charts

### Architecture Diagram

```
┌─────────────┐     ┌─────────────┐
│  index.html │     │ Client Site │
│  (chat wgt) │     │ (lead form) │
└──────┬──────┘     └──────┬──────┘
       │ POST /api/chat    │ POST /api/webhook
       ▼                   ▼
┌──────────────┐    ┌──────────────┐
│  /api/chat   │    │ /api/webhook │
│  (edge func) │───▶│ (edge func)  │
└──────┬───────┘    └──────┬───────┘
       │ logAnalyticsEvent │ logAnalyticsEvent
       ▼                   ▼
┌──────────────────────────────┐
│  /api/lib/analytics-lib.js   │
│  → kvLpush(analytics:{id}:events)  │
│  → kvIncr(analytics:{id}:daily:{YYYYMMDD}:{type})  │
└─────────┬────────────────────┘
          │ reads
          ▼
┌─────────────────┐
│   Vercel KV     │
│  (Upstash/Redis)│
└─────────┬───────┘
          │ GET /api/analytics/:id/summary
          ▼
┌─────────────────┐    ┌─────────────┐
│  /api/analytics │───▶│  Dashboard  │
│  (edge func)    │    │  (HTML/JS)  │
└─────────────────┘    └─────────────┘
```

## Production Readiness Checklist

- [ ] Phase 1: Fix broken imports (blocking — leads not being logged)
- [ ] Phase 2: Source attribution tracking
- [ ] Phase 2: Funnel conversion rates
- [ ] Phase 2: Daily aggregates (fix O(N) scan pattern)
- [ ] Phase 2: Admin dashboard
- [ ] Phase 3: Rate limit warning alerts
- [ ] Phase 3: Weekly email digest of top-line metrics
