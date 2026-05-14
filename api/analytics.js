/**
 * Vercel Edge Function: /api/analytics/:clientId
 *
 * Returns per-client analytics data from Vercel KV daily aggregates.
 * Protected by X-Analytics-Key header.
 *
 * Endpoints:
 *   GET /api/analytics/:clientId/summary   → Aggregate stats using daily counters
 *   GET /api/analytics/:clientId/leads     → Recent lead events (paginated)
 *   GET /api/analytics/:clientId/timeline  → Daily aggregates for charting
 *   GET /api/analytics/:clientId/funnel    → Conversion funnel (chat→qualified→submitted)
 *
 * Query params:
 *   ?days=N      — Number of days to aggregate (default: 7, max: 90)
 *   ?limit=N     — Max events to return (default: 50, max: 500)
 *   ?since=ISO   — Return events after this timestamp
 */
// Vercel Serverless Function (local ESM imports supported natively)
import { kvLrange, kvLlen, kvGet } from './kv.js';

const ANALYTICS_KEY = process.env.ANALYTICS_KEY || process.env.ADMIN_API_KEY || '';

function unauthorized(message = 'Unauthorized') {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

/**
 * Read a daily aggregate counter from KV.
 */
async function readDailyCounter(clientId, dateKey, counter) {
  const key = `analytics:${clientId}:daily:${dateKey}:${counter}`;
  const val = await kvGet(key);
  return val !== null ? parseInt(val, 10) : 0;
}

/**
 * Read all counters for a given date and client.
 */
async function readDailyCounters(clientId, dateKey) {
  const [total, leadCaptured, leadSubmitted, sourceChat, sourceForm, qualQualified, qualNurture, qualNotAFit] =
    await Promise.all([
      readDailyCounter(clientId, dateKey, 'total'),
      readDailyCounter(clientId, dateKey, 'lead_captured'),
      readDailyCounter(clientId, dateKey, 'lead_submitted'),
      readDailyCounter(clientId, dateKey, 'source:chat_widget'),
      readDailyCounter(clientId, dateKey, 'source:lead_form'),
      readDailyCounter(clientId, dateKey, 'classification:qualified'),
      readDailyCounter(clientId, dateKey, 'classification:nurture'),
      readDailyCounter(clientId, dateKey, 'classification:not_a_fit'),
    ]);

  return {
    total,
    lead_captured: leadCaptured,
    lead_submitted: leadSubmitted,
    sources: {
      chat_widget: sourceChat,
      lead_form: sourceForm,
    },
    classifications: {
      qualified: qualQualified,
      nurture: qualNurture,
      not_a_fit: qualNotAFit,
    },
  };
}

export default async function handler(request) {
  // CORS preflight
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, X-Analytics-Key',
      },
    });
  }

  // Auth check
  const authHeader = request.headers.get('x-analytics-key') || request.headers.get('x-admin-key');
  if (ANALYTICS_KEY && authHeader !== ANALYTICS_KEY) {
    return unauthorized('Missing or invalid analytics key');
  }

  const url = new URL(request.url);
  const pathParts = url.pathname.split('/').filter(Boolean);

  // Path: api/analytics/{clientId}/{action?}
  if (pathParts.length < 3) {
    return jsonResponse({ error: 'Client ID required' }, 400);
  }

  const clientId = pathParts[2];
  const action = pathParts[3] || 'summary';
  const days = Math.min(parseInt(url.searchParams.get('days') || '7'), 90);
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 500);
  const since = url.searchParams.get('since');

  const eventKey = `analytics:${clientId}:events`;

  try {
    switch (action) {
      // === SUMMARY ===
      case 'summary': {
        const total = await kvLlen(eventKey);

        // Build daily counter data for the period
        const now = new Date();
        const dailyCounters = [];
        let periodTotal = 0;
        let periodSources = { chat_widget: 0, lead_form: 0, other: 0 };
        let periodClassifications = { qualified: 0, nurture: 0, not_a_fit: 0 };

        for (let i = 0; i < days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateKey = d.toISOString().slice(0, 10).replace(/-/g, '');
          const counters = await readDailyCounters(clientId, dateKey);

          dailyCounters.push({
            date: dateKey,
            ...counters,
          });

          periodTotal += counters.total;
          periodSources.chat_widget += counters.sources.chat_widget;
          periodSources.lead_form += counters.sources.lead_form;
          periodClassifications.qualified += counters.classifications.qualified;
          periodClassifications.nurture += counters.classifications.nurture;
          periodClassifications.not_a_fit += counters.classifications.not_a_fit;
        }

        return jsonResponse({
          clientId,
          total_events: total,
          period: { days },
          totals: {
            events: periodTotal,
            sources: periodSources,
            classifications: periodClassifications,
          },
          daily: dailyCounters,
        });
      }

      // === LEADS (raw events) ===
      case 'leads': {
        const events = await kvLrange(eventKey, 0, limit - 1);
        let filtered = events;

        if (since) {
          const sinceTs = new Date(since).getTime();
          filtered = events.filter((e) => new Date(e.timestamp).getTime() > sinceTs);
        }

        return jsonResponse({
          clientId,
          total: filtered.length,
          events: filtered,
        });
      }

      // === TIMELINE (daily aggregates for charting) ===
      case 'timeline': {
        const now = new Date();
        const timelineData = [];

        for (let i = 0; i < days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateKey = d.toISOString().slice(0, 10).replace(/-/g, '');
          const counters = await readDailyCounters(clientId, dateKey);

          timelineData.push({
            date: dateKey,
            events: counters.total,
            lead_captured: counters.lead_captured,
            lead_submitted: counters.lead_submitted,
            qualified: counters.classifications.qualified,
            sources: counters.sources,
          });
        }

        return jsonResponse({
          clientId,
          days,
          timeline: timelineData,
        });
      }

      // === FUNNEL (conversion funnel) ===
      case 'funnel': {
        const now = new Date();
        let totalChatStarted = 0;
        let totalQualified = 0;
        let totalSubmitted = 0;

        for (let i = 0; i < days; i++) {
          const d = new Date(now);
          d.setDate(d.getDate() - i);
          const dateKey = d.toISOString().slice(0, 10).replace(/-/g, '');
          const counters = await readDailyCounters(clientId, dateKey);
          totalChatStarted += counters.lead_captured;
          totalQualified += counters.classifications.qualified;
          totalSubmitted += counters.lead_submitted;
        }

        const funnel = {
          chat_started: totalChatStarted,
          qualified: totalQualified,
          lead_submitted: totalSubmitted,
        };

        // Conversion rates
        funnel.chat_to_qualified_pct = totalChatStarted > 0
          ? Math.round((totalQualified / totalChatStarted) * 100)
          : 0;
        funnel.qualified_to_submitted_pct = totalQualified > 0
          ? Math.round((totalSubmitted / totalQualified) * 100)
          : 0;
        funnel.chat_to_submitted_pct = totalChatStarted > 0
          ? Math.round((totalSubmitted / totalChatStarted) * 100)
          : 0;

        return jsonResponse({
          clientId,
          days,
          funnel,
        });
      }

      default:
        return jsonResponse({ error: `Unknown action: ${action}` }, 400);
    }
  } catch (err) {
    return jsonResponse({ error: `Analytics error: ${err.message}` }, 500);
  }
}
