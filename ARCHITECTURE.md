# Lead Pipeline & Admin Dashboard — Architecture

## Current State

### Pipeline
```
lead-capture.html ──POST──→ /api/webhook ──→ /tmp/leads.json
                                        └──→ GHL (if API key set)
                                        └──→ Email (if Resend key set)
                                        └──→ SMS (if Twilio key set)
```

### Visibility
```
GET /api/leads ──→ /tmp/leads.json (auth-gated: full vs anonymized)
GET /admin/leads ──→ Standalone dashboard SPA (FOC-312)
```

### Lead Schema (in /tmp/leads.json)
```
{
  leads: [
    {
      id: "uuid",
      name, phone, email, practice,
      qualification: { score, classification, summary },
      source, timestamp, notified
    }
  ]
}
```

## FOC-303 — Leads API (DONE)

**Status**: Deployed but non-functional. Root cause: Vercel Hobby does not support Node >18.x for Serverless Functions. The production deployment (dpl_AQvwFx4FU1iZX583TiLKCthBxLZC) uses minimal vercel.json without explicit `runtime: nodejs18.x`, causing Vercel to default to the package.json `engines.node` value which is 24.x.

**Fix applied** (committed to main, awaiting deploy):
- vercel.json: `"api/**/*.js": { "runtime": "nodejs18.x", "maxDuration": 30 }` with explicit rewrites for all API routes
- package.json: `"engines": { "node": "18.x" }`
- Blocked by Vercel Hobby 100 deploys/day limit (resets 2026-05-15 14:44 UTC)

## FOC-312 — Admin Dashboard (IN PROGRESS)

### Architecture
```
/admin/leads.html (standalone HTML, no build)
  │
  ├── on load: GET /api/leads (with Admin auth header)
  │
  ├── Render: table with Name, Phone, Email, Practice, Score, Source, Timestamp
  ├── Filters: score (hot/warm/cold), source, date range
  ├── Dark theme, #6eff8a accent, JetBrains Mono
  └── Stored in repo at public/admin/leads.html
```

Filesystem: `/home/ai13/focusrunnercom/portfolio/public/admin/leads.html`

### Why standalone HTML
- No React, no build step, no dependencies
- Deploys as a static asset via Vercel SPA catch-all
- `/admin/leads` rewrites to `/admin/leads.html` via the existing `/(.*)` → `/index.html` rule... **Wait** — the catch-all rewrites to `/index.html`, not `public/admin/leads.html`. Need to add an explicit rewrite.

**vercel.json update needed**: Add `/admin/leads` route before the catch-all.

### Auth
- Dashboard calls GET /api/leads with `Authorization: Bearer <ADMIN_API_KEY>`
- ADMIN_API_KEY set in Vercel env (from .env.local)
- Public calls get anonymized data (phone masked, email empty)

## FOC-181 — Lead Notification

### Current State
- `api/lead-notify.js` — standalone POST endpoint, calls Resend API. Exists in repo.
- `api/lib/lead-notify.js` — shared notification library. Exists in repo.
- `api/webhook.js` — appends to leads.json + calls Resend inline + attempts GHL + SMS
- RESEND_API_KEY: empty (no env var set)
- Notifications are wired but non-functional until a valid Resend API key is set

### Architecture
```
Lead captured → webhook.js → appendLead() to /tmp/leads.json
                           → createGHLContact() (if key set)
                           → notifyLeadEmail() via Resend (if key set)
                           → smsFollowup() via Twilio (if key set)
                           → [future] POST /api/lead-notify for decoupled notification
```

The Resend key must be set in Vercel env before notifications work.

## Deployment Constraints

| Constraint | Detail |
|-----------|--------|
| Vercel Hobby | Node 18.x only for serverless functions |
| Deploy limit | 100/day, resets 14:44 UTC daily |
| /tmp storage | Ephemeral per warm instance — lost on cold start |
| Git integration | Not enabled (sourceless project) — deploy via Vercel API only |

## File Layout
```
public/
  lead-capture.html     — Standalone lead capture form (posts to /api/webhook)
  admin/
    leads.html          — NEW: Admin dashboard SPA (FOC-312)
api/
  leads.js              — GET /api/leads (FOC-303)
  webhook.js            — POST /api/webhook — lead ingest + forwarding
  lead-notify.js        — Standalone notification endpoint
  direct-qualify.js     — DeepSeek-independent qualification
  health.js             — Health check endpoint
  lib/
    lead-store.js       — File-based lead CRUD
    lead-notify.js      — Email notification library
    notify.js           — (from git history, not in HEAD)
```

## Next Steps
1. Deploy after Vercel limit reset (14:44 UTC May 15) — vercel.json + package.json fix
2. Test: `curl https://focusrunner.io/api/leads` returns lead data
3. Test: Open `/admin/leads` — table renders with test leads
4. Set RESEND_API_KEY in Vercel env to activate email notifications
5. Wire lead-capture.html → webhook → leads.json pipeline end-to-end
