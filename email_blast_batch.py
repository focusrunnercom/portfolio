"""
email_blast_batch.py — Drop-in batch email sender for FocusRunner AI.

Usage:
  # Set credentials first:
  export SENDGRID_API_KEY=SG.xxxxx
  # OR
  export SMTP_EMAIL=focusrunner@gmail.com
  export SMTP_PASSWORD=your-app-password

  # Dry run (preview):
  python3 email_blast_batch.py --dry-run

  # Fire:
  python3 email_blast_batch.py

  # Single:
  python3 email_blast_batch.py --to lead@example.com

Requirements: requests (for SendGrid), python-dotenv (optional)
No other deps. Falls back to smtplib if SendGrid not available.
"""

import os
import sys
import json
import smtplib
import argparse
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
log = logging.getLogger(__name__)

# ── Load leads ────────────────────────────────────────────────

LEADS_PATH = os.environ.get("LEADS_JSON", "/tmp/leads.json")

def load_leads(path=LEADS_PATH):
    with open(path) as f:
        all_leads = json.load(f)
    # Filter out test entries, only real leads
    return [l for l in all_leads if l.get("source") != "test" and l.get("name")]

# ── Email building ────────────────────────────────────────────

def build_html(name, practice):
    return f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#1a1a1a;">
<div style="border-bottom:3px solid #7c3aed;padding-bottom:15px;margin-bottom:20px;">
<h1 style="color:#7c3aed;margin:0;">FocusRunner AI</h1>
<p style="color:#666;margin:5px 0 0;">AI-Powered Patient Acquisition for Miami Med Spas</p>
</div>
<p>Hi {name},</p>
<p>I noticed <strong>{practice}</strong> is doing well in the Miami market. Quick question:</p>
<p><em>How many leads come through your website and social channels every week — and how many actually book?</em></p>
<p>Most med spa owners tell us 60%+ of their leads arrive after hours or on weekends, and they never hear back until Monday. By then, the patient has booked elsewhere.</p>
<p>FocusRunner AI captures every lead 24/7, qualifies them automatically, and follows up via SMS and email until they respond. We convert 70% more leads to booked consults — without hiring more front desk staff.</p>
<p style="background:#f5f3ff;padding:15px;border-radius:8px;border-left:4px solid #7c3aed;">
<strong>15 qualified leads in 30 days, guaranteed.</strong><br>
$2,500 setup &middot; $2,500/month &middot; Free Patient Acquisition Audit included.</p>
<p>Would 15 minutes this week work to show you how it works for {practice}?</p>
<p>Best,<br><strong>[Your Name]</strong><br>FocusRunner AI<br>Miami Med Spa Lead Response</p>
<p style="font-size:12px;color:#999;border-top:1px solid #e5e5e5;padding-top:10px;">
FocusRunner AI &middot; 15 qualified leads in 30 days or it's free</p>
</body></html>"""

def build_text(name, practice):
    return f"""Hi {name},

I noticed {practice} is doing great in the Miami market. Quick question:

How many leads come through your website and social channels every week — and how many actually book?

Most med spa owners tell us 60%+ of their leads arrive after hours or weekends and never get a response until Monday. By then, the patient has booked elsewhere.

FocusRunner AI captures every lead 24/7, qualifies them automatically, and follows up via SMS and email until they respond. We convert 70% more leads to booked consults.

15 qualified leads in 30 days, guaranteed. $2,500 setup / $2,500/month.

Would 15 minutes work to show you?

Best,
[Your Name]
FocusRunner AI
"""

# ── Send via SendGrid API ─────────────────────────────────────

def send_sendgrid(to_email, subject, html, text, api_key):
    import requests
    data = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": "outreach@focusrunner.ai", "name": "FocusRunner AI"},
        "subject": subject,
        "content": [
            {"type": "text/plain", "value": text},
            {"type": "text/html", "value": html}
        ]
    }
    r = requests.post(
        "https://api.sendgrid.com/v3/mail/send",
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        },
        json=data,
        timeout=15
    )
    return r.status_code == 202, r.status_code, r.text[:200]

# ── Send via smtplib ─────────────────────────────────────────

def send_smtp(to_email, subject, html, text, smtp_host, smtp_port, smtp_user, smtp_pass, from_email):
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_email
    msg["To"] = to_email
    msg.attach(MIMEText(text, "plain"))
    msg.attach(MIMEText(html, "html"))

    with smtplib.SMTP(smtp_host, smtp_port, timeout=15) as s:
        if smtp_user and smtp_pass:
            s.starttls()
            s.login(smtp_user, smtp_pass)
        s.sendmail(from_email, [to_email], msg.as_string())
    return True

# ── Main ──────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="FocusRunner AI Email Blast")
    parser.add_argument("--dry-run", action="store_true", help="Preview only")
    parser.add_argument("--to", help="Send to single email instead of all leads")
    args = parser.parse_args()

    leads = load_leads()
    sg_key = os.environ.get("SENDGRID_API_KEY", "")
    smtp_host = os.environ.get("SMTP_HOST", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", "587"))
    smtp_user = os.environ.get("SMTP_EMAIL", "")
    smtp_pass = os.environ.get("SMTP_PASSWORD", "")
    from_email = os.environ.get("EMAIL_FROM", "outreach@focusrunner.ai")

    # Check if any credential is set
    has_sendgrid = bool(sg_key)
    has_smtp = bool(smtp_user and smtp_pass)

    if not has_sendgrid and not has_smtp:
        print("=" * 60)
        print("  NO EMAIL CREDENTIALS FOUND")
        print("=" * 60)
        print()
        print("  Set one of:")
        print("    export SENDGRID_API_KEY=SG.xxxxx")
        print("    export SMTP_EMAIL=focusrunner@gmail.com")
        print("    export SMTP_PASSWORD=your-app-password")
        print()
        print("  Or run with --dry-run to preview emails")
        print("=" * 60)

    target_leads = leads
    if args.to:
        target_leads = [l for l in leads if args.to in l.get("email", "") or args.to == l.get("name")]
        if not target_leads:
            target_leads = [{"name": args.to, "practice": args.to, "email": args.to}]

    print()
    print(f"{'TO':40s} {'STATUS':20s}")
    print("-" * 60)

    sent_count = 0
    for lead in target_leads:
        name = lead.get("name", "Lead")
        practice = lead.get("practice", name)
        email = lead.get("email", "") or f"{name.lower().replace(' ','')}@example.com"
        subject = f"Quick question about {practice}"

        if args.dry_run:
            print(f"{name:40s} {'[DRY RUN — would send]':20s}")
            continue

        html = build_html(name, practice)
        text = build_text(name, practice)

        try:
            if has_sendgrid:
                ok, code, body = send_sendgrid(email, subject, html, text, sg_key)
                status = f"SendGrid {code}" if ok else f"FAIL {code}"
            elif has_smtp:
                send_smtp(email, subject, html, text, smtp_host, smtp_port, smtp_user, smtp_pass, from_email)
                status = "SMTP sent"
            else:
                status = "[no credentials — skipped]"

            if ok or not has_smtp:
                sent_count += 1
            ok = False if not ok else ok
        except Exception as e:
            status = f"ERROR: {e}"
            ok = False

        print(f"{name:40s} {status:20s}")

    print("-" * 60)
    print(f"Total: {len(target_leads)} leads | Sent: {sent_count}")

if __name__ == "__main__":
    main()
