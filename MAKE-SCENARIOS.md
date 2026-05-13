# Make.com Scenario Blueprints — Med Spa AI Patient Acquisition

**Source:** AUTOMATION.md, INTEGRATION-SPEC.md
**Author:** CTO (FOC-96)
**Date:** 2026-05-12
**Plan:** Make.com Core ($30/mo) — shared across all clients initially

---

## Scenario 1: Lead Capture & Qualification (Primary)

**Trigger:** Webhook receives form submission from landing page

### Flow Diagram

```
Webhook (POST from landing page)
  │
  ├─ Step 1: Parse JSON body
  │   Fields: name, email, phone, service_interest, budget_range, timeline,
  │           utm_source, utm_campaign, utm_medium, gclid
  │
  ├─ Step 2: Validate fields
  │   - Email: basic regex check
  │   - Phone: strip non-digits, check length >= 10
  │   - Honeypot check: if "website" field filled → discard silently
  │
  ├─ Step 3: Route to OpenAI qualification
  │   HTTP → POST https://{vercel-url}.vercel.app/api/chat
  │   Body: { messages: [{role: "system", content: "<system prompt>"},
  │                       {role: "user", content: "New lead from {name}"}],
  │          userData: {name, phone, service_interest, budget_range, timeline} }
  │   Response: { reply, qualification: { score, classification, ... } }
  │
  ├─ Step 4: Branch on score
  │   │
  │   ├── score >= 70 ──────────────────────────────────────────┐
  │   │   Route: QUALIFIED                                        │
  │   │   Actions:                                                │
  │   │   1. POST to GHL: Create/Update Contact                   │
  │   │      Endpoint: POST https://rest.gohighlevel.com/v1/contacts/
  │   │      Headers: { Authorization: "Bearer {GHL_API_KEY}" }  │
  │   │      Body: { firstName, lastName, email, phone,           │
  │   │              customField: { service_interest, budget,     │
  │   │                            lead_score, classification }, │
  │   │              tags: ["ai-patient-acquisition", "qualified"]}│
  │   │   2. POST to GHL: Move to "Qualified" pipeline stage     │
  │   │   3. Log to dashboard Google Sheet                       │
  │   │                                                          │
  │   ├── score 40-69 ──────────────────────────────────────────┐│
  │   │   Route: NURTURE                                         ││
  │   │   Actions:                                               ││
  │   │   1. POST to GHL: Create/Update Contact                  ││
  │   │      Tags: ["ai-patient-acquisition", "nurture"]         ││
  │   │   2. POST to GHL: Move to "Nurture" pipeline stage      ││
  │   │   3. Log to dashboard Google Sheet                       ││
  │   │                                                          ││
  │   └── score < 40 ───────────────────────────────────────────┘│
  │       Route: LOST                                             │
  │       Actions:                                                │
  │       1. POST to GHL: Create/Update Contact (minimal)         │
  │          Tags: ["ai-patient-acquisition", "cold-lead"]        │
  │       2. POST to GHL: Move to "Lost" pipeline stage           │
  │       3. Log to dashboard Google Sheet                        │
  │                                                               │
  └───────────────────────────────────────────────────────────────┘
```

### Make.com Module Setup

**Module 1:** Webhook (Custom)
- Webhook URL: `https://hook.make.com/{unique-id}`
- Accepts: POST JSON

**Module 2:** Router (Filter by score)

**Module 3a (Qualified):** GoHighLevel — Create/Update Contact
- Connection: GHL API Key from agency account
- Map all fields from webhook payload

**Module 3b (Nurture):** GoHighLevel — Create/Update Contact
- Same as 3a, different tags

**Module 3c (Lost):** GoHighLevel — Create/Update Contact
- Same as 3a, minimal fields

**Module 4 (all branches):** Google Sheets — Append Row
- Sheet: `{Client Name} — Lead Dashboard`
- Columns: Timestamp, Name, Email, Phone, Service, Budget, Timeline, Score, Classification, Source, UTM

---

## Scenario 2: Booking Confirmation Sync

**Trigger:** GHL Calendar event created

```
GHL Webhook (appointment booked)
  │
  ├─ Step 1: Parse event data (contact_id, service, time, date)
  ├─ Step 2: Update lead score to 100 (booked)
  ├─ Step 3: Move contact to "Booked" pipeline stage
  ├─ Step 4: Log to dashboard Google Sheet
  └─ Step 5: (Optional) SMS confirmation via Twilio if GHL doesn't auto-send
```

### Make.com Module Setup

**Module 1:** GoHighLevel — Watch Events (Appointments)
- Trigger: New appointment created

**Module 2:** GoHighLevel — Update Contact
- Move to stage: "Booked"

**Module 3:** Google Sheets — Append Row
- Sheet: Booking Log
- Columns: Timestamp, Contact ID, Service, Date, Time

---

## Scenario 3: Post-Visit Automation

**Trigger:** GHL Calendar event completed (appointment status = "show")

```
GHL Webhook (appointment completed)
  │
  ├─ Step 1: Move contact to "Visited" stage
  ├─ Step 2: Log to dashboard
  └─ GHL handles the post-visit sequence internally via Workflow C in GHL-SETUP.md
```

**Note:** Post-visit SMS/email timers run natively in GoHighLevel automations. Make.com only needs to push the stage change trigger. GHL workflow C handles:
- +24h: Review request SMS
- +7d: Follow-up check-in SMS
- +30d: Rebooking reminder SMS
- +90d: Cross-sell SMS

---

## Scenario 4: Error Handler (Fallback)

**Trigger:** Any scenario fails

```
Error catch
  │
  ├─ Step 1: Log error details to error log sheet
  │   Columns: Timestamp, Scenario Name, Error Message, Payload (truncated)
  │
  ├─ Step 2: Retry once after 30s
  │   - If GHL API fails: queue lead data, retry
  │   - If OpenAI fails: fallback to static form submission (GHL creates contact at Qualified)
  │   - If webhook times out: log raw payload, retry
  │
  └─ Step 3: Send Slack alert (if configured)
      Webhook: {slack-webhook-url}
      Message: "⚠️ [Alert] Make scenario failed: {scenario_name}. Error: {error}"
```

---

## Per-Client Configuration

| Variable | Where to Set | Example |
|----------|-------------|---------|
| Webhook URL | Landing Page form action | `https://hook.make.com/abc123` |
| GHL API Key | Make.com connection | `{ghl-api-key}` |
| OpenAI API Key | Vercel env var | `sk-proj-...` |
| Slack Webhook | Error Handler module | `https://hooks.slack.com/...` |
| Dashboard Sheet ID | Google Sheets module | `1abc...` |
| OpenAI Chat Endpoint | Vercel deployment URL | `https://focusrunner-{slug}.vercel.app/api/chat` |

---

## Testing Checklist

- [ ] Scenario 1: Submit test form → webhook received → contact created in GHL correct stage
- [ ] Scenario 1: Test all 3 score tiers (qualified, nurture, lost)
- [ ] Scenario 2: Create test appointment in GHL → contact moves to "Booked"
- [ ] Scenario 3: Mark appointment as completed in GHL → contact moves to "Visited"
- [ ] Error handler: Send malformed payload → verify fallback triggers
- [ ] Dashboard: Verify row appended to Google Sheet for each event
