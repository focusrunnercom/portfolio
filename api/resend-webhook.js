/**
 * Vercel Serverless Function: /api/resend-webhook
 * Receives Resend delivery events (bounced, complained, delivered, clicked, opened).
 * Logs critical events (bounced, complained) and stores for monitoring.
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405).end('Method Not Allowed');
    return;
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const event = body?.type || body?.event || 'unknown';
    const data = body?.data || {};

    switch (event) {
      case 'email.bounced':
        console.error(`[RESEND] BOUNCED: ${data.to || data.email} — ${data.reason || 'unknown reason'}`);
        break;
      case 'email.complained':
        console.error(`[RESEND] SPAM COMPLAINT: ${data.to || data.email} — IMMEDIATE ACTION REQUIRED`);
        break;
      case 'email.delivered':
        console.log(`[RESEND] Delivered: ${data.to || data.email}`);
        break;
      case 'email.clicked':
        console.log(`[RESEND] Clicked: ${data.to || data.email} → ${data.link || 'link'}`);
        break;
      case 'email.opened':
        // Silent — opens are unreliable due to Apple MPP
        break;
      default:
        console.log(`[RESEND] Event: ${event}`, JSON.stringify(data).slice(0, 200));
    }

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
  } catch (err) {
    console.error('[RESEND] Webhook error:', err.message);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true, error: 'logged' }));
  }
}
