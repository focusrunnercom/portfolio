# FocusRunner Architecture

**Author:** Sr Engineer
**Last Updated:** 2026-05-14

---

## System Overview

FocusRunner's lead pipeline captures, qualifies, notifies, and routes leads from multiple sources (chatbot, web form, Instagram DM) through automation into GoHighLevel CRM — with real-time email alerts to the team.

```
                    EXTERNAL TRAFFIC
                           │
              ┌────────────▼──────────────────┐
              │  VERCEL EDGE (focusrunner.io)  │
              │                                 │
              │  /api/chat → OpenAI/DPS (qual) │
              │  /api/webhook → GHL + Notify   │
              │  /api/lead-notify → Resend     │
              │  /api/leads → KV/demo data     │
              │  /admin/* → Dashboard pages    │
              └────────────┬────────────────────┘
                           │
              ┌────────────▼────────────────────┐
              │  MAKE.COM (Automation Layer)     │
              │  S1: Lead Ingest Pipeline        │
              │  S2: Qual Lead → Notify Sales    │
              │  S3: Inactive Lead Re-engagement │
              │  S4: Weekly Pipeline Digest      │
              └────────────┬─────────────────────┘
                           │
              ┌────────────▼────────────────────┐
              │  GoHighLevel (CRM)              │
              │  Pipeline + Automations + SMS   │
              └─────────────────────────────────┘
```

---

## API Endpoints

| Endpoint | Method | Purpose | Dependencies |
|----------|--------|---------|-------------|
| `/api/chat` | POST | AI qualification via DeepSeek | DEEPSEEK_API_KEY |
| `/api/webhook` | POST | Full pipeline: GHL + analytics + email | RESEND_API_KEY, GHL_API_KEY |
| `/api/lead-notify` | POST | Standalone email notification | RESEND_API_KEY |
| `/api/leads` | GET | Lead dashboard data (KV or demo) | ADMIN_API_KEY |
| `/api/admin/client` | POST | Manage per-client KV config | ADMIN_API_KEY |

---

## Notification System

### End-to-End Flow

```
Lead Captured (any source)
        │
        ▼
  /api/webhook.js
        │
        ├──▶ 1. Forward to GoHighLevel (if configured)
        ├──▶ 2. Log analytics event to KV
        └──▶ 3. Send email to hello@focusrunner.com via Resend
                 └── notifyLead(body) in api/lib/notify.js
```

### Components

- **`api/lib/notify.js`** — shared email module, called by webhook.js
- **`api/lead-notify.js`** — standalone endpoint for Make.com/Zapier to call directly
- **Provider:** Resend API (`POST https://api.resend.com/emails`)
- **Template:** Mobile-friendly HTML with qualification badge color
- **Fail-safe:** `.catch(() => {})` — never blocks lead capture

### Env Vars

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | Resend API key for email sending |
| `NOTIFY_EMAIL` | No | Recipient override (default: hello@focusrunner.com) |
| `DEEPSEEK_API_KEY` | Yes | DeepSeek/OpenAI API key for chat |
| `CHAT_MODEL` | No | Model name (default: deepseek-chat) |
| `GHL_WEBHOOK_URL` | No | GoHighLevel webhook URL |
| `GHL_API_KEY` | No | GoHighLevel API key |
| `ADMIN_API_KEY` | No | Token for admin endpoints |

---

## Multi-Tenant Design

Each API endpoint supports an `X-Client-Id` header for per-client configuration stored in Vercel KV.

### Config Resolution

1. If `X-Client-Id` header provided → read config from KV key `client:{slug}`
2. If KV not found or no header → fallback to env vars (backward compatible)

### Client Config Structure (KV)

```json
{
  "active": true,
  "name": "Client Name",
  "ai": {
    "system_prompt": "...",
    "model": "deepseek-chat",
    "temperature": 0.7,
    "max_tokens": 500
  },
  "crm": {
    "webhook_url": "...",
    "api_key": "...",
    "custom_fields_map": {"score": "...", "classification": "..."}
  },
  "booking_url": "https://...",
  "white_label_config": {
    "logo_url": "...",
    "primary_color": "#...",
    "custom_domain": "..."
  }
}
```

---

## Data Schema

See INTEGRATION-SPEC.md for the full schema definition (leads, bookings, tenants tables) with indexes, constraints, and multi-tenant design.

---

## GoHighLevel Pipeline

| Stage | Description | Automation |
|-------|-------------|------------|
| New Lead | Raw lead from any source | Auto-tag: new-lead |
| Qualified | Score >= 70 (high-intent) | SMS booking link sent |
| Booked | Discovery call scheduled | Calendar reminders |
| Visited | Call completed | Post-visit sequence |
| Nurture | Score 40-69 | 10-day email campaign |
| Lost | No engagement 30 days | Monthly check-in SMS |

---

## Make.com Scenarios

| Scenario | Trigger | Purpose |
|----------|---------|---------|
| S1: Lead Ingest | GHL contact created | Route by score, notify, assign tasks |
| S2: Qual Lead | GHL stage → Qualified | Email + Slack alert for hot leads |
| S3: Inactive | Cron every 6h | Re-engage leads inactive 48h |
| S4: Weekly Digest | Cron Monday 9AM | Pipeline summary email |

See INTEGRATION-SPEC.md for detailed scenario designs with error handling.

---

## Key Design Decisions

### Why Resend over SendGrid?
- Works on Vercel Edge Runtime naturally (pure REST, no NPM packages)
- Free tier (100/day) sufficient for current volume
- Simple API with no dependency on @sendgrid/mail

### Why fire-and-forget for notifications?
- Lead capture is the critical path — must not be slowed by email delivery
- Email failures are non-critical (lead is already in CRM)
- KV analytics provides a fallback audit trail

### Why two notification endpoints?
- `/api/webhook` is the full pipeline (GHL + analytics + email)
- `/api/lead-notify` is a standalone endpoint for external automations that don't need the GHL/analytics pipeline (e.g., Make.com scenario 2)

---

## Deployment

Vercel auto-deploys from `focusrunnercom/portfolio` on push. No build step — pure serverless functions.

```bash
git add -A
git commit -m "description"
git push
# Vercel auto-deploys ~15s later
```
