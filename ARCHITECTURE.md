# Lead Dashboard — Architecture

## FOC-303: /admin/leads

### Problem
Leads are being captured by the chatbot and webhook, stored in `/tmp/leads.json`, and served via `/api/leads`. But there is no user-facing UI to view them. The CEO and sales team need a real-time dashboard to see submissions at `focusrunner.io/admin/leads`.

### Constraints
- No database — file-based storage (`/tmp/leads.json`) on Vercel Serverless
- No new external API keys or services
- Authentication via `ADMIN_API_KEY` env var (already configured)
- Current site is a static HTML page with importmap-based React (not bundled React SPA)
- Vercel deployment — serverless functions + static build

### Architecture

```
Browser → /admin/leads → /admin-leads.html (Vercel static route)
                            ↓
                      Standalone HTML page with inline JS
                            ↓
                 GET /api/leads (Authorization: Bearer <key>)
                            ↓
                      /api/leads.js (Vercel Serverless Function)
                            ↓
                      /tmp/leads.json
```

### Why Standalone HTML (not React SPA)
The current site (`index.html`) is a fully self-contained marketing page with inline HTML/CSS/JS. The React components under `components/` and `App.tsx` are not wired into the page (no `<div id="root">` in index.html). Adding React Router and mounting the dashboard into the React SPA would require:

1. Adding `#root` to index.html (breaking the existing marketing page layout)
2. Complex routing for the landing page sections
3. Build pipeline changes

Instead: **`/admin-leads.html`** is a self-contained page that lives in `public/` and gets served statically by Vercel. It:

- Has zero dependencies (no React, no build tools)
- Is a single file that works immediately
- Can be developed, tested, and deployed independently
- Is served at `/admin-leads.html` and accessible under `/admin/leads` via Vercel routing

### File Changes

| File | Change |
|------|--------|
| `public/admin-leads.html` | **NEW** — standalone lead dashboard page (~500 lines) |
| `vercel.json` | Add route: `/admin/leads` → `/admin-leads.html` |

### Auth flow
1. User visits `focusrunner.io/admin/leads`
2. Page checks `sessionStorage` for `fr_admin_key`
3. If missing: shows password prompt overlay
4. On auth: key stored in `sessionStorage`, fetch `/api/leads` with `Authorization: Bearer <key>`
5. On 401: clear key, re-prompt
6. Auto-refresh every 30 seconds

### Data Flow
```
Chatbot/Webhook → appendLead() → /tmp/leads.json
                                    ↓
Admin dashboard → fetch /api/leads → readLeads() → JSON → table render
```

### Visualization
| Column | Content |
|--------|---------|
| Name | Lead name (truncated) |
| Contact | Phone + email (click to copy) |
| Practice | Practice name |
| Status | Badge: HOT/WARM/COLD/unknown |
| Score | Qualification score /10 |
| Source | Source icon + label |
| Time | Relative time (5m ago, 2h ago) |

### Security
- Admin key never sent in HTML source
- Key entered directly by user, stored in `sessionStorage` only
- `Authorization: Bearer` header validated server-side
- On 401: key cleared, re-auth required

### Future
- Real-time WebSocket push when leads arrive
- CSV export (route at `/api/leads/export` already exists)
- Notification status column
- Lead detail panel with qualification breakdown
- Filtering and search
