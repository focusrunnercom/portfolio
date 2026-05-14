/**
 * Vercel Serverless Function: /api/chat
 * Lead qualification endpoint — called by the focusrunner-chat-widget.js
 *
 * Input:  POST { name, email, phone, time, page_url, practice, niche, volume }
 *         Header: X-Client-Id — optional, resolves per-client AI config
 * Output: { reply, qualification, booking_link }
 *
 * Features:
 * - Per-client AI config (model, temperature, max_tokens) via KV
 * - AbortController timeout (15s) for DeepSeek API calls
 * - Multi-strategy JSON extraction (fenced block, bare JSON, multi-line fragment)
 * - Returns 504 on timeout instead of generic 502
 * - Validates required fields (name, phone) — returns 400 if missing
 * - Real-time email notification on hot/warm leads via Resend
 */
// =============================================================================
// Configuration
// =============================================================================
import { kvGet } from './kv.js';
import { notifyLead } from './lib/lead-notify.js';
import { record as storeLead } from './lib/notify.js';

const AI_TIMEOUT_MS = 15000;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';

/**
 * Resolve AI configuration for a client.
 * Falls back to env vars if no client config found.
 */
async function resolveAIConfig(clientId) {
  // Default config from env
  const config = {
    apiKey: process.env.DEEPSEEK_API_KEY || '',
    apiBase: process.env.OPENAI_API_BASE || 'https://api.deepseek.com/v1',
    model: process.env.CHAT_MODEL || 'deepseek-chat',
    temperature: 0.7,
    maxTokens: 500,
    bookingUrl: process.env.BOOKING_URL || 'https://focusrunner.io',
  };

  if (!clientId) return config;

  try {
    const clientConfig = await kvGet(`client:${clientId}`);
    if (clientConfig && clientConfig.active !== false && clientConfig.ai) {
      config.model = clientConfig.ai.model || config.model;
      config.temperature = clientConfig.ai.temperature ?? config.temperature;
      config.maxTokens = clientConfig.ai.max_tokens ?? config.maxTokens;
      config.bookingUrl = clientConfig.booking_url || config.bookingUrl;
      // If client has a per-client API key, use it
      if (clientConfig.crm?.api_key && clientConfig.crm?.api_key !== '__PENDING_SETUP__') {
        config.apiKey = clientConfig.crm.api_key;
      }
      console.log(`[chat] Using per-client config for ${clientId}: model=${config.model} temp=${config.temperature}`);
    }
  } catch (err) {
    console.warn(`[chat] Failed to load client config for ${clientId}:`, err.message);
  }

  return config;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Fetch with an AbortController timeout.
 * Throws on timeout — caller catches and returns 504.
 */
async function fetchWithTimeout(url, options, timeoutMs = AI_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Build the system prompt for lead qualification.
 */
function buildSystemPrompt(leadData) {
  const name = leadData.name || 'there';
  const phone = leadData.phone || 'unknown';
  const email = leadData.email || 'unknown';
  const time = leadData.time || 'unknown';
  const pageUrl = leadData.page_url || 'unknown';
  const practice = leadData.practice || 'a med spa';
  const niche = leadData.niche || 'med spa services';
  const volume = leadData.volume || 'some';

  return `You are a senior marketing consultant at FocusRunner. You only talk to med spa owners — the person who signs the checks.

YOUR JOB: Figure out if this med spa owner is a fit for what we do. Nothing else. No small talk. No fluff.

THE PROBLEM THEY HAVE (state it, don't ask about it):
They spend $3K-$10K/month on Meta ads. 85% of those leads go cold — nobody follows up at 2AM on Saturday. A booked patient is worth $2K-$5K lifetime. Every cold lead is cash on the table.

TALK TO THEM LIKE THIS:
- "I've seen this a hundred times. What are you spending on ads right now?"
- "Out of 100 leads, how many actually book?"
- "What's a booked patient worth to you in revenue?"
- No buzzwords. No "revolutionary AI". No "paradigm shift." Just math.

SCORING (internal, invisible to them — compute silently):
1. Ad Spend: $3K-$5K=20pts, $5K-$10K=30pts, $10K+=35pts, under $3K=5pts
2. Booking Rate: under 10%=35pts, 10-15%=25pts, 15-20%=10pts, 20%+=5pts
3. Timeline: ASAP=30pts, this quarter=20pts, exploring=5pts
Total: 0-100

CONVERSATION ARC (keep it tight — 3-4 messages max):
1. Hit them with the problem they already feel but can't solve
2. Ask ad spend + booking rate
3. Ask timeline
4. Close: "Let me show you the math" + ask for booking

TONE RULES:
- Direct. Minimal. No emoji. No exclamation marks.
- Numbers win arguments. "If you're spending $5K/mo and booking 8%, you're burning $4,600."
- Never pitch. Never sell. Consult.
- If they're under $3K ad spend or timeline >6 months, be honest: "You're not ready yet."

KNOWN INFO (use this, don't ask for it again):
- Name: ${name}
- Phone: ${phone}
- Email: ${email}
- Practice: ${practice}
- Niche: ${niche}
- Current patients/mo: ${volume}

OUTPUT FORMAT at the very end (keep it silent — append after your last message):
\`\`\`json
{
  "score": <0-100>,
  "classification": "hot|warm|cold",
  "ad_spend_tier": "premium|mid|low",
  "service_focus": "<main service from conversation>",
  "timeline": "immediate|this_quarter|exploring",
  "summary": "<1-sentence summary for sales team>",
  "booking_link": "https://focusrunner.com/book-demo"
}
\`\`\``;
}

/**
 * Multi-strategy JSON qualification extraction from AI response.
 * Strategy 1: ```json ... ``` fenced block
 * Strategy 2: Bare JSON object with "score" field
 * Strategy 3: Multi-line brace-balanced fragment
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

  // Strategy 3: Multi-line JSON fragment — walk lines tracking brace depth
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

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: corsHeaders(),
  });
}

// =============================================================================
// Handler
// =============================================================================

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  // Health check
  if (request.method === 'GET') {
    const url = request.url.startsWith('http') ? new URL(request.url) : new URL(request.url, 'https://focusrunner.io');
    const clientId = url.searchParams.get('clientId') || '';
    return jsonResponse({
      status: 'ok',
      endpoint: '/api/chat',
      model: process.env.CHAT_MODEL || 'deepseek-chat',
      client_config: clientId ? `resolved for: ${clientId}` : 'none (using defaults)',
    });
  }

  if (request.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405);
  }

  // Parse body
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { name, email, phone, time, page_url, practice, niche, volume } = body || {};

  // Validate required fields
  if (!name || !phone) {
    return jsonResponse({
      error: 'name and phone are required',
      required: ['name', 'phone'],
      received: { name: !!name, email: !!email, phone: !!phone },
    }, 400);
  }

  // Resolve per-client AI config from X-Client-Id header
  const clientId = request.headers.get('x-client-id') || '';
  const aiConfig = await resolveAIConfig(clientId);

  // Check AI API key
  if (!aiConfig.apiKey) {
    console.warn('[chat] No AI API key configured — skipping AI, storing lead only');
    return jsonResponse({
      reply: `Thanks ${name}! Our team will get back to you shortly.`,
      qualification: null,
      booking_link: null,
      lead_received: true,
    });
  }

  const leadData = { name, email, phone, time, page_url };
  const systemPrompt = buildSystemPrompt(leadData);

  const fullMessages = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `New lead: Name=${name}, Email=${email||'none'}, Phone=${phone||'none'}, Time=${time||'any'}` },
  ];

  let aiResponse;
  try {
    aiResponse = await fetchWithTimeout(`${aiConfig.apiBase}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiConfig.apiKey}`,
      },
      body: JSON.stringify({
        model: aiConfig.model,
        messages: fullMessages,
        temperature: aiConfig.temperature,
        max_tokens: aiConfig.maxTokens,
      }),
    });
  } catch (err) {
    // Timeout or network error
    if (err.name === 'AbortError') {
      console.error('[chat] AI API timeout after 15s');
      return jsonResponse({
        error: 'AI service timed out — lead stored for later processing',
        lead_received: true,
        name,
      }, 504);
    }
    return jsonResponse({
      error: `AI API error: ${err.message}`,
      lead_received: true,
      name,
    }, 502);
  }

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text().catch(() => '(no body)');
    console.error(`[chat] AI API error ${aiResponse.status}: ${errorText.slice(0, 300)}`);
    return jsonResponse({
      error: `AI API error ${aiResponse.status}`,
      lead_received: true,
      name,
    }, 502);
  }

  const aiData = await aiResponse.json();
  const aiText = aiData.choices?.[0]?.message?.content || '';

  const qualification = parseQualification(aiText);

  // Strip JSON block from visible reply
  let reply = aiText.replace(/```json\s*\{.*?\}\s*```/gs, '').trim();
  if (!reply) reply = aiText.trim();
  // Truncate to keep response tight
  if (reply.length > 300) reply = reply.slice(0, 297) + '...';

  const bookingLink = qualification?.classification === 'hot'
    ? (aiConfig.bookingUrl || process.env.BOOKING_URL || 'https://focusrunner.io')
    : null;

  console.log(`[chat] Lead qualified: ${name} score=${qualification?.score ?? 'N/A'} class=${qualification?.classification ?? 'N/A'}`);

  // === EMAIL NOTIFICATION: alert the team in real-time ===
  // Only send for hot/warm/qualified leads (skips cold/unknown)
  if (qualification && qualification.classification !== 'cold') {
    const leadPayload = {
      name: name || 'Anonymous',
      email: email || '',
      phone: phone || '',
      practice: practice || '',
      niche: niche || '',
      volume: volume || '',
      qualification,
      source: 'chat_widget',
    };
    notifyLead(leadPayload).catch(err =>
      console.error('[chat] Email notification failed:', err.message)
    );
  }

  // === IN-MEMORY STORE: always store for live dashboard ===
  storeLead({
    name: name || 'Anonymous',
    email: email || '',
    phone: phone || '',
    practice: practice || '',
    niche: niche || '',
    volume: volume || '',
    qualification,
    source: 'chat_widget',
  });

  return jsonResponse({
    reply,
    qualification,
    booking_link: bookingLink,
    lead_received: true,
  });
}
