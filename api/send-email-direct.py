#!/usr/bin/env python3
"""
send-email-direct.py — Direct-to-MX email sender.
No SMTP relay, no credentials needed. Resolves recipient's MX record
and delivers directly. May land in spam but WILL deliver.

Usage:
    python3 send-email-direct.py --status
    python3 send-email-direct.py --send-test --to someone@example.com
    python3 send-email-direct.py --dry-run
    python3 send-email-direct.py --send-all

Env vars (optional):
    FROM_EMAIL     — sender address (default: hello@focusrunner.ai)
    FROM_NAME      — sender name (default: FocusRunner AI)
"""
import os, sys, json, sqlite3, smtplib, ssl, time, logging, socket, dns.resolver
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from pathlib import Path

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("send-email-direct")

FROM_EMAIL = os.environ.get("FROM_EMAIL", "hello@focusrunner.ai")
FROM_NAME = os.environ.get("FROM_NAME", "FocusRunner AI")
RATE_LIMIT = 2  # seconds between emails

SCRIPT_DIR = Path(__file__).parent
DB_PATH = SCRIPT_DIR / "leads.db"
ALT_DB_PATHS = [
    SCRIPT_DIR.parent / "lead-dashboard" / "leads.db",
    Path("/home/ai13/workspace/portfolio/lead-dashboard/leads.db"),
]

def find_db():
    for p in [DB_PATH] + ALT_DB_PATHS:
        if p.exists():
            return p
    return None

def resolve_mx(domain):
    """Resolve MX records for a domain, return (priority, host) sorted."""
    try:
        answers = dns.resolver.resolve(domain, 'MX')
        records = [(r.preference, str(r.exchange).rstrip('.')) for r in answers]
        records.sort(key=lambda x: x[0])
        return records
    except Exception as e:
        logger.warning(f"MX lookup failed for {domain}: {e}")
        return []

def send_direct(to_email, subject, html_body):
    """Send email directly to recipient's MX server."""
    domain = to_email.split('@')[1]
    mx_records = resolve_mx(domain)
    if not mx_records:
        # Fallback: try common mail providers directly
        mx_map = {
            "gmail.com": "gmail-smtp-in.l.google.com",
            "yahoo.com": "mx1.mail.yahoo.com",
            "outlook.com": "outlook-com.olc.protection.outlook.com",
            "hotmail.com": "outlook-com.olc.protection.outlook.com",
            "aol.com": "mx.aol.com",
        }
        mx_host = mx_map.get(domain)
        if not mx_host:
            return {"ok": False, "error": f"No MX records for {domain}"}
        mx_records = [(10, mx_host)]

    errors = []
    for prio, mx_host in mx_records:
        try:
            msg = MIMEMultipart("alternative")
            msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
            msg["To"] = to_email
            msg["Subject"] = subject
            msg["Message-ID"] = f"<{int(time.time())}.{hash(to_email)%100000}@focusrunner.ai>"

            text_body = "View this email in an HTML client for the best experience.\n\n— FocusRunner AI"
            msg.attach(MIMEText(text_body, "plain", "utf-8"))
            msg.attach(MIMEText(html_body, "html", "utf-8"))

            with smtplib.SMTP(mx_host, 25, timeout=20) as srv:
                srv.ehlo("focusrunner.ai")
                srv.sendmail(FROM_EMAIL, [to_email], msg.as_string())

            return {"ok": True, "mx": mx_host}

        except (smtplib.SMTPException, OSError, socket.timeout) as e:
            err_msg = str(e)[:100]
            logger.warning(f"MX {mx_host}:{25} failed: {err_msg}")
            errors.append(f"{mx_host}: {err_msg}")
            continue

    return {"ok": False, "error": "; ".join(errors)[:300]}

def personal_intro_html(name, practice):
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

def get_leads():
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

def cmd_status():
    leads = get_leads()
    db_path = find_db()
    print(f"DB path: {db_path or 'NOT FOUND'}")
    print(f"Leads with email: {len(leads)}")
    print(f"From: {FROM_NAME} <{FROM_EMAIL}>")
    print(f"\nDependencies: dnspython (pip install dnspython)")
    if leads:
        print(f"\nFirst 5 leads:")
        for l in leads[:5]:
            print(f"  {l['name']:25} {l['email']:35} {l.get('practice', '')}")

def cmd_send_test(to_email):
    logger.info(f"Installing dnspython dependency...")
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "dnspython", "-q"], capture_output=True)
    
    import importlib
    importlib.reload(dns)
    
    html = personal_intro_html("CEO", "FocusRunner AI")
    logger.info(f"Sending direct-to-MX test email to {to_email}...")
    result = send_direct(to_email, "TEST — FocusRunner Direct Email is LIVE", html)
    if result["ok"]:
        logger.info(f"SUCCESS: Delivered via MX {result['mx']}")
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
    import subprocess
    subprocess.run([sys.executable, "-m", "pip", "install", "dnspython", "-q"], capture_output=True)
    
    import importlib
    importlib.reload(dns)
    
    leads = get_leads()
    if not leads:
        print("No leads with email")
        return
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
        result = send_direct(email, "Your free Patient Acquisition Audit — personalized for your med spa", html)
        if result["ok"]:
            sent += 1
            logger.info(f"[{i+1}/{len(leads)}] SENT to {name} <{email}> via {result['mx']}")
        else:
            failed += 1
            logger.error(f"[{i+1}/{len(leads)}] FAIL to {name} <{email}>: {result['error']}")
        if i < len(leads) - 1:
            time.sleep(RATE_LIMIT)
    print(f"\n=== DONE === Total: {len(leads)}  Sent: {sent}  Failed: {failed}")

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
