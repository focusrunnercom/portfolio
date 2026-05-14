"""
FocusRunner Lead Capture — Vercel Python Serverless Function
Vercel detects `app` as WSGI automatically.
"""

import os
import json
import datetime
import urllib.request
import urllib.parse


def app(environ, start_response):
    """WSGI application for Vercel Python Runtime."""
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")

    # Handle OPTIONS preflight
    if method == "OPTIONS":
        start_response("200 OK", [
            ("Content-Type", "application/json"),
            ("Access-Control-Allow-Origin", "*"),
            ("Access-Control-Allow-Methods", "POST, GET, OPTIONS"),
            ("Access-Control-Allow-Headers", "Content-Type"),
        ])
        return [b""]

    # Read body
    content_length = int(environ.get("CONTENT_LENGTH", "0") or "0")
    body = environ["wsgi.input"].read(content_length) if content_length > 0 else b"{}"

    json_headers = [
        ("Content-Type", "application/json"),
        ("Access-Control-Allow-Origin", "*"),
    ]

    if method == "GET":
        data = json.dumps({
            "status": "ok",
            "service": "FocusRunner Lead Capture API",
            "version": "1.0.0",
        }).encode()
        start_response("200 OK", json_headers + [("Content-Length", str(len(data)))])
        return [data]

    if method == "POST":
        try:
            data = json.loads(body)
        except (json.JSONDecodeError, TypeError):
            resp = json.dumps({"error": "Invalid JSON"}).encode()
            start_response("400 Bad Request", json_headers + [("Content-Length", str(len(resp)))])
            return [resp]

        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip()

        if not name or not email:
            resp = json.dumps({"error": "Name and email required"}).encode()
            start_response("400 Bad Request", json_headers + [("Content-Length", str(len(resp)))])
            return [resp]

        phone = data.get("phone", "")
        pref_time = data.get("time", "")
        page_url = data.get("page_url", "")

        lead = {
            "name": name,
            "email": email,
            "phone": phone,
            "time": pref_time,
            "page_url": page_url,
            "source": "focusrunner_chat_widget",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }

        errors = []
        if not _send_tg(lead):
            errors.append("telegram_failed")
        if not _send_ghl(lead):
            errors.append("ghl_webhook_failed")

        status = "complete" if not errors else "partial"
        resp = json.dumps({
            "success": status == "complete",
            "status": status,
            "errors": errors,
            "lead": {"name": name, "email": email},
        }).encode()
        start_response("200 OK", json_headers + [("Content-Length", str(len(resp)))])
        return [resp]

    resp = json.dumps({"error": "Method not allowed"}).encode()
    start_response("405 Method Not Allowed", json_headers + [("Content-Length", str(len(resp)))])
    return [resp]


def _send_tg(lead):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return False

    chat_id = "5926797455"
    text = "New Lead - FocusRunner!\n"
    text += "Name: " + lead["name"] + "\n"
    text += "Email: " + lead["email"] + "\n"
    text += "Phone: " + (lead["phone"] or "n/a") + "\n"
    text += "Time: " + (lead["time"] or "n/a")

    try:
        data = urllib.parse.urlencode({
            "chat_id": chat_id,
            "text": text,
            "parse_mode": "HTML",
        }).encode()
        req = urllib.request.Request(
            "https://api.telegram.org/bot" + token + "/sendMessage",
            data=data,
        )
        with urllib.request.urlopen(req, timeout=10):
            return True
    except Exception:
        return False


def _send_ghl(lead):
    url = os.environ.get("GHL_WEBHOOK_URL", "")
    if not url:
        return True

    payload = json.dumps({
        "name": lead["name"],
        "email": lead["email"],
        "phone": lead["phone"],
        "tags": ["focusrunner-widget", "ai-lead", "hot"],
        "preferred_time": lead["time"],
        "page_url": lead["page_url"],
        "source": "FocusRunner Chat Widget",
    }).encode()

    try:
        req = urllib.request.Request(
            url, data=payload,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=15):
            return True
    except Exception:
        return False
