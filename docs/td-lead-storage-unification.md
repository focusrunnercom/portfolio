# Technical Debt: Lead Storage Fragmentation

**Author:** Senior Engineer
**Date:** 2026-05-14

## Problem

Leads are stored in **5 different ways** with incompatible schemas:

| Component | Storage | Schema | Survives Cold Start? |
|-----------|---------|--------|---------------------|
| `chat.js` | `/tmp/leads.json` (file) | `{ id, name, phone, email, practice, source, qualification }` | No (ephemeral FS) |
| `webhook.js` | In-memory array | `{ id, name, phone, email, practice, source, timestamp }` | No (RAM) |
| `direct-qualify.js` | `/tmp/leads.json` (file) | different structure | No |
| `leads.js` | `/tmp/leads.json` (file read) | `{ leads: [...] }` | No |
| `lib/lead-store.js` | `/tmp/leads.json` (file) | same as chat.js | No |

### Issues:
1. **No unified schema** — `webhook.js` writes one format, `chat.js` another
2. **Webhook in-memory leads are invisible** to `/api/leads` endpoint (which reads from file)
3. **Vercel cold start wipes all leads** — `/tmp` is ephemeral
4. **Race conditions** — multiple concurrent requests to write `/tmp/leads.json` can corrupt data

## Proposal: Unified Storage via Vercel KV

1. Create `api/lib/lead-store.js` as the **single** storage interface
2. Backend: Vercel KV (Upstash) with file-based fallback
3. All endpoints import from `lib/lead-store.js`:
   - `storeLead(lead)` → returns lead ID
   - `getLeads(filter)` → returns filtered list
   - `markNotified(leadId)` → marks notification sent
4. Schema enforced by `storeLead()`:
   ```
   { id, name, phone, email, practice, niche, volume, 
     score, classification, summary, source, timestamp, notified }
   ```
5. KV key: `lead:{id}` + sorted set `leads` for listing

Backward compatible: `/api/leads` still returns `{ leads: [], count }` format.
