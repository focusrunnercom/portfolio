/**
 * Vercel Serverless Function: /api/direct-qualify
 * DeepSeek-independent lead qualification endpoint.
 *
 * Zero external API calls. Zero dependencies. Zero AI.
 * Hardcoded 3-question qualification flow:
 *   1. Name + Practice name
 *   2. Monthly patient volume
 *   3. Current ad spend
 *
 * Input:  POST { message, name?, phone?, email?, practice?, volume?, spend? }
 * Output: { response, score, next_action }
 *
 * Score logic:
 *   practice + volume >= 50  → hot   → book_call
 *   practice + volume >= 10  → warm  → send_info
 *   else                     → cold  → drip
 *
 * Override: if all fields are provided (name, practice, volume, spend),
 * the endpoint returns classification immediately.
 *
 * Response times: <500ms (no network calls).
 */

// ─── Configuration ──────────────────────────────────────────────────────────

const STEP_MESSAGES = {
  greeting: "👋 Hi! I'm FocusRunner AI. Quick 3 questions to see if we can help you grow.",
  ask_practice:
    "First — what's your **practice name** and what **services** do you offer? (e.g., 'Miami Rejuvenation Spa — Botox, fillers, laser')",
  ask_volume:
    "How many **new patients** do you get per month? Rough estimate is fine.",
  ask_spend:
    "What are you currently spending on **ads & marketing** per month?",
  hot: "🔥 You're a great fit! Our team will reach out to book a strategy call within 24 hours. In the meantime, check out focusrunner.io/case-studies",
  warm:
    "👍 You look like a solid prospect. I'm sending info to your email with a few case studies from similar practices. Our team will follow up within 48 hours.",
  cold:
    "Thanks for your interest! We've noted your details. When you're ready to scale your patient acquisition, reach out anytime at hello@focusrunner.com.",
};

const SCORE_THRESHOLDS = {
  hot: { minVolume: 50 },
  warm: { minVolume: 10 },
};

// ─── Scoring Engine ────────────────────────────────────────────────────────

/**
 * Determine score tier and next action from lead data.
 * @param {{ practice?: string, volume?: number|string, spend?: number|string }} lead
 * @returns {{ score: 'hot'|'warm'|'cold', next_action: 'book_call'|'send_info'|'drip' }}
 */
function qualify(lead) {
  const volume = parseInt(String(lead.volume || '0'), 10) || 0;
  const hasPractice = !!(lead.practice || '').trim();

  // Hot: has a practice AND volume >= 50
  if (hasPractice && volume >= SCORE_THRESHOLDS.hot.minVolume) {
    return { score: 'hot', next_action: 'book_call' };
  }

  // Warm: has a practice AND volume >= 10
  if (hasPractice && volume >= SCORE_THRESHOLDS.warm.minVolume) {
    return { score: 'warm', next_action: 'send_info' };
  }

  // Cold: no practice info or very low volume
  return { score: 'cold', next_action: 'drip' };
}

// ─── Conversation State Machine ────────────────────────────────────────────

/**
 * Map conversation step to the next question or final response.
 * Returns { response, score?, next_action?, requires_input? }
 */
function processMessage(message, state) {
  // State fields: step, name, practice, volume, spend
  const step = (state && state.step) || 'greeting';
  const name = (state && state.name) || '';
  const practice = (state && state.practice) || '';
  const volume = (state && state.volume) || '';
  const spend = (state && state.spend) || '';

  // Parse incoming message if provided
  const input = (message || '').trim();

  switch (step) {
    case 'greeting':
      return {
        response: STEP_MESSAGES.greeting + '\n\n' + STEP_MESSAGES.ask_practice,
        next_step: 'ask_volume',
        requires_input: true,
        field: 'practice',
      };

    case 'ask_volume':
      // Input should contain practice name — save it
      return {
        response: STEP_MESSAGES.ask_volume,
        next_step: 'ask_spend',
        requires_input: true,
        field: 'volume',
      };

    case 'ask_spend':
      return {
        response: STEP_MESSAGES.ask_spend,
        next_step: 'done',
        requires_input: true,
        field: 'spend',
      };

    case 'done': {
      const result = qualify({ practice, volume, spend: input || spend });
      return {
        response: STEP_MESSAGES[result.score],
        score: result.score,
        next_action: result.next_action,
        next_step: 'complete',
        requires_input: false,
      };
    }

    case 'complete':
      return {
        response: 'Already submitted! Our team will reach out.',
        score: 'cold',
        next_action: 'drip',
        next_step: 'complete',
        requires_input: false,
      };

    default:
      return {
        response: STEP_MESSAGES.greeting,
        next_step: 'ask_volume',
        requires_input: true,
        field: 'practice',
      };
  }
}

/**
 * Handle a complete submission (all fields provided at once).
 * Used when the widget sends all data in one shot or for testing.
 */
function handleDirectSubmission(body) {
  const { name, practice, volume, spend } = body;
  const result = qualify({ practice, volume, spend });
  return {
    response: STEP_MESSAGES[result.score],
    score: result.score,
    next_action: result.next_action,
    data_received: {
      name: name || '',
      practice: practice || '',
      volume: parseInt(String(volume || '0'), 10) || 0,
      spend: spend || '',
    },
  };
}

// ─── HTTP Helpers ──────────────────────────────────────────────────────────

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

// ─── Handler ───────────────────────────────────────────────────────────────

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
    return jsonResponse({
      status: 'ok',
      endpoint: '/api/direct-qualify',
      version: '1.0.0',
      mode: 'no-external-deps',
      score_logic: 'practice + volume >= 50 → hot, >= 10 → warm, else cold',
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

  const { message, name, practice, volume, spend, phone, email } = body || {};

  // Check for direct submission (all fields provided)
  if (name || practice || volume || spend) {
    // If we have at least practice AND volume, do a direct qualification
    if (practice && volume) {
      const result = handleDirectSubmission(body);
      return jsonResponse(result);
    }
  }

  // Conversational flow (stateful)
  const state = body.state || {};
  const result = processMessage(message || '', state);

  return jsonResponse(result);
}
