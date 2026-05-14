"""
FocusRunner Lead Capture — Vercel Python Serverless (WSGI at /api/lead)
"""

import os
import json
import datetime
import urllib.request
import urllib.parse


def app(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    content_length = int(environ.get("CONTENT_LENGTH", "0") or "0")
    body_bytes = environ["wsgi.input"].read(content_length) if content_length > 0 else b"{}"

    cors = [
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Headers", "Content-Type"),
        ("Access-Control-Allow-Methods", "POST, GET, OPTIONS"),
    ]

    if method == "OPTIONS":
        start_response("200 OK", cors)
        return [b""]

    jh = [("Content-Type", "application/json")] + cors

    if method == "GET":
        return _send(start_response, 200, jh, {
            "status": "ok", "service": "FocusRunner Lead Capture", "version": "1.0.0"})

    if method == "POST":
        try:
            data = json.loads(body_bytes)
        except Exception:
            return _send(start_response, 400, jh, {"error": "Invalid JSON"})

        name = (data.get("name") or "").strip()
        email = (data.get("email") or "").strip()
        if not name or not email:
            return _send(start_response, 400, jh, {"error": "Name and email required"})

        lead = {
            "name": name,
            "email": email,
            "phone": data.get("phone", ""),
            "time": data.get("time", ""),
            "page_url": data.get("page_url", ""),
            "source": "focusrunner_chat_widget",
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        }

        errors = []
        if not _send_tg(lead):
            errors.append("telegram_failed")
        if not _send_ghl(lead):
            errors.append("ghl_webhook_failed")

        status = "complete" if not errors else "partial"
        return _send(start_response, 200, jh, {
            "success": status == "complete",
            "status": status,
            "errors": errors,
            "lead": {"name": name, "email": email},
        })

    return _send(start_response, 405, jh, {"error": "Method not allowed"})


def _send(start_response, status_code, headers, data):
    status_map = {200: "200 OK", 400: "400 Bad Request", 405: "405 Method Not Allowed"}
    body = json.dumps(data).encode()
    h = headers + [("Content-Length", str(len(body)))]
    start_response(status_map.get(status_code, "500 Internal Server Error"), h)
    return [body]


def _send_tg(lead):
    token = os.environ.get("TELEGRAM_BOT_TOKEN", "")
    if not token:
        return False
    chat_id = "5926797455"
    text = "New Lead - FocusRunner!\nName: " + lead["name"]
    text += "\nEmail: " + lead["email"]
    text += "\nPhone: " + (lead["phone"] or "n/a")
    text += "\nTime: " + (lead["time"] or "n/a")
    try:
        data = urllib.parse.urlencode({"chat_id": chat_id, "text": text}).encode()
        req = urllib.request.Request(
            "https://api.telegram.org/bot" + token + "/sendMessage", data=data)
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
        req = urllib.request.Request(url, data=payload,
                                     headers={"Content-Type": "application/json"})
        with urllib.request.urlopen(req, timeout=15):
            return True
    except Exception:
        return False
