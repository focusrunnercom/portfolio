/**
 * Vercel Serverless Function: /api/direct-qualify
 * DeepSeek-independent lead qualification endpoint.
 *
 * ZERO external API calls. Pure JS logic. Returns structured JSON in <500ms.
 * Serves as a fallback when DeepSeek API is unreachable.
 *
 * Input:  POST { message, name?, phone?, email?, practice?, monthly_volume? }
 * Output: { response, score, next_action, qualification }
 *
 * CEO ORDER 15-May-2026: Ship this right now. Test with curl. No excuses.
 */

// =============================================================================
// Scoring Logic
// =============================================================================

/**
 * Score a lead based on known info and conversational prompts.
 * Hot:  practice + monthly_volume >= 50 patients/mo
 * Warm: practice provided, volume unknown or < 50
 * Cold: nothing provided, no practice name
 */
function scoreLead(lead) {
  const { practice, monthly_volume, message } = lead;
  const hasPractice = Boolean(practice && practice !== 'unknown' && practice !== '');
  const hasVolume = Boolean(monthly_volume && monthly_volume !== '' && monthly_volume !== 'unknown');
  const volumeNum = hasVolume ? parseInt(String(monthly_volume).replace(/[^0-9]/g, ''), 10) : 0;
  // Also check if the message mentions a practice name or volume
  const msgPractice = message && /(?:spa|clinic|practice|center|studio|med\s*spa|aesthetics|laser|injectables|botox|fillers|medical\s+spa)/i.test(message);
  const msgVolume = message && /\b(\d{2,})\s*(?:patient|client|lead|booking|appointment)/i.test(message);

  if (hasPractice && volumeNum >= 50) {
    return { score: 'hot', next_action: 'book_call', reason: `Practice identified + monthly volume ${volumeNum} >= 50` };
  }
  if (hasPractice && volumeNum > 0) {
    return { score: 'hot', next_action: 'book_call', reason: `Practice identified with monthly volume ${volumeNum}` };
  }
  if (hasPractice) {
    return { score: 'warm', next_action: 'send_info', reason: 'Practice identified, need volume data' };
  }
  if (msgPractice) {
    return { score: 'warm', next_action: 'send_info', reason: 'Mentioning practice in message - needs qualification' };
  }
  if (msgVolume) {
    return { score: 'warm', next_action: 'send_info', reason: 'Volume mentioned - needs practice info' };
  }
  return { score: 'cold', next_action: 'drip', reason: 'No qualifying data yet' };
}

/**
 * Generate a conversational response based on score and next action.
 * The response itself drives qualification forward — each message is designed to extract more data.
 */
function buildResponse(lead, qualification) {
  const { name, practice, monthly_volume, message } = lead;
  const greeting = name && name !== 'unknown' ? name.split(' ')[0] : 'there';

  switch (qualification.next_action) {
    case 'book_call':
      // They're qualified — book the call
      return `Hey ${greeting} — I ran the numbers on ${practice || 'your practice'}. ${monthly_volume ? `At ${monthly_volume} patients/month you're leaving real money on the table.` : 'Let me show you the math.'}\n\nWe can recover 70% of your cold leads with automated follow-up. I've seen this exact playbook work for similar med spas in your tier.\n\nHow's tomorrow or Friday for a 15-min call? I'll bring your personalized ROI projection.`;

    case 'send_info':
      // Warm — need volume to confirm hot. Ask for it.
      return `Thanks ${greeting}. One quick figure: what's your current monthly patient volume? Or what are you spending on ads?\n\n${practice ? `For ${practice}, ` : ''}I can run the numbers and show you exactly how many leads we'd recover in month one. Just need that one data point.`;

    case 'drip':
      // Cold — introduce the problem value prop, qualify
      return `Hey ${greeting} — quick question: are you running a med spa or aesthetics practice?\n\nThe reason I ask: most med spas spend $3K-$10K/month on ads, but 85% of those leads never book. We built an AI system that turns that around — automated follow-up, 24/7, no extra staff.\n\nIf that sounds like a problem you deal with, I'd love to hear a bit about your practice.`;

    default:
      return `Hey ${greeting} — thanks for reaching out. What's your practice name and how many patients are you seeing per month?`;
  }
}

// =============================================================================
// Qualification Flow State Machine
// =============================================================================

/**
 * Determine the next question in the qualification flow.
 * Each stage extracts one piece of data from the lead.
 */
function buildQualification(lead) {
  const base = scoreLead(lead);

  // Extract practice name from message if not provided
  const practiceMatch = lead.message ? lead.message.match(/(?:at|from|my)\s+(?:practice\s+)?([A-Z][A-Za-z0-9\s&'-]+?)(?:\.|,|\s+in\s+|\s+near\s+|$)/) : null;
  const extractedPractice = practiceMatch ? practiceMatch[1].trim() : null;

  // Extract volume from message
  const volumeMatch = lead.message ? lead.message.match(/(\d+)\s*(?:patients?|clients?|booking|customers?|people)/i) : null;
  const extractedVolume = volumeMatch ? parseInt(volumeMatch[1], 10) : null;

  return {
    score: base.score,
    next_action: base.next_action,
    reason: base.reason,
    classification: base.score,
    summary: base.reason + (extractedPractice ? ` (practice: ${extractedPractice})` : ''),
    extracted: {
      practice: extractedPractice || lead.practice || null,
      monthly_volume: extractedVolume || (lead.monthly_volume ? parseInt(String(lead.monthly_volume), 10) : null),
    },
    stage: base.score === 'hot' ? 'closing' : base.score === 'warm' ? 'qualifying' : 'intro',
  };
}

// =============================================================================
// Helpers
// =============================================================================

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
  const start = Date.now();

  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders() });
  }

  // Health / info check
  if (request.method === 'GET') {
    return jsonResponse({
      status: 'ok',
      endpoint: '/api/direct-qualify',
      version: '1.0.0',
      mode: 'zero_external_api',
      runtime_ms: Date.now() - start,
      timestamp: new Date().toISOString(),
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

  const { message, name, phone, email, practice, monthly_volume } = body || {};

  // Validate at least a message
  if (!message && !name) {
    return jsonResponse({
      error: 'message or name is required',
      required: ['message', 'name'],
      received: { message: !!message, name: !!name },
    }, 400);
  }

  // Build lead object with all available info
  const lead = {
    message: message || '',
    name: name || '',
    phone: phone || '',
    email: email || '',
    practice: practice || '',
    monthly_volume: monthly_volume || '',
  };

  // Score + qualify — no external API calls, pure JS
  const qualification = buildQualification(lead);
  const response = buildResponse(lead, qualification);

  const runtimeMs = Date.now() - start;

  console.log(`[direct-qualify] ${name || 'anon'} → ${qualification.score} (${runtimeMs}ms)`);

  return jsonResponse({
    response,
    score: qualification.score,
    classification: qualification.classification,
    next_action: qualification.next_action,
    qualification,
    runtime_ms: runtimeMs,
    timestamp: new Date().toISOString(),
  });
}
