"""
Vercel serverless function: /api/chat
OpenAI GPT-4o-powered lead qualification for med spa patient acquisition.

Input:  POST { messages: [{role, content}], userData: {name, phone, practice, niche, volume} }
Output: { reply: string, qualification: { score, classification, budget_tier, service_interest, timeline, summary }, booking_link: string | null }
"""
import os
import json
from http.server import BaseHTTPRequestHandler

# Use OpenAI-compatible API. Works with OPENAI_API_KEY or DEEPSEEK_API_KEY.
API_KEY = os.environ.get("OPENAI_API_KEY") or os.environ.get("DEEPSEEK_API_KEY", "")
API_BASE = os.environ.get("OPENAI_API_BASE", "https://api.openai.com/v1")
MODEL = os.environ.get("CHAT_MODEL", "gpt-4o-mini")

SYSTEM_PROMPT = """You are a medical spa patient concierge for a premium aesthetics practice. Your role is to qualify leads by understanding their needs, budget, and timeline through natural conversation.

SERVICES: Botox ($200-600), Dermal Fillers ($600-1500), Laser Treatments ($300-1200), Facials ($150-400), Body Contouring ($800-3000), Free Consult ($0)

QUALIFICATION RULES:
- Budget: Can they afford $200+ procedures? (30 points)
- Intent: Are they actively looking for treatment or just browsing? (40 points)
- Timeline: Do they want to book within 2 weeks? (30 points)

CONVERSATION FLOW:
1. Friendly greeting — thank them for their interest
2. Ask what service they're interested in
3. Understand their goal (anti-aging, acne, body contouring, etc.)
4. Gently ask about budget range
5. Ask about preferred timeline
6. If qualified, offer booking link enthusiastically
7. If not, thank them and let them know about future offers

TONE: Warm, professional, consultative. Never pushy. Educate while qualifying.
RULES: Never give medical advice. Route clinical questions to human staff. Keep responses under 3 sentences unless providing detailed information.

At the END of the conversation (when you have enough to score), append a JSON block wrapped in ```json:
```json
{
  "score": <0-100>,
  "classification": "<qualified|nurture|not_a_fit>",
  "budget_tier": "<premium|mid|budget>",
  "service_interest": "<service name>",
  "timeline": "<immediate|within_month|exploring>",
  "summary": "<1-sentence lead summary for sales team>"
}
```

The user is a med spa prospect who filled out a form. Here's what we already know about them:
- Name: {name}
- Phone: {phone}
- Practice: {practice} (this is their OWN practice name — they are a med spa OWNER, not a patient)
- Niche: {niche}
- Current patient volume: {volume} per month

IMPORTANT: This person OWNS or runs a medical aesthetics practice. They are looking for a patient acquisition SYSTEM, not a treatment. Adapt your questions accordingly — ask about their practice's lead flow, conversion challenges, and growth goals. Do NOT treat them as a patient seeking treatment."""


def build_messages(user_data, conversation):
    name = user_data.get("name", "there")
    phone = user_data.get("phone", "unknown")
    practice = user_data.get("practice", "unknown")
    niche = user_data.get("niche", "med spa")
    volume = user_data.get("volume", "unknown")

    sys = SYSTEM_PROMPT.format(name=name, phone=phone, practice=practice, niche=niche, volume=volume)
    return [{"role": "system", "content": sys}] + conversation


def call_openai(messages):
    import urllib.request
    import urllib.error

    url = f"{API_BASE}/chat/completions"
    body = json.dumps({
        "model": MODEL,
        "messages": messages,
        "temperature": 0.7,
        "max_tokens": 500,
    }).encode("utf-8")

    req = urllib.request.Request(url, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}",
    })

    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            return data["choices"][0]["message"]["content"]
    except urllib.error.HTTPError as e:
        error_body = e.read().decode("utf-8")[:500]
        raise Exception(f"API error {e.code}: {error_body}")


def parse_qualification(text):
    """Extract JSON qualification block from AI response."""
    import re
    match = re.search(r"```json\s*(\{.*?\})\s*```", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(1))
        except json.JSONDecodeError:
            pass

    # Fallback: try to find bare JSON object
    match = re.search(r'\{[^{}]*"score"[\s:0-9,\."\'a-z_\-]*\}', text, re.IGNORECASE)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            pass

    return None


def handler(request_body):
    """Main handler. Returns (status_code, response_dict)."""
    if not API_KEY:
        return 500, {"error": "API key not configured. Set OPENAI_API_KEY or DEEPSEEK_API_KEY."}

    try:
        body = json.loads(request_body)
    except json.JSONDecodeError:
        return 400, {"error": "Invalid JSON body"}

    messages = body.get("messages", [])
    user_data = body.get("userData", {})

    if not messages:
        return 400, {"error": "messages array is required"}

    full_messages = build_messages(user_data, messages)

    try:
        ai_text = call_openai(full_messages)
    except Exception as e:
        return 502, {"error": f"AI API call failed: {str(e)}"}

    qualification = parse_qualification(ai_text)

    # Strip the JSON block from the visible reply
    import re
    reply = re.sub(r"```json\s*\{.*?\}\s*```", "", ai_text, flags=re.DOTALL).strip()
    if not reply:
        reply = ai_text.strip()

    return 200, {
        "reply": reply,
        "qualification": qualification,
        "booking_link": "https://focusrunner.com" if (qualification and qualification.get("classification") == "qualified") else None,
    }


# Vercel Python serverless handler
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
        self.wfile.write(json.dumps({"status": "ok", "endpoint": "/api/chat", "model": MODEL}).encode("utf-8"))
