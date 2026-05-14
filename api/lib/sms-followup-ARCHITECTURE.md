# SMS Auto-Followup Pipeline — Architecture Document

**Author:** Senior Engineer
**Issue:** FOC-187
**Date:** 2026-05-14
**Status:** Draft — pending CTO review before activation

---

## 1. System Topology

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│  Chatbot      │────▶│  /api/chat       │────▶│  /api/webhook    │
│  Widget       │     │  (Qualification) │     │  (Distribution)  │
└──────────────┘     └──────────────────┘     └──────────────────┘
                                                     │
                    ┌────────────────────────────────┼────────────────────────────┐
                    │                                │                            │
                    ▼                                ▼                            ▼
           ┌──────────────┐                 ┌──────────────┐           ┌──────────────────┐
           │  Resend       │                 │  Twilio API  │           │  Make.com        │
           │  (Email)      │                 │  (SMS)       │           │  (Webhook Path)  │
           └──────────────┘                 └──────────────┘           └──────────────────┘
                                                    │
                                                    ▼
                                           ┌──────────────────┐
                                           │  Sales Team SMS  │
                                           │  Lead Auto-Reply │
                                           └──────────────────┘
```

## 2. Trigger Conditions

SMS followup fires when ALL of:
1. Lead is qualified through `/api/chat` or `/api/webhook`
2. `qualification.score >= 70` (hot) OR `classification === 'hot'`
3. Lead has a valid phone number
4. Lead is NOT on the opt-out blocklist
5. Twilio env vars are configured

Classification → action matrix:

| Classification | Score Range | Email Notify | SMS Sales | SMS Lead |
|---------------|-------------|-------------|-----------|----------|
| hot           | 70-100      | YES         | YES       | YES      |
| warm          | 40-69       | YES         | NO        | NO       |
| cold          | 0-39        | NO          | NO        | NO       |
| unknown       | N/A         | NO          | NO        | NO       |

## 3. SMS Content Templates

### Sales Team Alert (Twilio → SALES_TEAM_PHONE)

```
FOCUSRUNNER: New {classification} lead!
Name: {name}
Phone: {phone}
Score: {score}/100
Practice: {practice}
Source: {source}
Call NOW — leads convert in <5 min.
```

### Lead Auto-Reply (Twilio → lead's phone)

```
Hi {name}! Thanks for your interest in FocusRunner.
We specialize in helping med spas like yours attract and convert more patients with AI.

Book a quick call to see how: {booking_url}
Reply STOP to opt out.
```

## 4. Implementation: Inline in webhook.js

The current implementation lives as an inline `smsFollowup()` function in `/api/webhook.js` (lines 274-313). It:

1. Checks `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` env vars
2. Constructs Basic Auth header (Base64-encoded SID:Token)
3. Sends SMS via Twilio Messages API (`POST /2010-04-01/Accounts/{sid}/Messages.json`)
4. Uses `application/x-www-form-urlencoded` content type
5. Fire-and-forget: catches all errors, logs warnings only
6. Sales notification only (no auto-reply to lead — pending CMO copy)

Called from webhook.js line 441:
```js
if (qualification && qualification.classification !== 'cold' && qualification.classification !== 'not_a_fit') {
    await smsFollowup(leadData, qualification);
}
```

## 5. Make.com Scenario Design

### Trigger: Webhook
- Method: POST
- Headers: `Content-Type: application/json`
- Payload: full webhook.js forward payload

### Scenario Steps

```
Step 1: Webhook Trigger
  ├── Receives: { name, phone, email, practice, score, classification, source }
  │
Step 2: Filter (Router)
  ├── Route A: score >= 70 OR classification === "hot"
  │     ├── Step 3a: Send Sales Team SMS (Twilio module)
  │     ├── Step 3b: Send Lead Auto-Reply SMS (Twilio module)
  │     ├── Step 3c: Add GHL Tag "followup_sent" (HTTP module)
  │     └── Step 3d: Log to Data Store
  │
  └── Route B: score < 70 OR cold
        └── Step 4: No-op (log only)
```

### Error Handling

| Failure Mode | Retry Strategy | Dead Letter |
|-------------|---------------|-------------|
| Twilio rate limit (429) | 3 retries, exponential backoff (1s, 5s, 15s) | Log to data store |
| Twilio auth failure (401) | No retry — env misconfig | Alert owner |
| Invalid phone number (400) | No retry | Log to error bucket |
| Network timeout | 3 retries | Log |
| GHL API down | 2 retries, 10s apart | Queue for manual retry |

### Env Vars Required

| Variable | Source | Description |
|----------|--------|-------------|
| TWILIO_ACCOUNT_SID | Vercel env | Twilio account identifier |
| TWILIO_AUTH_TOKEN | Vercel env | Twilio auth token (secret) |
| TWILIO_PHONE_NUMBER | Vercel env | Sender phone number (e.g., +1888XXXXXXX) |
| SALES_TEAM_PHONE | Vercel env | Sales team notification number |
| BOOKING_URL | Vercel env | Lead auto-reply booking link (default: https://focusrunner.io/book) |

## 6. GoHighLevel Integration

- **GHL Tag API**: `POST https://rest.gohighlevel.com/v1/contacts/{contactId}/tags`
- **Header**: `Authorization: Bearer {{ghl_api_key}}`
- **Tags**: `ai_qualified`, `followup_sent`, `sms_notified`
- **Custom Fields**: `ai_score`, `ai_classification`, `sms_status`

## 7. Opt-Out Handling

When a lead replies "STOP" to the auto-reply SMS:
1. Twilio webhook fires to a callback URL
2. Phone number is added to opt-out blocklist in `/tmp/leads.json`
3. Future SMS checks blocklist before sending
4. Blocklist is in-memory and resets on Vercel cold start — for production, use Vercel KV

Current: opt-out handled at Twilio account level (built-in STOP handling). App-level blocklist is TODO pending Vercel KV integration.

## 8. Production Rollout Checklist

- [ ] Set TWILIO env vars in Vercel
- [ ] CMO provides SMS copy for lead auto-reply
- [ ] Test sales SMS with test lead
- [ ] Verify STOP opt-out handling
- [ ] Monitor Twilio logs for first 24 hours
- [ ] Configure Make.com webhook scenario (alternative path)
- [ ] Add rate limiting if traffic > 100 leads/day
