#!/usr/bin/env python3
"""
send-email.py — Python stdlib SMTP email blast CLI.

CEO ORDER (FOC-620):
  - Reads leads from leads.db where email IS NOT NULL
  - Sends via smtplib (Gmail SMTP: smtp.gmail.com:587, TLS)
  - Reads sender credentials from env vars: SMTP_EMAIL, SMTP_PASSWORD
  - Uses the existing email template from send-outreach.js
  - Rate-limits to 1 email per 3 seconds (Gmail limit)
  - Logs success/failure per-email

Usage:
    # Check config
    python3 send-email.py --status

    # Send 1 test email
    python3 send-email.py --send-test --to ceo@focusrunner.ai

    # Dry run (see who would get emailed)
    python3 send-email.py --dry-run

    # Send all outreach
    python3 send-email.py --send-all

Env vars required:
    SMTP_EMAIL      — Gmail address
    SMTP_PASSWORD   — Gmail app password (16 characters)
"""

import os
import sys
import json
import sqlite3
import smtplib
import ssl
import time
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("send-email")

# ── Config ──────────────────────────────────────────────────────────

SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
FROM_EMAIL = "FocusRunner AI <hello@focusrunner.ai>"
DEFAULT_SUBJECT = "Your free Patient Acquisition Audit — personalized for your med spa"
RATE_LIMIT = 3  # seconds between emails

SCRIPT_DIR = Path(__file__).parent
DB_PATH = SCRIPT_DIR / "leads.db"
# Also check parent paths
ALT_DB_PATHS = [
    SCRIPT_DIR.parent / "lead-dashboard" / "leads.db",
    SCRIPT_DIR.parent / "leads.db",
    Path("/home/ai13/workspace/portfolio/lead-dashboard/leads.db"),
    Path("/home/ai13/workspace/portfolio/leads.db"),
]


def find_db():
    """Find the leads.db file."""
    for p in [DB_PATH] + ALT_DB_PATHS:
        if p.exists():
            return p
    return None


def check_creds():
    email = os.environ.get("SMTP_EMAIL", "")
    password = os.environ.get("SMTP_PASSWORD", "")
    if not email or not password:
        return False, "SMTP_EMAIL and SMTP_PASSWORD must be set"
    if "@" not in email:
        return False, f"Invalid SMTP_EMAIL: {email}"
    return True, f"SMTP configured: {email}"


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


def send_email(to_email, subject, html_body):
    """Send one email via smtplib + Gmail SMTP. Returns dict."""
    smtp_email = os.environ.get("SMTP_EMAIL", "")
    smtp_password = os.environ.get("SMTP_PASSWORD", "")

    try:
        msg = MIMEMultipart("alternative")
        msg["From"] = FROM_EMAIL
        msg["To"] = to_email
        msg["Subject"] = subject

        text_part = MIMEText("View this email in an HTML client for the best experience.\n\n— FocusRunner AI", "plain", "utf-8")
        html_part = MIMEText(html_body, "html", "utf-8")
        msg.attach(text_part)
        msg.attach(html_part)

        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=30) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, [to_email], msg.as_string())

        message_id = f"smtp-{int(time.time())}-{hash(to_email) % 10000}"
        return {"ok": True, "id": message_id}

    except smtplib.SMTPAuthenticationError:
        return {"ok": False, "error": "SMTP auth failed. Use Gmail App Password (16 chars), not your regular password."}
    except smtplib.SMTPRecipientsRefused as e:
        return {"ok": False, "error": f"Recipient refused: {e}"}
    except Exception as e:
        return {"ok": False, "error": str(e)[:200]}


def get_leads():
    """Get all leads with email from the database."""
    db_path = find_db()
    if not db_path:
        logger.error("No leads.db found!")
        return []

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, name, email, practice FROM leads WHERE email IS NOT NULL AND email != '' ORDER BY created_at DESC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


# ── CLI Dispatch ────────────────────────────────────────────────────

def cmd_status():
    ok, msg = check_creds()
    leads = get_leads()
    db_path = find_db()
    print(f"Status: {'OK' if ok else 'FAIL'}")
    print(f"Message: {msg}")
    print(f"DB path: {db_path or 'NOT FOUND'}")
    print(f"Leads with email: {len(leads)}")
    if leads:
        print(f"\nFirst 5 leads:")
        for l in leads[:5]:
            print(f"  {l['name']:25} {l['email']:35} {l.get('practice', '')}")


def cmd_send_test(to_email):
    html = personal_intro_html("CEO", "FocusRunner AI")
    logger.info(f"Sending test email to {to_email}...")
    result = send_email(to_email, "TEST — FocusRunner smtplib is LIVE", html)
    if result["ok"]:
        logger.info(f"SUCCESS: Email sent to {to_email} (id: {result['id']})")
    else:
        logger.error(f"FAILED: {result['error']}")


def cmd_dry_run():
    leads = get_leads()
    if not leads:
        print("No leads with email")
        return
    print(f"Would send to {len(leads)} leads:")
    for l in leads:
        print(f"  [{l['id'][:8]}] {l['name']:25} {l['email']:35} {l.get('practice', '')}")


def cmd_send_all():
    leads = get_leads()
    if not leads:
        print("No leads with email")
        return

    ok, msg = check_creds()
    if not ok:
        logger.error(f"Credential check failed: {msg}")
        sys.exit(1)

    sent = 0
    failed = 0

    for i, lead in enumerate(leads):
        name = lead["name"] or "Friend"
        email = lead["email"]
        practice = lead.get("practice", "your med spa")

        if "@" not in email:
            logger.warning(f"[{i+1}/{len(leads)}] SKIP {name}: invalid email {email}")
            failed += 1
            continue

        html = personal_intro_html(name, practice)
        result = send_email(email, DEFAULT_SUBJECT, html)

        if result["ok"]:
            sent += 1
            logger.info(f"[{i+1}/{len(leads)}] SENT to {name} <{email}> ({result['id']})")
        else:
            failed += 1
            logger.error(f"[{i+1}/{len(leads)}] FAIL to {name} <{email}>: {result['error']}")

        if i < len(leads) - 1:
            time.sleep(RATE_LIMIT)

    print(f"\n=== DONE ===")
    print(f"Total: {len(leads)}  Sent: {sent}  Failed: {failed}")


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1]

    if cmd == "--status":
        cmd_status()
    elif cmd == "--send-test":
        to_email = "ceo@focusrunner.ai"
        for i, arg in enumerate(sys.argv):
            if arg == "--to" and i + 1 < len(sys.argv):
                to_email = sys.argv[i + 1]
        cmd_send_test(to_email)
    elif cmd == "--dry-run":
        cmd_dry_run()
    elif cmd == "--send-all":
        cmd_send_all()
    else:
        print(f"Unknown command: {cmd}")
        print(__doc__)
        sys.exit(1)
