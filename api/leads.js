/**
 * Vercel Edge Function: /api/leads
 * Returns captured leads for the admin dashboard.
 * Protected by shared secret token for simplicity.
 */
export const config = {
  runtime: 'edge',
};

const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'focusrunner-admin-2026';
const GHL_API_KEY = process.env.GHL_API_KEY || '';
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID || '';

/**
 * Fetch leads from GoHighLevel API.
 */
async function fetchGHLContacts(page = 1, limit = 50) {
  if (!GHL_API_KEY) return [];

  const url = `https://rest.gohighlevel.com/v1/contacts/?locationId=${GHL_LOCATION_ID}&page=${page}&limit=${limit}&order=created_at_desc`;
  const response = await fetch(url, {
    headers: {
      'Authorization': `Bearer ${GHL_API_KEY}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    console.error(`GHL API error: ${response.status}`);
    return [];
  }

  const data = await response.json();
  return (data.contacts || []).map(c => ({
    id: c.id,
    name: c.name || c.firstName + ' ' + (c.lastName || ''),
    phone: c.phone || '',
    email: c.email || '',
    practice: c.customField?.practice_name || '',
    source: c.customField?.source || c.source || 'unknown',
    qualification_score: parseInt(c.customField?.qualification_score) || 0,
    qualification_class: c.customField?.qualification_class || 'unknown',
    budget_tier: c.customField?.budget_tier || 'unknown',
    service_interest: c.customField?.service_interest || '',
    timeline: c.customField?.timeline || 'unknown',
    summary: c.customField?.lead_summary || '',
    status: c.tags?.includes('qualified') ? 'qualified' : c.tags?.includes('contacted') ? 'contacted' : 'new',
    created_at: c.createdAt || new Date().toISOString(),
  }));
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  // Health check — no auth required
  if (request.method === 'GET' && new URL(request.url).pathname === '/api/leads') {
    // Check auth token
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || request.headers.get('Authorization')?.replace('Bearer ', '') || '';

    if (token !== ADMIN_TOKEN) {
      return new Response(JSON.stringify({ error: 'Unauthorized. Provide ?token=... or Authorization header.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      });
    }

    const leads = await fetchGHLContacts();

    const stats = {
      total: leads.length,
      qualified: leads.filter(l => l.qualification_score >= 70).length,
      warm: leads.filter(l => l.qualification_score >= 40 && l.qualification_score < 70).length,
      cold: leads.filter(l => l.qualification_score < 40).length,
      chat_sourced: leads.filter(l => l.source === 'focusrunner_chat' || l.source === 'chat').length,
      form_sourced: leads.filter(l => l.source === 'focusrunner_form' || l.source === 'form').length,
    };

    return new Response(JSON.stringify({ leads, stats }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}
