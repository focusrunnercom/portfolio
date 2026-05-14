# Technical Debt: Notification System Consolidation

**Author:** Senior Engineer
**Date:** 2026-05-14
**Status:** Partially resolved — webhook.js now uses lib/notify.js; lib/lead-notify.js removed. See ARCHITECTURE.md §5.

## Problem

There are **4 separate notification implementations** across the codebase, each with different API patterns, HTML templates, and error handling:

| File | Function | Pattern | Dependencies |
|------|----------|---------|-------------|
| `api/chat.js:55` | `sendNotif()` | Inline, synchronous fire-and-forget | `fetch()` to Resend |
| `api/direct-qualify.js:111` | `notifyLead()` | Inline, mixed signature | `fetch()` to Resend |
| `api/lib/notify.js:24` | `notifyLead()` | Shared lib, ESM export | `fetch()` to Resend |
| `api/lib/lead-notify.js:15` | `notifyLead()` | Standalone edge function | same as lib/notify.js |

This means:
- HTML email templates are duplicated (different styles)
- Classification filters differ (some check `!== 'cold'`, others check score ranges)
- Env var checks are duplicated
- A bug fix in one doesn't propagate to others

## Proposal: Consolidated Notify Library

Create a single `api/lib/notify.js` that:
1. Exports `sendEmail(lead, classification)` — Resend integration, single HTML template
2. Exports `sendSms(phone, message)` — Twilio integration (extracted from webhook.js)
3. Exports `shouldNotify(classification, score)` — shared classification logic
4. All helpers use synchronous fire-and-forget; all errors caught internally

Then update `chat.js`, `direct-qualify.js`, `webhook.js` to import from the single lib.

## Backward Compatibility

- No changes to API routes or return values
- No new env vars required
- Existing RESEND_API_KEY, TWILIO_* env vars reused
