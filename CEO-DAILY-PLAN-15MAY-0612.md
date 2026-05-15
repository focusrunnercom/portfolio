# CEO DAILY PLAN — 15 May 2026 (06:12 ET Version)

**Commander:** CEO (Rumelt)
**Budget:** $10/day — ALL AUTOMATION PAUSED. $5 to TextBelt, $5 remaining.
**Phone = revenue channel.** Execute today or the Saturday blitz is dead.

---

## TASK 1: BUY TEXTBELT $5 KEY [CEO HUMAN ACTION — NOW]

**Why:** The single unlock. 15 days of cancelled tasks, $3,577 in agent spend, zero SMS sent, all blocked on this $5 purchase.

**Action:**
1. Open https://textbelt.com/purchase/ in browser
2. Select the $5 plan (200 texts)
3. Complete Stripe checkout — this is the step no agent can do for you
4. Copy the API key
5. Set it: `export TEXTBELT_API_KEY=<your_key>` then add to `/home/ai13/workspace/portfolio/lead-dashboard/.env`
6. Verify it works:
   ```
   TEXTBELT_API_KEY=<your_key> curl -X POST https://textbelt.com/text \
     -d phone=+15559990001 -d message='test from FocusRunner' -d key=<your_key>
   ```
7. Comment on FOC-749: "TEXTBELT KEY PURCHASED. Set in .env. Verified."

**Do not skip this. Do not defer. Do not create another issue. $5 right now.**

---

## TASK 2: FIX SMS SCRIPT + FIRE TEST [CEO — AFTER KEY]

**Why:** The send-sms-textbelt.py hardcodes `/home/ai13/data/leads.db` which doesn't exist. The real DB is at `/home/ai13/workspace/portfolio/lead-dashboard/leads.db`. `--all-hot` returns 0 leads.

**Action:**
1. Patch line 38 of `/home/ai13/send-sms-textbelt.py`:
   - Change `LEAD_DB = Path("/home/ai13/data/leads.db")`
   - To: `LEAD_DB = Path("/home/ai13/workspace/portfolio/lead-dashboard/leads.db")`
2. Test: `TEXTBELT_API_KEY=<your_key> python3 /home/ai13/send-sms-textbelt.py --dry-run --all-hot`
   — Should show 38 leads with phone numbers, including Sarah Mitchell (hot_95), Jane Doe, Miami Rejuvenation, UTM Lead 2, Ciela Med Spa
3. Now fire the real SMS to top 5 hot leads:
   ```
   TEXTBELT_API_KEY=<your_key> python3 /home/ai13/send-sms-textbelt.py --all-hot
   ```
4. Comment on FOC-749: "SMS sent to top leads. Confirmation IDs recorded."

---

## TASK 3: DIAL UTM LEAD 2 DISCOVERY CALL [CEO — 10:00 ET]

**Why:** $2,500/month recurring. This lead (hot_65) agreed to a 7-day trial. The system has cancelled this call 10+ times across 15 days. Every day without a dial pushes the lead colder.

**Action:**
1. At 10:00 ET, dial +1555...4567
2. Follow DISCOVERY-CALL.md protocol (7 phases)
3. Script MVP: "Hi [name], this is [name] from FocusRunner AI. We spoke on the 14th about a 7-day trial for your Miami med spa. I'm calling to get that set up and running. Do you have 10 minutes right now?"
4. Outcome: Close 7-day trial OR book a firm callback within 48 hours
5. Comment on FOC-750 with result: "Called at X ET. Outcome: [closed trial / booked callback for Y]"
6. Log the call manually

---

## SATURDAY BLITZ CHECKLIST (24 May)

| Item | Status |
|------|--------|
| CLI dialer (cli-dialer.py) | READY |
| 20 verified numbers | READY |
| COLD-CALL-SCRIPTS (11 scripts) | READY |
| DISCOVERY-CALL (7-phase protocol) | READY |
| OBJECTION-PLAYBOOK (17 objections) | READY |
| VOICEMAIL-SCRIPTS (8 scripts) | READY |
| **TEXTBELT KEY (Task 1)** | **NOT DONE** |
| **sms script DB path fix (Task 2)** | **NOT DONE** |
| UTM Lead 2 call (Task 3) | NOT DONE |

**If Task 1 and 2 aren't done by end of day today, the blitz's SMS follow-up is dead.**

---

## EXECUTION ORDER

```
06:15 ET — BUY TEXTBELT $5 KEY (Task 1)
06:30 ET — FIX SCRIPT DB PATH + FIRE SMS (Task 2)
10:00 ET — DIAL UTM LEAD 2 (Task 3)
11:00 ET — Blitz final prep review
```

---

## BUDGET RULES

- TextBelt $5: APPROVED (today's only spend)
- Agent automation: PAUSED — no new agent spend
- New signups: FORBIDDEN — no Mailgun, SendGrid, Twilio, LinkedIn
- New issues: FORBIDDEN — execute what exists

## BOTTOM LINE

$5 and one phone call. That's the distance between $3,577 spent and revenue.
Execute today or the Saturday blitz is a waste of 20 dial sheets.
