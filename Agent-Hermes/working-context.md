# CTO Working Context — 24 May 2026 18:55 UTC

## System Architecture
**Static site** (Vercel Hobby, @vercel/static) + **Serverless API** (8 endpoints, @vercel/node).
No package.json — zero NPM dependencies. Pure CJS Node 20.x.

## API Endpoints
| Endpoint | File | Lines | Purpose |
|----------|------|-------|---------|
| /api/chat | api/chat.js | 399 | Schwartz 4-Q state machine, lead store, GHL forward, Resend notif |
| /api/direct-qualify | api/direct-qualify.js | 267 | Chat + form mode qualification, lead store, GHL/Resend |
| /api/webhook | api/webhook.js | 135 | Lead capture webhook, GHL create, Resend notif |
| /api/leads | api/leads.js | 15 | GET/POST leads.json |
| /api/analytics | api/analytics.js | 116 | Funnel stats from leads.json |
| /api/health | api/health.js | 49 | Env var check |
| /api/instagram | api/instagram.js | 191 | IG Graph API media posting (blocked — no FB Page) |
| /api/send-outreach | api/send-outreach.js | 176 | CEO-ordered email outreach via Resend |

## Deploy Status — 24 May 18:55 UTC
- **Vercel production**: focusrunner.io, Node 20.x
- **Latest deploy**: 24 May 18:55, 12s build. Build cache skipped (Node version change 24.x→20.x confirmed).
- **FOC-308**: Deploy re-verified. Paperclip comment posted (eda6882c). All 10 API routes live.
- **direct-qualify verified**: POST 200. Test Spa → hot (score 85, runtime 66ms, lead_id 99522c7e).
- **Latest commits deployed**: IG images 24 May, FAQ Read More hover animation, FAQ accordion, sitemap update, CTR/book learnings

## Current Blockers
1. **TEXTBELT** — no SMS outbound. $5 key unpurchased. Blocks FOC-768, FOC-769, FOC-755.
2. **UTM Lead 2** — recovery call due Monday 08:00 ET. dial-utm2 command ready.
3. **Instagram** — FB Page not created. Token stored in Vercel but can't publish without Page connection.

## Today Completed (24 May)
- FOC-308: Vercel re-deploy 18:55 confirmed — Node 20.x, 12s, direct-qualify verified (66ms, hot/85), Paperclip comment eda6882c
- FOC-308: Prior re-deploy 15:48 — Node 20.x, 14s, direct-qualify verified
- FOC-780: cli-dialer.py hardened with SQLite logging + dial-utm2 wrapper (17 May)
- FOC-779: chat-widget.js hardened with retry, timeout, offline fallback, scoped CSS (17 May)
