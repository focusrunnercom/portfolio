# CEO DAILY PLAN — 15 May 2026 (10:02 ET Update)

## DIAGNOSIS

#1 BLOCKER: TextBelt $5 key never purchased (Day 22). 21 leads with phones, zero SMS. Human action only — must open browser + credit card.

#2 BLOCKER: UTM Lead 2 call due NOW. $2.5K setup / $2.5K/mo recurring. Pre-agreed 7-day trial 9 days ago. +1555...4567.

#3 BLOCKER: send-sms-textbelt.py DB path broken. Hardcoded `/home/ai13/data/leads.db` doesn't exist. Real DB: `/home/ai13/workspace/portfolio/lead-dashboard/leads.db`

BOARD: FOC-750 released from stale checkout. FOC-749 blocked. CMO can now write to FOC-750.

## 4 TASKS

### Task 1 — DIAL UTM Lead 2 NOW
**Deadline: 10:15 ET** | **Who: CEO (human)**
- Dial +1555...4567
- 60-sec demo: confirm need → show lead response system → close 7-day trial
- Objection: "Tried automation before" → reframe: "Chatbots answer. We respond. Different."
- Outcome: YES to trial OR book firm callback date

### Task 2 — BUY TextBelt $4 key (1,000 texts)
**Deadline: 10:30 ET** | **Who: CEO (human)**
- Open https://textbelt.com/purchase/ in browser
- Buy $4 plan
- Copy API key → set TEXTBELT_KEY
- Test: `curl -X POST https://textbelt.com/text -d phone=15551234567 -d message='Test' -d key=$TEXTBELT_KEY`

### Task 3 — FIX send-sms-textbelt.py DB path + fire to 5 hot leads
**Deadline: 11:00 ET**
- Patch hardcoded path from `/home/ai13/data/leads.db` → `/home/ai13/workspace/portfolio/lead-dashboard/leads.db`
- Dry-run: `python3 /home/ai13/send-sms-textbelt.py --dry-run --all-hot`
- Fire: `python3 /home/ai13/send-sms-textbelt.py --all-hot`
- Log results in CALL-LOG.md

### Task 4 — Post-call disposition + unlock agents
**Deadline: 11:30 ET**
- Once UTM Lead 2 call done: assign FOC-750 to CMO for disposition
- Unblock FOC-755 (Copywriter) + FOC-756 (Sales) — they need CMO sign-off
- Verify agent pipeline flowing

## METRICS FOR TODAY
- [ ] UTM Lead 2 call completed and dispositioned
- [ ] TextBelt $4 key purchased
- [ ] send-sms-textbelt.py fixed and fired to 5 hot leads
- [ ] SMS blast logged

## BUDGET
$4 TextBelt key. Under $10/day limit.

## APPROVAL
Reply on Telegram to approve or modify this plan. Window closes at 10:15 ET for the call.
