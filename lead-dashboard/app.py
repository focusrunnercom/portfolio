#!/usr/bin/env python3
"""
FocusRunner Lead Capture Backend — Flask server on port 5000.

SQLite leads.db is the single source of truth.
Telegram notifications fire on every lead capture.
Twilio SMS fires for hot_85+ leads.

CLI: python3 app.py --send-sms "+1555..." --body "..."
     python3 app.py --list-leads
"""

import json, os, uuid, hmac, sqlite3, csv, io, datetime, logging, sys
from pathlib import Path
from datetime import datetime, timezone
from flask import Flask, jsonify, request, render_template_string, make_response
from flask_cors import CORS

app = Flask(__name__)
CORS(app)

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"
logging.basicConfig(level=logging.INFO, format="[%(name)s] %(message)s")
logger = logging.getLogger("fr")

ADMIN_TOKEN = os.environ.get("ADMIN_API_KEY") or os.environ.get("LEAD_DASHBOARD_ADMIN_TOKEN") or "focusrunner-admin-2026"

def _check_admin():
    token = request.headers.get("X-Admin-Key", "") or request.headers.get("X-Admin-Token", "") or request.args.get("token", "")
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
    sent_at TEXT
);
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

@app.route("/api/health", methods=["GET"])
@app.route("/health", methods=["GET"])
def health():
    try:
        c = conn()
        cnt = c.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        c.close()
        return jsonify({"status": "ok", "leads_count": cnt, "twilio_configured": TW_OK})
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
