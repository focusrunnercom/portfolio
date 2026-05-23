/**
 * POST /api/email/send — Send transactional email via Resend
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { to, subject, html, text, from, template, tags } = req.body;
  const apiKey = process.env.RESEND_API_KEY;

  if (!to) return res.status(400).json({ error: 'Missing "to" field' });

  const payload = {
    from: from || 'FocusRunner <leads@focusrunner.io>',
    to: Array.isArray(to) ? to : [to],
    subject: subject || 'Message from FocusRunner',
    tags: tags || [{ name: 'source', value: 'agency' }]
  };

  if (template) {
    payload.template = template;
  } else if (html) {
    payload.html = html;
    if (text) payload.text = text;
  } else if (text) {
    payload.text = text;
  } else {
    return res.status(400).json({ error: 'Missing html, text, or template' });
  }

  try {
    const response = await fetch('https://api.resend.com/emails', {
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
      return res.status(200).json({ success: true, id: data.id });
    }
    return res.status(response.status).json({ error: data });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}