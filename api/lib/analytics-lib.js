/**
 * Analytics Library — shared KV event logging for FocusRunner.
 *
 * Used by webhook.js and chat.js to log lead events into Vercel KV.
 * Extracted from analytics.js to fix the broken import cycle.
 *
 * Two event types:
 *   lead_captured  — fired by chat.js when the AI produces a qualification
 *   lead_submitted — fired by webhook.js when the lead/survey data is forwarded to GHL
 */

import { kvLpush, kvIncr } from '../kv.js';

/**
 * Log an analytics event for a client into Vercel KV.
 * Silently no-ops if KV is not configured.
 *
 * @param {string} clientId  — the client identifier
 * @param {object} event     — event payload with type, source, qualification, etc.
 */
export async function logAnalyticsEvent(clientId, event) {
  if (!clientId) return;

  const timestamp = new Date().toISOString();
  const dateKey = timestamp.slice(0, 10).replace(/-/g, '');
  const eventKey = `analytics:${clientId}:events`;
  const dailyPrefix = `analytics:${clientId}:daily:${dateKey}`;

  const enriched = {
    ...event,
    clientId,
    timestamp,
  };

  // 1. Append to the running event list
  await kvLpush(eventKey, enriched).catch(() => {});

  // 2. Increment daily counters — avoids O(N) timeline scanning
  const type = event.type || 'unknown';
  await kvIncr(`${dailyPrefix}:total`).catch(() => {});
  await kvIncr(`${dailyPrefix}:${type}`).catch(() => {});

  // 3. If this is a lead_captured event, also increment classification counter
  if (type === 'lead_captured' && event.qualification) {
    const cls = event.qualification.classification || 'unknown';
    await kvIncr(`${dailyPrefix}:classification:${cls}`).catch(() => {});
  }

  // 4. If this is a lead_submitted event, track source
  if (type === 'lead_submitted' && event.source) {
    const source = event.source.replace(/[^a-zA-Z0-9_-]/g, '_');
    await kvIncr(`${dailyPrefix}:source:${source}`).catch(() => {});
  }
}
