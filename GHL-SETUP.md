# GoHighLevel Agency Template — Med Spa AI Patient Acquisition

**Source:** AI-SYSTEM.md, INTEGRATION-SPEC.md, AUTOMATION.md
**Author:** CTO (FOC-96)
**Date:** 2026-05-12
**Stack:** GoHighLevel Agency Starter ($97/mo)

---

## Template Overview

This document defines the GoHighLevel sub-account template for deploying the AI Patient Acquisition System to a new med spa client. Use these steps to create a repeatable sub-account in ~30 minutes.

---

## Step 1: Create Sub-Account

1. In GHL Agency view, click **Add Sub-Account**
2. Name: `{Client Name} — AI Patient Acquisition`
3. Timezone: Match client's local timezone
4. Phone: Assign Twilio number or use GHL's built-in SMS
5. Enable: **Conversations AI** (for chatbot), **Campaigns** (for nurture), **Calendar** (for booking)
6. Default language: **English** (board mandate — no exceptions)

> **Config variables to capture:** Client name, timezone, phone number, service list with prices, office hours.

---

## Step 2: Pipeline Stages

Create these 7 pipeline stages **in order** (drag to sort after creation):

| # | Stage Name     | Description                                      | Automation Trigger               |
|---|----------------|--------------------------------------------------|----------------------------------|
| 1 | New Lead       | Raw lead from any source (form, IG, DM, referral) | Auto-tag: `new-lead`             |
| 2 | Qualified      | Score >= 70 via chatbot                          | SMS booking link sent            |
| 3 | Booked         | Appointment confirmed in calendar                 | Reminder sequence starts         |
| 4 | Visited        | Appointment completed                            | Post-visit sequence starts       |
| 5 | Post-Visit     | In follow-up sequence (24h, 7d, 30d, 90d)       | Auto-move from Visited           |
| 6 | Nurture        | Score 40-69, in email sequence                    | 10-day nurture campaign          |
| 7 | Lost           | No engagement 30 days                            | Monthly re-engagement check      |

**Stage color coding:** New = gray, Qualified = green, Booked = blue, Visited = gold, Nurture = yellow, Lost = red.

---

## Step 3: Custom Fields

Create these custom fields on the Contact object:

| Field Name         | Type      | Required | Notes                                     |
|--------------------|-----------|----------|-------------------------------------------|
| service_interest   | dropdown  | Yes      | Botox, Filler, Laser, Facial, Body, Consult |
| budget_range       | dropdown  | No       | $200-500, $500-1K, $1K+, Not Sure          |
| timeline           | dropdown  | No       | This week, This month, 1-3 months, Exploring |
| lead_score         | number    | Yes      | 0-100 from chatbot qualification           |
| lead_classification| dropdown  | Yes      | qualified, nurture, not_a_fit              |
| utm_source         | text      | No       | Auto-populated from landing page           |
| utm_campaign       | text      | No       | Auto-populated from landing page           |
| source_channel     | dropdown  | Yes      | Meta Ads, Instagram DM, Organic, Referral  |
| appointment_type   | text      | No       | Treatment type they booked for             |

---

## Step 4: Automation Workflows

### Workflow A: Qualified Lead (Instant)

**Trigger:** Lead moves to "Qualified" stage

```
Step 1: Send SMS
  Template: "Hi {contact.first_name}, great news — based on your interest in {contact.service_interest}, 
  you're a perfect fit for a free consultation at {company.name}. Book your time here: {booking_link}"
  Sender: Client's Twilio number

Step 2: Wait 24 hours

Step 3: Check if lead is still in "Qualified" stage
  If YES → trigger Workflow B (Follow-up Sequence)
  If NO → (they booked) → exit
```

### Workflow B: No Booking After 24h (SMS + Email)

**Trigger:** Lead still in "Qualified" after 24h

```
Step 1: Send SMS
  Template: "Hi {contact.first_name}, just checking in! Still interested in {contact.service_interest}? 
  We have availability this week: {booking_link}"

Step 2: Wait 24 hours

Step 3: Send SMS + Email
  SMS: "Last call for priority booking this week, {contact.first_name}. 
  Book here: {booking_link} or reply to chat with our team."
  Email: Case study PDF + booking link

Step 4: If no booking after 72h total → move to "Nurture" stage
```

### Workflow C: Post-Visit Sequence

**Trigger:** Lead moves to "Visited" stage

```
Step 1 (+24h): Send SMS
  Template: "Hi {contact.first_name}, thanks for visiting {company.name}! 
  We'd love your feedback — leave a Google review: {review_link}"

Step 2 (+7d): Send SMS
  Template: "How are your results, {contact.first_name}? 
  Reply with a quick update or book a follow-up: {booking_link}"

Step 3 (+30d): Send SMS
  Template (Botox clients): "Time for your touch-up, {contact.first_name}! 
  Botox results last 3-4 months. Book your next session: {booking_link}"
  Template (Other): "Ready for your next treatment? Book here: {booking_link}"

Step 4 (+90d): Send SMS
  Template: "We have a new service you might love, {contact.first_name}. 
  Reply for details or book a consult: {booking_link}"

Step 5: After Step 4 → move to Post-Visit stage (stays for lifecycle)
```

### Workflow D: Nurture Sequence (10-Day Email Campaign)

**Trigger:** Lead moves to "Nurture" stage

```
Day 1 — Email: "What to expect from your first {service_interest} treatment"
  Content: Educational, sets expectations, builds trust

Day 3 — Email: "Before & After: Real results from {city} patients"
  Content: Social proof with case study images

Day 5 — Email: "Limited-time offer: 15% off your first treatment"
  Content: Discount + booking link + scarcity

Day 10 — Email: "Still thinking about it? Let's chat."
  Content: Re-qualification prompt + direct reply CTA

Exit conditions: Lead replies, books, or unsubscribes
```

### Workflow E: Lost Lead Monthly Check

**Trigger:** Lead moves to "Lost" stage

```
Every 30 days: Send SMS
  Template: "Hi {contact.first_name}, it's been a while! 
  If your needs have changed, we'd love to help. Reply to this message or book: {booking_link}"
```

---

## Step 5: Email Templates

### Template 1: "What to Expect" (Day 1 Nurture)

**Subject:** What to expect from your first {service_interest} treatment
**Body:**

```
Hi {contact.first_name},

Thanks for your interest in {service_interest} at {company.name}. 
We know trying a new treatment can feel like a big decision — here's what you can expect.

STEP 1: Free Consultation
A quick, no-pressure chat with our provider. We'll discuss your goals, 
answer questions, and recommend a treatment plan tailored to you.

STEP 2: Your Treatment
Most treatments take 15-45 minutes. No downtime for injectables. 
Our providers are licensed and experienced — patient comfort is priority one.

STEP 3: Results & Follow-Up
We'll check in after your visit to make sure you're happy with your results. 
Long-term clients get priority booking and exclusive offers.

Ready to book? {booking_link}

See you soon,
The {company.name} Team
```

### Template 2: Case Study (Day 3 Nurture)

**Subject:** Real results: {service_interest} before & after
**Body:** [Custom per client — use their actual before/after photos]

### Template 3: Limited Offer (Day 5 Nurture)

**Subject:** 15% off your first {service_interest} treatment
**Body:** [Limited-time offer with booking link]

### Template 4: Re-Qualification (Day 10 Nurture)

**Subject:** Still interested in {service_interest}?
**Body:** A friendly, low-pressure re-engagement that asks them to reply or book.

---

## Step 6: SMS Templates

Create these SMS templates in GHL:

| Name | Content | Character Count |
|------|---------|-----------------|
| booking_link | "Hi {first_name}, based on your interest in {service_interest} you're a perfect fit for a free consultation! Book here: {booking_link}" | ~160 |
| followup_24h | "Still interested in {service_interest}, {first_name}? We have availability this week: {booking_link}" | ~120 |
| followup_48h | "Last call for priority booking, {first_name}. Book here: {booking_link} or reply to chat." | ~110 |
| post_visit_24h | "Thanks for visiting {company_name}! Love to hear your feedback: {review_link}" | ~100 |
| post_visit_7d | "How are your results, {first_name}? Book a follow-up: {booking_link}" | ~85 |
| rebook_30d | "Time for your touch-up, {first_name}! Book your next session: {booking_link}" | ~90 |
| lost_monthly | "Hi {first_name}, it's been a while! If your needs have changed, we'd love to help: {booking_link}" | ~120 |

---

## Step 7: Booking Configuration

1. Go to **Calendar** → **Services**
2. Create service types matching client's treatments:
   - Botox Consultation (15 min)
   - Filler Consultation (15 min)
   - Laser Consultation (30 min)
   - Facial Consultation (15 min)
   - Body Treatment Consult (30 min)
3. Set availability to match client's office hours
4. Enable **Buffer time**: 15 min between appointments
5. Enable **Reminders**: SMS at -24h, -2h
6. Enable **Auto-confirm**: Yes

---

## Step 8: Team Permissions

| Role | GHL Access Level |
|------|------------------|
| Client (Owner) | Full access (can view pipeline, calendar, reports) |
| Client (Staff) | Limited — view contacts + calendar only |
| FocusRunner (Admin) | Full agency access |

Set client access via **Agency View** → **Sub-Account** → **Users**.

---

## Step 9: QA Checklist

Before marking the sub-account as ready:

- [ ] Pipeline stages created and ordered correctly (New → Qualified → Booked → Visited → Post-Visit → Nurture → Lost)
- [ ] Custom fields created and mapped
- [ ] Workflow A triggers on Qualified stage entry
- [ ] Workflow B triggers after 24h in Qualified
- [ ] Workflow C triggers on Visited stage entry
- [ ] Workflow D starts on Nurture stage entry
- [ ] Email templates created and linked to Workflow D
- [ ] SMS templates created and linked to Workflow A, B, C, E
- [ ] Calendar configured with correct services and availability
- [ ] Test lead: create a test contact, move through pipeline, verify SMS fires
- [ ] Booking link generated and works end-to-end
- [ ] Twilio number assigned and verified

---

## Per-Client Config Variables

| Variable | Where to Set | Example |
|----------|-------------|---------|
| Client name | Sub-account name | "Serenity Med Spa" |
| Service list | Calendar → Services | Botox, Filler, Laser |
| Price ranges | Workflow templates + Email body | "$200-500 per area" |
| Booking link | Calendar → Widget → Share | https://app.gohighlevel.com/... |
| Twilio number | Settings → Phone Numbers | +16025551234 |
| Office hours | Calendar → Hours | Mon-Sat 9AM-6PM |
| Review link | Workflow C template | https://g.page/r/review |
| Brand colors | Sub-account → Branding | #1a1a2e, #e94560 |

---

**Template setup time:** ~30 minutes per client.
