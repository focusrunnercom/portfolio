# FocusRunner Platform Architecture

**Last Updated:** 2026-05-14 (v2 — added webhook notification, removed duplicate lib/lead-notify.js)
**Author:** Senior Engineer

---

## 1. Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Vercel (Hobby Plan)                        │
│  ┌──────────┐  ┌────────────────────┐  ┌──────────────────┐  │
│  │   SPA    │  │  API Functions     │  │  Static Assets   │  │
│  │  React   │  │  (Node 18 CJS)     │  │  /admin/leads    │  │
│  │  /dist   │  │  /api/*.js        │  │  /lead-form      │  │
│  └────┬─────┘  └────────┬───────────┘  └──────────────────┘  │
│       │                 │                                     │
│       └──────┬──────────┘                                     │
│              │                                                │
│         ┌────▼─────┐                                         │
│         │ vercel.json (rewrites)                              │
│         │ /api/* → /api/*.js                                  │
│         │ /*     → /index.html (SPA catch-all)                │
│         └─────────────────────────────────────────────────────┘
```

### 1.1 Vercel Hobby Plan Constraints

| Constraint | Value | Impact |
|---|---|---|
| Node version | 18.x (max on Hobby) | No ESM, no `@vercel/node` builder |
| Deploys/day | 100 | ~24h lockout when exhausted |
| Function timeout | 10s (free) / 30s (pro) | Configure `maxDuration: 30` |
| Concurrent functions | 2 (free) | Acceptable for single-user lead flow |
| Runtime auto-detect | Partially broken on Hobby | Requires `functions.runtime` explicit config |

### 1.2 vercel.json — Current (Working) Config

```json
{
  "functions": {
    "api/**/*.js": { "runtime": "nodejs18.x", "maxDuration": 30 }
  },
  "rewrites": [
    { "source": "/api/health",     "destination": "/api/health.js" },
    { "source": "/api/leads",     "destination": "/api/leads.js" },
    { "source": "/api/chat",      "destination": "/api/chat.js" },
    { "source": "/api/webhook",   "destination": "/api/webhook.js" },
    { "source": "/api/direct-qualify", "destination": "/api/direct-qualify.js" },
    { "source": "/api/kv",        "destination": "/api/kv.js" },
    { "source": "/api/client-config", "destination": "/api/client-config.js" },
    { "source": "/api/notify-status", "destination": "/api/notify-status.js" },
    { "source": "/api/lead-notify",   "destination": "/api/lead-notify.js" },
    { "source": "/api/leads/export",  "destination": "/api/leads.js" },
    { "source": "/admin/leads",       "destination": "/admin/leads.html" },
    { "source": "/admin/leads/:path*","destination": "/admin/leads.html" },
    { "source": "/(.*)",              "destination": "/index.html" }
  ]
}
```

**Critical rule:** API rewrites MUST be listed before the SPA catch-all `/(.*)`.

### 1.3 Deployment Flow

```
git push origin main  →  GitHub
                          ↓
vercel deploy --prod   →  Vercel Pipeline
                          ↓
                   Build Phase:
                   - SPA: vite build → dist/
                   - API: auto-detect api/*.js → serverless functions
                          ↓
                   Deploy Phase:
                   - Upload assets to Vercel CDN
                   - Register serverless functions with rewrites
                          ↓
                   Validation:
                   - curl /api/health → JSON { status: "ok" }
                   - curl / → HTML SPA
                   - curl /admin/leads → HTML dashboard
```

## 2. API Layer

### 2.1 API Functions — All CJS for Node 18 Hobby Compatibility

| Endpoint | File | Method(s) | Description |
|---|---|---|---|
| `/api/health` | `health.js` | GET | Health check + env diagnostics |
| `/api/leads` | `leads.js` | GET, POST | Lead CRUD (file-based) |
| `/api/chat` | `chat.js` | POST | AI lead qualification (DeepSeek) |
| `/api/webhook` | `webhook.js` | POST | Lead ingestion from forms + GHL sync |
| `/api/direct-qualify` | `direct-qualify.js` | POST | Rules-based qualification (no AI) |
| `/api/kv` | `kv.js` | GET, POST, DELETE | Vercel KV abstraction with memory fallback |
| `/api/client-config` | `client-config.js` | GET, POST, DELETE | Per-client CRM/AI config |
| `/api/notify-status` | `notify-status.js` | GET, POST | Notification pipeline diagnostics |
| `/api/lead-notify` | `lead-notify.js` | POST | Email notification via Resend |

### 2.2 Shared Libraries (`/api/lib/`)

| Library | File | Purpose |
|---|---|---|
| KV client | `kv.js` | Vercel KV REST API wrapper with in-memory fallback |
| Lead store | `lead-store.js` | File-based /tmp/leads.json persistence |
| Notify | `notify.js` | Email notification via Resend API |

### 2.3 CJS Compatibility Notes

All API files must:
- Use `require()` not `import`/`from`
- Use `module.exports` not `export default`
- Avoid top-level `await`
- Avoid ESM-only packages
- Use `process.env` for config (not compile-time injection)

## 3. Data Layer

### 3.1 Lead Storage (File-Based, Zero Infra)

```
File: /tmp/leads.json
Schema:
[
  {
    "id": "uuid",
    "name": "string",
    "phone": "string",
    "email": "string",
    "practice": "string",
    "source": "web|chat|manual|api",
    "qualification": "hot|warm|cold|null",
    "score": 0-100,
    "timestamp": "ISO-8601"
  }
]
```

Atomic writes via `/tmp/leads.json.tmp` + `os.replace()`. Survives warm instance restarts.

### 3.2 Vercel KV (Upstash) — When Configured

Used for: client-specific AI configs, session state, analytics counters.
Falls back to in-memory Map when KV env vars are unset.

### 3.3 GoHighLevel Integration

Webhook payload shape for GHL:
```json
{
  "name": "string",
  "phone": "string",
  "email": "string",
  "practice": "string",
  "source": "web",
  "qualification": "hot",
  "score": 85,
  "gclid": "string or null"
}
```

## 4. Frontend Layer

### 4.1 Lead Capture (`/lead-capture.html`)

- Standalone static HTML (no build step)
- Three fields: name, phone, email
- POSTs to `/api/webhook`
- Schwartz framework copy for med spa owners
- Works with or without SPA React app

### 4.2 Lead Dashboard (`/admin/leads.html`)

- Dark theme with `#6eff8a` accent, JetBrains Mono
- Fetches from `/api/leads`
- Filters: qualification (hot/warm/cold), source, date
- Auto-refresh every 30s
- Full data with auth, anonymized without

### 4.3 Chat Widget (`focusrunner-chat-widget.js`)

- External .js file — one `<script>` tag embed
- Posts to `/api/chat`
- 3-question lead qualification: practice → volume → interest
- Returns hot/warm/cold with score

## 5. Notification Pipeline

```
Lead Captured
      │
      ▼
/api/webhook
      │
      ├───► Save to /tmp/leads.json
      │
      ├───► Send to GoHighLevel (if configured)
      │
      ├───► /api/lead-notify → Resend email
      │         (if RESEND_API_KEY set)
      │
      └───► SMS followup (via Make.com webhook)
                (planned — FOC-187)
```

### 5.1 Required Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `DEEPSEEK_API_KEY` | Yes | AI lead qualification |
| `ADMIN_API_KEY` | Yes | Dashboard + API admin auth |
| `RESEND_API_KEY` | No (fallback degrades) | Email notifications |
| `NOTIFY_EMAIL` | No (defaults) | Notification recipient |
| `KV_URL` | No (in-memory fallback) | Upstash KV |
| `KV_REST_API_TOKEN` | No (in-memory fallback) | Upstash KV token |
| `GHL_API_KEY` | No | GoHighLevel CRM sync |

## 6. Known Issues & Technical Debt

### 6.1 Vercel Hobby Deploy Rate Limit

- **Problem:** 100 deploys/day cap, easily exhausted during iteration
- **Impact:** Cannot deploy urgent fixes for ~24h after hitting limit
- **Workaround:** Local Flask fallback server (see §6.3)
- **Fix:** Upgrade to Vercel Pro ($20/mo) for unlimited deploys

### 6.2 API Functions Return SPA HTML

- **Root cause:** Last successful deploy had no `@vercel/node` or `functions.runtime` config. Vercel Hobby auto-detection doesn't compile api/*.js without explicit build instructions.
- **Fix deployed in:** Commit `5136174` (uses `functions.runtime: nodejs18.x`)
- **Status:** Staged, blocked by rate limit

### 6.3 Fallback Architecture — Local Flask Server

When Vercel is down or rate-limited:
```
lead-capture.html ──► POST ──► focusrunner.io/api/webhook (Vercel, if up)
                               └──► localhost:5000/api/webhook (Flask fallback)
                                         │
                                         ▼
                                   /tmp/leads.json
                                         │
                                         ▼
                              localhost:5000/admin (Flask dashboard)
```

### 6.4 Notification Pipeline (Resend)

- `RESEND_API_KEY` and `NOTIFY_EMAIL` exist in Vercel env as **empty strings** (Resend not provisioned)
- Trigger: any lead qualification (hot/warm) — wired in `chat.js`, `direct-qualify.js`, `webhook.js`
- All endpoints now use shared `api/lib/notify.js` (consolidated per td-notify-consolidation.md)
- `api/lib/lead-notify.js` removed (was duplicate of `api/lib/notify.js`)

## 7. Future Architecture

### 7.1 Multi-Tenant Analytics Schema

```
Goal: Cross-client aggregate queries
Approach: Vercel KV with structured keys
  analytics:{clientId}:{date}:{metric}
Schema in api/lib/analytics-lib.js
```

### 7.2 SMS Followup Pipeline

See `api/lib/sms-followup-ARCHITECTURE.md`

### 7.3 Make.com Integration

```
/api/webhook ──► fire webhook to Make.com
                     │
                     ├──► Email notification
                     ├──► SMS followup (Twilio)
                     └──► CRM update (GHL/Airtable)
```

### 7.4 Recommended Upgrades

| Priority | Item | Cost | Impact |
|---|---|---|---|
| P0 | Vercel Pro | $20/mo | Unlimited deploys, 300s timeout |
| P1 | Vercel KV (Upstash) | $0-25/mo | Persistent cross-region state |
| P2 | Twilio SMS | Pay-per-use | SMS followup pipeline |
| P3 | Resend Pro | $0-10/mo | Reliable email notifications |
