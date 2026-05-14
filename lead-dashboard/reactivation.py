#!/usr/bin/env python3
"""
FocusRunner Lead Reactivation — 3-Touch SMS+Email Sequence
FOC-495

Sends a 3-touch reactivation sequence to cold leads over 7 days:
  Touch 1 (Day 1):  SMS — "Hey [Name], saw your med spa on IG..."
  Touch 2 (Day 3):  Email — Value proposition + case study link
  Touch 3 (Day 7):  SMS — "Last chance for your free patient acquisition audit..."

Uses Twilio (SMS) and Resend (Email) when API keys are configured.
Graceful fallback to dry-run mode if no API keys.

Database: reactivation.db (separate tracking DB per spec)
Schema: CREATE TABLE reactivation_tracking (
    lead_id TEXT,
    touch_1_sent TEXT,
    touch_2_sent TEXT,
    touch_3_sent TEXT,
    created_at TEXT,
    updated_at TEXT
)

Usage:
    python3 reactivation.py --dry-run    # Preview without sending
    python3 reactivation.py --run        # Execute the sequence
"""

import os
import sys
import json
import sqlite3
import datetime
import argparse
from pathlib import Path

# ─── Paths ───────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
LEADS_DB = BASE_DIR / "leads.db"
REACT_DB = BASE_DIR / "reactivation.db"

# ─── API Configuration ───────────────────────────────────────
TWILIO_ACCOUNT_SID = os.environ.get("TWILIO_ACCOUNT_SID", "")
TWILIO_AUTH_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "")
TWILIO_PHONE_NUMBER = os.environ.get("TWILIO_PHONE_NUMBER", "")
RESEND_API_KEY = os.environ.get("RESEND_API_KEY", "")

SMS_CONFIGURED = all([TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER])
EMAIL_CONFIGURED = bool(RESEND_API_KEY)

FROM_EMAIL = "FocusRunner AI <hello@focusrunner.io>"


# ─── Database ─────────────────────────────────────────────────

def ensure_tracking_db():
    """Create reactivation.db with the tracking schema."""
    conn = sqlite3.connect(str(REACT_DB))
    conn.execute("""
        CREATE TABLE IF NOT EXISTS reactivation_tracking (
            lead_id      TEXT PRIMARY KEY,
            touch_1_sent TEXT,
            touch_2_sent TEXT,
            touch_3_sent TEXT,
            created_at   TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    conn.commit()
    conn.close()


def get_react_conn():
    conn = sqlite3.connect(str(REACT_DB))
    conn.row_factory = sqlite3.Row
    return conn


def get_leads_conn():
    if not LEADS_DB.exists():
        print(f"[ERROR] Leads database not found at {LEADS_DB}")
        sys.exit(1)
    conn = sqlite3.connect(str(LEADS_DB))
    conn.row_factory = sqlite3.Row
    return conn


# ─── Sending Functions ───────────────────────────────────────

def send_sms(to: str, body: str, dry_run: bool = False) -> dict:
    """Send SMS via Twilio API (HTTP direct, no SDK)."""
    if not SMS_CONFIGURED and not dry_run:
        return {"sid": "dry-run", "status": "unconfigured"}

    if dry_run:
        print(f"  [DRY-RUN SMS] To: {to}")
        print(f"  [DRY-RUN SMS] Body: {body[:100]}")
        return {"sid": "dry-run", "status": "dry-run"}

    import urllib.request
    import urllib.parse
    import base64

    auth_bytes = f"{TWILIO_ACCOUNT_SID}:{TWILIO_AUTH_TOKEN}".encode()
    auth_b64 = base64.b64encode(auth_bytes).decode()

    payload = {"To": to, "From": TWILIO_PHONE_NUMBER, "Body": body}
    data = "&".join(f"{k}={urllib.parse.quote(v)}" for k, v in payload.items()).encode()

    req = urllib.request.Request(
        f"https://api.twilio.com/2010-04-01/Accounts/{TWILIO_ACCOUNT_SID}/Messages.json",
        data=data,
        headers={"Authorization": f"Basic {auth_b64}", "Content-Type": "application/x-www-form-urlencoded"},
    )

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            result = json.loads(resp.read())
            sid = result.get("sid", "?")
            status = result.get("status", "?")
            print(f"  [SENT SMS] to {to} | SID: {sid} | Status: {status}")
            return result
    except Exception as e:
        print(f"  [FAIL SMS] to {to}: {e}")
        return {"error": str(e)}


def send_email(to: str, subject: str, html_body: str, dry_run: bool = False) -> dict:
    """Send email via Resend API (direct HTTP, no SDK)."""
    if not EMAIL_CONFIGURED and not dry_run:
        return {"id": "dry-run", "status": "unconfigured"}

    if dry_run:
        print(f"  [DRY-RUN EMAIL] To: {to}")
        print(f"  [DRY-RUN EMAIL] Subject: {subject}")
        print(f"  [DRY-RUN EMAIL] Body preview: {html_body[:120]}...")
        return {"id": "dry-run", "status": "dry-run"}

    import urllib.request

    payload = json.dumps({
        "from": FROM_EMAIL,
        "to": [to],
        "subject": subject,
        "html": html_body,
    }).encode()

    req = urllib.request.Request(
        "https://api.resend.com/emails",
        data=payload,
        headers={
            "Authorization": f"Bearer {RESEND_API_KEY}",
            "Content-Type": "application/json",
        },
    )

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        result = json.loads(resp.read())
        print(f"  [SENT EMAIL] to {to} | ID: {result.get('id', '?')}")
        return result
    except Exception as e:
        # Try to extract HTTP error details if it's an HTTPError
        error_str = str(e)
        if hasattr(e, 'code') and hasattr(e, 'read'):
            try:
                error_body = e.read().decode()
                error_str = f"{e.code} — {error_body[:200]}"
            except Exception:
                pass
        print(f"  [FAIL EMAIL] to {to}: {error_str}")
        return {"error": error_str}


# ─── Touch Templates ─────────────────────────────────────────

def touch_1_sms_body(name: str, practice: str) -> str:
    """Touch 1: SMS — Day 1"""
    return (
        f"Hey {name}, saw your med spa on IG. "
        f"We help practices like {practice} recover 70% of lost leads. Free audit?"
    )


def touch_2_email_html(name: str, practice: str) -> str:
    """Touch 2: Email — Day 3, value proposition + case study link"""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #1a1a1a;">
  <div style="border-bottom: 3px solid #7c3aed; padding-bottom: 15px; margin-bottom: 20px;">
    <h1 style="color: #7c3aed; margin: 0;">FocusRunner AI</h1>
    <p style="color: #666; margin: 5px 0 0;">AI-Powered Patient Acquisition</p>
  </div>

  <p>Hi {name},</p>

  <p>Last week we mentioned our lead recovery framework. Here's how it works for practices like <strong>{practice}</strong>:</p>

  <ul>
    <li><strong>Capture</strong> — AI qualifies every lead in real-time (volume, spend, intent)</li>
    <li><strong>Score</strong> — Hot leads get an SMS alert to your front desk within 60 seconds</li>
    <li><strong>Reactivate</strong> — Cold leads enter our 3-touch automated sequence</li>
  </ul>

  <p>A Miami med spa using FocusRunner went from <strong>23 cold leads to 16 booked consults</strong> in just 14 days.</p>

  <p><a href="https://focusrunner.io/case-studies/miami-recovery" style="background: #7c3aed; color: white; padding: 14px 32px; text-decoration: none; border-radius: 8px; font-size: 16px; font-weight: 600; display: inline-block;">See the Full Case Study →</a></p>

  <p>No catch. Just results.</p>

  <p>— CEO, FocusRunner AI</p>

  <div style="border-top: 1px solid #e5e5e5; padding-top: 15px; margin-top: 20px; font-size: 12px; color: #999;">
    <p>FocusRunner AI · 15 qualified leads in 30 days or it's free</p>
    <p><a href="https://focusrunner.io" style="color: #7c3aed;">focusrunner.io</a></p>
  </div>
</body>
</html>"""


def touch_3_sms_body() -> str:
    """Touch 3: SMS — Day 7, last chance"""
    return "Last chance for your free patient acquisition audit. 5 min setup at focusrunner.io/lead-capture"


def touch_2_email_subject() -> str:
    return "70% lead recovery — the playbook for your med spa"


# ─── Core Sequence Logic ─────────────────────────────────────

def get_cold_leads() -> list[dict]:
    """Fetch leads with score LIKE 'cold%' from leads.db."""
    conn = get_leads_conn()
    rows = conn.execute(
        "SELECT id, name, email, phone, practice, score, source FROM leads WHERE score LIKE 'cold%' ORDER BY created_at ASC"
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]


def get_tracking_state(lead_id: str) -> dict | None:
    """Get current tracking state for a lead, or None if not tracked."""
    conn = get_react_conn()
    row = conn.execute(
        "SELECT * FROM reactivation_tracking WHERE lead_id = ?", (lead_id,)
    ).fetchone()
    conn.close()
    return dict(row) if row else None


def upsert_tracking(lead_id: str, touch_field: str, timestamp: str):
    """Insert or update the tracking record for a lead."""
    conn = get_react_conn()
    existing = conn.execute(
        "SELECT lead_id FROM reactivation_tracking WHERE lead_id = ?", (lead_id,)
    ).fetchone()

    now = timestamp or datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")

    if existing:
        conn.execute(
            f"UPDATE reactivation_tracking SET {touch_field} = ?, updated_at = ? WHERE lead_id = ?",
            (now, now, lead_id),
        )
    else:
        cols = ["lead_id", touch_field, "created_at", "updated_at"]
        vals = [lead_id, now, now, now]
        placeholders = ", ".join("?" for _ in cols)
        conn.execute(
            f"INSERT INTO reactivation_tracking ({', '.join(cols)}) VALUES ({placeholders})",
            vals,
        )
    conn.commit()
    conn.close()


# ─── Send Functions (exported) ───────────────────────────────

def send_touch_1(lead: dict, dry_run: bool = False) -> dict:
    """
    Touch 1 (Day 1): SMS to cold lead.
    Reads leads with score like 'cold%'.
    """
    name = lead.get("name", "there")
    practice = lead.get("practice", "your med spa")
    phone = lead.get("phone", "")

    if not phone or len(phone.strip()) < 5:
        print(f"  [SKIP] {lead.get('id','?')[:12]} — no valid phone for SMS touch 1")
        return {"status": "skipped", "reason": "no_phone"}

    body = touch_1_sms_body(name, practice)
    result = send_sms(phone, body, dry_run=dry_run)

    if not dry_run and "error" not in result:
        ts = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        upsert_tracking(lead["id"], "touch_1_sent", ts)
        print(f"  ✓ Touch 1 (SMS) sent to {name} ({phone})")

    return result


def send_touch_2(lead: dict, dry_run: bool = False) -> dict:
    """
    Touch 2 (Day 3): Email with value proposition + case study link.
    """
    name = lead.get("name", "there")
    practice = lead.get("practice", "your med spa")
    email = lead.get("email", "")

    if not email or "@" not in email:
        print(f"  [SKIP] {lead.get('id','?')[:12]} — no valid email for touch 2")
        return {"status": "skipped", "reason": "no_email"}

    subject = touch_2_email_subject()
    html_body = touch_2_email_html(name, practice)
    result = send_email(email, subject, html_body, dry_run=dry_run)

    if not dry_run and "error" not in result:
        ts = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        upsert_tracking(lead["id"], "touch_2_sent", ts)
        print(f"  ✓ Touch 2 (Email) sent to {name} ({email})")

    return result


def send_touch_3(lead: dict, dry_run: bool = False) -> dict:
    """
    Touch 3 (Day 7): SMS — last chance for free audit.
    """
    phone = lead.get("phone", "")

    if not phone or len(phone.strip()) < 5:
        print(f"  [SKIP] {lead.get('id','?')[:12]} — no valid phone for SMS touch 3")
        return {"status": "skipped", "reason": "no_phone"}

    body = touch_3_sms_body()
    result = send_sms(phone, body, dry_run=dry_run)

    if not dry_run and "error" not in result:
        ts = datetime.datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
        upsert_tracking(lead["id"], "touch_3_sent", ts)
        print(f"  ✓ Touch 3 (SMS) sent to {lead.get('name','?')} ({phone})")

    return result


# ─── Orchestrator ────────────────────────────────────────────

def run_sequence(dry_run: bool = False) -> dict:
    """
    Run the full 3-touch reactivation sequence for all cold leads.
    Touch 1: SMS (Day 1)
    Touch 2: Email (Day 3)
    Touch 3: SMS (Day 7)

    In --dry-run mode: preview everything without sending.
    In --run mode: sends Touch 1 now (Day 1). Touch 2 and 3
                   are logged as scheduled — caller should run
                   on Day 3 and Day 7 with the same command.
    """
    ensure_tracking_db()
    leads = get_cold_leads()

    if not leads:
        print("No cold leads found in the database.")
        return {"total": 0, "touch_1": 0, "touch_2": 0, "touch_3": 0, "skipped": 0}

    mode = "DRY RUN" if dry_run else "LIVE"
    print(f"\n{'='*60}")
    print(f"  FocusRunner Lead Reactivation — {mode}")
    print(f"{'='*60}")
    print(f"  Cold leads found: {len(leads)}")
    print(f"  SMS configured:   {SMS_CONFIGURED}")
    print(f"  Email configured: {EMAIL_CONFIGURED}")
    print(f"{'='*60}\n")

    results = {"total": len(leads), "touch_1": 0, "touch_2": 0, "touch_3": 0, "skipped": 0}

    for lead in leads:
        lid = lead["id"][:12]
        name = lead.get("name", "?") or "?"
        print(f"\n  ── Lead: {lid} ({name}) ──")

        # Check current tracking state
        state = get_tracking_state(lead["id"])
        t1 = state and state.get("touch_1_sent")
        t2 = state and state.get("touch_2_sent")
        t3 = state and state.get("touch_3_sent")

        if t3:
            print(f"  Already completed (all 3 touches sent). Skipping.")
            continue

        # Touch 1 — SMS (Day 1)
        if not t1:
            print(f"  [DAY 1] Sending Touch 1 (SMS)...")
            r1 = send_touch_1(lead, dry_run=dry_run)
            if r1.get("status") == "skipped":
                results["skipped"] += 1
            else:
                results["touch_1"] += 1
        else:
            print(f"  Touch 1 already sent on {t1}")

        # Touch 2 — Email (Day 3)
        if t1 and not t2:
            # Check if 3+ days have passed since touch 1
            t1_dt = datetime.datetime.strptime(t1[:19], "%Y-%m-%d %H:%M:%S")
            days_since_t1 = (datetime.datetime.utcnow() - t1_dt).days
            if days_since_t1 >= 3 or dry_run:
                print(f"  [DAY 3] Sending Touch 2 (Email)...")
                r2 = send_touch_2(lead, dry_run=dry_run)
                if r2.get("status") == "skipped":
                    results["skipped"] += 1
                else:
                    results["touch_2"] += 1
            else:
                print(f"  Touch 2 due in {3 - days_since_t1} day(s) (Day 3)")
        elif not t1:
            print(f"  Touch 2 will be sent on Day 3 (after Touch 1)")
        else:
            print(f"  Touch 2 already sent on {t2}")

        # Touch 3 — SMS (Day 7)
        if t2 and not t3:
            t2_dt = datetime.datetime.strptime(t2[:19], "%Y-%m-%d %H:%M:%S")
            days_since_t2 = (datetime.datetime.utcnow() - t2_dt).days
            if days_since_t2 >= 4 or dry_run:  # 7-3=4 days after touch 2
                print(f"  [DAY 7] Sending Touch 3 (SMS)...")
                r3 = send_touch_3(lead, dry_run=dry_run)
                if r3.get("status") == "skipped":
                    results["skipped"] += 1
                else:
                    results["touch_3"] += 1
            else:
                print(f"  Touch 3 due in {4 - days_since_t2} day(s) (Day 7)")
        elif not t2:
            print(f"  Touch 3 will be sent on Day 7 (after Touch 2)")
        else:
            print(f"  Touch 3 already sent on {t3}")

    print(f"\n{'='*60}")
    print(f"  RESULTS ({mode})")
    print(f"{'='*60}")
    print(f"  Total cold leads processed: {results['total']}")
    print(f"  Touch 1 (SMS) sent:         {results['touch_1']}")
    print(f"  Touch 2 (Email) sent:       {results['touch_2']}")
    print(f"  Touch 3 (SMS) sent:         {results['touch_3']}")
    print(f"  Skipped (no contact info):  {results['skipped']}")

    if not SMS_CONFIGURED and not dry_run:
        print(f"\n  ⚠  Twilio not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN,")
        print(f"     and TWILIO_PHONE_NUMBER env vars for live SMS sending.")

    if not EMAIL_CONFIGURED and not dry_run:
        print(f"\n  ⚠  Resend not configured. Set RESEND_API_KEY env var for live email sending.")

    print(f"{'='*60}\n")

    return results


def show_status():
    """Display current reactivation tracking state."""
    ensure_tracking_db()

    # Get tracking records from reactivation.db
    conn = get_react_conn()
    rows = conn.execute("SELECT * FROM reactivation_tracking ORDER BY updated_at DESC").fetchall()
    conn.close()

    # Enrich with lead info from leads.db
    leads_conn = get_leads_conn()
    lead_info = {}
    for r in leads_conn.execute("SELECT id, name, email, phone, score, practice FROM leads").fetchall():
        lead_info[r["id"]] = dict(r)
    leads_conn.close()

    enriched = []
    for r in rows:
        d = dict(r)
        li = lead_info.get(d["lead_id"], {})
        d["name"] = li.get("name", "")
        d["email"] = li.get("email", "")
        d["phone"] = li.get("phone", "")
        d["score"] = li.get("score", "")
        d["practice"] = li.get("practice", "")
        enriched.append(d)

    total = len(enriched)
    t1_count = sum(1 for r in enriched if r["touch_1_sent"])
    t2_count = sum(1 for r in enriched if r["touch_2_sent"])
    t3_count = sum(1 for r in enriched if r["touch_3_sent"])

    print(f"\n{'='*60}")
    print(f"  Reactivation Tracking Status")
    print(f"{'='*60}")
    print(f"  Leads in tracking: {total}")
    print(f"  Touch 1 sent:      {t1_count}")
    print(f"  Touch 2 sent:      {t2_count}")
    print(f"  Touch 3 sent:      {t3_count}")
    print()

    if enriched:
        print(f"  {'LEAD ID':<16} {'NAME':<20} {'TOUCH 1':<20} {'TOUCH 2':<20} {'TOUCH 3':<20}")
        print(f"  {'─'*16} {'─'*20} {'─'*20} {'─'*20} {'─'*20}")
        for r in enriched:
            lid = (r["lead_id"] or "?")[:12]
            name = (r.get("name") or "?")[:18]
            t1 = (r["touch_1_sent"] or "—")[:18]
            t2 = (r["touch_2_sent"] or "—")[:18]
            t3 = (r["touch_3_sent"] or "—")[:18]
            print(f"  {lid:<16} {name:<20} {t1:<20} {t2:<20} {t3:<20}")

    print()


# ─── CLI ─────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(
        description="FocusRunner Lead Reactivation — 3-Touch SMS+Email Sequence"
    )
    group = parser.add_mutually_exclusive_group()
    group.add_argument("--dry-run", action="store_true",
                       help="Preview the sequence without sending anything")
    group.add_argument("--run", action="store_true",
                       help="Execute the reactivation sequence")
    group.add_argument("--status", action="store_true",
                       help="Show reactivation tracking status")

    args = parser.parse_args()

    if args.status:
        show_status()
    elif args.run:
        run_sequence(dry_run=False)
    else:
        # Default: dry-run
        run_sequence(dry_run=True)


if __name__ == "__main__":
    main()
