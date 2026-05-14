#!/usr/bin/env python3
"""
FocusRunner Lead Capture Backend (Local Flask)
- Receives leads from the chat widget (/api/capture, /api/chat, /api/lead)
- Stores them in SQLite database
- Sends Telegram notification
- Health endpoint for monitoring

Intended to run locally (not on Vercel) — bypasses Vercel API routing issues.
"""

import os
import sys
import json
import sqlite3
import hmac
import datetime
import requests
from pathlib import Path
from flask import Flask, request, jsonify, abort, send_from_directory
from flask_cors import CORS

# ─── GHL Sync & SMS Modules ────────────────────────────
try:
    from ghl_sync import run_sync
except ImportError:
    run_sync = None

try:
    from sms_notify import send_hot_alert, ensure_notifications_table
except ImportError:
    send_hot_alert = None
    ensure_notifications_table = None

# ─── Configuration ───────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"

# Read Telegram bot token from environment or .env
def _read_env_token() -> str:
    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val
    return os.environ.get("TELEGRAM_BOT_TOKEN", "")

TELEGRAM_BOT_TOKEN = _read_env_token()
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "5926797455")
HOST = os.environ.get("FLASK_HOST", "0.0.0.0")
PORT = int(os.environ.get("FLASK_PORT", "5000"))

# Read admin token from environment
ADMIN_API_KEY = os.environ.get("ADMIN_API_KEY", "")

app = Flask(__name__)
CORS(app)


# ─── Admin Auth Decorator ─────────────────────────────────────
def _extract_admin_token():
    """Get admin token from header or query param.

    Checks in order: X-Admin-Key header, Authorization Bearer, ?token=.
    """
    token = request.headers.get("X-Admin-Key", "")
    if token:
        return token
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return request.args.get("token", "")


def require_admin(f):
    """Decorator: validate admin token via header or query param."""
    from functools import wraps
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _extract_admin_token()
        if not ADMIN_API_KEY or not hmac.compare_digest(token, ADMIN_API_KEY):
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper


# ─── Database ────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT DEFAULT '',
            practice TEXT DEFAULT '',
            volume TEXT DEFAULT '',
            spend TEXT DEFAULT '',
            message TEXT DEFAULT '',
            page_url TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            source TEXT DEFAULT 'web',
            score TEXT DEFAULT 'unscored',
            ghl_synced TEXT,
            ghl_contact_id TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            lead_id INTEGER NOT NULL,
            recipient TEXT DEFAULT '',
            status TEXT DEFAULT 'pending',
            message TEXT DEFAULT '',
            error TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            sent_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def save_lead(data):
    conn = sqlite3.connect(str(DB_PATH))
    # Auto-score on save if not explicitly provided
    if not data.get("score") or data["score"] in ("unscored", "pending"):
        category, score_num = score_lead(
            data.get("volume", ""), data.get("spend", "")
        )
        computed_score = f"{category}_{score_num}"
    else:
        computed_score = data["score"]

    conn.execute(
        """INSERT INTO leads (name, email, phone, practice, volume, spend, message, page_url, ip_address, source, score)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
        (
            data.get("name", ""),
            data.get("email", ""),
            data.get("phone", ""),
            data.get("practice", ""),
            data.get("volume", ""),
            data.get("spend", ""),
            data.get("message", ""),
            data.get("page_url", ""),
            data.get("ip_address", ""),
            data.get("source", "web"),
            computed_score,
        ),
    )
    conn.commit()
    lead_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()

    # Send SMS alert for hot leads (if Twilio configured)
    if send_hot_alert:
        lead_with_id = dict(data)
        lead_with_id["id"] = lead_id
        sms_result = send_hot_alert(lead_with_id)
        if sms_result.get("sent"):
            print(f"[SMS] Hot alert sent for lead #{lead_id}")
    return lead_id


def get_leads(limit=50):
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM leads ORDER BY created_at DESC LIMIT ?", (limit,)
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Telegram ────────────────────────────────────────────────
def send_telegram_notification(lead):
    if not TELEGRAM_BOT_TOKEN:
        print("[Telegram] No bot token configured, skipping notification")
        return
    name = lead.get("name", "?")
    email = lead.get("email", "?")
    phone = lead.get("phone") or "—"
    practice = lead.get("practice") or "—"
    volume = lead.get("volume") or "—"
    score = lead.get("score", "unscored")

    # Scoring badge
    if score.startswith("hot"):
        badge = "🔥 HOT"
    elif score.startswith("warm"):
        badge = "⭐ WARM"
    elif score.startswith("cold"):
        badge = "❄️ COLD"
    else:
        badge = "🆕 NEW"

    message = (
        f"{badge} <b>New Lead — FocusRunner!</b>\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>Name:</b> {name}\n"
        f"📧 <b>Email:</b> {email}\n"
        f"📞 <b>Phone:</b> {phone}\n"
        f"🏥 <b>Practice:</b> {practice}\n"
        f"📊 <b>Volume:</b> {volume}\n"
        f"⭐ <b>Score:</b> {score}\n"
        f"🕐 <b>Time:</b> {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')}"
    )

    try:
        resp = requests.post(
            f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage",
            json={
                "chat_id": TELEGRAM_CHAT_ID,
                "text": message,
                "parse_mode": "HTML",
                "disable_web_page_preview": True,
            },
            timeout=10,
        )
        if resp.status_code == 200:
            print(f"[Telegram] Notification sent for lead {name}")
        else:
            print(f"[Telegram] Failed: {resp.status_code} {resp.text[:200]}")
    except Exception as e:
        print(f"[Telegram] Error: {e}")


# ─── Lead Scoring ──────────────────────────────────────────

SCORING_RULES = {
    "hot": {"min_volume": 100, "min_spend": 5000, "base_score": 85},
    "warm": {"min_volume": 30, "min_spend": 1000, "base_score": 60},
    "cold": {"base_score": 25},
}


def score_lead(volume_str: str, spend_str: str) -> tuple[str, int]:
    """Return (category, score_number). Score stored as 'hot_85', 'warm_60', 'cold_25'."""
    try:
        volume = int(volume_str) if volume_str else 0
    except (ValueError, TypeError):
        volume = 0
    try:
        spend = int(spend_str) if spend_str else 0
    except (ValueError, TypeError):
        spend = 0

    hot = SCORING_RULES["hot"]
    if volume >= hot["min_volume"] or spend >= hot["min_spend"]:
        bonus = 0
        if volume >= 200:
            bonus += 10
        if spend >= 10000:
            bonus += 10
        return "hot", hot["base_score"] + bonus

    warm = SCORING_RULES["warm"]
    if volume >= warm["min_volume"] or spend >= warm["min_spend"]:
        return "warm", warm["base_score"]

    return "cold", SCORING_RULES["cold"]["base_score"]


# ─── Admin Auth ────────────────────────────────────────────

ADMIN_TOKEN = os.environ.get("LEAD_DASHBOARD_ADMIN_TOKEN", "focusrunner-admin-2026")


def _extract_token():
    """Get token from ?token= query param, Authorization header, or X-Admin-Token header."""
    # Check query param first
    token = request.args.get("token", "")
    if token:
        return token
    # Check Authorization: Bearer <token>
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    # Check X-Admin-Token header
    token = request.headers.get("X-Admin-Token", "")
    return token


def _require_admin(f):
    """Decorator: require valid admin token on a route."""
    from functools import wraps

    @wraps(f)
    def wrapper(*args, **kwargs):
        token = _extract_token()
        if not hmac.compare_digest(token, ADMIN_TOKEN):
            return jsonify({"error": "Unauthorized", "message": "Valid admin token required"}), 401
        return f(*args, **kwargs)

    return wrapper


# ─── Routes ──────────────────────────────────────────────────

# ─── Static Files ──────────────────────────────────────────────
PUBLIC_DIR = BASE_DIR.parent / "public"


@app.route("/public/<path:filename>")
def serve_public(filename):
    """Serve static files from public/ (widget JS, etc.)"""
    return send_from_directory(str(PUBLIC_DIR), filename)


# ─── Lead Capture Form ─────────────────────────────────────────
LEAD_CAPTURE_HTML_PATH = BASE_DIR.parent / "public" / "lead-capture.html"
LEAD_CAPTURE_AI_HTML_PATH = BASE_DIR.parent / "public" / "lead-capture-ai.html"


@app.route("/", methods=["GET"])
@app.route("/lead-capture", methods=["GET"])
@app.route("/lead-capture.html", methods=["GET"])
def serve_lead_capture():
    """Serve lead capture form directly from Flask — bypasses Vercel entirely."""
    path = LEAD_CAPTURE_HTML_PATH
    if not path.exists():
        path = BASE_DIR.parent / "dist" / "lead-capture.html"
    if path.exists():
        return path.read_text(), 200, {"Content-Type": "text/html; charset=utf-8"}
    return jsonify({"error": "lead-capture.html not found"}), 404


@app.route("/api/health", methods=["GET"])
def health():
    """Health check — also reports DB status."""
    # Public: count only
    try:
        conn = sqlite3.connect(str(DB_PATH))
        count = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        conn.close()
    except Exception:
        count = 0
    return jsonify({"count": count, "authenticated": False})


@app.route("/api/ghl-sync", methods=["GET"])
@_require_admin
def trigger_ghl_sync():
    """Trigger GoHighLevel sync for unsynced leads.

    GET /api/ghl-sync?dry_run=true  — dry-run mode
    GET /api/ghl-sync?limit=5       — sync at most 5 leads
    """
    if run_sync is None:
        return jsonify({"error": "ghl_sync module not available"}), 500

    dry_run = request.args.get("dry_run", "").lower() in ("true", "1", "yes")
    limit = request.args.get("limit", type=int)

    result = run_sync(dry_run=dry_run, limit=limit)
    return jsonify(result)


@app.route("/api/ghl-sync/status", methods=["GET"])
@_require_admin
def ghl_sync_status():
    """Get GHL sync status summary: how many synced, pending, failed."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        synced = conn.execute("SELECT COUNT(*) FROM leads WHERE ghl_synced IS NOT NULL AND ghl_synced NOT LIKE 'FAILED:%'").fetchone()[0]
        pending = conn.execute("SELECT COUNT(*) FROM leads WHERE ghl_synced IS NULL AND score IS NOT NULL AND score != ''").fetchone()[0]
        failed = conn.execute("SELECT COUNT(*) FROM leads WHERE ghl_synced LIKE 'FAILED:%'").fetchone()[0]
        conn.close()
    except Exception as e:
        return jsonify({"error": str(e)}), 500

    return jsonify({
        "total": total,
        "synced": synced,
        "pending": pending,
        "failed": failed,
    })
        "status": "ok",
        "timestamp": datetime.datetime.now().isoformat(),
        "db_path": str(DB_PATH),
        "db_exists": db_ok,
        "lead_count": count,
        "telegram_configured": bool(TELEGRAM_BOT_TOKEN),
    })


@app.route("/api/lead", methods=["POST"])
@app.route("/api/capture", methods=["POST"])
def receive_lead():
    """Receive lead data from chat widget or form."""
    data = request.get_json(silent=True) or {}
    if not data.get("name") or not data.get("email"):
        return jsonify({"error": "Name and email are required"}), 400

    data["ip_address"] = request.remote_addr or ""
    data["page_url"] = request.headers.get("Referer", data.get("page_url", ""))

    lead_id = save_lead(data)
    send_telegram_notification(data)

    print(f"[Lead #{lead_id}] {data.get('name')} <{data.get('email')}> — score: {data.get('score', 'unscored')}")
    return jsonify({"success": True, "id": lead_id, "message": "Lead saved!"})


@app.route("/api/chat", methods=["POST"])
def chat():
    """Chat endpoint — stores lead info from the AI qualification flow."""
    data = request.get_json(silent=True) or {}
    state = data.get("state", {})
    message = data.get("message", "")

    # Build lead record from chat state
    lead = {
        "name": state.get("email", data.get("name", "")),  # fall back to email
        "email": state.get("email", ""),
        "phone": state.get("phone", ""),
        "practice": state.get("practice", ""),
        "volume": state.get("q1_volume", ""),
        "spend": state.get("q2_spend", ""),
        "message": message,
        "source": "chat-widget",
        "score": "pending",
    }

    # Only save if we have contact info
    if lead["email"] or data.get("name"):
        lead["ip_address"] = request.remote_addr or ""
        lead["page_url"] = request.headers.get("Referer", "")
        lead_id = save_lead(lead)
        send_telegram_notification(lead)
        print(f"[Lead #{lead_id} from chat] {lead.get('name')}")
        return jsonify({"success": True, "id": lead_id})
    else:
        return jsonify({"status": "no_data", "message": "No lead info in chat payload"})


@app.route("/api/webhook", methods=["POST"])
def webhook():
    """Webhook endpoint — accepts any JSON payload, extracts lead data."""
    data = request.get_json(silent=True) or {}
    lead = {
        "name": data.get("name", data.get("fullName", "")),
        "email": data.get("email", ""),
        "phone": data.get("phone", data.get("telephone", "")),
        "practice": data.get("practice", data.get("company", "")),
        "volume": data.get("volume", ""),
        "spend": data.get("spend", data.get("budget", "")),
        "message": json.dumps(data) if len(json.dumps(data)) < 1000 else str(data)[:1000],
        "source": "webhook",
    }

    if not lead["email"]:
        return jsonify({"error": "email required"}), 400

    lead["ip_address"] = request.remote_addr or ""
    lead["page_url"] = request.headers.get("Referer", "")
    lead_id = save_lead(lead)
    send_telegram_notification(lead)
    print(f"[Lead #{lead_id} from webhook] {lead.get('name')}")
    return jsonify({"success": True, "id": lead_id})


@app.route("/api/leads", methods=["GET"])
@require_admin
def list_leads():
    """List recent leads for admin panel."""
    limit = request.args.get("limit", 50, type=int)
    return jsonify({"leads": get_leads(limit)})


@app.route("/api/leads/export", methods=["GET"])
@require_admin
def export_leads_csv():
    """Export all leads as CSV download."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC").fetchall()
    conn.close()

    leads = [dict(r) for r in rows]
    headers = ["id", "name", "email", "phone", "practice", "volume", "spend",
               "message", "page_url", "ip_address", "source", "score", "created_at"]

    import io
    import csv as csv_module
    buf = io.StringIO()
    writer = csv_module.writer(buf)
    writer.writerow(headers)
    for lead in leads:
        writer.writerow([lead.get(h, "") for h in headers])
    csv_out = buf.getvalue()

    from flask import Response as FlaskResponse
    return FlaskResponse(
        csv_out,
        mimetype="text/csv",
        headers={
            "Content-Disposition": "attachment; filename=focusrunner-leads.csv",
            "Access-Control-Allow-Origin": "*",
        },
    )


@app.route("/api/admin/login", methods=["POST"])
def admin_login():
    """Validate admin token against ADMIN_API_KEY.

    Request: POST {"token": "..."}
    Response: 200 {"authenticated": true} on success, 401 on failure.
    """
    data = request.get_json(silent=True) or {}
    token = data.get("token", "")
    if not token:
        token = _extract_admin_token()
    if ADMIN_API_KEY and hmac.compare_digest(token, ADMIN_API_KEY):
        return jsonify({"authenticated": True, "token": ADMIN_API_KEY})
    return jsonify({"authenticated": False, "error": "Invalid admin token"}), 401


# ─── Admin Dashboard ──────────────────────────────────────────

ADMIN_HTML_PATH = BASE_DIR / "admin.html"


@app.route("/admin", methods=["GET"])
@app.route("/admin/leads", methods=["GET"])
def serve_admin_dashboard():
    """Serve the admin dashboard HTML."""
    if ADMIN_HTML_PATH.exists():
        return ADMIN_HTML_PATH.read_text(), 200, {"Content-Type": "text/html; charset=utf-8"}
    return jsonify({"error": "admin.html not found"}), 404


# ─── Main ────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"⚡ FocusRunner Lead Backend")
    print(f"   DB: {DB_PATH}")
    print(f"   Listening: http://{HOST}:{PORT}")
    print(f"   Endpoints:")
    print(f"   • GET  /api/health    — health check")
    print(f"   • POST /api/lead      — capture lead")
    print(f"   • POST /api/capture   — capture lead (alias)")
    print(f"   • POST /api/chat      — chat widget lead")
    print(f"   • POST /api/webhook   — webhook lead")
    print(f"   • GET  /api/leads       — list leads (auth: full data, public: count)")
    print(f"   • POST /api/admin/login — authenticate admin token")
    print(f"   Telegram: {'CONFIGURED' if TELEGRAM_BOT_TOKEN else 'NOT CONFIGURED'}")
    print()
    init_db()
    app.run(host=HOST, port=PORT, debug=False)
