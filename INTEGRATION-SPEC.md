# INTEGRATION-SPEC.md — End-to-End System Wiring

**Author:** FocusRunner CTO (via CEO directive), updated by Sr Engineer (FOC-171)
**Sources:** AI-SYSTEM.md, AUTOMATION.md, OUTREACH-SCRIPTS.md, LANDING-PAGE.md, SALES-SCRIPTS.md
**Date:** 2026-05-14

---

## System Topology

```
                    ┌──────────────────────────────────────────────────────┐
                    │                   EXTERNAL WORLD                      │
                    │  ┌──────────┐  ┌──────────┐  ┌──────────────────┐   │
                    │  │ Meta Ads │  │ Instagram│  │ Organic/Referral  │   │
                    │  │ (Lead)   │  │ (DM)     │  │ (Direct Visit)    │   │
                    │  └────┬─────┘  └────┬─────┘  └────────┬─────────┘   │
                    └───────┼──────────────┼──────────────────┼─────────────┘
                            │              │                  │
                    ┌───────▼──────────────▼──────────────────▼─────────────┐
                    │               ENTRY LAYER (Vercel)                     │
                    │  ┌──────────────────────────────────────────────┐     │
                    │  │  Landing Page (focusrunner.vercel.app/…)      │     │
                    │  │  - Form: name, email, phone, service, budget, │     │
                    │  │    timeline, source (hidden UTM)              │     │
                    │  │  - Meta Pixel (conversion tracking)           │     │
                    │  │  - Bot detection + spam filter                │     │
                    │  └──────────────────────┬───────────────────────┘     │
                    │                         │ Webhook POST                │
                    │  ┌──────────────────────▼───────────────────────┐     │
                    │  │  Chatbot Widget (inline iframe or floating)   │     │
                    │  │  - Initial greeting within 8 seconds          │     │
                    │  │  - Structured qualification flow             │     │
                    │  └──────────────────────┬───────────────────────┘     │
                    └─────────────────────────┼─────────────────────────────┘
                                              │
                    ┌─────────────────────────▼─────────────────────────────┐
                    │            QUALIFICATION LAYER (Vercel Functions)       │
                    │  ┌──────────────────────────────────────────────┐     │
                    │  │  /api/chat — DeepSeek/OpenAI                 │     │
                    │  │  Input: {messages[], userData{}}             │     │
                    │  │  Output: {reply, qualification{score, ...}}  │     │
                    │  └──────────────────────┬───────────────────────┘     │
                    │                         │ JSON result                 │
                    │  ┌──────────────────────▼───────────────────────┐     │
                    │  │  /api/webhook — Multi-tenant Router          │     │
                    │  │  - GHL CRM sync                              │     │
                    │  │  - Analytics logging (KV)                    │     │
                    │  │  - Email notification (Resend)               │     │
                    │  │  - SMS pipeline trigger (if qualified)       │     │
                    │  └──────┬───────────────────────┬───────────────┘     │
                    │         │                      │                      │
                    │  ┌──────▼──────────┐  ┌────────▼──────────┐          │
                    │  │  /api/sms-     │  │  /api/lead-notify │          │
                    │  │  followup      │  │  (standalone)     │          │
                    │  │  (score >= 70) │  │  (alt endpoint)   │          │
                    │  └──────┬─────────┘  └────────┬──────────┘          │
                    └─────────┼─────────────────────┼──────────────────────┘
                              │                     │
                    ┌─────────▼─────────────────────▼──────────────────────┐
                    │              CRM LAYER (GoHighLevel)                    │
                    │  ┌──────────────────────────────────────────────┐     │
                    │  │  Pipeline: New → Qualified → Booked → Visited│     │
                    │  │             → Nurture → Lost                  │     │
                    │  ├──────────────────────────────────────────────┤     │
                    │  │  Automations:                                │     │
                    │  │  - Qualified: SMS w/ booking link (instant)   │     │
                    │  │  - No booking 24h: SMS follow-up             │     │
                    │  │  - No booking 48h: SMS + email               │     │
                    │  │  - Booked: Calendar reminders (-24h, -2h)    │     │
                    │  │  - Nurture: 4-email sequence over 10 days    │     │
                    │  │  - Visited: Post-visit sequence (+24h,+7d,   │     │
                    │  │    +30d, +90d)                               │     │
                    │  └──────────────────────────────────────────────┘     │
                    └──────────────────────────────────────────────────────┘
```

---

## 1. Data Schema Definition

### 1.1 Lead Table (Vercel KV + Normalized Schema)

The lead pipeline operates on a unified data contract used across all API endpoints, KV storage, and analytics.

**Lead Object (canonical shape):**

```json
{
  "id": "lead_<uuid_short>",
  "name": "Jane Smith",
  "phone": "+16075551234",
  "email": "jane@example.com",
  "practice": "Miami MedSpa & Wellness",
  "niche": "med_spa",
  "volume": "10_30",
  "source": "chat_widget",
  "tenant_id": "client_default",
  "qualification": {
    "score": 85,
    "classification": "qualified",
    "budget_tier": "premium",
    "practice_size": "single",
    "monthly_ad_spend": "5000",
    "service_interest": "AI Patient Acquisition",
    "timeline": "immediate",
    "summary": "Strong fit — high volume, $5K ad spend, immediate timeline."
  },
  "status": "new",
  "tags": [],
  "created_at": "2026-05-14T17:49:44.873Z",
  "updated_at": "2026-05-14T17:49:44.873Z"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | UUID short — unique lead identifier |
| name | string | no | Lead contact name (practice owner) |
| phone | string | no | E.164 format phone number |
| email | string | no | Contact email |
| practice | string | no | Medical practice / clinic name |
| niche | enum | no | med_spa, cosmetic_dentistry, plastic_surgery, hair_transplant |
| volume | enum | no | under_10, 10_30, 30_60, 60_plus |
| source | string | auto | chat_widget, lead_form, referral, instagram_dm |
| tenant_id | string | auto | Multi-tenant isolation key |
| qualification | object | no | Nested qualification result (see below) |
| status | enum | default: new | new, contacted, qualified, nurture, lost |
| tags | string[] | no | GHL tags synced back |
| created_at | ISO8601 | auto | Submission timestamp |
| updated_at | ISO8601 | auto | Last status/field change |

### 1.2 Qualification Object (nested)

| Field | Type | Description |
|-------|------|-------------|
| score | integer (0-100) | Qualification score |
| classification | enum | qualified, nurture, not_a_fit |
| budget_tier | enum | premium, mid, budget |
| practice_size | enum | single, multi, chain |
| monthly_ad_spend | string | Raw amount or "unknown" |
| service_interest | string | Detected service interest |
| timeline | enum | immediate, within_month, exploring |
| summary | string | 1-sentence assessment for sales |

### 1.3 KV Storage Keys

| Key Pattern | Type | Purpose |
|-------------|------|---------|
| `client:{tenant_id}` | JSON | Per-tenant config (GHL URL, API key, prompt, booking URL) |
| `leads:{tenant_id}` | List | Ordered lead records (newest first) |
| `analytics:{tenant_id}:events` | List | Raw event log |
| `analytics:{tenant_id}:daily:{YYYYMMDD}:total` | Counter | Daily lead count |
| `analytics:{tenant_id}:daily:{YYYYMMDD}:lead_captured` | Counter | Daily captured count |
| `analytics:{tenant_id}:daily:{YYYYMMDD}:lead_submitted` | Counter | Daily submitted count |
| `analytics:{tenant_id}:daily:{YYYYMMDD}:classification:{cls}` | Counter | Per-classification breakdown |
| `analytics:{tenant_id}:daily:{YYYYMMDD}:source:{src}` | Counter | Per-source breakdown |
| `sms:blocklist:{phone_hash}` | Key | Opt-out phone numbers |

### 1.4 Status State Machine

```
    new
     │
     ├──▶ contacted  (sales reached out)
     │
     ├──▶ qualified  (score >= 70 or sales-confirmed)
     │       │
     │       ├──▶ booked  (appointment confirmed)
     │       │       │
     │       │       ├──▶ visited  (appointment completed)
     │       │       │       │
     │       │       │       └──▶ post_visit  (follow-up active)
     │       │       │
     │       │       └──▶ lost  (no-show or declined)
     │       │
     │       └──▶ nurture  (score 40-69, needs work)
     │               │
     │               ├──▶ qualified  (re-engaged)
     │               └──▶ lost  (30 days no engagement)
     │
     ├──▶ nurture  (score 40-69)
     │
     └──▶ lost  (score < 40)
```

---

## 2. GoHighLevel Integration Flow

### 2.1 Field Mapping — /api/webhook → GHL Custom Fields

| webhook.js field | GHL Custom Field | Notes |
|------------------|------------------|-------|
| name | firstName + lastName | Split on first space |
| phone | phone | Stored as-is, GHL normalizes |
| email | email | |
| practice | customField.practice_name | |
| niche | customField.niche | |
| volume | customField.patient_volume | |
| source | customField.source | |
| qualification.score | customField.qualification_score | |
| qualification.classification | customField.qualification_class | |
| qualification.budget_tier | customField.budget_tier | |
| qualification.service_interest | customField.service_interest | |
| qualification.timeline | customField.timeline | |
| qualification.summary | customField.lead_summary | |

### 2.2 Tags

| Tag | Applied When | Purpose |
|-----|-------------|---------|
| `focusrunner-lead` | On contact create | Identifies FocusRunner-sourced |
| `qualified` | Score >= 70 | High-intent lead |
| `nurture` | Score 40-69 | Needs follow-up sequence |
| `not-a-fit` | Score < 40 | Low priority |
| `followup_sent` | SMS sent | Dedup — don't resend |
| `sms_opted_out` | Lead replied STOP | Compliance blocklist |

### 2.3 Two-Way Sync (Future)

GHL → FocusRunner:
- GHL webhook fires on tag change → POST to `/api/ghl-webhook`
- `/api/ghl-webhook` updates lead status in KV based on tag
- Pipeline stage move → sync status back

FocusRunner → GHL:
- Already handled by `/api/webhook` on lead creation
- Automated re-qualification pushes score updates via PATCH

### 2.4 Pipeline Stages

| # | Stage Name | Description | Trigger |
|---|------------|-------------|---------|
| 1 | New Lead | Raw lead from any source | Contact created |
| 2 | Qualified | Score >= 70 | Tag `qualified` added |
| 3 | Booked | Appointment confirmed | Calendar event created |
| 4 | Visited | Appointment completed | Manual move or webhook |
| 5 | Post-Visit | Follow-up active | Auto from Visited |
| 6 | Nurture | Score 40-69 | Tag `nurture` added |
| 7 | Lost | No engagement 30d | Auto or manual |

---

## 3. Make.com Scenario Designs

### 3.1 Scenario 1: Lead Ingest & Qualification (Primary)

```
Trigger: Webhook receives form submission
  → Step 1: Parse + validate JSON fields
  → Step 2: POST to /api/chat (AI qualification)
  → Step 3: Branch on score
       ├── >= 70 → Create GHL contact (Qualified stage)
       │           → Send SMS w/ booking link
       │           → Log to dashboard
       │           → Tag: qualified, focusrunner-lead
       ├── 40-69 → Create GHL contact (Nurture stage)
       │           → Start 10-day nurture sequence
       │           → Log to dashboard
       │           → Tag: nurture, focusrunner-lead
       └── < 40 → Create GHL contact (Lost stage)
                   → Log to dashboard
                   → Tag: not-a-fit, focusrunner-lead
```

**Error Handling:**
- OpenAI API failure → Fallback to static form submission, Slack: #alerts
- GHL API failure → Queue message, retry 3x with exponential backoff, Slack: #alerts
- Webhook timeout → Log raw payload, retry via scheduled module

### 3.2 Scenario 2: Lead Qualifies (score > 70) — Auto-Intro + Scheduling

```
Trigger: Webhook receives score >= 70 from /api/chat
  → Step 1: Generate email intro
       Module: DeepSeek/OpenAI — Generate email
       Prompt: "Write a brief intro email for {lead_name} from {practice},
                mentioning their interest in {service_interest}"
       Model: deepseek-chat
  → Step 2: Send intro email
       Module: Email — Send via SMTP
       To: {lead.email}
       Subject: "Your Free Patient Acquisition Audit — {lead.practice}"
       Body: Generated intro + booking CTA
  → Step 3: Schedule discovery call
       Module: GoHighLevel — Create Opportunity
       Pipeline: Qualified stage
       Assigned to: Sales team
       Due: Today + 2h (within lead response SLA)
  → Step 4: Log booking link
       Module: Google Sheets — Add Row
       Data: lead name, practice, score, email sent at, booking link
```

### 3.3 Scenario 3: Lead Inactive 48h — SMS Follow-up Sequence

```
Trigger: Schedule — checks leads with status "qualified" and no booking after 48h
  → Step 1: Filter — last_contact > 48h ago AND status != "booked"
  → Step 2: Check phone validity (regex check, not empty)
  → Step 3: Check blocklist (phone not in opt-out list)
  → Step 4: Send SMS #1 — Value reminder
       Module: Twilio — Send SMS
       Body: "Hey {name}, saw you checked us out at FocusRunner.
              Quick question — still looking to grow {practice}?"
  → Step 5: Wait 24h
  → Step 6: If no reply and no booking, send SMS #2 — Urgency
       Body: "Last call: your Free Patient Acquisition Audit is ready.
              See how many patients you're leaving on the table:
              {booking_link} Reply STOP to opt out."
  → Step 7: If no reply after SMS #2, move to Nurture stage
       Module: GoHighLevel — Move Contact to Stage
       Stage: Nurture
       Tag: 'inactive_sms_sent'
```

---

## 4. Multi-Tenant Architecture

### 4.1 Tenant Propagation

Every API endpoint resolves the tenant via `X-Client-Id` header:

```
/webhook.js → resolveClient(request) → clientConfig + clientId
/chat.js    → resolveClient(request) → clientConfig + clientId
/leads.js   → ?client_id= query param
```

**Tenant ID flows through every component:**
- KV keys are namespaced: `leads:{clientId}`, `analytics:{clientId}:*`
- GHL webhook URL is per-client from `clientConfig.crm.webhook_url`
- System prompt is per-client from `clientConfig.ai.system_prompt`
- Booking URL is per-client from `clientConfig.booking_url`

### 4.2 White-Label Subdomain Routing

```
focusrunner.io/{client-slug}/
  → Client-specific landing page variant
  → Chatbot loads with client-specific prompt and branding
  → Leads tagged with client_id for pipeline routing
```

**Resolution flow:**
1. Request arrives at `focusrunner.io/miami-medspa/`
2. Vercel rewrites to `/?client=miami-medspa`
3. Frontend JS reads client from URL param or hostname
4. Sets `X-Client-Id` on all API calls
5. Backend resolves full config from KV

### 4.3 Data Isolation Strategy

| Layer | Isolation Mechanism | Notes |
|-------|-------------------|-------|
| KV Storage | Key prefix per tenant: `leads:{clientId}:*` | Simple prefix-based isolation |
| GHL | Separate sub-account per client | GHL agency model — each client gets their own pipeline |
| Email | Per-client from address or reply-to | `{client}@focusrunner.io` via Resend routing |
| SMS | Per-client Twilio number | Separate phone numbers per client for compliance |
| Analytics | Prefix + per-client dashboard filter | CEO/CMO can view cross-client, client sees only their own |

### 4.4 Scaling

| Scale | Architecture | When |
|-------|-------------|------|
| 1-10 clients | Single Vercel project + KV | Now |
| 10-50 clients | Vercel + dedicated KV namespace per client | 2 months |
| 50+ clients | Vercel + Postgres + per-client subdomain deploy | 6+ months |

---

## 5. Entry Layer — Landing Page (Client-Facing)

**Hosting:** Vercel static site (focusrunner.vercel.app/{client-slug}/)
**Performance target:** <2s TTFB, <0.5s FID, 95+ Lighthouse

### Form Fields (POST to webhook)

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| name | text | yes | Full name |
| email | email | yes | Validated client-side |
| phone | tel | yes | E.164 format |
| service_interest | select | yes | Botox, Filler, Laser, Facial, Body, Consult |
| budget_range | select | no | $200-500, $500-1K, $1K+, Not Sure |
| timeline | select | no | This week, This month, 1-3 months, Exploring |
| source | hidden | auto | UTM_source, UTM_campaign, UTM_medium |
| gclid | hidden | auto | Google Click ID (if applicable) |

### Bot Protection
- Honeypot field (hidden from users, rejects bots that fill it)
- Rate limit: 3 submissions/IP/hour
- Simple JS challenge (button delay >2s before enabled)

### Integration Points
- **Make.com webhook:** POST to `https://hook.make.com/{webhook-id}`
- **Meta Pixel:** `fbq('track', 'Lead')` on form submit, passing `value=2500`, `currency=USD`
- **Chatbot trigger:** Load chatbot widget on page load (after 3s delay)

---

## 6. Chatbot Layer (Vercel Serverless Function)

**Endpoint:** `POST /api/chat`
**Runtime:** Vercel Edge Function (Node.js 20)
**Model:** DeepSeek Chat (via OpenAI-compatible API)

### Request/Response Contract

```json
// Request
{
  "messages": [
    {"role": "system", "content": "<client-specific prompt>"},
    {"role": "user", "content": "I'm interested in Botox"}
  ],
  "userData": {
    "name": "Jane Smith",
    "phone": "+16075551234",
    "practice": "Miami MedSpa",
    "niche": "med_spa",
    "volume": "10_30"
  }
}

// Response
{
  "reply": "Great choice, Jane! Botox is our most popular treatment...",
  "qualification": {
    "score": 85,
    "classification": "qualified",
    "budget_tier": "premium",
    "practice_size": "single",
    "monthly_ad_spend": "5000",
    "timeline": "immediate",
    "summary": "Jane Smith, 35, interested in Botox for forehead lines. Has $1K+ budget, wants to book this week. High-intent lead."
  },
  "booking_link": "https://focusrunner.com/book",
  "clientId": "client_default"
}
```

### Qualification Logic (deterministic rules applied to GPT output)

| Factor | Weight | How to evaluate |
|--------|--------|----------------|
| Budget | 30 pts | Can afford min procedure price ($200 Botox, $600 Filler, $1K+ Body) |
| Intent | 40 pts | Actively looking vs. browsing. "I want to book" = 40. "Tell me more" = 15 |
| Timeline | 30 pts | This week = 30, This month = 20, Exploring = 5 |

**Thresholds:**
- 70+ → **Qualified.** SMS booking link sent immediately
- 40-69 → **Nurture.** 10-day automated email sequence
- <40 → **Lost.** Monthly check-in only

---

## 7. Automation Layer (Make.com)

**Plan:** Core ($30/mo) — shared across all clients initially

### Scenario 1: Lead Ingest (Primary)

```
Trigger: Webhook receives form submission
  → Step 1: Parse + validate fields
  → Step 2: POST to /api/chat (OpenAI qualification)
  → Step 3: Branch on score
       ├── >= 70 → Create GHL contact (Qualified stage)
       │           → Trigger SMS w/ booking link
       │           → Log to dashboard
       ├── 40-69 → Create GHL contact (Nurture stage)
       │           → Start 10-day nurture sequence
       │           → Log to dashboard
       └── < 40 → Create GHL contact (Lost stage)
                   → Log to dashboard
```

### Scenario 2: WhatsApp/IG DM Forwarding

```
Trigger: IG DM or WhatsApp message received
  → Step 1: Check if contact exists in GHL
  → Step 2: If yes, append message to contact timeline
  → Step 3: If no, create contact + assign last-touch attribution
  → Step 4: Forward to human for manual handling (during business hours)
```

### Error Handling

| Error | Action | Alert |
|-------|--------|-------|
| OpenAI API failure | Fallback to static form submission | Slack: #alerts |
| GHL API failure | Queue message, retry 3x with backoff | Slack: #alerts |
| Webhook timeout | Log raw payload, retry | Dashboard warning |

---

## 8. CRM Layer (GoHighLevel)

**Plan:** Agency Starter ($97/mo, covers unlimited sub-accounts)

### Pipeline Stages

```
1. New Lead       → Raw leads from any source
2. Qualified      → Score >= 70, booking link sent
3. Booked         → Appointment confirmed in calendar
4. Visited        → Appointment completed
5. Post-Visit     → Follow-up sequence active
6. Nurture        → Score 40-69, email sequence active
7. Lost           → No engagement 30 days
```

### Key Automations

| Trigger | Action | Delay |
|---------|--------|-------|
| Lead enters "Qualified" | SMS: "Hi {name}, ready to book your {service} consult?" + booking link | Instant |
| No booking after 24h | SMS follow-up: "Still interested? Claim your free consult" | +24h |
| No booking after 48h | SMS + email: case study link + "Last chance for priority booking" | +48h |
| Appointment booked | Calendar reminder | -24h, -2h |
| Lead enters "Nurture" | Email 1: "What to expect from your first {service}" | Day 1 |
| | Email 2: Case study / before-after | Day 3 |
| | Email 3: Limited-time package offer | Day 5 |
| | Email 4: Re-qualification prompt | Day 10 |
| Lead enters "Visited" | SMS: Thank you + Google review request | +24h |
| | SMS: Results check-in | +7d |
| | SMS: Rebooking reminder (Botox 3-4mo cycle) | +30d |
| | SMS: Cross-sell adjacent services | +90d |

---

## 9. SMS Follow-up Pipeline

### Architecture

```
Lead qualifies (score >= 70)
    │
    ▼
/api/sms-followup (Edge Function)
    │
    ├──▶ Send SMS to Sales Team
    │     Twilio: "New qualified lead: {name} / {practice} / {score}"
    │
    ├──▶ Send SMS to Lead
    │     Twilio: "Hi {name}, ready to grow {practice}? Book your free audit: {url}"
    │
    └──▶ Tag lead as 'followup_sent' in GHL
```

### Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Provider | Twilio | Reliable, E.164 auto-format, best docs |
| Runtime | Vercel Edge Function | No infra, already in stack |
| Lead contact | SMS (not email) | 98% open rate vs 20% for email |
| Sales alert | SMS (not Slack) | Sales team on phone, SMS reaches them instantly |
| Opt-out | Reply STOP | TCPA compliance, key-based blocklist |

See `api/lib/sms-followup-ARCHITECTURE.md` for full design document.

---

## 10. Monitoring & Alerting

### Slack Alerts
- #system-alerts: API failures, integration drops, high error rates
- #client-reports: Weekly lead/conversion summary per client
- #support: Manual intervention needed (e.g., lead asks a question the AI can't answer)

### Dashboard
- Leads/day by source (Meta, IG, Organic)
- Qualification rate: % of leads that reach Qualified stage
- Booking rate: % of qualified that book
- Cost per booked appointment by client
- Monthly report auto-emailed to client

### Key Metrics

| Metric | Current | Target | How to Measure |
|--------|---------|--------|----------------|
| Lead capture → notification | ~0s (inline) | <1s | Vercel function logs |
| Lead capture → email sent | ~500ms | <2s | Resend API latency |
| Lead capture → SMS sent | ~1s | <3s | Twilio response time |
| Sales response time | ∞ (no notification) | <5 min | Tag timing in GHL |
| SMS delivery rate | N/A | >98% | Twilio delivery status |
| SMS opt-out rate | N/A | <2% | Blocklist count / total SMS |

---

## 11. Deployment Checklist (Per Client Onboarding)

| Step | Owner | Duration |
|------|-------|----------|
| 1. Create GHL sub-account + pipeline | CTO / Engineer | 30 min |
| 2. Configure automations + email templates | CTO | 1 hr |
| 3. Deploy landing page to Vercel | CTO / Engineer | 30 min |
| 4. Set up Make.com webhook + scenario | CTO | 30 min |
| 5. Configure chatbot prompt for client's services | CTO | 1 hr |
| 6. Wire Meta Pixel + UTM tracking | CTO / Engineer | 30 min |
| 7. Configure Twilio SMS (phone number, templates) | CTO / Engineer | 15 min |
| 8. Set RESEND_API_KEY + TWILIO env vars on Vercel | CTO / Engineer | 10 min |
| 9. Test full flow (form → chatbot → GHL → email → SMS) | CTO / Engineer | 1 hr |
| 10. Live walkthrough with client | CTO / Sales | 30 min |

**Total setup time:** ~4 hours. 7-day guarantee accounts for buffer + iteration.

---

## 12. Fitness Functions

| Function | Threshold | Check Frequency | Owner |
|----------|-----------|----------------|-------|
| Lead-to-qualified response time | <10s | Daily | CTO |
| Chatbot API uptime | >99.5% | Daily | CTO |
| Email notification delivery rate | >99% | Daily | CTO |
| SMS delivery rate | >98% | Weekly | CTO |
| Nurture sequence open rate | >25% | Weekly | CMO |
| Booking conversion (qualified → booked) | >40% | Weekly | CMO |
| Overall booking rate (all leads) | >20% | Monthly | CEO |
| Cost per booked appointment | <$200 | Monthly | CEO |
| Client churn | <5%/month | Monthly | CEO |
| Lead response time (sales) | <5 min | Weekly | CEO |
