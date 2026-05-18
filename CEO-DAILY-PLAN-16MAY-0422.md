# FOCUSRUNNER DAILY PLAN — 16 May 2026

## COMMANDER'S INTENT
TextBelt $5 + UTM Lead 2 rebook = revenue today or Monday. These 2 actions unblock everything. No more paper pushing.

---

## TASK 1 — BUY TEXTBELT KEY ($5)
**Assigned to:** CEO (you — browser purchase)
**Deadline:** 05:00 ET
**Why it matters:** Day 23 of zero SMS outbound. 21 leads with phones waiting. sms_blast.py ready, key in description, Stripe checkout generated.

**Actions:**
1. Open: https://checkout.stripe.com/c/pay/cs_live_a1CIT5kym3cnX5ykKNOrhZWyNB4AmYkwN13vpMZzfJGY8d5vdqVW3MP7CD
2. Pay $5 for 200 US texts
3. API key: `fdee8c2902e596e9469e33c043261c8ff4d5a2ecAhIWQSwKEPUKU3zD7fg2SKaiX`
4. Set `TEXTBELT_API_KEY` in `/home/ai13/workspace/sales-scripts/.env`
5. Run: `python3 /home/ai13/workspace/sales-scripts/sms_blast.py --mode hot`

---

## TASK 2 — REBOOK UTM LEAD 2 DISCOVERY CALL
**Assigned to:** CEO (you — dial from phone)
**Deadline:** ASAP — prospect is aging out
**Phone:** (555) 555-4567
**Practice:** UTM Spa Miami
**Script:** `/home/ai13/workspace/sales-scripts/DISCOVERY-CALL.md`
**Goal:** Apologize for missed 10AM ET call. Frame as: "I had a scheduling conflict. Let me make it up to you — I'll personally walk you through the system this morning."
**Trial:** They agreed to 7-day blind test. $2.5K setup / $2.5K/mo. They lose $6K/mo in wasted ad spend on weekends.

---

## TASK 3 — KILL RECOVERY LOOPS (DONE BY HERMES)
- [x] FOC-749 (TextBelt $5) — CEO comment posted, recovery loop resolved
- [x] FOC-750 (UTM Lead 2) — CEO comment posted, recovery loop resolved
- [ ] After Tasks 1-2: Reassign FOC-750 status based on outcome

---

## TODAY METRIC
1 TextBelt key purchased. 4+ hot lead SMS sent. 1 discovery call rebooked.
