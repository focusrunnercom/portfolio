# FocusRunner Platform Architecture

**Last Updated:** 2026-05-14 (v3 — HARD CUT Vercel API, Flask is the only backend)
**Author:** CTO

---

## 1. Deployment Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                    Vercel (Hobby Plan)                        │
│  ┌──────────┐                                                │
│  │   SPA    │  SPA only. No API functions.                   │
│  │  React   │  Lead capture forms served from Flask.         │
│  │  /dist   │                                                │
│  └──────────┘                                                │
│                                                              │
│  vercel.json: SPA catch-all only. No /api/* rewrites.        │
│                                                              │
│  SPA: focusrunner.io (Vercel CDN)                            │
│  API: 192.168.40.1:5000 (Flask — local server)               │
└──────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌──────────────────────────────────────────────────────────────┐
│              Flask Backend (192.168.40.1:5000)                │
│                                                              │
│  Endpoints:                                                   │
│    GET  /lead-capture         — serve lead form HTML          │
│    GET  /lead-capture-ai      — serve AI variant              │
│    POST /api/webhook          — lead capture from forms       │
│    POST /api/lead             — lead from chat widget          │
│    POST /api/capture          — lead capture (alias)           │
│    POST /api/chat             — chat qualification state       │
│    GET  /api/leads            — list leads (auth required)     │
│    GET  /api/health           — health check                   │
│    GET  /health               — health check (alias)           │
│    POST /api/admin/login      — admin auth                     │
│                                                              │
│  Storage: SQLite (workspace/portfolio/lead-dashboard/leads.db)│
│  Notifications: Telegram (hermes .env config)                 │
│  Scoring: volume + spend rules → hot/warm/cold               │
└──────────────────────────────────────────────────────────────┘
```

### 1.1 Why This Architecture

- **Vercel API was unreliable**: Hobby plan rate-limits (100 deploys/day), silent failures with Node 24.x, SPA catch-all serving HTML for API routes
- **Flask is local + fast**: 0ms cold start, no rate limits, full control over the stack
- **Lead forms POST directly to Flask**: no Vercel API dependency at all

### 1.2 Removed (HARD CUT 2026-05-14)

All Vercel API serverless functions deleted from git:
- api/webhook.js, api/chat.js, api/health.js, api/kv.js, api/leads.js
- api/client-config.js, api/notify-status.js, api/lead-notify.js, api/ping.js
- api/direct-qualify.py, api/direct-qualify.js
- api/lib/* (shared libraries)
- vercel.json rewrites for /api/* removed

### 1.3 Lead Capture Flow

```
User → focusrunner.io/lead-capture.html (Vercel SPA, or Flask direct)
                                    │
                                    ▼
                  POST http://192.168.40.1:5000/api/webhook
                                    │
                                    ├───► Save to SQLite leads.db
                                    │
                                    ├───► Send Telegram notification
                                    │
                                    └───► Score lead (hot/warm/cold)
                                          based on volume + spend
```

## 2. Data Layer

### 2.1 Lead Storage (SQLite)

```
File: /home/ai13/workspace/portfolio/lead-dashboard/leads.db
Schema:
  leads:
    id          INTEGER PRIMARY KEY AUTOINCREMENT
    name        TEXT NOT NULL
    email       TEXT NOT NULL
    phone       TEXT DEFAULT ''
    practice    TEXT DEFAULT ''
    volume      TEXT DEFAULT ''
    spend       TEXT DEFAULT ''
    message     TEXT DEFAULT ''
    page_url    TEXT DEFAULT ''
    ip_address  TEXT DEFAULT ''
    source      TEXT DEFAULT 'web'
    score       TEXT DEFAULT 'unscored'
    created_at  TEXT DEFAULT datetime('now')
```

Scoring logic:
- hot (85+): volume >= 100 OR spend >= $5,000
- warm (60): volume >= 30 OR spend >= $1,000
- cold (25): everything else

### 2.2 Admin Dashboard

```
GET /api/leads?token=<admin_token>  → full lead list (JSON)
GET /api/leads                      → count only (public)
```

Admin token: `focusrunner-admin-2026` (configurable via LEAD_DASHBOARD_ADMIN_TOKEN env)

## 3. Frontend

### 3.1 SPA (Vercel)

React app at `focusrunner.io` — portfolio site only. No API calls to Vercel functions.

### 3.2 Lead Capture Form

- `/lead-capture.html` — standalone HTML, dark theme, #22c55e green
- Schwartz framework copy (Desire → Identification → Credibility → Action)
- Posts to Flask `/api/webhook` at 192.168.40.1:5000
- Works served from Vercel (CORS to Flask) or directly from Flask

### 3.3 Admin Panel

- `/admin/leads.html` — dark theme admin panel
- Fetches from Flask `http://192.168.40.1:5000/api/leads`
- Auth via admin token

## 4. Operations

### 4.1 Start Flask Backend

```bash
cd /home/ai13/workspace/portfolio/lead-dashboard
python3 app.py
# Listens on 0.0.0.0:5000
```

Managed via `/home/ai13/workspace/lead-dashboard/lead-dashboard.sh {start|stop|status}`

### 4.2 Deploy Vercel SPA

```bash
cd /home/ai13/focusrunnercom/portfolio
git add -A && git commit -m "message" && git push origin main
# Vercel auto-deploys from main branch
```

### 4.3 Required Environment Variables

| Variable | Required | Purpose |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | Yes (via .hermes/.env) | Telegram notifications |
| `ADMIN_API_KEY` | No | Admin auth for /api/admin/login |
| `LEAD_DASHBOARD_ADMIN_TOKEN` | No | Admin dashboard access (default: focusrunner-admin-2026) |

## 5. Future Roadmap

### 5.1 SMS Reactivation (FOC-187, FOC-287)
- Add SMS reminder endpoint to Flask
- Schedule follow-up texts for cold leads after 24h
- Use Twilio or Telegram-native SMS via Make.com

### 5.2 Multi-Tenant
- Add client_id to leads schema
- Per-client qualification rules
- White-label dashboard per med spa
