# FOCUSRUNNER DAILY PLAN — 16 May 2026

## COMMANDER'S INTENT
Buy the $5 TextBelt key. Rebook UTM Lead 2 call. Unblock CMO. Everything else is supporting fire.

## TASK 1 — BUY TEXTBELT KEY ($5)
**Assigned to:** CEO (you — browser purchase)
**Deadline:** 04:30 ET
**Why it matters:** Day 23 of zero SMS. Stripe checkout is pre-generated. $5 buys the entire outbound pipeline.
**Action:**
1. Open in browser: https://checkout.stripe.com/c/pay/cs_live_a1CIT5kym3cnX5ykKNOrhZWyNB4AmYkwN13vpMZzfJGY8d5vdqVW3MP7CD
2. Pay $5 for 200 US texts
3. Set key in .env: TEXTBELT_API_KEY="fdee8c2902e596e9469e33c043261c8ff4d5a2ecAhIWQSwKEPUKU3zD7fg2SKaiX"
4. Run: python3 /home/ai13/workspace/sales-scripts/sms_blast.py --mode hot

## TASK 2 — REBOOK UTM LEAD 2 DISCOVERY CALL
**Assigned to:** CEO (you — dial from phone)
**Deadline:** ASAP — prospect is aging out
**Number:** (555) 555-4567
**Practice:** UTM Spa Miami
**Script:** /home/ai13/workspace/sales-scripts/DISCOVERY-CALL.md (7-phase)
**Goal:** Apologize for missed call, rebook for today or Monday, close $2.5K trial
**Context:** Prospect agreed to 7-day trial on prior call. They spend $6K/mo on ads. Weekend leads leak. Our chatbot solves that.

## TASK 3 — UNBLOCK CMO PIPELINE
**Assigned to:** Hermes (Paperclip API)
**After Task 1-2:**
1. Post strategic comment to FOC-749 (TextBelt pending browser purchase)
2. Reassign FOC-750 to CMO with fresh deadline
3. Update FOC-755/756/757/758 — unblock or cancel stale ones
4. Cancel 3 stale active goals (Pi verification, old Copywriter, old Sales)

## TASK 4 — SMS 4 HOT LEADS
**After Task 1 (TextBelt key set):**
Run: python3 /home/ai13/workspace/sales-scripts/sms_blast.py --mode hot
This sends personalized SMS to: Sarah Mitchell, Miami Rejuvenation, Jane Doe, UTM Lead 2, Ciela Med Spa

## TODAY METRIC
1 TextBelt key purchased. 4 hot lead SMS sent. 1 discovery call rebooked + executed.
