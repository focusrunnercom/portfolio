/**
 * Vercel Edge Function: /api/chat
 * DeepSeek-powered lead qualification for med spa patient acquisition.
 * Converts from Python to JS Edge Function for reliable Vercel builds.
 *
 * Input:  POST { messages, userData: {name, phone, practice, niche, volume} }
 * Output: { reply, qualification, booking_link }
 */
export const config = {
  runtime: 'edge',
};

const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const API_BASE = process.env.OPENAI_API_BASE || 'https://api.deepseek.com/v1';
const MODEL = process.env.CHAT_MODEL || 'deepseek-chat';
const AI_TIMEOUT_MS = 15000; // 15s timeout for AI calls

function buildSystemPrompt(userData) {
  const name = userData.name || 'there';
  const phone = userData.phone || 'unknown';
  const practice = userData.practice || 'unknown';
  const niche = userData.niche || 'med spa';
  const volume = userData.volume || 'unknown';

  return `You are a medical spa patient concierge for a premium aesthetics practice. Your role is to qualify leads by understanding their needs, budget, and timeline through natural conversation.

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

At the END of the conversation (when you have enough to score), append a JSON block wrapped in \`\`\`json:
\`\`\`json
{
  "score": <0-100>,
  "classification": "qualified|nurture|not_a_fit",
  "budget_tier": "premium|mid|budget",
  "service_interest": "<service name>",
  "timeline": "immediate|within_month|exploring",
  "summary": "<1-sentence lead summary for sales team>"
}
\`\`\`

The user is a med spa prospect who filled out a form. Here's what we already know about them:
- Name: ${name}
- Phone: ${phone}
- Practice: ${practice} (this is their OWN practice name — they are a med spa OWNER, not a patient)
- Niche: ${niche}
- Current patient volume: ${volume} per month

IMPORTANT: This person OWNS or runs a medical aesthetics practice. They are looking for a patient acquisition SYSTEM, not a treatment. Adapt your questions accordingly — ask about their practice's lead flow, conversion challenges, and growth goals. Do NOT treat them as a patient seeking treatment.`;
}

/**
 * Extract JSON qualification block from AI response.
 * Handles: ```json ... ```, bare JSON with leading whitespace, partial fragments.
 * Returns null if no valid JSON found.
 */
function parseQualification(text) {
  if (!text || typeof text !== 'string') return null;

  // Strategy 1: ```json ... ``` block (most common)
  const fencedMatch = text.match(/```(?:json)?\s*(\{[^`]*?\})\s*```/s);
  if (fencedMatch) {
    try {
      const parsed = JSON.parse(fencedMatch[1]);
      if (parsed && typeof parsed.score === 'number') return parsed;
    } catch (e) { /* fallthrough */ }
  }

  // Strategy 2: Bare JSON anywhere in text with a "score" field
  const bareMatch = text.match(/\{\s*"[^"]*"\s*:[\s\S]*?"score"\s*:\s*\d+[\s\S]*?\}/);
  if (bareMatch) {
    try {
      const parsed = JSON.parse(bareMatch[0]);
      if (parsed && typeof parsed.score === 'number') return parsed;
    } catch (e) { /* fallthrough */ }
  }

  // Strategy 3: Multi-line JSON fragment (model sometimes splits across lines)
  const lines = text.split('\n');
  let braceDepth = 0;
  let jsonStart = -1;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '{') {
        if (braceDepth === 0) jsonStart = i;
        braceDepth++;
      } else if (line[j] === '}') {
        braceDepth--;
        if (braceDepth === 0 && jsonStart >= 0) {
          const candidate = lines.slice(jsonStart, i + 1).join('\n');
          try {
            const parsed = JSON.parse(candidate);
            if (parsed && typeof parsed.score === 'number') return parsed;
          } catch (e) { /* not valid — keep looking */ }
          jsonStart = -1;
        }
      }
    }
  }

  return null;
}

/**
 * Fetch with an AbortController timeout.
 */
async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS, GET',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  // Health check
  if (request.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ok', endpoint: '/api/chat', model: MODEL }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  if (!DEEPSEEK_API_KEY) {
    return new Response(JSON.stringify({ error: 'API key not configured.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const messages = body.messages || [];
  const userData = body.userData || {};

  if (!messages.length) {
    return new Response(JSON.stringify({ error: 'messages array is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Build the full messages array
  const systemPrompt = buildSystemPrompt(userData);
  const fullMessages = [
    { role: 'system', content: systemPrompt },
    ...messages,
  ];

  try {
    const aiResponse = await fetchWithTimeout(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        messages: fullMessages,
        temperature: 0.7,
        max_tokens: 500,
      }),
    }, AI_TIMEOUT_MS);

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      return new Response(JSON.stringify({
        error: `AI API error ${aiResponse.status}: ${errorText.slice(0, 500)}`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const aiData = await aiResponse.json();
    const aiText = aiData.choices[0]?.message?.content || '';

    const qualification = parseQualification(aiText);

    // Strip the JSON block from the visible reply
    let reply = aiText.replace(/```(?:json)?\s*\{[\s\S]*?\}\s*```/g, '').trim();
    if (!reply) reply = aiText.trim();

    const bookingLink = qualification?.classification === 'qualified'
      ? 'https://focusrunner.com'
      : null;

    const responseData = {
      reply,
      qualification,
      booking_link: bookingLink,
    };

    return new Response(JSON.stringify(responseData), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    // Detect abort/timeout specifically
    if (err.name === 'AbortError') {
      return new Response(JSON.stringify({ error: 'AI API call timed out after 15 seconds' }), {
        status: 504,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }
    return new Response(JSON.stringify({ error: `AI API call failed: ${err.message}` }), {
      status: 502,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }
}
