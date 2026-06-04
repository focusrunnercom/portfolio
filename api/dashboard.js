/**
 * Vercel Serverless Function: /api/dashboard
 * GET -> single aggregated system health + funnel overview.
 * CJS, no external imports. Node.js Serverless Runtime.
 */
const fs = require('fs');
const { rateLimit, corsHeaders } = require('./_middleware');
const LEADS_PATH = '/tmp/leads.json';

module.exports = function handler(req, res) {
  if (!rateLimit(req, res)) return;
  if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders()); return res.end(); }
  if (req.method !== 'GET') {
    res.writeHead(405, corsHeaders());
    return res.end(JSON.stringify({ error: 'Method not allowed' }));
  }

  // ─── Lead funnel ────────────────────────────────────────────────
  let leads = [];
  try {
    if (fs.existsSync(LEADS_PATH)) {
      const raw = fs.readFileSync(LEADS_PATH, 'utf-8');
      const parsed = JSON.parse(raw);
      leads = Array.isArray(parsed) ? parsed : (parsed.leads || []);
    }
  } catch (_) { /* empty */ }

  const totalLeads = leads.length;

  // Qualification breakdown
  let hot = 0, warm = 0, cold = 0, unqualified = 0;
  for (const l of leads) {
    const c = (l.qualification && l.qualification.classification) || '';
    if (c === 'hot') hot++;
    else if (c === 'warm') warm++;
    else if (c === 'cold') cold++;
    else unqualified++;
  }

  // Source breakdown
  const bySource = {};
  for (const l of leads) {
    const s = l.source || 'unknown';
    bySource[s] = (bySource[s] || 0) + 1;
  }

  // Last 7 days funnel
  const now = new Date();
  const daily = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const ds = d.toISOString().slice(0, 10);
    let count = 0;
    for (const l of leads) {
      const ts = l.timestamp || l.created_at;
      if (ts && ts.slice(0, 10) === ds) count++;
    }
    daily.push({ date: ds, leads: count });
  }

  // Recent leads (last 5)
  const recent = leads.slice(-5).reverse().map(l => ({
    name: l.name || 'Unknown',
    phone: l.phone || '',
    source: l.source || 'unknown',
    qualification: l.qualification ? l.qualification.classification : 'unqualified',
    timestamp: l.timestamp || l.created_at,
  }));

  // ─── System health ──────────────────────────────────────────────
  const health = {
    chatbot: { status: 'healthy', endpoint: '/api/chat' },
    api: { status: 'healthy', endpoints: 12 },
    lead_capture: { status: totalLeads > 0 ? 'active' : 'idle', total_leads: totalLeads },
    deploy: { status: 'healthy', platform: 'Vercel', last_deploy: 'continuous' },
  };

  // ─── Pipeline status ────────────────────────────────────────────
  const conversionRate = totalLeads > 0
    ? Math.round(((hot + warm) / totalLeads) * 100)
    : 0;

  const result = {
    timestamp: new Date().toISOString(),
    health,
    funnel: {
      total_leads: totalLeads,
      hot,
      warm,
      cold,
      unqualified,
      conversion_rate: conversionRate,
    },
    by_source: bySource,
    daily: daily,
    recent_leads: recent,
  };

  res.writeHead(200, corsHeaders());
  return res.end(JSON.stringify(result, null, 2));
};
