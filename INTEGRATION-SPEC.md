# INTEGRATION-SPEC.md — End-to-End System Wiring

**Author:** FocusRunner CTO (via CEO directive)
**Sources:** AI-SYSTEM.md, AUTOMATION.md, OUTREACH-SCRIPTS.md, LANDING-PAGE.md, SALES-SCRIPTS.md
**Date:** 2026-05-12

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
                    │  │  /api/chat — OpenAI GPT-4o-mini              │     │
                    │  │  Input: {messages[], userData{}}             │     │
                    │  │  Output: {reply, qualification{score, ...}}  │     │
                    │  └──────────────────────┬───────────────────────┘     │
                    │                         │ JSON result                 │
                    │  ┌──────────────────────▼───────────────────────┐     │
                    │  │  Make.com Scenario Router                     │     │
                    │  │  - score >= 70 → Qualified → GHL pipeline     │     │
                    │  │  - score 40-69 → Nurture → GHL + email seq   │     │
                    │  │  - score < 40 → Lost → GHL + monthly check   │     │
                    │  └──────────────────────┬───────────────────────┘     │
                    └─────────────────────────┼─────────────────────────────┘
                                              │
                    ┌─────────────────────────▼─────────────────────────────┐
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

## 1. Entry Layer — Landing Page (Client-Facing)

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

## 2. Chatbot Layer (Vercel Serverless Function)

**Endpoint:** `POST /api/chat`
**Runtime:** Node.js 20, Edge-ready
**Model:** OpenAI GPT-4o-mini (faster + cheaper than GPT-4o for qualification)

### Request/Response Contract

```json
// Request
{
  "messages": [
    {"role": "system", "content": "<system prompt from AI-SYSTEM.md>"},
    {"role": "user", "content": "I'm interested in Botox"}
  ],
  "userData": {
    "name": "Jane Smith",
    "phone": "+16025551234",
    "service_interest": "Botox"
  }
}

// Response
{
  "reply": "Great choice, Jane! Botox is our most popular treatment...",
  "qualification": {
    "score": 85,
    "classification": "qualified",
    "budget_tier": "premium",
    "service_interest": "Botox",
    "timeline": "immediate",
    "summary": "Jane Smith, 35, interested in Botox for forehead lines. Has $1K+ budget, wants to book this week. High-intent lead."
  }
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

### Integration Points
- **Make.com:** POST to `/api/chat` on form submission. Make.com receives JSON, branches on score
- **GHL:** When score >= 70, Make.com creates GHL contact at "Qualified" stage
- **Monitoring:** Log every conversation (anonymized) for quality scoring + prompt iteration

---

## 3. Automation Layer (Make.com)

**Plan:** Core ($30/mo) — shared across all clients initially

### Scenario 1: Lead Ingest

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

## 4. CRM Layer (GoHighLevel)

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

### Coaching Budget on Attached Guest

Source issue FOC-94 displays `coachingBudgetCents` on the attached Guest, but its raw value shows as a number when inspected. PATCHing via JSON may be fragile. The reliable pattern is:

```http
PATCH /api/companies/{companyId}/guests/{guestId}
Content-Type: application/json

{"coachingBudgetCents": <integer>}
```

If this fails, try PATCH on the **sponsorship** object:

```http
PATCH /api/sponsorships/{sponsorshipId}
Content-Type: application/json

{"coachingBudgetCents": <integer>}
```

---

## 5. Monitoring & Alerting

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

---

## 6. Deployment Checklist (Per Client Onboarding)

| Step | Owner | Duration |
|------|-------|----------|
| 1. Create GHL sub-account + pipeline | CTO / Engineer | 30 min |
| 2. Configure automations + email templates | CTO | 1 hr |
| 3. Deploy landing page to Vercel | CTO / Engineer | 30 min |
| 4. Set up Make.com webhook + scenario | CTO | 30 min |
| 5. Configure chatbot prompt for client's services | CTO | 1 hr |
| 6. Wire Meta Pixel + UTM tracking | CTO / Engineer | 30 min |
| 7. Test full flow (form → chatbot → GHL → SMS) | CTO / Engineer | 1 hr |
| 8. Live walkthrough with client | CTO / Sales | 30 min |

**Total setup time:** ~4 hours. 7-day guarantee accounts for buffer + iteration.

---

## 7. Fitness Functions

| Function | Threshold | Check Frequency | Owner |
|----------|-----------|----------------|-------|
| Lead-to-qualified response time | <10s | Daily | CTO |
| Chatbot API uptime | >99.5% | Daily | CTO |
| SMS delivery rate | >98% | Weekly | CTO |
| Nurture sequence open rate | >25% | Weekly | CMO |
| Booking conversion (qualified → booked) | >40% | Weekly | CMO |
| Overall booking rate (all leads) | >20% | Monthly | CEO |
| Cost per booked appointment | <$200 | Monthly | CEO |
| Client churn | <5%/month | Monthly | CEO |
