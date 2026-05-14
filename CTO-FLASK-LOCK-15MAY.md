# CTO Flask Lock Verification — 15 May 2026

**Status:** VERIFIED — Vercel API dependency killed, Flask backend is the ONLY lead capture path.

---

## What Was Done

### 1. Flask systemd Service Fix
- **Problem:** `focusrunner-flask.service` had `User=ai13` in a user-mode systemd unit
  - Exit code 216 (GROUP): user units can't set `User=`
- **Fix:** Removed `User=ai13`, changed `WantedBy=multi-user.target` → `WantedBy=default.target`
- **Result:** Service now runs as `systemctl --user` and auto-restarts on crash/failure
- **Verification:** `systemctl --user enable focusrunner-flask.service` — enabled at boot

### 2. lead-capture.html — POST Target Changed
- **File:** `/home/ai13/workspace/portfolio/public/lead-capture.html`
- **Change:** `api_url` from `'/api/webhook'` (Vercel relative) → `'http://192.168.1.244:5000/api/lead'` (Flask direct)
- **Also changed:**
  - Validate `data.success` before showing success screen
  - Error message now tells user to check network connectivity
- **Verification:** curl POST returns `{"success":true,"id":13,"message":"Lead saved!"}`

### 3. Flask CORS — focusrunner.io Allowed
- `flask_cors.CORS(app)` with default config allows all origins
- Verified preflight (OPTIONS) returns `Access-Control-Allow-Origin: https://focusrunner.io`
- Verified POST with `Origin: https://focusrunner.io` returns correct CORS headers

### 4. Flask Static File Serve
- **Added:** `/public/<path:filename>` route serves static files from `public/` directory
  - Enables widget JS files and other static assets via Flask
- **File:** `/home/ai13/workspace/portfolio/lead-dashboard/app.py`

### 5. Lead Pipeline End-to-End Verified
```bash
# Submit lead via Flask (same path used by lead-capture.html)
curl -X POST http://192.168.1.244:5000/api/lead \
  -H "Content-Type: application/json" \
  -H "Origin: https://focusrunner.io" \
  -d '{"name":"Test Lead CTO Lock","email":"test-cto-lock@focusrunner.com",
       "phone":"+1555111555","practice":"Test Spa","source":"lead_capture_standalone"}'

# Result: {"id":13,"message":"Lead saved!","success":true}

# Verify stored in SQLite
> sqlite3 leads.db "SELECT id, name, email, source FROM leads ORDER BY id DESC LIMIT 2;"
13|Test Lead CTO Lock|test-cto-lock@focusrunner.com|lead_capture_standalone
12|Test Lead|test@focusrunner.com|lead_capture_standalone

# Telegram notification sent (CONFIGURED)
```

### 6. Port Cleanup
- Killed orphaned python3 process holding port 5000
- systemd now properly manages lifecycle

---

## System State

| Component | Status | Notes |
|-----------|--------|-------|
| Flask service | RUNNING | `focusrunner-flask.service` on port 5000 |
| SQLite DB | READY | 14 leads stored |
| CORS | CONFIGURED | All origins allowed |
| Telegram | CONNECTED | Notifications on new leads |
| lead-capture.html | UPDATED | POSTs to Flask directly |
| Vercel API | DEPRECATED | No longer receiving lead capture traffic |

## Next Steps
1. Deploy lead-capture.html to Vercel (push to main) so focusrunner.io serves the updated form
2. Remove Vercel API routes from vercel.json (drop all `/api/*` rewrites) — after tunnel is confirmed
3. Set up cloudflared tunnel for public internet access to Flask :5000
4. Cancel stale FOC-359 (Vercel deploy at limit reset) and FOC-356 (engines.node fix)
