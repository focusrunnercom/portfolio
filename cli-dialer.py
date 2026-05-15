#!/usr/bin/env python3
"""
FocusRunner CLI Phone Dialer — FOC-715
========================================
CLI tool for phone outreach calls. Prints scripts, logs outcomes.
No agent adapter needed — works right now.

Usage:
  python3 cli-dialer.py --list                 # Show available script segments
  python3 cli-dialer.py call                   # Start a guided call workflow
  python3 cli-dialer.py call --lead "Sarah Mitchell" --phone "+1555...4567" --script "cold-call"
  python3 cli-dialer.py log                    # View call log
  python3 cli-dialer.py sms --phone "+1555...4567" --message "..."  # Send SMS via TextBelt
"""

import json
import os
import sys
import urllib.request
import urllib.parse
from datetime import datetime

CALL_LOG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "CALL-LOG.md")
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
}

TEXTBELT_URL = "https://textbelt.com/text"
TEXTBELT_KEY = os.environ.get("TEXTBELT_KEY", "textbelt")

# PHONE: The CEO's phone for sending SMS
CEO_PHONE = "+1555...4567"  # placeholder — set via env or real data


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
    print(bold(f"  TIME:    {datetime.now().strftime('%Y-%m-%d %H:%M UTC')}"))
    print(bold(f"{'='*60}\n"))

    script_content = load_script(script_key)
    if script_content:
        print(green("=== SCRIPT ===\n"))
        lines = script_content.split("\n")
        # Print first 100 lines of the script
        for line in lines[:100]:
            print(f"  {line}")
        if len(lines) > 100:
            print(f"\n  ... [{len(lines) - 100} more lines] ...")
        print(green("\n=== END SCRIPT ===\n"))

    print(blue("After the call, log the outcome."))
    print()

    outcome = input(yellow("Outcome (connected/voicemail/no-answer/refused/callback): ")).strip().lower()
    notes = input(yellow("Notes: ")).strip()

    log_entry = {
        "date": datetime.now().strftime("%Y-%m-%d %H:%M UTC"),
        "lead": lead_name,
        "phone": phone,
        "script": script_key,
        "outcome": outcome,
        "notes": notes,
    }

    _append_log(log_entry)
    print(green(f"\nCall logged for {lead_name}. Outcome: {outcome}"))

    # Offer SMS follow-up
    if outcome in ("voicemail", "no-answer", "callback"):
        send_sms = input(yellow("\nSend SMS follow-up? (y/n): ")).strip().lower()
        if send_sms == "y":
            default_msg = f"FocusRunner here — I called you earlier about our AI patient acquisition system. We help med spas book 3x more consults. Can we talk 10 min? Reply YES or text back."
            msg = input(yellow(f"Message [{default_msg}]: ")).strip() or default_msg
            result = do_send_sms(phone, msg)
            if result:
                log_entry["sms_sent"] = True
                log_entry["sms_message"] = msg
                _update_log(log_entry)
                print(green("SMS sent + log updated."))


def _append_log(entry):
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
        print(red(f"Failed to write log: {e}"))


def _update_log(entry):
    """Update the most recent log entry for this lead with SMS info."""
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


def show_log():
    if not os.path.exists(CALL_LOG):
        print(yellow("No call log yet."))
        return
    with open(CALL_LOG) as f:
        print(f.read())


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


def main():
    import argparse
    parser = argparse.ArgumentParser(description="FocusRunner CLI Phone Dialer")
    sub = parser.add_subparsers(dest="command")

    p_call = sub.add_parser("call", help="Make a call with script + logging")
    p_call.add_argument("--lead", default="")
    p_call.add_argument("--phone", default="")
    p_call.add_argument("--script", default="")

    p_sms = sub.add_parser("sms", help="Send SMS via TextBelt")
    p_sms.add_argument("--phone", default="")
    p_sms.add_argument("--message", default="")

    p_list = sub.add_parser("list", help="List available scripts")
    p_log = sub.add_parser("log", help="View call log")

    args = parser.parse_args()

    if args.command == "call":
        do_call({"lead": args.lead, "phone": args.phone, "script": args.script})
    elif args.command == "sms":
        do_sms({"phone": args.phone, "message": args.message})
    elif args.command == "list":
        list_scripts()
    elif args.command == "log":
        show_log()
    else:
        parser.print_help()
        print("\nQuick start: python3 cli-dialer.py list")
        print("Then: python3 cli-dialer.py call")


if __name__ == "__main__":
    main()
