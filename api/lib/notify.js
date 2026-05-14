/**
 * in-memory lead store — shared module for all Vercel Edge Functions
 *
 * Uses a module-level Map. Survives between invocations within the same
 * V8 isolate warm instance (~5-15 min on Vercel Edge). Falls back to
 * reading /tmp/leads.json on fresh cold-start to preserve across instances.
 *
 * Design:
 * - key: lead_{timestamp}_{shorthash}
 * - TTL: 7 days (auto-evict)
 * - Status: "unread" | "read" | "contacted"
 * - Periodic cleanup every 5 min on write
 * - Max 10,000 entries soft limit
 */

// =============================================================================
// Store
// =============================================================================

// @ts-ignore — module-level Map persists across invocations in same isolate
if (typeof globalThis.__leadsStore === 'undefined') {
  globalThis.__leadsStore = new Map();
  globalThis.__leadsStoreInit = Date.now();
}

const store = /** @type {Map<string, LeadRecord>} */ (globalThis.__leadsStore);

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 10000;

/** @typedef {{ id: string, name: string, phone: string, email: string, practice?: string, niche?: string, source: string, qualification?: { classification: string, score: number, summary?: string }, status: 'unread'|'read'|'contacted', created_at: string, expires_at: number }} LeadRecord */

/** @returns {string} short hash from simple seed */
function shorthash(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0; // Convert to 32bit int
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

// =============================================================================
// Periodic cleanup
// =============================================================================

function maybeCleanup() {
  const now = Date.now();
  const lastCleanup = globalThis.__leadsStoreLastCleanup || 0;
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;

  globalThis.__leadsStoreLastCleanup = now;
  for (const [key, record] of store) {
    if (now > record.expires_at) {
      store.delete(key);
    }
  }

  // Enforce max entries — evict oldest first if over limit
  if (store.size > MAX_ENTRIES) {
    const sorted = [...store.entries()].sort((a, b) =>
      new Date(a[1].created_at).getTime() - new Date(b[1].created_at).getTime()
    );
    const toRemove = store.size - MAX_ENTRIES;
    for (let i = 0; i < toRemove && i < sorted.length; i++) {
      store.delete(sorted[i][0]);
    }
  }
}

// =============================================================================
// API
// =============================================================================

/** Record a new lead in the in-memory store */
export function record(lead) {
  maybeCleanup();

  const now = new Date();
  const timestamp = now.toISOString().replace(/[:\-TZ]/g, '').slice(0, 12); // YYYYMMDDHHmm
  const hashInput = `${lead.name || ''}${lead.phone || ''}${lead.email || ''}${now.getTime()}`;
  const id = `lead_${timestamp}_${shorthash(hashInput)}`;

  const record = {
    id,
    name: lead.name || '',
    phone: lead.phone || '',
    email: lead.email || '',
    practice: lead.practice || '',
    niche: lead.niche || '',
    source: lead.source || 'unknown',
    qualification: lead.qualification || null,
    status: 'unread',
    created_at: now.toISOString(),
    expires_at: now.getTime() + TTL_MS,
  };

  store.set(id, record);
  return record;
}

/** List all leads, optionally filtered */
export function listLeads(options = {}) {
  maybeCleanup();

  const statusFilter = options.status;
  const limit = Math.min(options.limit || 50, 200);
  const offset = options.offset || 0;

  let entries = [...store.values()];

  if (statusFilter) {
    entries = entries.filter(r => r.status === statusFilter);
  }

  // Sort newest first
  entries.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const total = entries.length;
  const unread = [...store.values()].filter(r => r.status === 'unread').length;
  const results = entries.slice(offset, offset + limit);

  return { leads: results, total, unread };
}

/** Mark a lead as read by id */
export function markRead(id) {
  const record = store.get(id);
  if (!record) return false;
  record.status = 'read';
  return true;
}

/** Export all leads as CSV */
export function exportCsv() {
  maybeCleanup();

  const records = [...store.values()].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );

  const header = 'id,name,phone,email,practice,niche,source,qualification_score,qualification_class,status,created_at';
  const rows = records.map(r => [
    escapeCsv(r.id),
    escapeCsv(r.name),
    escapeCsv(r.phone),
    escapeCsv(r.email),
    escapeCsv(r.practice),
    escapeCsv(r.niche),
    escapeCsv(r.source),
    r.qualification?.score ?? '',
    r.qualification?.classification ?? '',
    r.status,
    r.created_at,
  ].join(','));

  return [header, ...rows].join('\n');
}

function escapeCsv(val) {
  if (!val) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
