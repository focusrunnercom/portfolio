/**
 * Lead Storage — file-based lead persistence for Vercel Serverless.
 *
 * Uses /tmp/leads.json as a zero-infra storage layer.
 * Survives warm instances. All functions are fail-safe.
 *
 * Schema: { leads: Array<Lead> }
 *   Lead: { id, name, phone, email, practice, qualification, source, referral_source, timestamp, notified }
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { randomUUID } from 'crypto';

const STORAGE_PATH = '/tmp/leads.json';
const MAX_LEADS = 500;

/**
 * Read all stored leads. Returns empty array on failure.
 */
export function readLeads() {
  try {
    if (!existsSync(STORAGE_PATH)) return [];
    const raw = readFileSync(STORAGE_PATH, 'utf-8');
    const data = JSON.parse(raw);
    return Array.isArray(data.leads) ? data.leads : [];
  } catch (err) {
    console.warn('[lead-store] Failed to read leads:', err.message);
    return [];
  }
}

/**
 * Append a lead to the local file store.
 * Returns the lead ID on success, null on failure.
 *
 * @param {object} leadData — { name, phone, email, practice, qualification, source, referral_source }
 * @returns {string|null}
 */
export function appendLead(leadData) {
  try {
    const lead = {
      id: randomUUID(),
      name: String(leadData.name || '').slice(0, 200),
      phone: String(leadData.phone || '').slice(0, 30),
      email: String(leadData.email || '').slice(0, 254),
      practice: String(leadData.practice || '').slice(0, 200),
      qualification: leadData.qualification || null,
      source: leadData.source || 'unknown',
      referral_source: String(leadData.referral_source || '').slice(0, 100),
      timestamp: new Date().toISOString(),
      notified: false,
    };

    let leads = readLeads();
    leads.push(lead);

    // Trim to max
    if (leads.length > MAX_LEADS) {
      leads = leads.slice(-MAX_LEADS);
    }

    writeFileSync(STORAGE_PATH, JSON.stringify({ leads }, null, 2), 'utf-8');
    console.log(`[lead-store] Appended lead ${lead.id}: ${lead.name} (${lead.source})`);
    return lead.id;
  } catch (err) {
    console.error('[lead-store] Failed to append lead:', err.message);
    return null;
  }
}

/**
 * Mark a lead as notified.
 * @param {string} leadId
 */
export function markNotified(leadId) {
  try {
    const leads = readLeads();
    const idx = leads.findIndex(l => l.id === leadId);
    if (idx === -1) return;
    leads[idx].notified = true;
    writeFileSync(STORAGE_PATH, JSON.stringify({ leads }, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[lead-store] Failed to mark notified:', err.message);
  }
}
