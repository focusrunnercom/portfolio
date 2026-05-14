# FocusRunner Lead Notification Architecture

## Problem

Chatbot and lead form capture leads on focusrunner.io, but the team is not notified in real time. Leads go cold in hours. Revenue is leaking.

## Solution: Email Notification Layer

A **non-blocking** email notification layer added to the existing `/api/webhook` endpoint. It fires after GHL CRM sync and analytics logging — zero impact on lead capture latency.

### Email Provider: Resend

- Simple REST API — `POST https://api.resend.com/emails`
- Works on Vercel Edge Runtime (no NPM deps, just `fetch()`)
- Free tier: 100 emails/day
- Environment variable: `RESEND_API_KEY`

### Data Flow

```
Lead Capture (chat.js / lead form)
        │
        ▼
  /api/webhook.js
        │
        ├──▶ 1. Forward to GoHighLevel CRM   (existing)
        ├──▶ 2. Log analytics event          (existing)
        └──▶ 3. Send email notification      (NEW)
                 via api/lib/notify.js
                 └──▶ hello@focusrunner.com
```

### Email Template

Subject: `🚀 New Lead: {name} — {classification}`

Body:
```
🚀 NEW LEAD CAPTURED
━━━━━━━━━━━━━━━━━━━━━

Name:          {name}
Phone:         {phone}
Email:         {email}
Practice:      {practice}
Classification: {classification}  (HOT / WARM / COLD)
Score:         {score}/10
Source:        {source}
Timestamp:     {timestamp}

━━━━━━━━━━━━━━━━━━━━━
FocusRunner AI
```

### Implementation

**File**: `api/lib/notify.js`
- Function: `notifyLead(leadData)` → POST to Resend API
- Fails silently (catch + console.error) — never blocks lead capture
- HTML email with mobile-friendly layout

**File**: `api/webhook.js`
- Import `notifyLead`
- Add one call after GHL forwarding, before response

### Env Vars

| Variable | Required | Description |
|----------|----------|-------------|
| `RESEND_API_KEY` | Yes | Resend API key |
| `NOTIFY_EMAIL` | No | Override recipient (default: hello@focusrunner.com) |

### Rollout

1. Create `api/lib/notify.js`
2. Update `api/webhook.js` to call `notifyLead()`
3. Set `RESEND_API_KEY` env var on Vercel
4. Commit + push → Vercel auto-deploys
5. Test with a real lead submission
