/**
 * Vercel Serverless Function: /api/leads
 * Returns captured leads with qualification scores.
 * Protected by ?token= query param matching ADMIN_API_KEY env var.
 *
 * GET /api/leads?token=...&limit=50&offset=0
 *
 * Reads from Vercel KV (leads list) with fallback to demo data.
 * No local ESM imports — fully self-contained.
 */
export const config = {
  runtime: 'edge',
};

const ADMIN_KEY = process.env.ADMIN_API_KEY || '';

/** Parse KV JSON, graceful on bad data */
function safeParse(str) {
  if (!str) return null;
  try { return JSON.parse(str); } catch { return null; }
}

/** Format lead for display */
function formatLead(raw, i) {
  const data = typeof raw === 'string' ? safeParse(raw) : raw;
  if (!data) return null;
  return {
    id: data.id || `lead_${i}`,
    name: data.name || 'Unknown',
    phone: data.phone || '',
    practice: data.practice || '',
    email: data.email || '',
    niche: data.niche || 'unknown',
    volume: data.volume || '',
    source: data.source || 'chat_widget',
    score: data.qualification?.score ?? 0,
    classification: data.qualification?.classification || 'unknown',
    budget_tier: data.qualification?.budget_tier || '',
    service_interest: data.qualification?.service_interest || '',
    timeline: data.qualification?.timeline || '',
    summary: data.qualification?.summary || '',
    message: data.message || '',
    created_at: data.created_at || data.timestamp || new Date().toISOString(),
  };
}

/** Try Vercel KV read */
async function tryKVRead(clientId) {
  let kvModule;
  try {
    kvModule = await import('@vercel/kv');
  } catch { return null; }

  try {
    const kv = kvModule.kv || kvModule.default?.kv;
    if (!kv) return null;
    const key = `leads:${clientId || 'client_default'}`;
    const raw = await kv.lrange(key, 0, 499);
    return (raw || []).map(formatLead).filter(Boolean);
  } catch { return null; }
}

/** Generate demo data when KV isn't available */
function generateDemoData(count) {
  const niches = ['med_spa', 'cosmetic_dentistry', 'plastic_surgery', 'hair_transplant'];
  const sources = ['chat_widget', 'lead_form'];
  const classifications = ['qualified', 'nurture', 'not_a_fit'];
  const statuses = ['new', 'contacted', 'qualified', 'closed'];

  return Array.from({ length: count }, (_, i) => {
    const daysAgo = Math.floor(Math.random() * 14);
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    const score = Math.floor(Math.random() * 100);
    const cls = score > 60 ? 'qualified' : score > 30 ? 'nurture' : 'not_a_fit';

    return {
      id: `demo_${i + 1}`,
      name: ['Miami MedSpa', 'Glow Aesthetics Miami', 'Elite Laser Center', 'Bella Derma', 'South Beach Cosmetic', 'Aura Skin Clinic', 'Prime Aesthetics', 'Luxe Dermatology', 'Vida Wellness Spa', 'Ocean MedSpa', 'Radiance Aesthetics', 'Pure Skin Studio', 'Eternal Youth Clinic', 'Sculpt Body Lab', 'Divine Beauty Lounge'][i % 15] || `Demo Practice ${i}`,
      phone: `(305) ${String(200 + i).slice(0,3)}-${String(4000 + i).slice(0,4)}`,
      practice: ['Miami MedSpa & Wellness', 'Glow Aesthetics', 'Elite Laser Center', 'Bella Derma Clinic', 'South Beach Cosmetic Surgery', 'Aura Skin Clinic', 'Prime Aesthetics Lounge', 'Luxe Dermatology & Laser', 'Vida Wellness & Aesthetics', 'Ocean Med Spa', 'Radiance Aesthetics Studio', 'Pure Skin & Body', 'Eternal Youth Anti-Aging', 'Sculpt Body Contouring', 'Divine Beauty & Laser'][i % 15] || `Demo Practice ${i}`,
      email: `owner@practice${i}.com`,
      niche: niches[i % niches.length],
      volume: ['under_10', '10_30', '30_60', '60_plus'][i % 4],
      source: sources[i % 2],
      score,
      classification: cls,
      budget_tier: score > 70 ? 'premium' : score > 40 ? 'mid' : 'budget',
      service_interest: ['AI Patient Acquisition', 'Chatbot Lead Gen', 'SMS Automation', 'Full Pipeline'][i % 4],
      timeline: score > 70 ? 'immediate' : score > 40 ? 'within_month' : 'exploring',
      summary: `${cls === 'qualified' ? 'Strong fit' : cls === 'nurture' ? 'Needs follow-up' : 'Low priority'} — ${['high volume practice looking to scale', 'mid-sized practice exploring AI', 'new clinic seeking growth', 'established practice wanting automation'][i % 4]}`,
      message: '',
      created_at: d.toISOString(),
    };
  });
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (request.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  const clientId = url.searchParams.get('client_id') || 'client_default';
  const limit = parseInt(url.searchParams.get('limit')) || 50;
  const offset = parseInt(url.searchParams.get('offset')) || 0;

  // Auth check
  if (ADMIN_KEY && token !== ADMIN_KEY) {
    return new Response(JSON.stringify({ error: 'Unauthorized — provide ?token= in URL' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Try KV first
  let leads = await tryKVRead(clientId);

  // Fall back to demo data
  if (!leads || leads.length === 0) {
    leads = generateDemoData(50);
  }

  // Sort: most recent first
  leads.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const total = leads.length;
  const paginated = leads.slice(offset, offset + limit);

  return new Response(JSON.stringify({
    leads: paginated,
    total,
    offset,
    limit,
    source: leads[0]?.id?.startsWith('demo_') ? 'demo' : 'kv',
  }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}
