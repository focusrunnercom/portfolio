#!/usr/bin/env python3
"""
FocusRunner Lead Capture Backend
- Receives leads from the chat widget
- Stores them in SQLite database
- Sends Telegram notification to the site owner
"""

import os
import sys
import json
import sqlite3
import datetime
import requests
from pathlib import Path
from flask import Flask, request, jsonify
from flask_cors import CORS

# ─── Configuration ───────────────────────────────────────────
BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"

# Read Telegram bot token from .env file
def _read_env_token() -> str:
    """Read TELEGRAM_BOT_TOKEN from ~/.hermes/.env"""
    env_path = Path.home() / ".hermes" / ".env"
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("TELEGRAM_BOT_TOKEN="):
                val = line.split("=", 1)[1].strip().strip('"').strip("'")
                if val:
                    return val
    # fallback: check env
    return os.environ.get("TELEGRAM_BOT_TOKEN", "")

TELEGRAM_BOT_TOKEN = _read_env_token()
TELEGRAM_CHAT_ID = "5926797455"
HOST = "0.0.0.0"
PORT = 8765

app = Flask(__name__)
CORS(app)  # Allow cross-origin requests from the website


# ─── Database ────────────────────────────────────────────────
def init_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT DEFAULT '',
            preferred_time TEXT DEFAULT '',
            page_url TEXT DEFAULT '',
            ip_address TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def save_lead(data):
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute(
        """INSERT INTO leads (name, email, phone, preferred_time, page_url, ip_address)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            data.get("name", ""),
            data.get("email", ""),
            data.get("phone", ""),
            data.get("time", ""),
            data.get("page_url", ""),
            data.get("ip_address", ""),
        ),
    )
    conn.commit()
    lead_id = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    conn.close()
    return lead_id


def get_leads():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    rows = conn.execute("SELECT * FROM leads ORDER BY created_at DESC LIMIT 50").fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ─── Telegram ────────────────────────────────────────────────
def send_telegram_notification(lead):
    """Send a notification about the new lead to the site owner."""
    name = lead.get("name", "?")
    email = lead.get("email", "?")
    phone = lead.get("phone") or "— skipped —"
    time = lead.get("time") or "—"
    page = lead.get("page_url") or "—"
    ip = lead.get("ip_address") or "—"

    message = (
        f"🚀 <b>New Lead — FocusRunner!</b>\n"
        f"━━━━━━━━━━━━━━━━━\n"
        f"👤 <b>Name:</b> {name}\n"
        f"📧 <b>Email:</b> {email}\n"
        f"📞 <b>Phone:</b> {phone}\n"
        f"⏰ <b>Best time:</b> {time}\n"
        f"🌐 <b>Page:</b> {page}\n"
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
            print(f"[Telegram] Failed: {resp.status_code} {resp.text}")
    except Exception as e:
        print(f"[Telegram] Error: {e}")


# ─── Routes ──────────────────────────────────────────────────
@app.route("/api/health", methods=["GET"])
def health():
    return jsonify({"status": "ok", "timestamp": datetime.datetime.now().isoformat()})


@app.route("/api/lead", methods=["POST"])
def receive_lead():
    """Receive lead data from the chat widget."""
    data = request.get_json(silent=True) or {}
    if not data.get("name") or not data.get("email"):
        return jsonify({"error": "Name and email are required"}), 400

    # Add IP and page URL
    data["ip_address"] = request.remote_addr or ""
    data["page_url"] = request.headers.get("Referer", "")

    # Save to database
    lead_id = save_lead(data)

    # Send Telegram notification
    data["id"] = lead_id
    send_telegram_notification(data)

    print(f"[Lead #{lead_id}] {data['name']} <{data['email']}>")
    return jsonify({"success": True, "id": lead_id, "message": "Lead saved!"})


@app.route("/api/leads", methods=["GET"])
def list_leads():
    """List recent leads (for admin panel)."""
    return jsonify({"leads": get_leads()})


# ─── Main ────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"⚡ FocusRunner Lead Backend")
    print(f"   DB: {DB_PATH}")
    print(f"   Listening: http://{HOST}:{PORT}")
    print(f"   API: POST /api/lead")
    print(f"   Admin: GET /api/leads")
    print()
    init_db()
    app.run(host=HOST, port=PORT, debug=False)
