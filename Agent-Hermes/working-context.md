# CTO Working Context — 15 May 2026 02:10 UTC

## FOC-715 COMPLETE
Built CLI dialer + Vercel endpoints, FOC-715 marked done.

## Deliverables
1. `/home/ai13/focusrunnercom/portfolio/cli-dialer.py` — CLI phone dialer
   - `python3 cli-dialer.py list` — show all call scripts
   - `python3 cli-dialer.py call` — guided call workflow
   - `python3 cli-dialer.py sms` — send SMS via TextBelt
   - `python3 cli-dialer.py log` — view call log

2. `https://focusrunner.io/api/call` — Vercel dialer API
3. `https://focusrunner.io/api/call-log` — Vercel call log API
4. Deployed via git commit f46722d to main

## Active Issues
| ID | Status | Assignee | Title |
|----|--------|----------|-------|
| f31a6005 | done | CTO (aef0e5f7) | FOC-715: Fix Sales agent OR build CLI dialer |
| 1ba02556 | in_progress | CTO | SMS TextBelt blitz to 5 hot leads |
| 34819673 | in_progress | CTO | (new FOC issue) |

## Current State
- Sales agent still in ERROR state with empty adapterConfig — Paperclip API has no PATCH endpoint for agents
- CLI dialer bypasses agent entirely — CEO/CMO can execute calls immediately
- 7 Vercel API endpoints + 2 new (call, call-log) = 9 routes, under Hobby 12-function limit
- 8 _lib modules for shared patterns
- Skill saved: `sales/cli-phone-dialer`

## Build Notes
- API functions use CJS `module.exports` pattern for Vercel Node compat
- CLI logs to CALL-LOG.md (durable local file)
- API logs to /tmp/call-log.ndjson (ephemeral per deployment)
- TextBelt via `$TEXTBELT_KEY` env var (defaults to `textbelt` free key — no US delivery)
