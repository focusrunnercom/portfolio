# Med Spa Funnel Automation — Zapier/Make Workflows

**Version:** 1.0  
**Last Updated:** 2026-05-11  
**Owner:** FocusRunner  
**Goal:** Wire the entire med spa patient acquisition funnel end-to-end

---

## Automation Map

```
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│ META ADS │ →  │ LANDING  │ →  │ CHATBOT  │ →  │   CRM    │ →  │ BOOKING  │
│  (Lead)  │    │  (Form)  │    │ (Qualify)│    │(GoHighLvl)│   │(Calendly)│
└──────────┘    └──────────┘    └──────────┘    └──────────┘    └──────────┘
                                                       │
                                               ┌───────┴───────┐
                                               ▼               ▼
                                         ┌──────────┐   ┌──────────┐
                                         │ 5-TOUCH  │   │ DASHBOARD│
                                         │ FOLLOW-UP│   │ (Looker) │
                                         └──────────┘   └──────────┘
```

---

## Workflow 1: Lead Capture → CRM

**Trigger:** New form submission on landing page  
**Platform:** Zapier (preferred) or Make

### Steps

1. **Trigger:** Webhook catches form POST from landing page
   - Fields: `name`, `email`, `phone`, `service_interest`, `budget_range`, `timeline`
   
2. **Enrich:** Run lead through phone/email validation
   - Zapier's built-in formatter: Validate Email, Format Phone (E.164)
   
3. **Create/Update CRM Contact (GoHighLevel)**
   - Endpoint: `POST https://rest.gohighlevel.com/v1/contacts/`
   - Map fields:
     ```
     firstName  ← name (split first)
     lastName   ← name (split last)
     email      ← email
     phone      ← phone (E.164)
     customField.serviceInterest ← service_interest
     customField.budgetRange     ← budget_range
     customField.timeline        ← timeline
     tags: ["med-spa-lead", "ai-patient-acquisition"]
     ```
   - Source: "AI Patient Acquisition — Meta Ads"

4. **Add to Campaign:** Auto-enroll in "Med Spa Nurture" campaign
   
5. **Slack/Email Alert:** Notify sales team for leads with `budget_range ≥ $2,500`

### Zapier Zap Structure
```
Webhook (Catch Hook) → Formatter (Validate) → GoHighLevel (Create Contact) 
→ GoHighLevel (Add to Campaign) → Filter (Budget ≥ $2500?) → Slack (Alert)
```

---

## Workflow 2: AI Chatbot Qualification

**Trigger:** Lead enters CRM → auto-assigned to chatbot flow  
**Platform:** OpenAI API + GoHighLevel Conversations

### Chatbot Flow

```
WELCOME
  "Hey {firstName}! I noticed you're interested in patient acquisition for {practiceName}. 
   Quick question — what's your biggest challenge right now?"
   
  └─→ Q1: Challenge type
       ├─ "Not enough new patients"      → tag: cold-traffic
       ├─ "Patients book but no-show"    → tag: conversion-issue
       ├─ "Too busy for marketing"       → tag: capacity-ceiling
       └─ "Just exploring options"       → tag: top-of-funnel
  
  └─→ Q2: Monthly marketing budget
       ├─ "$0–$1,000"    → score: -1
       ├─ "$1K–$3K"      → score: 0
       ├─ "$3K–$5K"      → score: +1
       └─ "$5K+"         → score: +2
  
  └─→ Q3: Timeline to start
       ├─ "This week"         → score: +2, priority: high
       ├─ "This month"        → score: +1
       ├─ "Next quarter"      → score: 0
       └─ "Just researching"  → score: -1

SCORE ≥ 3 → "QUALIFIED — Let's book a call"
SCORE 1-2 → "WARM — Send case study, nurture"
SCORE ≤ 0 → "COLD — Add to newsletter sequence"
```

### Qualification Logic (OpenAI API)

```python
import openai

QUALIFICATION_PROMPT = """
You are qualifying a med spa owner for FocusRunner's AI Patient Acquisition System ($2.5K setup / $2.5K/mo).

Based on this conversation, classify the lead:
- QUALIFIED: Budget ≥ $3K/mo, starting within 30 days, clear pain point
- WARM: Budget $1K–$3K, starting within 60 days, interested but not urgent
- COLD: Budget < $1K, timeline > 60 days, just browsing

Return JSON: {"classification": "QUALIFIED|WARM|COLD", "score": 0-5, "next_action": "..."}
"""

def qualify_lead(conversation_history):
    response = openai.chat.completions.create(
        model="gpt-4o-mini",
        messages=[
            {"role": "system", "content": QUALIFICATION_PROMPT},
            *conversation_history
        ],
        response_format={"type": "json_object"}
    )
    return json.loads(response.choices[0].message.content)
```

---

## Workflow 3: Booking Handoff

**Trigger:** Lead classified as QUALIFIED  
**Action:** Push to Calendly + notify sales

### Steps

1. **Create Calendly scheduling link**
   - Event type: "AI Patient Acquisition Strategy Call" (45 min)
   - Pre-fill: name, email, phone
   
2. **Send booking message via GoHighLevel**
   ```
   "Great news {firstName} — based on what you shared, our AI Patient Acquisition System 
   would be a strong fit for {practiceName}. 

   I've set aside 45 minutes to walk you through exactly how it works and what results 
   you can expect. Pick a time that works: {calendly_link}"
   ```

3. **Create task in CRM**
   - Assign to: Sales
   - Due: 1 hour before scheduled call
   - Notes: Include lead score, classification, conversation summary

4. **If no booking within 24h** → Trigger Workflow 4 (Follow-up)

---

## Workflow 4: 5-Touch Follow-Up Sequence

**Trigger:** Lead classified as WARM, or QUALIFIED lead didn't book within 24h  
**Platform:** GoHighLevel Campaigns or Make

### Touch Sequence

| # | Channel | Timing | Content |
|---|---------|--------|---------|
| 1 | Email | +1 day | Case study PDF — "How [Similar Med Spa] Added 47 New Patients in 90 Days" |
| 2 | SMS | +3 days | "Hey {firstName}, quick thought on patient acquisition — worth 2 min?" |
| 3 | Email | +5 days | ROI calculator — "Here's what 10 extra patients/month means for your revenue" |
| 4 | SMS | +8 days | Social proof — "3 med spa owners switched to us last month. Here's why." |
| 5 | Email | +12 days | Breakup — "Closing your file. If timing changes, reply to this email." |

### GoHighLevel Campaign Setup

```
Campaign Name: "Med Spa — AI Patient Acquisition Nurture"
Triggers: 
  - Contact tag added: "warm-lead"
  - Contact tag added: "qualified-no-booking" AND no booking in 24h

Sequence:
  Wait 1 day → Send Email Template "Case Study"
  Wait 2 days → Send SMS Template "Quick Thought"
  Wait 2 days → Send Email Template "ROI Calculator"
  Wait 3 days → Send SMS Template "Social Proof"
  Wait 4 days → Send Email Template "Breakup"

Exit conditions:
  - Booking created
  - Contact replied
  - Contact unsubscribed
```

---

## Workflow 5: Dashboard & Reporting

**Platform:** Google Looker Studio + GoHighLevel + Meta Ads

### Key Metrics

| Metric | Source | Target |
|--------|--------|--------|
| Ad Spend | Meta Ads | $500–$2,000/mo per client |
| CPL (Cost Per Lead) | Meta Ads → CRM | ≤ $25 |
| Lead → Qualification Rate | Chatbot → CRM | ≥ 40% |
| Qualification → Booking Rate | CRM → Calendly | ≥ 30% |
| Booking → Close Rate | CRM (manual) | ≥ 40% |
| CAC (Customer Acquisition Cost) | Ad Spend / New Clients | ≤ $500 |
| LTV (Lifetime Value) | Avg monthly × retention | ≥ $15,000 |
| ROAS | Revenue / Ad Spend | ≥ 5x |

### Dashboard Setup

1. **GoHighLevel → Google Sheets sync**
   - Zapier zap: New/Updated Contact → Append to Google Sheet
   - Columns: contact_id, created_date, source, status, tags, booking_date, revenue

2. **Meta Ads → Google Sheets sync**
   - Supermetrics or Funnel.io connector
   - Daily: impressions, clicks, spend, conversions

3. **Looker Studio**
   - Data sources: Google Sheets (CRM + Meta)
   - Blended data: Join on date for ROAS calculation
   - Pages:
     - Overview: Total leads, qualified, booked, revenue, ROAS
     - Funnel: Lead → Qualified → Booked → Closed (conversion rates)
     - Ads: Spend by campaign, CPL, CTR, conversion rate
     - Clients: Per-client breakdown

---

## Implementation Checklist

### Phase 1 — Foundation (Week 1)
- [ ] Create Zapier account (Professional plan: $49/mo)
- [ ] Connect GoHighLevel to Zapier
- [ ] Build Workflow 1 (Lead Capture → CRM)
- [ ] Test with sample form submission
- [ ] Verify contact creation in GoHighLevel

### Phase 2 — Intelligence (Week 2)
- [ ] Set up OpenAI API key (billing enabled)
- [ ] Deploy chatbot qualification script (Workflow 2)
- [ ] Connect GoHighLevel Conversations to OpenAI
- [ ] Test qualification flow end-to-end
- [ ] Fine-tune scoring thresholds

### Phase 3 — Conversion (Week 3)
- [ ] Connect Calendly to GoHighLevel
- [ ] Build Workflow 3 (Booking Handoff)
- [ ] Create 5-touch campaign in GoHighLevel (Workflow 4)
- [ ] Test booking → follow-up flow

### Phase 4 — Visibility (Week 4)
- [ ] Set up Google Sheets sync
- [ ] Build Looker Studio dashboard
- [ ] Create automated weekly report
- [ ] Set up anomaly alerts (e.g., CPL spike > 30%)

---

## Monthly Operating Costs

| Tool | Plan | Cost |
|------|------|------|
| Zapier | Professional | $49/mo |
| GoHighLevel | Agency Pro | $297/mo |
| OpenAI API | Pay-as-you-go | ~$50/mo |
| Calendly | Teams | $20/mo |
| Supermetrics (optional) | Basic | $69/mo |
| **Total** | | **~$485/mo** |

*Note: These are FocusRunner's internal tooling costs. Client pays $2,500/mo for the managed service.*

---

## Troubleshooting

### Lead not appearing in CRM
1. Check Zapier task history for errors
2. Verify GoHighLevel API key is active
3. Check webhook URL matches landing page form action

### Chatbot not responding
1. Verify OpenAI API key has billing
2. Check GoHighLevel Conversations webhook is active
3. Review rate limits (GPT-4o-mini: 200 RPM)

### Booking link not sending
1. Check Calendly API connection in Zapier
2. Verify event type UUID is correct
3. Check GoHighLevel message template for variable errors
