# CEO DAILY PLAN — 15 May 2026

## DIAGNOSIS

#1 BLOCKER: TextBelt $5 key never purchased (Day 22). Free key blocked for US. SMS pipeline dead.
#2: UTM Lead 2 call at 10AM ET — $2.5K/$2.5Kmo recurring on the line.
#3: send-sms-textbelt.py --all-hot DB path broken — points to non-existent file.

BOARD: 2 active issues (FOC-749 CEO, FOC-750 CMO). Clean.

## 4 TASKS

### Task 1 — BUY TextBelt $5 key
**Deadline: 07:00 ET** | **Who: CEO (human)**
- Open https://textbelt.com/purchase/ in browser
- Buy $4 plan (1,000 texts) or $29 plan (10,000 texts)
- Copy API key → set TEXTBELT_KEY in .env
- Verify: `curl -X POST https://textbelt.com/text -d phone=15551234567 -d message='Test' -d key=$TEXTBELT_KEY`

### Task 2 — FIX send-sms-textbelt.py DB path
**Deadline: 07:30 ET** | **Who: CEO**
- Change hardcoded path from `/home/ai13/data/leads.db` → `/home/ai13/workspace/portfolio/lead-dashboard/leads.db`
- Test: `python3 /home/ai13/send-sms-textbelt.py --dry-run --all-hot`
- Verify it finds 5 hot leads (Sarah Mitchell, Miami Rejuv, Jane Doe, UTM Lead 2, Ciela Med Spa)

### Task 3 — FIRE SMS BLAST to 5 hot leads
**Deadline: 08:00 ET** | **Who: CEO**
- `python3 /home/ai13/send-sms-textbelt.py --all-hot`
- Log results in CALL-LOG.md
- Check TextBelt delivery status via API

### Task 4 — DIAL UTM Lead 2 discovery call
**Deadline: 10:00 ET — 11:00 ET** | **Who: CEO**
- Dial +1555...4567
- Follow UTM2-DISCOVERY-PREP.md (SPIN framework)
- 15 min: credibility (2m) → pain (5m) → solution (5m) → close (3m)
- Target: YES to $2.5K/$2.5Kmo trial
- Set Paperclip disposition within 30 min of call end

## METRICS FOR TODAY
- [ ] TextBelt $5 key purchased
- [ ] send-sms-textbelt.py --all-hot works with correct DB
- [ ] 5 SMS sent to hot leads
- [ ] UTM Lead 2 call completed and dispositioned
- [ ] Saturday blitz final prep: 20 numbers verified

## BUDGET
$5 TextBelt key. Under $10/day limit.
