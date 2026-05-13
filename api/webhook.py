"""
Vercel serverless function: /api/webhook
Receives lead form submissions from the landing page, enriches with UTM/source data,
and forwards to Make.com for CRM routing.

Input:  POST { name, email, phone, service_interest, budget_range, timeline, source, utm_* }
Output: { status: "ok" | "error", message: string }
"""
import os
import json
import urllib.request
import urllib.error
from http.server import BaseHTTPRequestHandler

# Make.com webhook URL (set in Vercel env vars)
MAKE_WEBHOOK_URL = os.environ.get("MAKE_WEBHOOK_URL", "")

# Fallback: log to a simple endpoint or just return success for demo
FALLBACK_MODE = not MAKE_WEBHOOK_URL


def validate_lead(data):
    """Basic validation. Returns (is_valid, errors)."""
    errors = []
    required = ["name", "phone"]
    for field in required:
        if not data.get(field):
            errors.append(f"Missing required field: {field}")

    # Basic phone validation (strip non-digits, check length)
    phone = data.get("phone", "")
    digits = "".join(c for c in phone if c.isdigit())
    if len(digits) < 7:
        errors.append("Invalid phone number (too few digits)")

    # Email validation (basic)
    email = data.get("email", "")
    if email and "@" not in email:
        errors.append("Invalid email format")

    return len(errors) == 0, errors


def enrich_lead(data):
    """Add computed fields to lead data."""
    enriched = dict(data)

    # Extract UTM params
    enriched["utm_source"] = data.get("utm_source", "direct")
    enriched["utm_medium"] = data.get("utm_medium", "none")
    enriched["utm_campaign"] = data.get("utm_campaign", "none")

    # Add lead scoring pre-qualifiers
    volume = str(data.get("volume", "")).lower()
    if "60+" in volume:
        enriched["pre_score"] = "high"
    elif "30" in volume:
        enriched["pre_score"] = "medium"
    else:
        enriched["pre_score"] = "low"

    # Timestamp
    from datetime import datetime, timezone
    enriched["captured_at"] = datetime.now(timezone.utc).isoformat()

    # Source priority
    enriched["lead_source"] = data.get("source", enriched["utm_source"])

    return enriched


def forward_to_make(lead_data):
    """POST enriched lead data to Make.com webhook."""
    body = json.dumps(lead_data).encode("utf-8")
    req = urllib.request.Request(MAKE_WEBHOOK_URL, data=body, headers={
        "Content-Type": "application/json",
    })

    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            response_text = resp.read().decode("utf-8")
            return True, response_text[:200]
    except urllib.error.HTTPError as e:
        return False, f"HTTP {e.code}: {e.read().decode('utf-8')[:200]}"
    except Exception as e:
        return False, str(e)[:200]


def handler(request_body):
    """Main handler. Returns (status_code, response_dict)."""
    try:
        data = json.loads(request_body)
    except json.JSONDecodeError:
        return 400, {"status": "error", "message": "Invalid JSON body"}

    is_valid, errors = validate_lead(data)
    if not is_valid:
        return 422, {"status": "error", "message": "Validation failed", "errors": errors}

    lead = enrich_lead(data)

    if FALLBACK_MODE:
        # Demo/development mode — just log and return success
        print(f"[webhook] Lead captured: {lead.get('name')} | {lead.get('practice')} | score={lead.get('pre_score')}")
        return 200, {
            "status": "ok",
            "message": "Lead captured (demo mode — set MAKE_WEBHOOK_URL for production)",
            "lead_id": f"lead_{lead.get('phone','')[-4:]}",
            "pre_score": lead["pre_score"],
        }

    success, detail = forward_to_make(lead)
    if success:
        return 200, {"status": "ok", "message": "Lead forwarded to automation", "detail": detail}
    else:
        return 502, {"status": "error", "message": f"Make.com webhook failed: {detail}"}


class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"

        status, response = handler(body)

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(response).encode("utf-8"))

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps({
            "status": "ok",
            "endpoint": "/api/webhook",
            "mode": "demo" if FALLBACK_MODE else "production",
        }).encode("utf-8"))
