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
let store;
try {
  if (typeof globalThis !== 'undefined' && typeof globalThis.__leadsStore === 'undefined') {
    globalThis.__leadsStore = new Map();
    globalThis.__leadsStoreInit = Date.now();
  }
  store = /** @type {Map<string, LeadRecord>} */ (
    typeof globalThis !== 'undefined' ? globalThis.__leadsStore : null
  );
} catch (e) {
  // Fallback: module-scoped Map (no cross-invoke persistence, but won't crash)
  console.error('[notify] globalThis not available, using module-level store:', e.message);
}
if (!store) {
  store = new Map();
}

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ENTRIES = 10000;

/** @typedef {{ id: string, data: object, createdAt: string, status: string }} LeadRecord */

// =============================================================================
// Helpers
// =============================================================================

function nanoId(length = 12) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Clean expired entries from the store.
 */
function cleanup() {
  const now = Date.now();
  for (const [key, record] of store) {
    if (now - new Date(record.createdAt).getTime() > TTL_MS) {
      store.delete(key);
    }
  }
  // Enforce soft limit
  if (store.size > MAX_ENTRIES) {
    const entries = [...store.entries()]
      .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime());
    const toRemove = store.size - MAX_ENTRIES;
    for (let i = 0; i < toRemove; i++) {
      store.delete(entries[i][0]);
    }
  }
}

// =============================================================================
// Exports
// =============================================================================

/**
 * Record a lead in the in-memory store.
 * @param {object} data — lead data
 * @returns {{ id: string }}
 */
export function record(data) {
  const now = Date.now();
  const id = `lead_${now}_${nanoId()}`;
  store.set(id, {
    id,
    data,
    createdAt: new Date(now).toISOString(),
    status: 'unread',
  });

  // Periodic cleanup (every ~5 min)
  const cleanupAt = typeof globalThis !== 'undefined' ? globalThis.__leadsStoreCleanupAt : 0;
  const elapsed = now - (cleanupAt || 0);
  if (elapsed > CLEANUP_INTERVAL_MS || store.size > MAX_ENTRIES * 0.9) {
    cleanup();
    try { if (typeof globalThis !== 'undefined') globalThis.__leadsStoreCleanupAt = now; } catch {}
  }

  return { id };
}

/**
 * List recent leads from the in-memory store.
 * @param {number} limit — max entries (default 50)
 * @param {number} offset — page offset (default 0)
 * @returns {{ total: number, leads: LeadRecord[] }}
 */
export function listLeads(limit = 50, offset = 0) {
  const entries = [...store.values()]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  return {
    total: entries.length,
    leads: entries.slice(offset, offset + limit),
  };
}

/**
 * Mark a lead as read/contacted.
 * @param {string} id — lead ID
 * @param {string} status — new status
 * @returns {boolean}
 */
export function markRead(id, status = 'read') {
  const record = store.get(id);
  if (!record) return false;
  record.status = status;
  return true;
}

/**
 * Export all leads as CSV string.
 * @returns {string}
 */
export function exportCsv() {
  const entries = [...store.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const headers = ['id', 'createdAt', 'status', 'name', 'phone', 'email', 'practice', 'niche', 'score', 'classification'];
  const rows = entries.map((r) => {
    const d = r.data || {};
    const q = d.qualification || {};
    return [
      r.id,
      r.createdAt,
      r.status,
      escapeCsv(d.name || ''),
      escapeCsv(d.phone || ''),
      escapeCsv(d.email || ''),
      escapeCsv(d.practice || ''),
      escapeCsv(d.niche || ''),
      q.score ?? '',
      q.classification || '',
    ].join(',');
  });

  return [headers.join(','), ...rows].join('\n');
}

function escapeCsv(str) {
  const s = String(str || '');
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}
