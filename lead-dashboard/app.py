#!/usr/bin/env python3
"""
FocusRunner Lead Capture Backend — Flask server on port 5000.

SQLite leads.db is the single source of truth.
Telegram notifications fire on every lead capture.
Twilio SMS fires for hot_85+ leads.

CLI: python3 app.py --send-sms "+1555..." --body "..."
     python3 app.py --list-leads
"""

import json, os, uuid, hmac, sqlite3, csv, io, datetime, logging, sys, hashlib, smtplib, ssl
from pathlib import Path
from smtp_fallback import send_email as smtp_send, status_report as smtp_status, send_outreach as smtp_batch
from datetime import datetime, timezone
from flask import Flask, jsonify, request, render_template_string, make_response
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
logger = logging.getLogger("fr")

ADMIN_TOKEN = os.environ.get("ADMIN_API_KEY", "")
if not ADMIN_TOKEN:
    raise RuntimeError("ADMIN_API_KEY not set in environment — admin endpoints disabled. Export ADMIN_API_KEY=*** before starting.")

def _check_admin():
    token = (request.headers.get("X-Admin-Key", "")
             or request.headers.get("Authorization", "").replace("Bearer ", "")
             or request.headers.get("X-Admin-Token", "")
             or request.args.get("token", ""))
    return bool(token) and hmac.compare_digest(token, ADMIN_TOKEN)

def req_auth_html(f):
    from functools import wraps
    @wraps(f)
    def w(*a, **k):
        if not _check_admin():
            return render_template_string("""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>FocusRunner</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0b0b;color:#e0e0e0;font-family:Inter,sans-serif;display:flex;min-height:100vh}
.card{background:#111;border:1px solid #222;border-radius:12px;padding:32px;margin:auto;max-width:400px;width:100%}
h1{color:#ef4444;font-size:18px;margin-bottom:8px}
p{color:#666;font-size:13px}
label{display:block;color:#888;font-size:12px;margin:12px 0 4px}
input{width:100%;padding:10px;background:#0b0b0b;border:1px solid #333;border-radius:8px;color:#e0e0e0}
input:focus{border-color:#22c55e;outline:none}
button{width:100%;padding:10px;margin-top:12px;background:#22c55e;border:none;border-radius:8px;color:#000;font-weight:600;cursor:pointer}
</style></head><body><div class="card"><h1>&#128274; Admin</h1><p>Enter token</p>
<form onsubmit="event.preventDefault();window.location.href='/admin?token='+encodeURIComponent(document.getElementById('t').value)">
<label>Token</label><input id="t" type="password" autofocus>
<button>Unlock</button></form></div></body></html>"""), 401
        return f(*a, **k)
    return w

def req_auth_json(f):
    from functools import wraps
    @wraps(f)
    def w(*a, **k):
        if not _check_admin():
            return jsonify({"error": "Unauthorized"}), 401
        return f(*a, **k)
    return w

# ── DB ──────────────────────────────────────────────────────────

SCHEMA = """
CREATE TABLE IF NOT EXISTS tenants (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    subdomain TEXT DEFAULT '',
    api_key TEXT DEFAULT '',
    api_key_hash TEXT DEFAULT '',
    api_key_prefix TEXT DEFAULT '',
    settings_json TEXT DEFAULT '{}',
    ghl_api_key TEXT DEFAULT '',
    ghl_location_id TEXT DEFAULT '',
    sms_webhook_url TEXT DEFAULT '',
    telegram_chat_id TEXT DEFAULT '',
    is_active INTEGER DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_tenants_api_key ON tenants(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_tenants_subdomain ON tenants(subdomain);

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY, tenant_id TEXT NOT NULL DEFAULT 'default',
    name TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '', practice TEXT NOT NULL DEFAULT '',
    volume TEXT NOT NULL DEFAULT '', spend TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '', page_url TEXT NOT NULL DEFAULT '',
    ip_address TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'web',
    score TEXT NOT NULL DEFAULT 'unscored', ghl_synced TEXT, ghl_contact_id TEXT,
    qualification TEXT, utm_source TEXT DEFAULT '', utm_medium TEXT DEFAULT '',
    utm_campaign TEXT DEFAULT '', utm_content TEXT DEFAULT '', utm_term TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
    id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL,
    lead_id TEXT NOT NULL, recipient TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending', message TEXT DEFAULT '',
    error TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT, dedup_count INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page TEXT NOT NULL DEFAULT '',
    session_id TEXT NOT NULL DEFAULT '',
    utm_source TEXT DEFAULT '',
    utm_medium TEXT DEFAULT '',
    utm_campaign TEXT DEFAULT '',
    referer TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(created_at);
CREATE INDEX IF NOT EXISTS idx_visits_session ON visits(session_id);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_score ON leads(tenant_id, score, created_at);
CREATE INDEX IF NOT EXISTS idx_leads_tenant_created ON leads(tenant_id, created_at);
CREATE TABLE IF NOT EXISTS email_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id TEXT NOT NULL DEFAULT 'default',
    to_email TEXT NOT NULL,
    to_name TEXT DEFAULT '',
    subject TEXT DEFAULT '',
    channel TEXT DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    message_id TEXT DEFAULT '',
    error TEXT DEFAULT '',
    lead_id TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    sent_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_email_log_status ON email_log(status);

"""

def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("PRAGMA journal_mode=WAL")
    conn.executescript(SCHEMA)
    conn.commit()
    conn.close()

def conn():
    c = sqlite3.connect(str(DB_PATH))
    c.row_factory = sqlite3.Row
    return c

def _cols():
    c = conn()
    names = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    return names

# ── Scoring ─────────────────────────────────────────────────────

def score_lead(lead: dict) -> tuple:
    try:
        volume = int(str(lead.get("volume", "0")).strip() or "0")
    except (ValueError, AttributeError): volume = 0
    try:
        spend = int(str(lead.get("spend", "0")).strip() or "0")
    except (ValueError, AttributeError): spend = 0
    has = bool(lead.get("email")) or bool(lead.get("phone"))
    d = {"volume": volume, "spend": spend, "has_contact": has}
    if volume >= 100 or spend >= 5000:
        s = 85 + (10 if (volume >= 200 or spend >= 10000) else 0)
        return f"hot_{s}", s, d
    elif volume >= 30 or spend >= 1000:
        s = 60 + (10 if (volume >= 50 or spend >= 3000) else 5 if has else 0)
        return f"warm_{s}", s, d
    else:
        s = 25 + (10 if has else 5)
        return f"cold_{s}", s, d

# ── Normalize ────────────────────────────────────────────────────

def norm(payload: dict) -> dict:
    d = payload.get("state", payload) if isinstance(payload, dict) else {}
    return {
        "name": (d.get("name") or "").strip(),
        "phone": (d.get("phone") or "").strip(),
        "email": (d.get("email") or "").strip(),
        "practice": ((d.get("practice") or "") or (d.get("practiceName") or "") or (d.get("company") or "")).strip(),
        "source": d.get("source") or "web",
        "qualification": d.get("qualification"),
        "volume": str(d.get("q1_volume") or d.get("volume") or ""),
        "spend": str(d.get("q2_spend") or d.get("spend") or ""),
        "message": (d.get("message") or "").strip(),
        "page_url": (d.get("page_url") or d.get("url") or "").strip(),
        "ip_address": request.remote_addr if request else "",
        "utm_source": d.get("utm_source", ""), "utm_medium": d.get("utm_medium", ""),
        "utm_campaign": d.get("utm_campaign", ""), "utm_content": d.get("utm_content", ""),
        "utm_term": d.get("utm_term", ""),
    }

# ── Telegram ─────────────────────────────────────────────────────

TG_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "5926797455")

def tg_send(lead: dict):
    if not TG_TOKEN: return
    msg = (
        f"\U0001f680 <b>New Lead — FocusRunner!</b>\n"
        f"\U0001f464 <b>Name:</b> {lead.get('name','?')}\n"
        f"\U0001f4e7 <b>Email:</b> {lead.get('email','?')}\n"
        f"\U0001f4de <b>Phone:</b> {lead.get('phone','—')}\n"
        f"\U0001f3e5 <b>Practice:</b> {lead.get('practice','—')}\n"
        f"\U0001f4ca <b>Score:</b> {lead.get('score','?')}\n"
        f"\U0001f550 <b>Time:</b> {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')}"
    )
    try:
        import requests
        r = requests.post(f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage",
            json={"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML", "disable_web_page_preview": True}, timeout=10)
        if r.status_code == 200: logger.info(f"TG sent for {lead.get('name')}")
        else: logger.warning(f"TG failed: {r.status_code}")
    except Exception as e: logger.warning(f"TG error: {e}")

# ── Twilio ───────────────────────────────────────────────────────

TW_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TW_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TW_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")
TW_SALES = os.environ.get("SALES_TEAM_PHONE", "")
TW_OK = all([TW_SID, TW_TOKEN, TW_FROM, TW_SALES])
# ── SMTP Email ──────────────────────────────────────────────────

SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_USER = os.environ.get("SMTP_USER", "")
SMTP_PASS = os.environ.get("SMTP_PASS", "")
SMTP_FROM = os.environ.get("SMTP_FROM_EMAIL", "hello@focusrunner.io")
SMTP_OK = bool(SMTP_PASS) and bool(SMTP_USER or SMTP_FROM)

def send_email_smtp(to: str, subject: str, html_body: str) -> dict:
    """Send email via SMTP with fallback chain: Gmail -> Direct MX.
    Returns {"ok": bool, "id": str, "error": str}.
    """
    # Try Gmail SMTP first if configured
    if SMTP_OK:
        result = _send_via_gmail_inline(to, subject, html_body)
        if result["ok"]:
            return result
        logger.warning(f"Gmail SMTP failed: {result.get('error')}, trying direct-MX fallback")
    else:
        logger.info("SMTP not configured for Gmail, using direct-MX")

    # Fallback: use smtp_fallback's send_email (direct-to-MX)
    try:
        from smtp_fallback import send_email as mx_send
        result = mx_send(to, subject, html_body)
        if result["ok"]:
            return {"ok": True, "id": result.get("id", ""), "error": None}
        return {"ok": False, "error": result.get("error", "Direct-MX failed")}
    except Exception as e:
        return {"ok": False, "error": f"All SMTP paths failed: {e}"}


def _send_via_gmail_inline(to: str, subject: str, html_body: str) -> dict:
    """Send via Gmail SMTP with STARTTLS using app's configured SMTP_USER/SMTP_PASS."""
    import re
    msg = MIMEMultipart("alternative")
    msg["From"] = SMTP_FROM
    msg["To"] = to
    msg["Subject"] = subject
    msg["Message-ID"] = f"<{uuid.uuid4().hex}@focusrunner.io>"
    text_body = re.sub(r"<[^>]+>", "", html_body)
    text_body = re.sub(r"\n{3,}", "\n\n", text_body).strip()
    msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    try:
        ctx = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as srv:
            srv.starttls(context=ctx)
            srv.login(SMTP_USER, SMTP_PASS)
            srv.sendmail(SMTP_FROM, [to], msg.as_string())
        return {"ok": True, "id": msg["Message-ID"]}
    except smtplib.SMTPAuthenticationError as e:
        return {"ok": False, "error": f"SMTP auth failed: check SMTP_USER/SMTP_PASS"}
    except Exception as e:
        return {"ok": False, "error": f"SMTP: {e}"}


def personal_intro_html(name, practice):
    """Outreach HTML template matching send-outreach.js style."""
    n = name or "Friend"
    p = practice or "your med spa"
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a;">
  <div style="border-bottom:3px solid #7c3aed;padding-bottom:15px;margin-bottom:20px;">
    <h1 style="color:#7c3aed;margin:0;">FocusRunner AI</h1>
    <p style="color:#666;margin:5px 0 0;">AI-Powered Patient Acquisition</p>
  </div>
  <p>Hi {n},</p>
  <p>I run a team that builds AI patient acquisition systems for med spas. We help practices like <strong>{p}</strong> recover the 70% of leads that go cold within 24 hours.</p>
  <p>Here's what we do:</p>
  <ul>
    <li><strong>24/7 AI Chatbot</strong> that qualifies leads while you sleep</li>
    <li><strong>Automated follow-up</strong> — SMS + email sequences that warm cold leads</li>
    <li><strong>Lead scoring</strong> so your front desk knows who to call first</li>
    <li><strong>Booking integration</strong> — qualified leads book directly</li>
  </ul>
  <p>I'd love to offer you a <strong>free Patient Acquisition Audit</strong> — we'll analyze your current lead flow and show you exactly where patients are falling through the cracks.</p>
  <div style="text-align:center;margin:30px 0;">
    <a href="https://focusrunner.io/lead-capture" style="background:#7c3aed;color:white;padding:14px 32px;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;display:inline-block;">Claim Your Free Audit &rarr;</a>
  </div>
  <p>No catch. Just a data-backed audit of your acquisition pipeline.</p>
  <p>— CEO, FocusRunner AI</p>
  <div style="border-top:1px solid #e5e5e5;padding-top:15px;margin-top:20px;font-size:12px;color:#999;">
    <p>FocusRunner AI &middot; 15 qualified leads in 30 days or it's free</p>
    <p><a href="https://focusrunner.io" style="color:#7c3aed;">focusrunner.io</a></p>
  </div>
</body>
</html>"""


def send_sms(to: str, body: str) -> tuple:
    if not TW_OK: return False, "Twilio not configured"
    try:
        import requests
        r = requests.post(f"https://api.twilio.com/2010-04-01/Accounts/{TW_SID}/Messages.json",
            auth=(TW_SID, TW_TOKEN), data={"From": TW_FROM, "To": to, "Body": body}, timeout=15)
        if r.status_code in (200, 201):
            sid = r.json().get("sid", "unknown")
            logger.info(f"SMS sent to {to} — SID: {sid}")
            return True, sid
        return False, f"HTTP {r.status_code}: {r.text[:200]}"
    except Exception as e: return False, str(e)

def log_notif(t, lid, rec, st, msg="", err=""):
    try:
        c = conn()
        c.execute("INSERT INTO notifications (type, lead_id, recipient, status, message, error) VALUES (?,?,?,?,?,?)",
                  (t, lid, rec, st, msg[:500], err[:500]))
        c.commit(); c.close()
    except Exception as e: logger.warning(f"Notif log fail: {e}")

def sms_alert(lead: dict):
    if not TW_OK: return log_notif("sms", lead.get("id",""), "", "skipped", "Twilio not configured")
    name, ph, em, pr, sc = lead.get("name","U"), lead.get("phone","—"), lead.get("email","—"), lead.get("practice","—"), lead.get("score","hot_??")
    body = f"🔥 HOT LEAD — FocusRunner\nName: {name}\nPhone: {ph}\nEmail: {em}\nPractice: {pr}\nScore: {sc}\nDashboard: http://localhost:5000/admin"
    ok, det = send_sms(TW_SALES, body)
    log_notif("sms", lead.get("id",""), TW_SALES, "sent" if ok else "failed", body, "" if ok else det)

# ── Store ────────────────────────────────────────────────────────

def store(lead: dict) -> str:
    # ── Dedup: skip if same phone+name combo already exists ──
    phone = (lead.get("phone") or "").strip()
    if phone:
        name = (lead.get("name") or "").strip().lower()
        c = conn()
        try:
            existing = c.execute(
                "SELECT id, name, source FROM leads WHERE phone = ? ORDER BY created_at DESC LIMIT 1",
                (phone,),
            ).fetchone()
            if existing:
                existing_name = (existing["name"] or "").strip().lower()
                # Phone match + name matches (or incoming name is empty — just phone match)
                if not name or not existing_name or name == existing_name:
                    logger.info(f"[Dedup] Skipped — phone={phone}, name={lead.get('name')}, existing id={existing['id']}, existing source={existing['source']}")
                    c.close()
                    return existing["id"]
        finally:
            c.close()

    lid = str(uuid.uuid4())
    sl, sv, sd = score_lead(lead)
    qj = json.dumps({"score": sv, "detail": sd, "category": sl.split("_")[0]})
    c = conn()
    try:
        c.execute("""INSERT INTO leads (id, tenant_id, name, email, phone, practice, volume, spend,
            message, page_url, ip_address, source, score, qualification,
            utm_source, utm_medium, utm_campaign, utm_content, utm_term)
            VALUES (?,'default',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (lid, lead.get("name",""), lead.get("email",""), lead.get("phone",""),
             lead.get("practice",""), lead.get("volume",""), lead.get("spend",""),
             lead.get("message",""), lead.get("page_url",""), lead.get("ip_address",""),
             lead.get("source","web"), sl, qj,
             lead.get("utm_source",""), lead.get("utm_medium",""), lead.get("utm_campaign",""),
             lead.get("utm_content",""), lead.get("utm_term","")))
        c.commit()
    finally: c.close()
    lead["id"] = lid; lead["score"] = sl; lead["score_value"] = sv
    tg_send(lead)
    if sv >= 85: sms_alert(lead)
    logger.info(f"Saved {lid} — {lead.get('name')} — {sl}")
    return lid

# ── Routes ───────────────────────────────────────────────────────

@app.route("/admin")
@req_auth_html
def admin():
    """Serve the lead admin dashboard HTML."""
    path = BASE_DIR / "admin.html"
    if path.exists():
        token = request.args.get("token", ADMIN_TOKEN)
        html = path.read_text()
        html = html.replace("TOKEN=*** URLSearchParams", f"TOKEN='***' || new URLSearchParams")
        return html, 200, {"Content-Type": "text/html; charset=utf-8"}
    # Fallback: inline dashboard (same data as admin.html)
    c = conn()
    rows = c.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    names = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    leads_list = [dict(zip(names, r)) for r in rows]
    return render_template_string("""<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><title>FocusRunner Leads</title>
<style>*{margin:0;padding:0;box-sizing:border-box}
body{background:#0b0b0b;color:#e0e0e0;font-family:Inter,sans-serif;padding:32px}
h1{color:#22c55e;font-size:22px;margin-bottom:6px}
.sub{color:#666;font-size:13px;margin-bottom:24px}
table{width:100%;border-collapse:collapse;font-size:13px}
th{text-align:left;padding:10px 12px;border-bottom:1px solid #222;color:#666;font-size:11px;text-transform:uppercase}
td{padding:10px 12px;border-bottom:1px solid #181818}
tr:hover td{background:#111}
.empty{text-align:center;padding:48px;color:#444}
.hot{color:#ef4444;font-weight:600}.warm{color:#f59e0b;font-weight:600}.cold{color:#6b7280}
</style></head><body>
<h1>&#9671; FocusRunner Leads</h1>
<div class="sub">{{ leads|length }} &middot; <a href="/admin?token={{ token }}">refresh</a> &middot; <a href="/api/leads/export?token={{ token }}">CSV</a></div>
{% if leads %}<table><thead><tr><th>Time</th><th>Name</th><th>Email</th><th>Phone</th><th>Practice</th><th>Score</th><th>Source</th></tr></thead><tbody>
{% for l in leads %}<tr><td>{{ (l.created_at[:16] if l.created_at else '') }}</td><td>{{ l.name }}</td><td>{{ l.email }}</td><td>{{ l.phone }}</td><td>{{ l.practice }}</td>
<td class="{% if 'hot' in l.score %}hot{% elif 'warm' in l.score %}warm{% else %}cold{% endif %}">{{ l.score }}</td><td>{{ l.source }}</td></tr>
{% endfor %}</tbody></table>{% else %}<div class="empty">No leads yet.</div>{% endif %}
</body></html>""", leads=leads_list, token=ADMIN_TOKEN)

@app.route("/api/lead", methods=["POST"])
@app.route("/api/capture", methods=["POST"])
def capture():
    data = request.get_json(silent=True) or {}
    lead = norm(data)
    if not lead.get("name") or not lead.get("email"):
        return jsonify({"success": False, "error": "name and email required"}), 400
    lid = store(lead)
    return jsonify({"success": True, "id": lid, "message": "Lead saved!"}), 201

@app.route("/api/chat", methods=["POST"])
def chat():
    data = request.get_json(silent=True) or {}
    lead = norm(data)
    st = data.get("state", {})
    if st:
        if not lead.get("email"): lead["email"] = st.get("email", "")
        if not lead.get("phone"): lead["phone"] = st.get("phone", "")
        if not lead.get("practice"): lead["practice"] = st.get("practice", st.get("practiceName", ""))
        if not lead.get("volume"): lead["volume"] = str(st.get("q1_volume", ""))
        if not lead.get("spend"): lead["spend"] = str(st.get("q2_spend", ""))
        lead["source"] = "chat-widget"
    if not lead.get("email"):
        return jsonify({"status": "pending", "message": "No contact info yet"}), 200
    lid = store(lead)
    return jsonify({"success": True, "id": lid}), 201

@app.route("/api/webhook", methods=["POST"])
def webhook():
    data = request.get_json(silent=True) or {}
    lead = norm({"name": data.get("name"), "phone": data.get("phone"),
                 "email": data.get("email"), "practice": data.get("practice"),
                 "source": data.get("source", "webhook")})
    if not lead.get("name") or not lead.get("phone"):
        return jsonify({"error": "name and phone required"}), 400
    # ── Webhook dedup: name+phone (case-insensitive) ──
    name_lower = lead.get("name", "").strip().lower()
    phone_lower = lead.get("phone", "").strip().lower()
    c = conn()
    try:
        existing = c.execute(
            "SELECT id, score, qualification FROM leads WHERE LOWER(name) = ? AND LOWER(phone) = ?",
            (name_lower, phone_lower),
        ).fetchone()
        if existing:
            # Re-score and update qualification
            sl, sv, sd = score_lead(lead)
            qj = json.dumps({"score": sv, "detail": sd, "category": sl.split("_")[0]})
            c.execute(
                "UPDATE leads SET score = ?, qualification = ?, updated_at = datetime('now') WHERE id = ?",
                (sl, qj, existing["id"]),
            )
            c.commit()
            # Log dedup event
            dedup_count = c.execute(
                "SELECT COUNT(*) FROM notifications WHERE type = 'dedup' AND lead_id = ?",
                (existing["id"],),
            ).fetchone()[0]
            c.execute(
                "INSERT INTO notifications (type, lead_id, recipient, status, message, error, dedup_count) VALUES (?,?,?,?,?,?,?)",
                ("dedup", existing["id"], "webhook", "deduped",
                 f"Webhook dedup: name={lead.get('name')}, phone={lead.get('phone')}, new_score={sl}",
                 "", dedup_count + 1),
            )
            c.commit()
            c.close()
            logger.info(f"[Webhook Dedup] Updated id={existing['id']}, name={lead.get('name')}, score={sl}")
            return jsonify({"ok": True, "id": existing["id"], "dedup": True}), 200
    finally:
        c.close()
    lid = store(lead)
    return jsonify({"ok": True, "id": lid}), 201

@app.route("/api/leads", methods=["GET"])
@req_auth_json
def list_leads():
    c = conn()
    rows = c.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    names = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    return jsonify({"leads": [dict(zip(names, r)) for r in rows]})

@app.route("/api/leads/export", methods=["GET"])
@req_auth_json
def export():
    c = conn()
    rows = c.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    names = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    out = io.StringIO()
    w = csv.DictWriter(out, fieldnames=names)
    w.writeheader()
    for r in rows: w.writerow(dict(zip(names, r)))
    resp = make_response(out.getvalue())
    resp.headers["Content-Type"] = "text/csv; charset=utf-8"
    resp.headers["Content-Disposition"] = "attachment; filename=leads.csv"
    return resp

@app.route("/api/analytics", methods=["GET"])
def analytics():
    c = conn()
    rows = c.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    names = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    leads = [dict(zip(names, r)) for r in rows]
    t = len(leads); now = datetime.now(timezone.utc)
    f = {"captured": t, "scored": 0, "qualified": 0, "hot": 0, "has_email": 0, "has_phone": 0, "has_both": 0}
    bk = {"unscored": 0, "cold_0_24": 0, "warm_25_49": 0, "qualified_50_74": 0, "hot_75_100": 0}
    ss = {}; dm = {}
    for i in range(30): dm[(now - __import__("datetime").timedelta(days=i)).strftime("%Y-%m-%d")] = {"captured":0,"scored":0,"qualified":0}
    for l in leads:
        s = l.get("source","unknown")
        he = bool(l.get("email","").strip()); hp = bool(l.get("phone","").strip())
        if he: f["has_email"]+=1
        if hp: f["has_phone"]+=1
        if he and hp and bool(l.get("practice","").strip()): f["has_both"]+=1
        st = l.get("score","unscored"); sc = 0; iq = ih = False
        if st != "unscored":
            f["scored"]+=1
            try: sc = int(st.split("_")[-1])
            except: pass
            if sc>=50: iq=True;f["qualified"]+=1
            if sc>=75: ih=True;f["hot"]+=1
            if sc<25: bk["cold_0_24"]+=1
            elif sc<50: bk["warm_25_49"]+=1
            elif sc<75: bk["qualified_50_74"]+=1
            else: bk["hot_75_100"]+=1
        else: bk["unscored"]+=1
        ss.setdefault(s, {"count":0,"scored":0,"hot":0,"qualified":0,"total_score":0,"with_info":0})
        ss[s]["count"]+=1
        if st!="unscored": ss[s]["scored"]+=1; ss[s]["total_score"]+=sc
        if iq: ss[s]["qualified"]+=1
        if ih: ss[s]["hot"]+=1
        if he or hp: ss[s]["with_info"]+=1
        d = (l.get("created_at") or "")[:10]
        if d in dm: dm[d]["captured"]+=1; dm[d]["scored"]+=1 if st!="unscored" else 0; dm[d]["qualified"]+=1 if iq else 0
    ssum = []
    for src, v in sorted(ss.items(), key=lambda x: x[1]["count"], reverse=True):
        avg = round(v["total_score"]/v["scored"]) if v["scored"] else None
        ir = round(v["with_info"]/v["count"]*100) if v["count"] else 0
        ssum.append({"source":src,"count":v["count"],"scored":v["scored"],"avg_score":avg,"qualified":v["qualified"],"hot":v["hot"],"with_info":v["with_info"],"info_rate":ir})
    return jsonify({"last_updated":now.isoformat(),"summary":{"total_leads":t,"funnel":f,"funnel_rate":{"scored":round(f["scored"]/t*100,1) if t else 0,"qualified":round(f["qualified"]/t*100,1) if t else 0,"hot":round(f["hot"]/t*100,1) if t else 0}},"score_distribution":bk,"by_source":ssum,"by_day":[{"date":d,**dm[d]} for d in sorted(dm) if dm[d]["captured"]>0]})

@app.route("/api/track", methods=["POST"])
def track_visit():
    """Track page visit with UTM params. Writes to visits table for visitor counter."""
    data = request.get_json(silent=True) or {}
    session_id = data.get("session_id", "")
    page = data.get("page", "/")
    utm_source = data.get("utm_source", "direct")
    utm_medium = data.get("utm_medium", "")
    utm_campaign = data.get("utm_campaign", "")
    referer = data.get("referer", "")
    logger.info(f"Visit: {page} utm_source={utm_source} session={session_id[:16]}")
    try:
        c = conn()
        c.execute(
            "INSERT INTO visits (page, session_id, utm_source, utm_medium, utm_campaign, referer) VALUES (?,?,?,?,?,?)",
            (page, session_id, utm_source, utm_medium, utm_campaign, referer),
        )
        c.commit()
        c.close()
    except Exception as e:
        logger.debug(f"Visit log non-critical fail: {e}")
    return jsonify({"ok": True}), 200


@app.route("/api/visitor-count", methods=["GET"])
def visitor_count():
    """Return total unique visitors (by session) and today's unique visitors."""
    try:
        c = conn()
        total = c.execute("SELECT COUNT(DISTINCT session_id) FROM visits WHERE session_id != ''").fetchone()[0]
        today = c.execute(
            "SELECT COUNT(DISTINCT session_id) FROM visits WHERE session_id != '' AND date(created_at) = date('now')"
        ).fetchone()[0]
        c.close()
        return jsonify({"total_visitors": total, "today_visitors": today}), 200
    except Exception as e:
        return jsonify({"error": str(e)}), 500

# ── Make.com Webhook ──────────────────────────────────────────────
MAKE_TOKEN = os.environ.get("MAKE_WEBHOOK_TOKEN", "fr-make-webhook-2026")

@app.route("/api/webhook/make/lead", methods=["POST"])
def make_webhook_lead():
    """Accept new lead from Make.com automation."""
    token = request.headers.get("X-Make-Webhook-Token", "") or request.args.get("token", "")
    if not hmac.compare_digest(token, MAKE_TOKEN):
        return jsonify({"error": "Invalid webhook token"}), 401
    data = request.get_json(silent=True) or request.form.to_dict() or {}
    lead = norm(data)
    if not lead.get("name") or not (lead.get("phone") or lead.get("email")):
        return jsonify({"error": "name and (phone or email) required"}), 400
    lead_id = store(lead)
    tg_send(lead)
    logger.info(f"Make webhook: lead {lead_id} - {lead['name']}")
    return jsonify({"ok": True, "id": lead_id}), 201

@app.route("/api/webhook/make/notify", methods=["POST"])
def make_webhook_notify():
    """Trigger a notification via Make.com."""
    token = request.headers.get("X-Make-Webhook-Token", "") or request.args.get("token", "")
    if not hmac.compare_digest(token, MAKE_TOKEN):
        return jsonify({"error": "Invalid webhook token"}), 401
    data = request.get_json(silent=True) or {}
    ntype = data.get("type", "manual")
    msg = data.get("message", "")
    lead_id = data.get("lead_id", "")
    try:
        c = conn()
        c.execute("INSERT INTO notifications (type, lead_id, recipient, status, message) VALUES (?, ?, 'make-webhook', 'triggered', ?)", (ntype, lead_id, msg))
        c.commit(); c.close()
    except Exception as e:
        logger.warning(f"Make notify log fail: {e}")
    return jsonify({"ok": True, "type": ntype}), 200

@app.route("/api/health", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    try:
        c = conn()
        cnt = c.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        ghl_ok = bool(os.environ.get("GHL_API_KEY", ""))
        c.close()
        return jsonify({"status": "ok", "leads_count": cnt, "telegram_configured": bool(TG_TOKEN), "twilio_configured": TW_OK, "ghl_configured": ghl_ok})
    except Exception as e:
        return jsonify({"status": "error", "error": str(e)}), 500

@app.route("/api/sms/send", methods=["POST"])
@req_auth_json
def sms_send():
    d = request.get_json(silent=True) or {}
    to, body = d.get("to","").strip(), d.get("body","").strip()
    if not to or not body: return jsonify({"success":False,"error":"'to' and 'body' required"}), 400
    ok, det = send_sms(to, body)
    return (jsonify({"success":True,"sid":det}),200) if ok else (jsonify({"success":False,"error":det}),500)

@app.route("/")
@app.route("/lead-capture")
def index():
    for p in [BASE_DIR/".."/"public"/"lead-capture.html", Path("/home/ai13/workspace/portfolio/public/lead-capture.html")]:
        if p.is_file(): return p.read_text()
    return "<h1>Lead Capture</h1><p>File not found.</p>"

@app.route("/public/<path:filename>")
def static_file(filename):
    base = BASE_DIR / ".." / "public"
    fp = (base / filename).resolve()
    if not str(fp).startswith(str(base.resolve())): return "Forbidden", 403
    if fp.is_file(): return fp.read_text()
    return "Not found", 404

# ── Tenant Auth ─────────────────────────────────────────────────

TENANT_HEADER = "X-Tenant-Key"


def _resolve_tenant():
    """Resolve tenant via X-Tenant-Key header. Returns (ok: bool, tenant_id: str|None)."""
    api_key = request.headers.get(TENANT_HEADER, "")
    if not api_key:
        return False, None
    key_hash = hashlib.sha256(api_key.encode()).hexdigest()
    try:
        c = conn()
        t = c.execute(
            "SELECT id, name FROM tenants WHERE api_key_hash = ? AND is_active = 1",
            (key_hash,),
        ).fetchone()
        c.close()
        if t:
            return True, t["id"]
        return False, None
    except Exception:
        return False, None


# ── Tenant API Routes ─────────────────────────────────────────


@app.route("/api/tenants", methods=["GET"])
@req_auth_json
def list_tenants():
    c = conn()
    rows = c.execute(
        "SELECT id, name, subdomain, api_key_prefix, is_active, created_at FROM tenants ORDER BY created_at DESC"
    ).fetchall()
    c.close()
    return jsonify({"tenants": [dict(r) for r in rows]})


@app.route("/api/tenants", methods=["POST"])
@req_auth_json
def create_tenant():
    import hashlib
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    subdomain = data.get("subdomain", "").strip()
    if not name:
        return jsonify({"error": "name is required"}), 400
    tid = "tenant_" + str(uuid.uuid4())[:8]
    raw_key = f"fr_{uuid.uuid4().hex[:24]}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()
    key_prefix = raw_key[:8]
    try:
        c = conn()
        c.execute(
            "INSERT INTO tenants (id, name, subdomain, api_key_hash, api_key_prefix) VALUES (?, ?, ?, ?, ?)",
            (tid, name, subdomain or "", key_hash, key_prefix),
        )
        c.commit()
        c.close()
        logger.info(f"Tenant created: {tid} - {name}")
        return jsonify({"id": tid, "name": name, "subdomain": subdomain, "api_key": raw_key}), 201
    except sqlite3.IntegrityError as e:
        return jsonify({"error": f"Duplicate: {e}"}), 409
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route("/api/tenants/<tid>", methods=["GET"])
@req_auth_json
def tenant_get(tid):
    c = conn()
    t = c.execute(
        "SELECT id, name, subdomain, api_key_prefix, is_active, created_at FROM tenants WHERE id = ?",
        (tid,),
    ).fetchone()
    c.close()
    if not t:
        return jsonify({"error": "Tenant not found"}), 404
    return jsonify(dict(t))

@app.route("/api/tenants/<tid>/stats", methods=["GET"])
@req_auth_json
def tenant_stats(tid):
    c = conn()
    # Verify tenant exists
    t = c.execute("SELECT id, name FROM tenants WHERE id = ?", (tid,)).fetchone()
    if not t:
        c.close()
        return jsonify({"error": "Tenant not found"}), 404
    # Get lead stats for this tenant
    rows = c.execute("SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC", (tid,)).fetchall()
    cols = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    leads = [dict(zip(cols, r)) for r in rows]
    total = len(leads)
    now_dt = datetime.now(timezone.utc)
    funnel = {"captured": total, "scored": 0, "qualified": 0, "hot": 0}
    bucket = {"unscored": 0, "cold_0_24": 0, "warm_25_49": 0, "qualified_50_74": 0, "hot_75_100": 0}
    for l in leads:
        st = l.get("score", "unscored")
        if st != "unscored":
            funnel["scored"] += 1
            try: sc = int(st.split("_")[-1])
            except: sc = 0
            if sc >= 50: funnel["qualified"] += 1
            if sc >= 75: funnel["hot"] += 1
            if sc < 25: bucket["cold_0_24"] += 1
            elif sc < 50: bucket["warm_25_49"] += 1
            elif sc < 75: bucket["qualified_50_74"] += 1
            else: bucket["hot_75_100"] += 1
        else:
            bucket["unscored"] += 1
    return jsonify({
        "tenant": dict(t),
        "total_leads": total,
        "funnel": funnel,
        "score_distribution": bucket,
    })
@app.route("/api/v2/leads", methods=["GET"])
def list_leads_v2():
    """Multi-tenant lead list. Requires X-Tenant-Key header."""
    ok, tenant_id = _resolve_tenant()
    if not ok:
        return jsonify({"error": "Invalid or missing X-Tenant-Key", "status": 401}), 401
    c = conn()
    rows = c.execute("SELECT * FROM leads WHERE tenant_id = ? ORDER BY created_at DESC", (tenant_id,)).fetchall()
    names = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    return jsonify({"tenant_id": tenant_id, "leads": [dict(zip(names, r)) for r in rows]})



# ── Email Send (SMTP) ──────────────────────────────────────────

@app.route("/api/email/send", methods=["POST"])
@req_auth_json
def api_email_send():
    """Send email via SMTP with fallback to Resend. Logs to email_log table.
    
    POST json: {to_email, subject, html_body, lead_id?, to_name?}
    """
    d = request.get_json(silent=True) or {}
    to_email = (d.get("to_email") or "").strip()
    subject = (d.get("subject") or "FocusRunner AI").strip()
    html_body = (d.get("html_body") or d.get("body") or "").strip()
    lead_id = (d.get("lead_id") or "").strip()
    to_name = (d.get("to_name") or "").strip()
    if not to_email or not html_body:
        return jsonify({"ok": False, "error": "to_email and html_body required"}), 400
    
    # Try Resend first (primary), then SMTP (fallback)
    result = {"ok": False, "error": "No email channel configured"}
    rk = os.environ.get("RESEND_API_KEY", "")
    if rk:
        import urllib.request, urllib.error
        try:
            data = json.dumps({
                "from": "FocusRunner AI <hello@focusrunner.io>",
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            }).encode("utf-8")
            req = urllib.request.Request(
                "https://api.resend.com/emails",
                data=data,
                headers={"Authorization": f"Bearer {rk}", "Content-Type": "application/json"},
                method="POST",
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                resp_data = json.loads(resp.read().decode("utf-8"))
                result = {"ok": True, "id": resp_data.get("id", ""), "channel": "resend"}
        except Exception as e:
            result = {"ok": False, "error": f"Resend failed: {e}", "channel": "resend"}
            logger.warning(f"Resend failed for {to_email}: {e}, trying SMTP fallback")
    
    # SMTP fallback
    if not result.get("ok"):
        smtp_result = send_email_smtp(to_email, subject, html_body)
        if smtp_result.get("ok"):
            result = {"ok": True, "id": smtp_result["id"], "channel": "smtp"}
        elif result.get("channel") == "resend":
            # Both failed — keep the Resend error but note SMTP also failed
            result["smtp_error"] = smtp_result.get("error", "unknown")
            result["error"] += f" | SMTP: {smtp_result.get('error', '')}"
    
    # Log to email_log table
    try:
        c = conn()
        c.execute(
            "INSERT INTO email_log (to_email, to_name, subject, channel, status, message_id, error, lead_id) VALUES (?,?,?,?,?,?,?,?)",
            (to_email, to_name, subject, result.get("channel", ""), 
             "sent" if result.get("ok") else "failed",
             result.get("id", ""), result.get("error", ""), lead_id)
        )
        c.commit()
        c.close()
    except Exception as e:
        logger.warning(f"Email log failed: {e}")
    
    status = 200 if result.get("ok") else 500
    return jsonify(result), status

@app.route("/api/email/log", methods=["GET"])
@req_auth_json
def api_email_log():
    """Return email send history."""
    c = conn()
    limit = min(int(request.args.get("limit", 50)), 200)
    rows = c.execute("SELECT * FROM email_log ORDER BY created_at DESC LIMIT ?", (limit,)).fetchall()
    cols = [d[1] for d in c.execute("PRAGMA table_info(email_log)").fetchall()]
    c.close()
    return jsonify({"emails": [dict(zip(cols, r)) for r in rows]})

# ── Credential Injection Endpoint ──────────────────────────────

@app.route("/api/credentials", methods=["POST"])
@req_auth_json
def set_credentials():
    """CEO injects API credentials at runtime. Writes .env and reloads globals."""
    d = request.get_json(silent=True) or {}
    env_path = BASE_DIR / ".env"
    written = []
    existing = {}
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            line = line.strip()
            if "=" in line and not line.startswith("#"):
                k, v = line.split("=", 1)
                existing[k.strip()] = v.strip()
    for key, val in d.items():
        key = key.upper().strip()
        val = str(val).strip()
        if not key or not val:
            continue
        existing[key] = val
        os.environ[key] = val
        written.append(key)
    with open(env_path, "w") as f:
        for k, v in sorted(existing.items()):
            f.write(f"{k}={v}\n")
    global TW_SID, TW_TOKEN, TW_FROM, TW_SALES, TW_OK, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM, SMTP_OK
    TW_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
    TW_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
    TW_FROM = os.environ.get("TWILIO_FROM_NUMBER", "")
    TW_SALES = os.environ.get("SALES_TEAM_PHONE", "")
    TW_OK = all([TW_SID, TW_TOKEN, TW_FROM, TW_SALES])
    SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
    SMTP_USER = os.environ.get("SMTP_USER", "")
    SMTP_PASS = os.environ.get("SMTP_PASS", "")
    SMTP_FROM = os.environ.get("SMTP_FROM_EMAIL", "hello@focusrunner.io")
    SMTP_OK = bool(SMTP_PASS) and bool(SMTP_USER or SMTP_FROM)
    logger.info(f"Credentials updated: {', '.join(written)}")
    return jsonify({"ok": True, "updated": written, "twilio_configured": TW_OK})

# ── Send Outreach (SMS + Email) ───────────────────────────────

@app.route("/api/send-outreach", methods=["POST"])
@req_auth_json
def send_outreach():
    d = request.get_json(silent=True) or {}
    lead_id = (d.get("lead_id") or "").strip()
    if not lead_id:
        return jsonify({"success": False, "error": "'lead_id' required"}), 400
    channel = (d.get("channel") or "both").strip().lower()
    if channel not in ("sms", "email", "both"):
        return jsonify({"success": False, "error": "channel must be sms, email, or both"}), 400
    c = conn()
    lead = c.execute("SELECT * FROM leads WHERE id = ?", (lead_id,)).fetchone()
    cols = [d[1] for d in c.execute("PRAGMA table_info(leads)").fetchall()]
    c.close()
    if not lead:
        return jsonify({"success": False, "error": "Lead not found"}), 404
    lead = dict(zip(cols, lead))
    name, phone, email, practice = lead.get("name","Client"), lead.get("phone",""), lead.get("email",""), lead.get("practice","your med spa")
    results, errors = {}, []
    if channel in ("sms","both") and phone:
        body = (d.get("sms_body") or "").strip() or f"Hi {name}, this is Sarah from FocusRunner. We noticed you've been exploring patient acquisition for {practice}. Free audit -- reply YES."
        ok, det = send_sms(phone, body)
        results["sms"] = {"to": phone, "sent": ok, "detail": det}
        if not ok: errors.append(f"sms: {det}")
        log_notif("sms", lead_id, phone, "sent" if ok else "failed", body, "" if ok else det)
    elif channel in ("sms","both") and not phone:
        results["sms"] = {"to": None, "sent": False, "error": "No phone"}
        errors.append("sms: no phone")
    if channel in ("email","both") and email:
        subject = (d.get("email_subject") or "").strip() or "Your Free Patient Acquisition Audit"
        html = (d.get("email_body") or "").strip() or f"<h1>Med Spa Growth</h1><p>Hi {name}, FocusRunner AI recovers 70%+ of your cold leads. Free audit -- <a href='https://focusrunner.io/lead-capture'>claim yours</a>.</p>"
        try:
            smtp_res = smtp_send(email, subject, html)
            if smtp_res["ok"]:
                results["email"] = {"to": email, "sent": True, "channel": smtp_res.get("channel", "unknown"), "id": smtp_res.get("id", "")}
                log_notif("email", lead_id, email, "sent", subject, f"via {smtp_res.get('channel','?')}")
            else:
                results["email"] = {"to": email, "sent": False, "error": smtp_res["error"]}
                errors.append(f"email: {smtp_res['error']}")
                log_notif("email", lead_id, email, "failed", subject, smtp_res["error"])
        except Exception as e:
            results["email"] = {"to": email, "sent": False, "error": str(e)}
            errors.append(f"email: {e}")
            log_notif("email", lead_id, email, "failed", subject, str(e))
    elif channel in ("email","both") and not email:
        results["email"] = {"to": None, "sent": False, "error": "No email"}
        errors.append("email: no email")
    overall = len(errors) == 0
    return jsonify({"success": overall, "lead_id": lead_id, "lead_name": name, "channel": channel, "results": results, "errors": errors or None}), (200 if overall else 500)

# ── Send Emails (Batch) ────────────────────────────────────────────

@app.route("/api/send-emails", methods=["POST"])
@req_auth_json
def send_emails():
    d = request.get_json(silent=True) or {}
    lead_ids = d.get("lead_ids")
    dry_run = d.get("dry_run", False)

    # Use the inline send_email_smtp to batch send
    results = []
    sent = 0
    failed = 0
    c = conn()
    if lead_ids:
        placeholders = ",".join(["?" for _ in lead_ids])
        rows = c.execute(
            f"SELECT id, name, email, practice FROM leads WHERE id IN ({placeholders}) AND email IS NOT NULL AND email != ''",
            lead_ids,
        ).fetchall()
    else:
        rows = c.execute(
            "SELECT id, name, email, practice FROM leads WHERE email IS NOT NULL AND email != '' ORDER BY created_at DESC"
        ).fetchall()
    c.close()

    subject = d.get("subject", d.get("email_subject")) or "Your Free Patient Acquisition Audit"

    for row in rows:
        lead = dict(row)
        email = lead.get("email", "")
        name = lead.get("name", "Friend")
        practice = lead.get("practice", "your med spa")

        if not email or "@" not in email:
            results.append({"id": lead.get("id"), "name": name, "email": email, "status": "skipped"})
            failed += 1
            continue

        if dry_run:
            results.append({"id": lead.get("id"), "name": name, "email": email, "practice": practice, "status": "dry-run"})
            sent += 1
            continue

        smtp_result = send_email_smtp(email, subject, personal_intro_html(name, practice))
        if smtp_result.get("ok"):
            results.append({"id": lead.get("id"), "name": name, "email": email, "status": "sent", "message_id": smtp_result["id"]})
            sent += 1
        else:
            results.append({"id": lead.get("id"), "name": name, "email": email, "status": "failed", "error": smtp_result.get("error")})
            failed += 1

    return jsonify({"ok": True, "sent": sent, "failed": failed, "total": len(rows), "results": results}), 200


# ── Campaign Send ─────────────────────────────────────────────────

@req_auth_json
@app.route("/api/campaigns/send", methods=["POST"])
def campaign_send():
    """
    CEO-accessible: email all leads with email addresses.
    Uses smtp_fallback.send_outreach() with direct-to-MX + Gmail fallback.
    Supports dry_run mode.

    POST body:
      {"subject": "...", "dry_run": true}

    Returns summary: {ok, sent, failed, total, results}
    """
    d = request.get_json(silent=True) or {}
    subject = (d.get("subject") or "").strip()
    dry_run = d.get("dry_run", False)

    try:
        from smtp_fallback import send_outreach, personal_intro_html, DEFAULT_SUBJECT

        result = send_outreach(dry_run=dry_run)

        if not result.get("ok"):
            return jsonify({
                "ok": False,
                "error": result.get("error", "Unknown error"),
                "sent": 0,
                "failed": 0,
                "results": [],
            }), 500

        return jsonify({
            "ok": True,
            "sent": result.get("sent", 0),
            "failed": result.get("failed", 0),
            "total": result.get("total", 0),
            "mode": "dry-run" if dry_run else "live",
            "results": result.get("results", []),
        }), 200

    except ImportError as e:
        return jsonify({"ok": False, "error": f"smtp_fallback module not available: {e}"}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)[:300]}), 500


# ── CLI ─────────────────────────────────────────────────────────


def cli():
    import argparse
    ap = argparse.ArgumentParser(description="FocusRunner Backend")
    ap.add_argument("--send-sms", metavar="PHONE", help="Send SMS to phone")
    ap.add_argument("--body", default="", help="SMS body")
    ap.add_argument("--list-leads", action="store_true", help="List leads")
    a = ap.parse_args()
    if a.send_sms:
        b = a.body or "Hello from FocusRunner! A hot lead just came in."
        if not TW_OK: print("Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SALES_TEAM_PHONE"); sys.exit(1)
        ok, det = send_sms(a.send_sms, b)
        print(f"{'OK' if ok else 'FAIL'}: {det}")
        return
    if a.list_leads:
        c = conn()
        rs = c.execute("SELECT id, name, email, score, created_at FROM leads ORDER BY created_at DESC LIMIT 20").fetchall()
        c.close()
        print(f"{'ID':36} {'Name':20} {'Email':25} {'Score':15} {'Created'}")
        print("-"*120)
        for r in rs: print(f"{r['id']:36} {(r['name'] or '')[:20]:20} {(r['email'] or '')[:25]:25} {str(r['score']):15} {str(r['created_at'])}")
        return

if __name__ == "__main__":
    if "--send-sms" in sys.argv or "--list-leads" in sys.argv:
        init_db()
        cli()
    else:
        init_db()
        logger.info("Starting on port 5000")
        app.run(host="0.0.0.0", port=5000, debug=False)