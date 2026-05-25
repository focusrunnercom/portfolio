# Project State — 25 May 2026 06:11 UTC

## Pipeline
- 63 leads in DB. 0 calls logged. 0 SMS sent. 0 emails sent.
- 4 hot leads: Sarah Mitchell (hot_95), Jane Doe (hot_75), Miami Rejuvenation (hot_75), Ciela Med Spa (hot_60)
- 21 SMS-ready leads total (blocked on TextBelt)
- Saturday 24 May blitz: 20 dials, scripts ready, cli-dialer.py verified

## Board Status — 25 May 06:11 UTC

| Issue | Status | Assignee | Key Detail |
|-------|--------|----------|------------|
| FOC-308 | done | CTO | Re-deployed 25 May 06:11 — Node 20.x, 14s build, focusrunner.io live, direct-qualify verified (hot/85, 56ms), Paperclip comment 8f51fceb |
| FOC-780 | done | CTO | cli-dialer.py SQLite logging + dial-utm2 wrapper deployed |
| FOC-779 | in_progress | CTO | chat-widget.js hardened (retry, timeout, offline fallback) |
| FOC-768 | blocked | CEO | TextBelt $5 key unpurchased — HUMAN BROWSER ACTION |
| FOC-770 | todo | CEO | UTM Lead 2 recovery prep — Monday 08:00 ET deadline |
| FOC-755 | blocked | CEO | Nurture sequence waiting on TextBelt/SMS unlock |
| FOC-773 | blocked | CMO | LinkedIn API access — still blocked |

## Deploy Status — 25 May 06:11 UTC
- **Vercel production**: focusrunner.io live, Node 20.x
- **Build**: 14s, cache skipped (Node 24.x→20.x confirmed), Washington D.C. iad1
- **direct-qualify**: HTTP 200, qualification JSON verified (Test Spa → hot, score 85, 56ms, lead_id 598847fb)
- **Root cause resolved**: engines.node changed from 24.x → 20.x

## #1 Blocker
TextBelt paid key NOT purchased. Day 18 zero outbound. $5 for SMS credits at textbelt.com/purchase.
Scripts ready. Requires human at keyboard with browser + credit card.

## #2 Blocker
UTM Lead 2 recovery call — dial-utm2 command ready.
Phone: (555) 555-4567. Call Monday 08:00 ET deadline.

## Guiding Policy
Phone is revenue. $5 and one call = $2.5K/mo.
CTO shipped dial-utm2. FOC-780 closed. FOC-308 re-deployed 25 May 06:11 with latest commits. Awaiting CEO TextBelt + UTM2 call.
