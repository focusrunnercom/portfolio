/**
 * POST /api/email/batch — Send up to 100 emails at once
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { emails } = req.body;
  const apiKey = process.env.RESEND_API_KEY;

  if (!emails || !Array.isArray(emails)) return res.status(400).json({ error: 'Missing "emails" array' });
  if (emails.length > 100) return res.status(400).json({ error: 'Max 100 emails per batch' });

  const payload = emails.map(e => ({
    from: e.from || 'FocusRunner <leads@focusrunner.io>',
    to: Array.isArray(e.to) ? e.to : [e.to],
    subject: e.subject || 'Message from FocusRunner',
    html: e.html,
    text: e.text,
    tags: e.tags || [{ name: 'source', value: 'agency-batch' }]
  }));

  try {
    const response = await fetch('https://api.resend.com/emails/batch', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'focusrunner/1.0'
      },
      body: JSON.stringify(payload)
    });

    const data = await response.json();
    if (response.ok) {
      return res.status(200).json({ success: true, count: emails.length, data });
    }
    return res.status(response.status).json({ error: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}