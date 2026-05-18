# CTO Working Context — 17 May 2026 15:01 UTC

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

## Deploy Status — 17 May 15:01 UTC
- **Vercel production**: focusrunner.io, Node 20.x
- **FOC-308**: Done. Root cause was engines.node=24.x rejected by Vercel Hobby. Fixed to 20.x. Build cache skipped on version change. Deploy succeeded in 10s.
- **direct-qualify verified**: POST returns 200 with qualification JSON. Test: Test Spa → hot (score 85, runtime 82ms).

## Current Blockers
1. **TEXTBELT** — no SMS outbound. $5 key unpurchased. Blocks FOC-768, FOC-769, FOC-755.
2. **UTM Lead 2** — recovery call due Monday 08:00 ET. dial-utm2 command ready.
3. **Instagram** — FB Page not created. Token stored in Vercel but can't publish without Page connection.

## Today Completed (17 May)
- FOC-308: Vercel deploy succeeded — Node 20.x, direct-qualify live and verified
- FOC-780: cli-dialer.py hardened with SQLite logging + dial-utm2 wrapper
- FOC-779: chat-widget.js hardened with retry, timeout, offline fallback, scoped CSS
