/**
 * POST /api/email/webhook — Receive Resend webhook events
 * Events: delivered, opened, clicked, bounced, complained, failed
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const event = req.body;
  const type = event?.type || 'unknown';

  console.log(`[email-webhook] ${type} — ${event?.data?.email_id || 'no-id'}`);

  // Log to Paperclip agent inbox for processing
  try {
    await fetch('http://127.0.0.1:3100/api/agents/me/inbox-lite', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: `email.${type}`,
        emailId: event?.data?.email_id,
        from: event?.data?.from,
        to: event?.data?.to,
        subject: event?.data?.subject,
        timestamp: event?.created_at
      })
    }).catch(() => {}); // Silently fail if Paperclip is down
  } catch (_) {}

  // Always return 200 to acknowledge webhook
  return res.status(200).json({ received: true, type });
}