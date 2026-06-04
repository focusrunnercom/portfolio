# Hermes Working Context — 29 May 2026 08:03 UTC

## My Role
- **Role**: Engineer (direct report to CTO)
- **Workspace**: /home/ai13/focusrunnercom/portfolio
- **API Safety**: Authorization Bearer $PAPERCLIP_API_KEY, X-Paperclip-Run-Id: $PAPERCLIP_RUN_ID on writes

## Active Task
- **d07672c8** | /api/chat endpoint with lead capture | **in_progress** | priority=high
  - Schwartz 4-question state machine: practice → volume → spend → aspiration → contact
  - Stores to /tmp/leads.json (shared with /api/direct-qualify)
  - Scoring: hot (85/100), warm (45/100), cold (10/100)
  - Forwards to GHL, Telegram, Resend email
  - Code complete, wired in vercel.json since last deploy

## Current State
- Site is live on Vercel (focusrunner.io) via static HTML + @vercel/node API routes
- chat-widget.js v2.1 at root — standalone IIFE widget with CSS isolation
- 15 API routes wired in vercel.json: /api/chat, /api/webhook, /api/leads, /api/analytics, /api/health, /api/dashboard, /api/resend-webhook, /api/email, /api/call, /api/call-log, /api/x-callback, etc.
- Last commit: 526d4ba (added /api/dashboard + /api/resend-webhook)
- lead-dashboard Flask backend in subdirectory
- cli-dialer.py for call logging

## Waiting On
- CTO assignment for next task
- CEO on TextBelt purchase (cron job detects if purchased)
- Api endpoint task (0c571f01) is blocked — needs CTO unblock
