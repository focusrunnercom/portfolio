/**
 * Vercel Serverless Function: /api/analytics
 * GET -> conversion funnel stats from /tmp/leads.json
 * Uses (req, res) callback style for Node.js Serverless Runtime.
 */
const fs = require('fs');
const path = require('path');

const LEADS_PATH = '/tmp/leads.json';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json',
};

function sendJson(res, data, status) {
  status = status || 200;
  res.writeHead(status, headers);
  return res.end(JSON.stringify(data, null, 2));
}

function loadLeads() {
  try {
    if (!fs.existsSync(LEADS_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(LEADS_PATH, 'utf-8');
    const parsed = JSON.parse(raw);
    // Handle both flat array and {leads: [...]} wrapper
    return Array.isArray(parsed) ? parsed : (parsed.leads || []);
  } catch (err) {
    return [];
  }
}

function getByDay(leads) {
  // Build last 7 days (UTC)
  const now = new Date();
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setUTCDate(d.getUTCDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    days.push(dateStr);
  }

  // Count leads per date
  const countMap = {};
  for (const lead of leads) {
    const ts = lead.timestamp || lead.created_at;
    if (ts) {
      const d = ts.slice(0, 10);
      countMap[d] = (countMap[d] || 0) + 1;
    }
  }

  return days.map(date => ({
    date,
    count: countMap[date] || 0,
  }));
}

module.exports = function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    return res.end();
  }
  if (req.method !== 'GET') {
    return sendJson(res, { error: 'Method not allowed' }, 405);
  }

  const leads = loadLeads();
  const totalLeads = leads.length;

  // Qualification stats
  const qualified = leads.filter(l => {
    const q = l.qualification;
    return q && typeof q.score === 'number' && q.score >= 50;
  });

  const hot = leads.filter(l => {
    const q = l.qualification;
    return q && q.classification === 'hot';
  });

  const withQualification = leads.filter(l => l.qualification !== null && l.qualification !== undefined);

  // By source
  const bySource = {};
  for (const lead of leads) {
    const src = lead.source || 'unknown';
    bySource[src] = (bySource[src] || 0) + 1;
  }

  // By day (last 7 days)
  const byDay = getByDay(leads);

  // Conversion rate: % of leads with qualification data
  const conversionRate = totalLeads > 0
    ? Math.round((withQualification.length / totalLeads) * 100)
    : 0;

  const result = {
    total_leads: totalLeads,
    qualified: qualified.length,
    hot: hot.length,
    by_source: bySource,
    by_day: byDay,
    conversion_rate: conversionRate,
    last_updated: new Date().toISOString(),
  };

  return sendJson(res, result);
};
