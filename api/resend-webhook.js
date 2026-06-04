/**
 * Vercel Serverless Function: /api/resend-webhook
 * Dedicated Resend email event webhook receiver.
 * Forwards delivery/bounce/complaint events to Paperclip.
 * CJS for Vercel Node 18.x Hobby compat.
 */

var { rateLimit, corsHeaders, parseBody } = require('./_middleware');

module.exports = async function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); return res.end(); }
  if (req.method !== 'POST') {
    res.writeHead(405, corsHeaders());
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  var body;
  try { body = await parseBody(req); }
  catch (e) {
    res.writeHead(400, corsHeaders());
    return res.end(JSON.stringify({ error: 'Invalid JSON body' }));
  }

  var eventType = body.type || 'unknown';
  var emailId = (body.data && body.data.email_id) || null;

  console.log('[resend-webhook] Event: ' + eventType + ' | Email: ' + emailId);

  // Forward to Paperclip for agent wake
  var PAPERCLIP_API_URL = process.env.PAPERCLIP_API_URL || 'http://127.0.0.1:3100';
  try {
    await fetch(PAPERCLIP_API_URL + '/api/agents/me/inbox-lite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'resend.' + eventType,
        emailId: emailId,
        from: body.data && body.data.from,
        to: body.data && body.data.to,
        subject: body.data && body.data.subject,
        timestamp: body.created_at,
      }),
    }).catch(function() {});
  } catch (_) {}

  res.writeHead(200, corsHeaders());
  return res.end(JSON.stringify({
    received: true,
    type: eventType,
    email_id: emailId,
  }));
};
