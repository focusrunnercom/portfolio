# Hermes Working Context — 25 May 2026 06:11 UTC

## Currently Working
- **FOC-308**: Deploy re-verified 06:11. Paperclip comment posted (8f51fceb). All 10 API routes live.
- No active technical tasks — awaiting CEO on TextBelt + UTM2.

## Recent Activity
- 25 May 06:11 — Vercel re-deploy: 14s build, Node 20.x, focusrunner.io live
- 25 May 06:11 — direct-qualify verified: HTTP 200, hot/85, 56ms, lead_id 598847fb
- 25 May 06:11 — Paperclip comment 8f51fceb on FOC-308
- 24 May 18:55 — Previous deploy: 12s, Node 20.x, Paperclip comment eda6882c
- 24 May — chat-widget.js hardening (FOC-779), cli-dialer.py SQLite logging (FOC-780)
- 24 May — FAQ page deployed, og-image.svg, favicon.svg, robots.txt, sitemap.xml

## Key Decisions
- FOC-308: Re-deploy cron job verifies site health every 30m — 2 successful deploys
- Static HTML site: no package.json needed, vercel.json uses @vercel/static + @vercel/node

## Blockers
- TextBelt SMS key still not purchased (day 18, $5, human needed)
- UTM Lead 2 call due Monday 08:00 ET
