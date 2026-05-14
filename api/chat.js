/**
 * Vercel Serverless Function: /api/chat
 * Lead qualification endpoint — called by the focusrunner-chat-widget.js
 *
 * Input:  POST { name, email, phone, time, page_url }
 *         Header: X-Client-Id — optional, resolves per-client AI config
 * Output: { reply, qualification, booking_link }
 *
 * Features:
 * - Per-client AI config (model, temperature, max_tokens) via KV
 * - AbortController timeout (15s) for DeepSeek API calls
 * - Multi-strategy JSON extraction (fenced block, bare JSON, multi-line fragment)
 * - Returns 504 on timeout instead of generic 502
 * - Validates required fields (name, phone) — returns 400 if missing
 */
// =============================================================================
// Configuration
// =============================================================================
import { kvGet } from './kv.js';
const AI_TIMEOUT_MS = 15000;

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

  return `You are a lead qualification assistant for FocusRunner, an AI marketing agency. Your job: analyze a new lead and determine their potential.

LEAD INFORMATION:
- Name: ${name}
- Phone: ${phone}
- Email: ${email}
- Preferred contact time: ${time}
- Source page: ${pageUrl}

At the end of your reply, output a JSON block with your assessment:
\`\`\`json
{
  "score": 0-100,
  "classification": "qualified|warm|cold",
  "summary": "<1-sentence lead summary for sales team>"
}
\`\`\`

Rules:
1. Keep your reply friendly and under 2 sentences — this is shown to the lead.
2. Always include the JSON block at the end.
3. Classification: qualified = has name + phone + clear interest; warm = has name + email; cold = partial info only.`;
}

/**
 * Multi-strategy JSON qualification extraction from AI response.
 * Strategy 1: \`\`\`json ... \`\`\` fenced block
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
    const clientId = new URL(request.url).searchParams.get('clientId') || '';
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

  const { name, email, phone, time, page_url } = body || {};

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

  const bookingLink = qualification?.classification === 'qualified'
    ? (aiConfig.bookingUrl || process.env.BOOKING_URL || 'https://focusrunner.io')
    : null;

  console.log(`[chat] Lead qualified: ${name} score=${qualification?.score ?? 'N/A'} class=${qualification?.classification ?? 'N/A'}`);

  return jsonResponse({
    reply,
    qualification,
    booking_link: bookingLink,
    lead_received: true,
  });
}
