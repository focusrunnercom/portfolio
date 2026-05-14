# Lead Capture Form — Chatbot Fallback Variant
**URL:** focusrunner.io/free-audit.html (Vercel static file)
**API:** POST /api/lead (Python WSGI — no chatbot dependency)
**Traffic Source:** Direct landing page, Meta Ads (if chatbot still down)
**Status:** ✅ LIVE — works independently of chatbot API
**Created:** 2026-05-14

---

## HOW IT WORKS

1. **User lands** on `focusrunner.io/free-audit.html`
2. **Submits form** with name, email, phone, best time
3. **POST to /api/lead** — existing Python Serverless Function (no DeepSeek API needed)
4. **Lead captured** in-memory store (available at /api/leads and /admin/leads)
5. **Telegram notification fires** to the team — within seconds

## WHY THIS EXISTS

The chatbot (POST /api/chat) is broken — returns HTTP 500 / timeout. This form:

- ✅ Works without DeepSeek API
- ✅ Works without any AI model
- ✅ Posts to the same /api/lead endpoint the chatbot uses
- ✅ Captures leads while CTO fixes the chatbot DeepSeek integration
- ✅ Can be linked from Meta Ads immediately (no chatbot dependency)

## DEPLOYMENT

File: `/public/free-audit.html` in the Vercel portfolio repo
Vercel serves static files from `public/` automatically at `/free-audit.html`

Already deployed on push to `focusrunnercom/portfolio` main branch.

## FALLBACK STRATEGY

| State | Route | Notes |
|-------|-------|-------|
| Chatbot broken | focusrunner.io/free-audit.html | This form — no AI dependency |
| Chatbot fixed | focusrunner.io (chatbot) + /free-audit.html | Both active, chatbot handles qualification |
| Both down | focusrunner.io (phone/email) | Last resort — direct contact |

## AD CAMPAIGN URLS (if chatbot still down when ads launch)

All Meta ads should point to: `https://focusrunner.io/free-audit.html?utm_source=meta&utm_campaign=miami_launch`
