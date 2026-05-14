# Lead Notification System — Architecture

**Author:** Sr Engineer
**Date:** 2026-05-14
**Status:** Approved — Implementation Ready

## 1. Problem Statement

The FocusRunner chatbot (`/api/chat`) generates qualified leads in real time, but the team has no active notification pipeline. The `lib/lead-notify.js` (Resend email) library is now implemented and wired into `chat.js`, but before this change, notifications only fired from `webhook.js` after manual lead submission — not in real-time from the chatbot itself.

## 2. Multi-Layer Notification Pipeline

```
User -> Chat Widget -> /api/chat (AI qualification)
                          |
                          |-- notifyLead()  -->  Email (Resend)   NEW: from chat.js
                          |-- [in-memory store]
                          |
                          +-- response to widget
                               |
                               +-- User submits form --> /api/webhook
                                                          |
                                                          |-- Forward to GoHighLevel
                                                          |-- notifyLeadEmail()
                                                          |-- [in-memory store]
```

## 3. Notification Flow Per Classification

| Classification | Email Alert |
|----------------|-------------|
| hot (score 80+) | Yes -- immediate |
| warm (score 50-79) | Yes -- immediate |
| cold (score <50) | Skipped |
| unknown | Skipped |

## 4. Files

| File | Role |
|------|------|
| `api/lib/lead-notify.js` | Resend email library with classification filter |
| `api/chat.js` | Real-time notification after AI qualification |
| `api/webhook.js` | Notification on form submission (existing) |
| `api/notify-status.js` | Diagnostic: GET checks config, POST sends test email |

## 5. Activation

1. Set `RESEND_API_KEY` in Vercel production environment
2. Set `NOTIFY_EMAIL` (optional, defaults to hello@focusrunner.com)
3. Run `POST /api/notify-status` to verify end-to-end
4. Submit a test lead via focusrunner.io chatbot
5. Check hello@focusrunner.com for email within 15 seconds

## 6. Verification

- [ ] Resend key is configured in Vercel prod env
- [ ] POST /api/notify-status returns { status: "test_email_sent", email_id: "..." }
- [ ] Chatbot submission triggers email to hello@focusrunner.com
- [ ] Cold leads do NOT trigger email (classification filter)
- [ ] Vercel logs show `[lead-notify] Email sent: id=...`
