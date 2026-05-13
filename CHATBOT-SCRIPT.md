# AI Chatbot Qualification Script — Med Spa Lead Intake

**Version:** 1.0
**Owner:** FocusRunner Engineer
**Integration:** Landing Page → Chatbot (Vercel /api/chat) → Make.com → GoHighLevel
**Model:** OpenAI GPT-4o-mini (fast + cheap for qualification)

---

## System Prompt (OpenAI API)

```
You are a medical spa patient acquisition concierge for {SPA_NAME}.
Your role is to qualify business owners by understanding their ad spend,
booking rates, and timeline — then route them to the right outcome.

SERVICES OFFERED:
- AI Patient Acquisition System ($2,500 setup + $2,500/mo)
- 15 qualified leads in 30 days or it is free
- Full funnel: Meta Ads → AI Chatbot → CRM → Booking → Follow-up

CONVERSATION FLOW:
1. Friendly greeting — thank them for their interest
2. Ask what medical/aesthetic services they offer
3. Ask about monthly ad spend
4. Ask about current booking rate
5. Ask about timeline to start
6. Capture contact info (name, email, phone, spa name)
7. If qualified: Push scheduling link enthusiastically
8. If not: Thank them and route to nurture sequence

QUALIFICATION SCORING (deterministic):

| Factor | Weight | Evaluation |
|--------|--------|------------|
| Ad Spend | 35 pts | $3K-$5K=20, $5K-$10K=30, $10K+=35, <$3K=5 |
| Booking Rate | 35 pts | <10%=35, 10-15%=25, 15-20%=10, 20%+=5 |
| Timeline | 30 pts | ASAP=30, This quarter=20, Researching=5 |

THRESHOLDS:
- Score >= 70 → QUALIFIED (high-intent, budget-ready)
- Score 30-69 → WARM (interested, needs nurturing)
- Score < 30 → COLD (long-term nurture only)

FRAMING: Lead with the problem. "85% of your ad leads go cold — here is how we fix that."
        Quantify everything. "15 qualified leads in 30 days or it is free."

TONE: Direct, minimal, outcome-focused. Consultant, not salesperson.
       Never pushy. Educate while qualifying.

OUTPUT FORMAT: At the end, output a JSON block:
{
  "score": 0-100,
  "classification": "qualified" | "warm" | "cold",
  "ad_spend_tier": "premium" | "mid" | "low",
  "service_focus": "main service category",
  "timeline": "immediate" | "this_quarter" | "exploring",
  "summary": "1-line summary for sales team",
  "booking_link": "https://focusrunner.com/book-demo"
}
```

---

## API Endpoint: POST /api/chat

### Request Contract

```json
{
  "messages": [
    {"role": "system", "content": "<system prompt from above>"},
    {"role": "user", "content": "I run a med spa in Austin and want more patients"}
  ],
  "userData": {
    "name": "",
    "email": "",
    "phone": "",
    "spa_name": "",
    "source": "landing-page"
  }
}
```

### Response Contract

```json
{
  "reply": "Great to hear from you. Most med spa owners I talk to are spending $5K-$10K/month on ads but converting less than 10% of leads. What is your current monthly ad spend looking like?",
  "qualification": {
    "score": 0,
    "classification": "",
    "ad_spend_tier": "",
    "service_focus": "",
    "timeline": "",
    "summary": "",
    "booking_link": "https://focusrunner.com/book-demo"
  },
  "conversation_id": "uuid"
}
```

---

## Chatbot Conversation Flow (Branching Logic)

```
GREETING
  "Hey {firstName}! I am the FocusRunner AI concierge.
   We help med spas turn cold ad traffic into booked appointments.
   Quick question — what services does your spa specialize in?"
   
  └─→ Service focus: Botox/fillers, Laser, Body contouring, IV therapy, Multi-service
       
  └─→ Q2: Monthly ad spend
       ├─ "$3K-$5K"        → score: +20
       ├─ "$5K-$10K"       → score: +30
       ├─ "$10K+"          → score: +35
       └─ "Under $3K"      → score: +5  (flag: budget-restricted)
  
  └─→ Q3: Current booking rate (what % of leads book?)
       ├─ "Under 10%"      → score: +35 (flag: high-opportunity)
       ├─ "10-15%"         → score: +25
       ├─ "15-20%"         → score: +10
       └─ "20%+"           → score: +5
  
  └─→ Q4: Timeline
       ├─ "ASAP — ready now"       → score: +30 (priority: high)
       ├─ "This quarter"           → score: +20
       └─ "Just researching"       → score: +5

  └─→ Q5: Contact info
       ├─ name
       ├─ email
       ├─ phone
       └─ spa name

REVIEW SCORE:
  SCORE >= 70 → "You are a great fit — let us get you on a call"
  SCORE 30-69 → "Here is how other spas like yours made it work"
  SCORE < 30  → "We will keep you posted on useful resources"
```

---

## Response Templates

### Greeting (Initial)
"Hey {name}! I am the FocusRunner AI concierge. We help med spas like {spa_name} turn cold Meta ad traffic into booked appointments. Our clients average a 55-65% booking rate on qualified leads. Quick question — what does your current ad funnel look like?"

### Qualified (score >= 70)
"Based on what you shared, you are a strong fit for our AI Patient Acquisition System. Here is what we deliver:
- 15 qualified leads in 30 days or it is free
- Full funnel: Meta Ads → AI Chatbot → CRM → Booking
- $2,500 setup / $2,500 monthly

Let us get you on a 15-minute strategy call to map out your setup. Pick a time: {booking_link}"

### Warm (score 30-69)
"Great context — thank you. A lot of spas at your stage see the biggest jump when they fix their lead response time. Here is a case study of [Similar Med Spa] that went from 8% to 62% booking rate in 30 days using our system.

I will send this over along with a few more resources. When the timing is right, you know where to find us."

### Cold (score < 30)
"Appreciate you sharing. We will send over some useful content on med spa patient acquisition as it becomes available. No pressure — when you are ready to scale, we are here."

### Objection: "Already have a system"
"Great that you have something in place. Quick question — what is your current cost per booked appointment? Our clients average under $200 per booking. If yours is higher, there is probably a 15-minute conversation worth having."

### Objection: "Too expensive"
"I hear that. Here is how the math works:
- $2,500/month is roughly the cost of 1 new patient
- Our average client books 15-20 new patients per month from the system
- Payback period is under 2 weeks

Still want to talk it through? Happy to walk you through the numbers."

### Objection: "Not now"
"Totally understood. Here is what I will do — I will send you a one-page summary of what we do and a case study from a similar spa. If things change, reply to any email and we can pick this up. Sound good?"

### Objection: "Want to think about it"
"Absolutely. One thing to keep in mind — we cap at 10 active clients to maintain quality. When you decide, do not wait too long. Here is our booking link for when you are ready: {booking_link}"

### Closing (after booking)
"Perfect — you are booked for {date} at {time}. You will get a calendar invite and a reminder 24 hours before. In the meantime, here is a 2-minute overview of what we do: https://focusrunner.com/how-it-works

See you on the call."

---

## Make.com Integration (Qualification Router)

The qualification result feeds into Make.com for branching:

```
Webhook (form POST / landing page API response)
  → Parse JSON qualification block
  → Branch on score:
       ├── >= 70 → GoHighLevel: "Qualified" stage
       │           → Send SMS w/ booking link (template Qual-1)
       │           → Notify Sales team via Slack
       │           → Create task: "Prep for demo call with {name}"
       │
       ├── 30-69 → GoHighLevel: "Nurture" stage
       │           → Add tag: "warm-lead"
       │           → Start 10-day email nurture sequence
       │           → Log to dashboard
       │
       └── < 30  → GoHighLevel: "Nurture" stage
                   → Add tag: "cold-lead"
                   → Monthly check-in only
```

### Webhook Payload (Make.com → GoHighLevel)

```json
{
  "name": "",
  "email": "",
  "phone": "",
  "spa_name": "",
  "service_focus": "",
  "score": 85,
  "classification": "qualified",
  "ad_spend_tier": "premium",
  "timeline": "immediate",
  "summary": "Dr. Smith, Austin med spa, spends $8K/mo on ads with <10% booking rate. Ready to start now.",
  "source": "landing-page-chatbot"
}
```

---

## GoHighLevel Pipeline Mapping

| Stage | Score Range | Automation Trigger |
|-------|-------------|-------------------|
| New Lead | — | Raw form submission or chatbot start |
| Qualified | >= 70 | SMS booking link instantly |
| Booked | — | Appointment confirmed |
| Visited | — | Post-visit follow-up sequence |
| Nurture | 30-69 | 10-day email sequence |
| Cold | < 30 | Monthly check-in only |
| Lost | — | No engagement 30 days |

### Pipeline Automation Rules

| Trigger | Action | Delay |
|---------|--------|-------|
| Lead -> "Qualified" | SMS: "Hi {name}, based on what you shared, you are a strong fit. Book your strategy call: {link}" | Instant |
| No booking 24h | SMS: "Still interested? Claim your free strategy session: {link}" | +24h |
| No booking 48h | SMS + email: case study + "Last chance for priority slot" | +48h |
| Lead -> "Nurture" | Start 4-email sequence (case study, ROI, social proof, re-qualify) | Day 1-10 |
| Booking confirmed | Calendar invite + reminder seq | -24h, -2h |
| Lead -> "Visited" | Thank you SMS + review request | +24h |
| Post-visit | Results check-in | +7d |
| Rebooking (Botox) | Rebooking reminder | +30d |
| Cross-sell | Adjacent service offer | +90d |

---

## Error Handling

| Error | Fallback | Alert |
|-------|----------|-------|
| OpenAI API timeout | Static form submission, queue for retry | Slack: #alerts |
| OpenAI rate limit | Retry with exponential backoff (3x) | Slack: #alerts |
| Make.com webhook failure | Log raw payload, retry in 5 min | Dashboard warning |
| GHL API failure | Queue in local retry buffer (max 24h) | Slack: #alerts |

---

## Testing Checklist

- [ ] System prompt loaded correctly → check response framing
- [ ] All 5 qualification questions asked in correct order
- [ ] Scoring matches thresholds (>=70, 30-69, <30)
- [ ] JSON output format matches contract
- [ ] Qualified path → booking link returned
- [ ] Warm path → case study mention returned
- [ ] Objection templates load for each objection type
- [ ] Make.com webhook receives valid JSON
- [ ] GHL pipeline stages mapped correctly
- [ ] SMS templates use correct variables
- [ ] Nurture sequence triggers on warm/cold classification
- [ ] Error fallbacks activate on simulated API failure
