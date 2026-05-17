#!/usr/bin/env python3
"""
FocusRunner CLI Phone Dialer — FOC-715 / FOC-780
=================================================
CLI tool for phone outreach calls. Prints scripts, logs outcomes.
No agent adapter needed — works right now.

Usage:
  python3 cli-dialer.py --list                 # Show available script segments
  python3 cli-dialer.py call                   # Start a guided call workflow
  python3 cli-dialer.py call --lead "Sarah Mitchell" --phone "+1555...4567" --script "cold-call"
  python3 cli-dialer.py log                    # View call log
  python3 cli-dialer.py sms --phone "+1555...4567" --message "..."  # Send SMS via TextBelt
  python3 cli-dialer.py dial-utm2              # One-command UTM2 recovery call w/ full script
  python3 cli-dialer.py db-log                 # View SQLite call log
"""

import json
import os
import sys
import sqlite3
import time
import urllib.request
import urllib.parse
from datetime import datetime

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
CALL_LOG = os.path.join(BASE_DIR, "CALL-LOG.md")
CALL_DB = os.path.join(BASE_DIR, "call-log.db")
SCRIPTS_DIR = "/home/ai13/workspace/sales-scripts"

SCRIPTS = {
    "cold-call": "COLD-CALL-SCRIPTS.md",
    "discovery": "DISCOVERY-CALL.md",
    "objections": "OBJECTION-PLAYBOOK.md",
    "saturday-blitz": "SATURDAY-BLITZ-CALL-SHEET.md",
    "hot-leads": "HOT-LEADS-14MAY.md",
    "close": "FREE-AUDIT-CLOSE.md",
    "sarah": "SARAH-MITCHELL-CLOSE.md",
    "warm-recovery": "WARM-LEAD-RECOVERY-SCRIPTS.md",
    "utm2-recovery": "UTM2-RECOVERY-18MAY.md",
}

TEXTBELT_URL = "https://textbelt.com/text"
TEXTBELT_KEY = os.environ.get("TEXTBELT_KEY", "textbelt")


def red(s):
    return f"\033[91m{s}\033[0m"

def green(s):
    return f"\033[92m{s}\033[0m"

def yellow(s):
    return f"\033[93m{s}\033[0m"

def blue(s):
    return f"\033[94m{s}\033[0m"

def bold(s):
    return f"\033[1m{s}\033[0m"


# ── SQLite call logging ───────────────────────────────────────────────

def _init_db():
    """Create call-log.db with schema if not exists."""
    conn = sqlite3.connect(CALL_DB)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS calls (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lead_name TEXT NOT NULL,
            phone TEXT NOT NULL,
            script TEXT,
            outcome TEXT,
            notes TEXT,
            duration_seconds INTEGER,
            sms_sent INTEGER DEFAULT 0,
            called_at TEXT NOT NULL
        )
    """)
    conn.commit()
    conn.close()


def _db_log_call(lead_name, phone, script, outcome, notes, duration_seconds=0, sms_sent=False):
    conn = sqlite3.connect(CALL_DB)
    conn.execute(
        "INSERT INTO calls (lead_name, phone, script, outcome, notes, duration_seconds, sms_sent, called_at) "
        "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        (lead_name, phone, script, outcome, notes, duration_seconds, 1 if sms_sent else 0,
         datetime.now().strftime("%Y-%m-%d %H:%M UTC"))
    )
    conn.commit()
    conn.close()


def show_db_log():
    if not os.path.exists(CALL_DB):
        _init_db()
        print(yellow("No calls logged yet."))
        return
    conn = sqlite3.connect(CALL_DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT * FROM calls ORDER BY called_at DESC LIMIT 50"
    ).fetchall()
    conn.close()
    if not rows:
        print(yellow("No calls logged yet."))
        return
    print(bold("\n=== CALL LOG (SQLite) ===\n"))
    for r in rows:
        print(f"  #{r['id']} | {r['called_at']} | {r['lead_name']:<25s} | {r['phone']:<16s} | {r['outcome']:<12s}"
              f"{'' if not r['sms_sent'] else ' | SMS'}")
        if r['duration_seconds']:
            print(f"       Duration: {r['duration_seconds']}s")
        if r['notes']:
            print(f"       Notes: {r['notes']}")
        print()
    print(f"  ({len(rows)} most recent calls)")


# ── Available scripts ─────────────────────────────────────────────────

def print_available_scripts():
    print(bold("\n=== AVAILABLE CALL SCRIPTS ===\n"))
    for key, fname in sorted(SCRIPTS.items()):
        path = os.path.join(SCRIPTS_DIR, fname)
        if os.path.exists(path):
            size = os.path.getsize(path)
            print(f"  {green(key):20s} -> {fname} ({size//1000}KB)")
        else:
            print(f"  {red(key):20s} -> {red('NOT FOUND: ' + path)}")
    print()


def load_script(key):
    fname = SCRIPTS.get(key)
    if not fname:
        print(red(f"Unknown script '{key}'. Use --list to see available scripts."))
        return None
    path = os.path.join(SCRIPTS_DIR, fname)
    if not os.path.exists(path):
        print(red(f"Script file not found: {path}"))
        return None
    with open(path) as f:
        return f.read()


def list_scripts():
    print_available_scripts()


# ── Markdown log (legacy) ─────────────────────────────────────────────

def _append_md_log(entry):
    now = datetime.now().strftime("%Y-%m-%d %H:%M UTC")
    name = entry.get("lead", "Unknown")
    outcome = entry.get("outcome", "unknown")
    notes = entry.get("notes", "")
    script = entry.get("script", "")

    try:
        with open(CALL_LOG, "a") as f:
            f.write(f"\n## {now} — {name}\n")
            f.write(f"- **Phone:** {entry.get('phone', '?')}\n")
            f.write(f"- **Script:** {script}\n")
            f.write(f"- **Outcome:** {outcome}\n")
            f.write(f"- **Notes:** {notes}\n")
            if entry.get("sms_sent"):
                f.write(f"- **SMS Follow-up:** Sent\n")
        print(green(f"Logged to {CALL_LOG}"))
    except Exception as e:
        print(red(f"Failed to write MD log: {e}"))


def _update_md_log(entry):
    now = entry.get("date", datetime.now().strftime("%Y-%m-%d %H:%M UTC"))
    name = entry.get("lead", "Unknown")
    try:
        with open(CALL_LOG, "r") as f:
            content = f.read()
        marker = f"## {now} — {name}"
        if marker in content:
            content = content.replace(marker, marker + "\n- **SMS Follow-up:** Sent")
            with open(CALL_LOG, "w") as f:
                f.write(content)
    except Exception:
        pass


def show_md_log():
    if not os.path.exists(CALL_LOG):
        print(yellow("No call log yet."))
        return
    with open(CALL_LOG) as f:
        print(f.read())


# ── SMS via TextBelt ──────────────────────────────────────────────────

def do_send_sms(phone, message):
    data = urllib.parse.urlencode({
        "phone": phone,
        "message": message,
        "key": TEXTBELT_KEY,
    }).encode()

    req = urllib.request.Request(TEXTBELT_URL, data=data, method="POST")
    req.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        resp = urllib.request.urlopen(req, timeout=15)
        result = json.loads(resp.read().decode())
        if result.get("success"):
            print(green(f"SMS sent to {phone} (quota: {result.get('quotaRemaining', '?')} remaining)"))
            return True
        else:
            print(red(f"SMS failed: {result.get('error', 'unknown error')}"))
            return False
    except Exception as e:
        print(red(f"SMS error: {e}"))
        return False


def do_sms(args):
    phone = args.get("phone", "")
    message = args.get("message", "")

    if not phone:
        phone = input(yellow("Phone number: ")).strip()
    if not message:
        message = input(yellow("Message: ")).strip()

    do_send_sms(phone, message)


# ── Call workflow ─────────────────────────────────────────────────────

def do_call(args):
    lead_name = args.get("lead", "")
    phone = args.get("phone", "")
    script_key = args.get("script", "")

    if not lead_name:
        lead_name = input(yellow("Lead name: ")).strip()
    if not phone:
        phone = input(yellow("Phone number: ")).strip()
    if not script_key:
        print_available_scripts()
        script_key = input(yellow("Script key: ")).strip()

    print(bold(f"\n{'='*60}"))
    print(bold(f"  CALLING: {lead_name}"))
    print(bold(f"  PHONE:   {phone}"))
    print(bold(f"  SCRIPT:  {script_key}"))
    t0 = time.time()
    print(bold(f"  TIME:    {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}"))
    print(bold(f"{'='*60}\n"))

    script_content = load_script(script_key)
    if script_content:
        print(green("=== SCRIPT ===\n"))
        lines = script_content.split("\n")
        for line in lines[:120]:
            print(f"  {line}")
        if len(lines) > 120:
            print(f"\n  ... [{len(lines) - 120} more lines] ...")
        print(green("\n=== END SCRIPT ===\n"))

    print(blue("APOLOGY-FIRST. 60-second close. Recover trust, then close the 7-day trial deployment.\n"))
    print()

    outcome = input(yellow("Outcome (connected/voicemail/no-answer/refused/callback): ")).strip().lower()
    notes = input(yellow("Notes: ")).strip()
    duration = int(time.time() - t0)

    entry = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M UTC"),
        "lead": lead_name,
        "phone": phone,
        "script": script_key,
        "outcome": outcome,
        "notes": notes,
    }

    # Log to both SQLite and Markdown
    _init_db()
    _db_log_call(lead_name, phone, script_key, outcome, notes, duration)
    _append_md_log(entry)
    print(green(f"\nCall logged for {lead_name}. Outcome: {outcome}. Duration: {duration}s"))

    # Offer SMS follow-up
    if outcome in ("voicemail", "no-answer", "callback"):
        send_sms = input(yellow("\nSend SMS follow-up? (y/n): ")).strip().lower()
        if send_sms == "y":
            default_msg = "FocusRunner here — I called you earlier about our AI patient acquisition system. We help med spas book 3x more consults. Can we talk 10 min? Reply YES or text back."
            msg = input(yellow(f"Message [{default_msg}]: ")).strip() or default_msg
            result = do_send_sms(phone, msg)
            if result:
                entry["sms_sent"] = True
                _update_md_log(entry)
                # Update SQLite too
                conn = sqlite3.connect(CALL_DB)
                conn.execute("UPDATE calls SET sms_sent = 1 WHERE lead_name = ? AND called_at = ?",
                             (lead_name, entry["date"]))
                conn.commit()
                conn.close()
                print(green("SMS sent + log updated."))


# ── UTM2 one-command wrapper ──────────────────────────────────────────

def do_utm2():
    title = "UTM LEAD 2 RECOVERY CALL — (hOt_65) UTM Spa Miami"
    phone = "(555) 555-4567"
    script_key = "utm2-recovery"

    print(bold(f"\n{'='*60}"))
    print(bold(f"  {title}"))
    print(bold(f"  PHONE:   {phone}"))
    print(bold(f"  SCRIPT:  {script_key}"))
    t0 = time.time()
    print(bold(f"  TIME:    {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}"))
    print(bold(f"{'='*60}\n"))

    script_content = load_script(script_key)
    if script_content:
        print(green("=== FULL SCRIPT ===\n"))
        for line in script_content.split("\n"):
            print(f"  {line}")
        print(green("\n=== END SCRIPT ===\n"))

    print(blue("STRATEGY: Apology-first. 60s to recover trust. Then close 7-day trial deployment."))
    print(blue("PHASES: (1) Apology Opener (2) Trust Reset (3) Re-engage Deal via SPIN (4) Objections"))
    print()

    outcome = input(yellow("Outcome (connected/voicemail/no-answer/refused/callback): ")).strip().lower()
    notes = input(yellow("Notes: ")).strip()
    duration = int(time.time() - t0)

    _init_db()
    _db_log_call("UTM Lead 2 (hot_65) — UTM Spa Miami", phone, script_key, outcome, notes, duration)

    md_entry = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M UTC"),
        "lead": "UTM Lead 2 (hot_65) — UTM Spa Miami",
        "phone": phone,
        "script": script_key,
        "outcome": outcome,
        "notes": notes,
    }
    _append_md_log(md_entry)
    print(green(f"\nUTM2 call logged. Outcome: {outcome}. Duration: {duration}s"))

    if outcome in ("voicemail", "no-answer", "callback"):
        send_sms = input(yellow("\nSend SMS follow-up? (y/n): ")).strip().lower()
        if send_sms == "y":
            msg = input(yellow("SMS message: ")).strip() or \
                "Hi — this is [Name] from FocusRunner. I missed our call Friday — my fault entirely. I have your audit ready. Can we do 10 min Monday? Reply YES or best time."
            do_send_sms(phone, msg)
            md_entry["sms_sent"] = True
            _update_md_log(md_entry)
            conn = sqlite3.connect(CALL_DB)
            conn.execute("UPDATE calls SET sms_sent = 1 WHERE lead_name = ? AND called_at = ?",
                         ("UTM Lead 2 (hot_65) — UTM Spa Miami", md_entry["date"]))
            conn.commit()
            conn.close()
            print(green("SMS sent + log updated."))


# ── Main CLI ──────────────────────────────────────────────────────────

def main():
    import argparse
    parser = argparse.ArgumentParser(description="FocusRunner CLI Phone Dialer")
    sub = parser.add_subparsers(dest="command")

    p_call = sub.add_parser("call", help="Make a call with script + logging")
    p_call.add_argument("--lead", default="")
    p_call.add_argument("--phone", default="")
    p_call.add_argument("--script", default="")

    p_utm2 = sub.add_parser("dial-utm2", help="One-command UTM Lead 2 recovery call w/ full script")

    p_sms = sub.add_parser("sms", help="Send SMS via TextBelt")
    p_sms.add_argument("--phone", default="")
    p_sms.add_argument("--message", default="")

    p_list = sub.add_parser("list", help="List available scripts")
    p_log = sub.add_parser("log", help="View Markdown call log")
    p_db = sub.add_parser("db-log", help="View SQLite call log")

    args = parser.parse_args()

    if args.command == "call":
        do_call({"lead": args.lead, "phone": args.phone, "script": args.script})
    elif args.command == "dial-utm2":
        do_utm2()
    elif args.command == "sms":
        do_sms({"phone": args.phone, "message": args.message})
    elif args.command == "list":
        list_scripts()
    elif args.command == "log":
        show_md_log()
    elif args.command == "db-log":
        show_db_log()
    else:
        parser.print_help()
        print("\nQuick start: python3 cli-dialer.py list")
        print("Then: python3 cli-dialer.py call")
        print("UTM2: python3 cli-dialer.py dial-utm2")


if __name__ == "__main__":
    main()
