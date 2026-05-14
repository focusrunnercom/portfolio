#!/usr/bin/env python3
"""
FocusRunner Twilio SMS CLI — Ship an SMS from the terminal.

Usage:
  # One-shot send:
  python3 twilio-cli.py send --to "+15551234567" --message "Your lead is hot!"

  # Test hot lead alert (trigger SMS to SALES_TEAM_PHONE):
  python3 twilio-cli.py test-lead

  # Check config status:
  python3 twilio-cli.py status

  # Interactive setup (paste credentials):
  python3 twilio-cli.py setup

Requires env vars (set via setup or .env):
  TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM_NUMBER, SALES_TEAM_PHONE
"""

import os
import sys
import json
import argparse
import subprocess
from pathlib import Path


ENV_VARS = {
    "TWILIO_ACCOUNT_SID": "Your Twilio Account SID (starts with AC...)",
    "TWILIO_AUTH_TOKEN": "Your Twilio Auth Token",
    "TWILIO_FROM_NUMBER": "Your Twilio phone number (e.g., +1234567890)",
    "SALES_TEAM_PHONE": "Your sales team's phone number to receive alerts (e.g., +1234567890)",
}


def get_env(key: str) -> str:
    """Read env var from os.environ or .env file."""
    val = os.environ.get(key, "")
    if val:
        return val
    # Check .env files
    for env_path in [Path.home() / ".hermes" / ".env", Path(".env"), Path.cwd() / ".env"]:
        if env_path.exists():
            for line in env_path.read_text().splitlines():
                if line.startswith(f"{key}="):
                    val = line.split("=", 1)[1].strip().strip('"').strip("'")
                    if val:
                        return val
    return ""


def check_config() -> dict:
    """Check which env vars are configured."""
    status = {}
    for key in ENV_VARS:
        val = get_env(key)
        status[key] = {"configured": bool(val), "masked": val[:8] + "..." if val else ""}
    status["all_configured"] = all(v["configured"] for v in status.values())
    return status


def cmd_status(args):
    """Check and display Twilio config status."""
    status = check_config()
    print("\n=== FocusRunner Twilio Config Status ===\n")
    all_ok = True
    for key, info in status.items():
        if key == "all_configured":
            continue
        icon = "✅" if info["configured"] else "❌"
        print(f"  {icon} {key}")
        if info["configured"]:
            print(f"       {info['masked']}")
        all_ok = all_ok and info["configured"]

    if all_ok:
        print(f"\n  ✅ ALL CONFIGURED — Ready to send SMS")
    else:
        count = sum(1 for k, v in status.items() if k != "all_configured" and v["configured"])
        total = sum(1 for k in ENV_VARS)
        print(f"\n  ⚠️  {count}/{total} vars configured")
        print(f"  Run: python3 twilio-cli.py setup")
    print()


def cmd_setup(args):
    """Interactive setup — paste Twilio credentials into .env."""
    env_path = Path.home() / ".hermes" / ".env"
    current = env_path.read_text().splitlines() if env_path.exists() else []

    print("\n=== FocusRunner Twilio Interactive Setup ===\n")
    print("You need a Twilio account. Sign up at: https://www.twilio.com/try-twilio\n")
    print("Paste each credential (or press Enter to skip/keep existing):\n")

    updates = {}
    for key, desc in ENV_VARS.items():
        existing = get_env(key)
        default = f" ({existing[:8]}...)" if existing else ""
        val = input(f"  {desc}{default}: ").strip().strip('"').strip("'")
        if val:
            updates[key] = val

    if not updates:
        print("\n  No changes made.\n")
        return

    # Read/write .env
    lines = env_path.read_text().splitlines() if env_path.exists() else []
    for key, val in updates.items():
        # Remove existing entry
        lines = [l for l in lines if not l.startswith(f"{key}=")]
        lines.append(f"{key}={val}")
        print(f"  ✅ {key} updated")

    env_path.write_text("\n".join(lines) + "\n")
    print(f"\n  Written to {env_path}")
    print("  Restart Flask (or source the .env) for changes to take effect.\n")


def cmd_send(args):
    """Send an SMS via Twilio REST API."""
    status = check_config()
    if not status["all_configured"]:
        print("\n❌ Twilio not configured. Run setup or set env vars.\n")
        sys.exit(1)

    to = args.to
    message = args.message

    if not to or not message:
        print("Usage: python3 twilio-cli.py send --to \"+15551234567\" --message \"Your text\"\n")
        sys.exit(1)

    account_sid = get_env("TWILIO_ACCOUNT_SID")
    auth_token = get_env("TWILIO_AUTH_TOKEN")
    from_number = get_env("TWILIO_FROM_NUMBER")

    import requests
    url = f"https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json"
    print(f"\n  Sending SMS to {to}...")

    resp = requests.post(
        url,
        auth=(account_sid, auth_token),
        data={"From": from_number, "To": to, "Body": message},
        timeout=15,
    )

    if resp.status_code in (200, 201):
        data = resp.json()
        sid = data.get("sid", "unknown")
        print(f"  ✅ SMS SENT — SID: {sid}\n")
        print(json.dumps({"sent": True, "to": to, "sid": sid}, indent=2))
    else:
        print(f"  ❌ FAILED — HTTP {resp.status_code}: {resp.text[:300]}\n")
        sys.exit(1)


def cmd_test_lead(args):
    """Send a test hot-lead alert to SALES_TEAM_PHONE."""
    status = check_config()
    if not status["all_configured"]:
        print("\n❌ Twilio not configured. Run setup or set env vars.\n")
        sys.exit(1)

    # Import and call the existing app module
    sys.path.insert(0, str(Path(__file__).parent))
    from sms_notify import send_hot_alert

    test_lead = {
        "id": 999,
        "name": "Test Hot Lead (CLI)",
        "email": "test@medspa.com",
        "phone": "+15551234567",
        "practice": "Test Med Spa",
        "score": "hot_95",
    }

    print(f"\n  Sending test hot lead alert to {get_env('SALES_TEAM_PHONE')}...\n")
    result = send_hot_alert(test_lead)
    print(json.dumps(result, indent=2))
    print()


def main():
    parser = argparse.ArgumentParser(description="FocusRunner Twilio SMS CLI")
    sub = parser.add_subparsers(dest="command", help="Command")

    # status
    p_status = sub.add_parser("status", help="Check Twilio configuration")

    # setup
    p_setup = sub.add_parser("setup", help="Interactive credential setup")

    # send
    p_send = sub.add_parser("send", help="Send an SMS to a phone number")
    p_send.add_argument("--to", "-t", help="Recipient phone number")
    p_send.add_argument("--message", "-m", help="SMS body text")

    # test-lead
    p_test = sub.add_parser("test-lead", help="Send a test hot-lead alert")

    args = parser.parse_args()

    if args.command == "status":
        cmd_status(args)
    elif args.command == "setup":
        cmd_setup(args)
    elif args.command == "send":
        cmd_send(args)
    elif args.command == "test-lead":
        cmd_test_lead(args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
