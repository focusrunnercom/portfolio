"""
Vercel Python Serverless: /api/direct-qualify
DeepSeek-independent lead qualification endpoint.

Zero external API calls. Pure Python logic. Always returns in <500ms.

Input:  POST { message, name?, practice?, monthly_volume?, spend?, phone?, email? }
Output: { response, score, next_action }

Score logic:
  practice + volume >= 50  → hot   → book_call
  practice + volume >= 10  → warm  → send_info
  else                     → cold  → drip

Response times: <500ms (no network calls).
"""
import json
import datetime

# ─── Configuration ──────────────────────────────────────────────────────────

STEP_MESSAGES = {
    "greeting": "👋 Hi! I'm FocusRunner AI. Quick 3 questions to see if we can help you grow.",
    "ask_practice": "First — what's your **practice name** and what **services** do you offer? (e.g., 'Miami Rejuvenation Spa — Botox, fillers, laser')",
    "ask_volume": "How many **new patients** do you get per month? Rough estimate is fine.",
    "ask_spend": "What are you currently spending on **ads & marketing** per month?",
    "hot": "🔥 You're a great fit! Our team will reach out to book a strategy call within 24 hours. In the meantime, check out focusrunner.io/case-studies",
    "warm": "👍 You look like a solid prospect. I'm sending info to your email with a few case studies from similar practices. Our team will follow up within 48 hours.",
    "cold": "Thanks for your interest! We've noted your details. When you're ready to scale your patient acquisition, reach out anytime at hello@focusrunner.com.",
}


# ─── Scoring Engine ────────────────────────────────────────────────────────

SPEND_SCORES = {"Under $3K": 5, "$3K-$5K": 20, "$5K-$10K": 30, "$10K+": 35}
BOOKING_SCORES = {"Under 10%": 35, "10-15%": 25, "15-20%": 10, "20%+": 5}
TIMELINE_SCORES = {"ASAP -- ready now": 30, "This quarter": 20, "Just researching": 5}

def qualify(practice="", volume=0, spend="", ad_spend=None, booking_rate=None, timeline=None):
    """Return (score, next_action) based on lead data."""
    has_practice = bool(practice and practice.strip())

    # Also check for direct lead-capture mode: all fields available
    try:
        vol = int(str(volume or "0").replace(",", "").replace("+", ""))
    except (ValueError, TypeError):
        vol = 0

    if has_practice and vol >= 50:
        return ("hot", "book_call")
    if has_practice and vol >= 10:
        return ("warm", "send_info")
    return ("cold", "drip")


def calc_form_score(ad_spend, booking_rate, timeline):
    """Calculate numeric qualification score from form fields (0-100)."""
    s = SPEND_SCORES.get(ad_spend, 5) + BOOKING_SCORES.get(booking_rate, 5) + TIMELINE_SCORES.get(timeline, 5)
    return s


def classify_numeric(score):
    """Classify a numeric form score into hot/warm/cold."""
    if score >= 65:
        return "hot"
    if score >= 30:
        return "warm"
    return "cold"


# ─── Conversation State Machine ────────────────────────────────────────────

def process_message(message, state):
    """Handle conversational flow. Returns response dict."""
    step = state.get("step", "greeting") if state else "greeting"
    practice = state.get("practice", "") if state else ""

    if step == "greeting":
        return {
            "response": STEP_MESSAGES["greeting"] + "\n\n" + STEP_MESSAGES["ask_practice"],
            "next_step": "ask_volume",
            "requires_input": True,
            "field": "practice",
        }
    elif step == "ask_volume":
        # Message body is the practice name
        return {
            "response": STEP_MESSAGES["ask_volume"],
            "next_step": "ask_spend",
            "requires_input": True,
            "field": "volume",
        }
    elif step == "ask_spend":
        return {
            "response": STEP_MESSAGES["ask_spend"],
            "next_step": "done",
            "requires_input": True,
            "field": "spend",
        }
    elif step == "done":
        score, action = qualify(practice, state.get("volume", 0) if state else 0)
        return {
            "response": STEP_MESSAGES[score],
            "score": score,
            "next_action": action,
            "next_step": "complete",
            "requires_input": False,
        }
    elif step == "complete":
        return {
            "response": "Already submitted! Our team will reach out.",
            "score": "cold",
            "next_action": "drip",
            "next_step": "complete",
            "requires_input": False,
        }
    else:
        return {
            "response": STEP_MESSAGES["greeting"],
            "next_step": "ask_volume",
            "requires_input": True,
            "field": "practice",
        }


def handle_direct_submission(body):
    """Route all provided fields at once (widget submission mode)."""
    name = body.get("name", "")
    practice = body.get("practice", "")
    raw_volume = body.get("volume") or body.get("monthly_volume") or ""
    spend = body.get("spend", "")
    score, action = qualify(practice, raw_volume, spend)
    return {
        "response": STEP_MESSAGES[score],
        "score": score,
        "next_action": action,
        "data_received": {
            "name": name,
            "practice": practice,
            "volume": int(str(raw_volume).replace(",", "").replace("+", "")) if raw_volume else 0,
            "spend": spend,
        },
    }


# ─── WSGI Application ──────────────────────────────────────────────────────

def app(environ, start_response):
    """WSGI application for Vercel Python Runtime."""
    method = environ.get("REQUEST_METHOD", "GET")
    headers = [
        ("Content-Type", "application/json"),
        ("Access-Control-Allow-Origin", "*"),
        ("Access-Control-Allow-Methods", "POST, GET, OPTIONS"),
        ("Access-Control-Allow-Headers", "Content-Type"),
    ]

    # CORS preflight
    if method == "OPTIONS":
        start_response("200 OK", headers)
        return [b""]

    # Health check
    if method == "GET":
        data = json.dumps({
            "status": "ok",
            "endpoint": "/api/direct-qualify",
            "version": "2.0.0",
            "mode": "python-wsgi",
            "score_logic": "practice + volume >= 50 → hot, >= 10 → warm, else cold",
        }).encode()
        start_response("200 OK", headers + [("Content-Length", str(len(data)))])
        return [data]

    if method != "POST":
        resp = json.dumps({"error": "Method not allowed"}).encode()
        start_response("405 Method Not Allowed", headers + [("Content-Length", str(len(resp)))])
        return [resp]

    # Parse body
    content_length = int(environ.get("CONTENT_LENGTH", "0") or "0")
    body_bytes = environ["wsgi.input"].read(content_length) if content_length > 0 else b"{}"
    try:
        body = json.loads(body_bytes)
    except (json.JSONDecodeError, TypeError):
        resp = json.dumps({"error": "Invalid JSON body"}).encode()
        start_response("400 Bad Request", headers + [("Content-Length", str(len(resp)))])
        return [resp]

    message = body.get("message", "")
    name = body.get("name", "")
    practice = body.get("practice", "")
    raw_volume = body.get("volume") or body.get("monthly_volume") or ""
    spend = body.get("spend", "")

    # Direct submission mode (all data provided at once)
    if practice and raw_volume:
        result = handle_direct_submission(body)
    else:
        # Partial data — use conversational flow
        state = body.get("state", {})
        result = process_message(message, state)

    resp = json.dumps(result).encode()
    start_response("200 OK", headers + [("Content-Length", str(len(resp)))])
    return [resp]
