# AI Patient Acquisition System — Med Spa Architecture

**Version:** 1.0  
**Last Updated:** 2026-05-11  
**Owner:** FocusRunner CTO  
**Goal:** Automate lead qualification, booking, and follow-up for med spa clients

---

## System Overview

An end-to-end AI pipeline that captures Meta Ads traffic, qualifies leads through conversational AI, routes qualified leads to booking, and runs automated follow-up sequences for unconverted leads.

```
Meta Ads → Landing Page (form) → AI Chatbot (qualification) → GoHighLevel (CRM)
                                          ↓                          ↓
                                    Qualified Lead           Booking Confirmed
                                          ↓                          ↓
                                    Push to Calendar        Post-Visit Follow-up
                                          ↓
                                    If No Booking → Follow-up Sequence (email/SMS)
```

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        META ADS LAYER                               │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────────────┐      │
│  │ FB/IG Ads│───▶│ Lead Form│───▶│ UTM + Pixel Tracking     │      │
│  └──────────┘    └──────────┘    └──────────┬───────────────┘      │
└─────────────────────────────────────────────┼──────────────────────┘
                                              │ Webhook
┌─────────────────────────────────────────────▼──────────────────────┐
│                     QUALIFICATION LAYER                             │
│  ┌──────────────────────────────────────────────────────────┐      │
│  │  OpenAI GPT-4o (Conversational AI)                        │      │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐                │      │
│  │  │ Budget   │  │ Intent   │  │ Timeline │  → Score 0-100 │      │
│  │  │ Check    │  │ Match    │  │ Urgency  │                │      │
│  │  └──────────┘  └──────────┘  └──────────┘                │      │
│  └──────────────────────┬───────────────────────────────────┘      │
│                         │ JSON (score + classification)             │
└─────────────────────────┼──────────────────────────────────────────┘
                          │
              ┌───────────┴───────────┐
              ▼                       ▼
      Score ≥ 70                  Score < 70
      QUALIFIED                   NURTURE
              │                       │
┌─────────────▼──────────┐  ┌─────────▼──────────────────┐
│    BOOKING LAYER       │  │    NURTURE SEQUENCE         │
│                        │  │                             │
│  GoHighLevel Calendar  │  │  Day 1:  Value email        │
│  SMS confirmation      │  │  Day 3:  Case study         │
│  Email reminder seq    │  │  Day 5:  Limited offer      │
│                        │  │  Day 10: Re-qualify         │
└────────────┬───────────┘  └─────────────────────────────┘
             ▼
┌────────────────────────────────────────────────────────┐
│              POST-VISIT LAYER                           │
│                                                        │
│  Visit +24h:  Thank you + review request               │
│  Visit +7d:   Follow-up results check                  │
│  Visit +30d:  Rebooking reminder (Botox 3-4mo cycle)   │
│  Visit +90d:  New service offer                        │
└────────────────────────────────────────────────────────┘
```

---

## Tool Stack

| Layer | Tool | Purpose | Monthly Cost (Est.) |
|-------|------|---------|---------------------|
| Ads | Meta Ads Manager | Traffic acquisition | Client's ad budget |
| Landing | Vercel (static) | High-speed landing pages | $0 (free tier) |
| Forms | Typeform / custom JS | Lead capture | $25–50 |
| AI Chat | OpenAI GPT-4o API | Conversational qualification | $50–200 |
| Automation | Make.com (formerly Integromat) | Webhook routing, logic branching | $30 (Core plan) |
| CRM | GoHighLevel | Contact management, pipeline, calendar, SMS/email, automations | $97–297 |
| Calendar | GoHighLevel built-in | Booking widget, availability, reminders | Included |
| SMS | Twilio (via GHL) | Booking confirmations, reminders | $10–30 |
| Analytics | Meta Pixel + GHL reporting | Attribution, conversion tracking | Included |

**Total tech cost per client:** $140–$375/month (tools only, excluding ad spend)

---

## Implementation Steps

### Phase 1: Foundation (Day 1–3)

1. **GoHighLevel Setup**
   - Create sub-account for the med spa
   - Configure pipeline stages: New Lead → Qualified → Booked → Visited → Nurture → Lost
   - Set up calendar with service types (Botox, Filler, Laser, Facial, Consult)
   - Configure SMS/email sending domains

2. **Landing Page**
   - Build single-page lead capture on Vercel
   - Embedded form (Name, Phone, Email, Service Interest dropdown)
   - Meta Pixel for conversion tracking
   - UTM parameter forwarding into hidden form fields

3. **OpenAI Chatbot Integration**
   - Create GPT-4o system prompt for med spa qualification
   - Deploy as Vercel serverless function (/api/chat endpoint)
   - Return JSON: `{score, classification, summary, bookingLink}`

### Phase 2: Automation (Day 4–6)

4. **Make.com Webhook Flow**
   - Form submission → webhook to Make.com
   - Make.com calls OpenAI chat endpoint
   - Branch: score ≥ 70 → GHL "Qualified" stage + trigger SMS with booking link
   - Branch: score < 70 → GHL "Nurture" stage + start email sequence

5. **GoHighLevel Automations**
   - **Qualified Lead Workflow:**
     - SMS: "Hi {name}, it looks like you're a great fit for {service}! Book your free consult here: {link}"
     - No booking in 24h → follow-up SMS
     - Booking confirmed → calendar invite + reminder sequence
   - **Nurture Sequence (10 days):**
     - Day 1: Educational email (what to expect)
     - Day 3: Social proof (before/after, testimonial)
     - Day 5: Limited-time offer or package deal
     - Day 10: Re-qualification prompt ("Still interested? Let's chat")

### Phase 3: Post-Visit (Day 7)

6. **Post-Visit Automation**
   - +24h: Thank you SMS + Google Review link
   - +7d: "How are your results?" check-in
   - +30d: Rebooking reminder (aligned to Botox 3-4 month cycle)
   - +90d: Cross-sell adjacent services (filler after Botox, laser after facial)

### Phase 4: Optimization (Ongoing)

7. **Analytics & Tuning**
   - Track by UTM campaign: CPL (cost per lead), CPLQ (cost per lead qualified), CPA (cost per acquisition)
   - A/B test chatbot qualification thresholds
   - Monitor drop-off in nurture sequence → adjust timing/content
   - Monthly report: leads → qualified → booked → revenue

---

## OpenAI System Prompt Template

```
You are a medical spa patient concierge for {SPA_NAME}. Your role is to
qualify leads by understanding their needs, budget, and timeline.

SERVICES: {list of services with price ranges}
TARGET CLIENT: {demographic, typical spend, common concerns}

QUALIFICATION RULES:
- Budget: Can they afford {MIN_PROCEDURE_PRICE}+? (30 points)
- Intent: Are they actively looking for treatment or just browsing? (40 points)
- Timeline: Do they want to book within 2 weeks? (30 points)

CONVERSATION FLOW:
1. Friendly greeting — thank them for their interest
2. Ask what service they're interested in
3. Understand their goal (anti-aging, acne, body contouring, etc.)
4. Gently ask about budget range
5. Ask about preferred timeline
6. If qualified, offer booking link enthusiastically
7. If not, thank them and let them know about future offers

OUTPUT FORMAT: At the end of the conversation, output a JSON block:
{
  "score": 0-100,
  "classification": "qualified" | "nurture" | "not_a_fit",
  "budget_tier": "premium" | "mid" | "budget",
  "service_interest": "service name",
  "timeline": "immediate" | "within_month" | "exploring",
  "summary": "1-sentence lead summary for sales team",
  "booking_link": "https://calendar.spa.com/book"
}

TONE: Warm, professional, consultative. Never pushy. Educate while qualifying.
```

---

## GoHighLevel Pipeline & Automation Setup

### Pipeline Stages

```
1. New Lead        → Form submitted, waiting qualification
2. Qualified       → Score ≥ 70, booking link sent
3. Booked          → Appointment in calendar
4. Visited         → Completed appointment
5. Post-Visit      → In follow-up sequence
6. Nurture         → Score < 70, in email sequence
7. Lost            → No engagement after 30 days
```

### Key Automations

| Trigger | Action | Timing |
|---------|--------|--------|
| Lead enters "Qualified" | SMS with booking link | Immediately |
| No booking after 24h | SMS follow-up #1 | +24h |
| No booking after 48h | SMS follow-up #2 + email | +48h |
| Appointment booked | Trigger reminder sequence | -24h, -2h |
| Lead enters "Nurture" | Start 4-email nurture sequence | Throttled over 10 days |
| Lead enters "Visited" | Trigger post-visit sequence | +24h, +7d, +30d, +90d |
| No engagement 30 days | Move to "Lost" | +30d |

---

## Cost Structure & Margins

### Client Pricing (per month)

| Package | Price | Includes |
|---------|-------|----------|
| Starter | $997 | Landing page, chatbot, CRM setup, basic automations |
| Growth | $1,997 | All Starter + ad management coordination, nurture sequences |
| Scale | $3,997 | All Growth + custom AI tuning, weekly reporting, brand strategy |

### Our Costs (per client)

| Item | Monthly |
|------|---------|
| OpenAI API | $50–200 |
| Make.com (shared across clients) | $30 total |
| GoHighLevel sub-account | $0 (included in our agency plan) |
| Vercel hosting | $0 |
| **Total tech cost** | **$80–230** |

### Margin

- Starter: ~80% margin ($800 profit)
- Growth: ~88% margin ($1,770 profit)
- Scale: ~94% margin ($3,770 profit)

High margin because fixed costs are shared across all clients — the marginal cost of adding a client is near $0 after initial setup.

---

## Expected Outcomes

### For the Med Spa Client

| Metric | Before (Manual) | After (AI System) |
|--------|-----------------|-------------------|
| Lead response time | 4–24 hours | Instant |
| Lead qualification rate | ~30% of leads screened | 100% screened |
| Booking rate (qualified) | ~40% | ~55–65% |
| No-show rate | ~20% | ~10% (automated reminders) |
| Re-booking rate (30d) | ~15% | ~30–40% |
| Front desk time on leads | 15–20 hrs/week | 2–3 hrs/week |

### For FocusRunner

| Metric | Per Client (Growth Package) |
|--------|----------------------------|
| Monthly recurring revenue | $1,997 |
| Monthly tech cost | ~$150 |
| Gross margin | ~92% |
| Annual client value | $23,964 |
| Client retention (est.) | 70–80% at 12 months |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| OpenAI API downtime | Fallback to static form submission, queue for bot pickup |
| HIPAA compliance for patient data | No PHI stored in chatbot — qualification only uses intent/budget/timeline. CRM handles PHI through GHL's HIPAA-compliant mode |
| Chatbot gives bad medical advice | System prompt explicitly forbids medical advice. Qualifies only — routes to human for clinical questions |
| Low conversion from ads | Monthly ad creative refresh. A/B test landing pages. Optimize chatbot prompts quarterly |

---

## Next Steps

1. CEO to sign off on med spa niche focus (is this the pilot client vertical?)
2. Build Vercel landing page template (assigned to Senior Engineer)
3. Deploy OpenAI chatbot endpoint as serverless function (assigned to Engineer)
4. Configure GoHighLevel sub-account template with all automations (CTO + Sales)
5. Wire Make.com webhook flow (CTO + Engineer)
6. Pilot with 1 friendly med spa (free/discounted first month)
7. Iterate on chatbot prompts based on real conversations
8. Document case study for portfolio
