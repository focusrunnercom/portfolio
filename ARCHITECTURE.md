# Lead Notification Pipeline — Architecture

## Problem
Chatbot captures leads on focusrunner.io but nobody gets notified. Leads go cold
in hours. This is a revenue leak — #1 operational gap.

## Current State
- `api/chat.js` — receives leads from chatbot widget, calls DeepSeek for qualification
- `api/webhook.js` — receives leads from Make.com/GHL, forwards to GHL + attempts email
- `api/lead-notify.js` — standalone notification endpoint (exists in git history, missing from HEAD)
- `api/lib/notify.js` — Resend email library (exists in git history, missing from HEAD)
- `RESEND_API_KEY` — env var set on Vercel but EMPTY (invalid key, no value stored)
- `NOTIFY_EMAIL` — env var set but service unavailable

## Architecture Decision

### Phase 1 (NOW — FOC-238, FOC-236)
**File-based storage + GET endpoint.** Zero-infra, zero-dependency fallback that works
immediately. No external API keys required.

```
chatbot → api/chat.js → append to /tmp/leads.json
                        → (attempt email silently)
webhook → api/webhook.js → append to /tmp/leads.json
                          → (attempt email silently)
                          → (attempt SMS silently)
                          
API consumer → GET /api/leads → returns JSON array from /tmp/leads.json
```

### Phase 2 (when API key arrives)
**Resend email notification.** Code already exists in git history. Just restore and set
a valid RESEND_API_KEY on Vercel. Email fires on every lead capture.

### Phase 3 (follow-up)
**Make.com webhook + SMS pipeline.** INTEGRATION-SPEC.md already documents the
Make.com scenarios. GHL already wired. SMS followup code (`smsFollowup` in webhook.js)
already written — just needs TWILIO env vars.

## File Layout
```
api/lib/notify.js          — Resend email library (restored from git)
api/lead-notify.js         — Standalone POST notification endpoint (restored)
api/leads.js               — NEW: GET endpoint returning lead store
api/webhook.js             — MODIFIED: appends to leads.json
```

## /tmp/leads.json Schema
```json
{
  "leads": [
    {
      "id": "uuid",
      "name": "...",
      "phone": "...",
      "email": "...",
      "practice": "...",
      "qualification": { "score": 85, "classification": "qualified", "summary": "..." },
      "source": "chat_widget|webhook|lead_form",
      "timestamp": "2026-05-14T18:00:00.000Z",
      "notified": false
    }
  ]
}
```

## Limitations
- Vercel Serverless = ephemeral filesystem. /tmp/leads.json persists only as long
  as the runtime instance stays warm. On cold start, lead store resets.
- Acceptable for now: the GET endpoint gives visibility for today's traffic.
- Long-term: replace with Vercel KV or a proper database.

## Verification
1. Submit lead via focusrunner.io chatbot
2. `curl https://focusrunner.io/api/leads` returns the lead
3. If RESEND_API_KEY is valid, email arrives at hello@focusrunner.com
