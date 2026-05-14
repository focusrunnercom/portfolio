#!/usr/bin/env python3
"""
SMS Notification via Twilio for hot leads.
Sends an SMS to the sales team when a lead scores hot_85+.

Usage:
    from sms_notify import send_hot_alert
    send_hot_alert({"name": "...", "phone": "...", "score": "hot_85", "practice": "..."})

Requires:
    - TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SALES_TEAM_PHONE env vars
    - Graceful skip if env vars are missing (logs warning)
"""

import os
import json
import sqlite3
import datetime
import logging
from pathlib import Path
from typing import Optional

logger = logging.getLogger("sms_notify")

# ─── Config ─────────────────────────────────────────────────
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_FROM_NUMBER = os.environ.get("TWILIO_FROM_NUMBER", "")
SALES_TEAM_PHONE = os.environ.get("SALES_TEAM_PHONE", "")

# Twilio is only available if all four vars are present
TWILIO_CONFIGURED = all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SALES_TEAM_PHONE])

BASE_DIR = Path(__file__).parent
DB_PATH = BASE_DIR / "leads.db"


# ─── Database: notifications tracking table ─────────────────

def ensure_notifications_table():
    """Create notifications table if it doesn't exist."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS notifications (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL,
            lead_id INTEGER NOT NULL,
            recipient TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'pending',
            message TEXT DEFAULT '',
            error TEXT DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            sent_at TEXT
        )
    """)
    conn.commit()
    conn.close()


def log_notification(notif_type: str, lead_id: int, recipient: str, status: str, message: str = "", error: str = ""):
    """Record a notification attempt in the database."""
    try:
        conn = sqlite3.connect(str(DB_PATH))
        sent_at = datetime.datetime.utcnow().isoformat() if status == "sent" else None
        conn.execute(
            "INSERT INTO notifications (type, lead_id, recipient, status, message, error, sent_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (notif_type, lead_id, recipient, status, message[:500], error[:500], sent_at),
        )
        conn.commit()
        conn.close()
    except Exception as e:
        logger.warning(f"Failed to log notification: {e}")


# ─── Twilio SMS ─────────────────────────────────────────────

def send_sms(to: str, body: str) -> tuple[bool, str]:
    """
    Send an SMS via Twilio API.
    Returns (success: bool, details_or_error: str).
    """
    if not TWILIO_CONFIGURED:
        return False, "Twilio not configured — missing env vars"

    try:
        # Use Twilio REST API directly via requests to avoid extra dependency
        import requests
        account_sid = TWILIO_ACCOUNT_SID
        auth_token = TWILIO_AUTH_TOKEN
        url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"

        resp = requests.post(
            url,
            auth=(account_sid, auth_token),
            data={
                "From": TWILIO_FROM_NUMBER,
                "To": to,
                "Body": body,
            },
            timeout=15,
        )

        if resp.status_code in (200, 201):
            data = resp.json()
            sid = data.get("sid", "unknown")
            logger.info(f"SMS sent to {to} — SID: {sid}")
            return True, sid
        else:
            error_msg = resp.text[:500]
            logger.error(f"SMS failed to {to} — HTTP {resp.status_code}: {error_msg}")
            return False, f"HTTP {resp.status_code}: {error_msg}"
    except ImportError:
        logger.error("requests library not available for Twilio API call")
        return False, "requests library not available"
    except Exception as e:
        logger.error(f"SMS error sending to {to}: {e}")
        return False, str(e)


# ─── Auto-extract score number from format like 'hot_85' ────

def parse_score(score_str: str) -> tuple[str, int]:
    """Return (category, numeric_value). e.g. 'hot_85' -> ('hot', 85)."""
    if not score_str:
        return "unscored", 0
    try:
        parts = score_str.split("_")
        category = parts[0] if parts else "unknown"
        value = int(parts[1]) if len(parts) > 1 else 0
        return category, value
    except (ValueError, IndexError):
        return "unknown", 0


# ─── Main Alert Function ────────────────────────────────────

def send_hot_alert(lead: dict) -> dict:
    """
    Send SMS alert for a hot lead (score >= hot_85).
    Gracefully skips if Twilio isn't configured.
    Returns dict: {sent: bool, recipient: str, sid_or_error: str, skipped: bool}
    """
    score_str = lead.get("score", "")
    category, score_value = parse_score(score_str)

    # Only fire for hot_85+
    is_hot = (category == "hot" and score_value >= 85) or (category == "hot" and score_value >= 85)

    if not is_hot:
        logger.info(f"Lead #{lead.get('id')} score {score_str} — below hot threshold, skipping SMS")
        return {"sent": False, "skipped": True, "reason": f"Score {score_str} below hot threshold"}

    if not TWILIO_CONFIGURED:
        logger.warning("Twilio not configured — SMS notification skipped")
        log_notification("sms", lead.get("id", 0), "", "skipped", "Twilio not configured")
        return {"sent": False, "skipped": True, "reason": "Twilio not configured"}

    # Build SMS body
    name = lead.get("name", "Unknown")
    email = lead.get("email", "—")
    phone = lead.get("phone", "—")
    practice = lead.get("practice", "—")
    score = lead.get("score", "hot_??")

    message = (
        f"🔥 HOT LEAD — FocusRunner\n"
        f"Name: {name}\n"
        f"Phone: {phone}\n"
        f"Email: {email}\n"
        f"Practice: {practice}\n"
        f"Score: {score}\n"
        f"Dashboard: http://localhost:5000/admin"
    )

    success, detail = send_sms(SALES_TEAM_PHONE, message)

    if success:
        log_notification("sms", lead.get("id", 0), SALES_TEAM_PHONE, "sent", message)
        return {"sent": True, "recipient": SALES_TEAM_PHONE, "sid": detail, "skipped": False}
    else:
        log_notification("sms", lead.get("id", 0), SALES_TEAM_PHONE, "failed", message, detail)
        return {"sent": False, "recipient": SALES_TEAM_PHONE, "error": detail, "skipped": False}


# ─── CLI Test ───────────────────────────────────────────────

if __name__ == "__main__":
    print(f"Twilio configured: {TWILIO_CONFIGURED}")
    if TWILIO_CONFIGURED:
        print(f"From: {TWILIO_FROM_NUMBER}")
        print(f"To: {SALES_TEAM_PHONE}")
    else:
        print("Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SALES_TEAM_PHONE in env")

    # Test with a sample hot lead
    test_lead = {
        "id": 999,
        "name": "Test Hot Lead",
        "email": "test@medspa.com",
        "phone": "+15551234567",
        "practice": "Med Spa",
        "score": "hot_95",
    }
    result = send_hot_alert(test_lead)
    print(json.dumps(result, indent=2))
