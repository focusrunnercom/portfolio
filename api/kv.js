/**
 * Vercel KV Helper — uses @vercel/kv REST API via fetch
 *
 * Requires env vars (set in Vercel dashboard):
 *   KV_REST_API_URL  — e.g. "https://us1-able-seahorse-12345.upstash.io"
 *   KV_REST_API_TOKEN — Upstash REST API token
 *
 * Falls back to /tmp file storage if KV is not configured
 * (for local development / testing).
 *
 * Usage:
 *   import { kvGet, kvSet, kvDel, kvKeys } from '../kv.js';
 *   const config = await kvGet('client:client_miami');
 *   await kvSet('client:client_miami', { name: '...' });
 */

// =============================================================================
// Vercel KV REST adapter
// =============================================================================

const KV_API_URL = process.env.KV_REST_API_URL || '';
const KV_API_TOKEN = process.env.KV_REST_API_TOKEN || '';
const KV_ENABLED = !!(KV_API_URL && KV_API_TOKEN);

/**
 * Execute a KV REST command.
 * Uses Upstash REST protocol: POST / { command: [...args] }
 * @param {string} command — Redis command (GET, SET, DEL, KEYS, etc.)
 * @param {...any} args — command arguments
 */
async function kvExec(command, ...args) {
  if (!KV_ENABLED) {
    throw new Error('KV not configured: set KV_REST_API_URL and KV_REST_API_TOKEN');
  }

  const res = await fetch(KV_API_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${KV_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify([command, ...args]),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '(no body)');
    console.error(`[kv] ${command} error ${res.status}: ${body.slice(0, 200)}`);
    return null;
  }

  const data = await res.json();
  return data.result !== undefined ? data.result : data;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Get a value from KV.
 * @param {string} key
 * @returns {Promise<any|null>}
 */
export async function kvGet(key) {
  if (!KV_ENABLED) {
    return kvGetFallback(key);
  }
  try {
    const raw = await kvExec('GET', key);
    if (raw === null || raw === undefined) return null;
    if (typeof raw === 'string') {
      try { return JSON.parse(raw); } catch { return raw; }
    }
    return raw;
  } catch (err) {
    console.error(`[kv] GET ${key} failed:`, err.message);
    return kvGetFallback(key);
  }
}

/**
 * Set a value in KV.
 * @param {string} key
 * @param {any} value — JSON-serializable value
 * @param {object} [opts] — { ex?: number } for TTL in seconds
 * @returns {Promise<boolean>}
 */
export async function kvSet(key, value, opts = {}) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  if (!KV_ENABLED) {
    kvSetFallback(key, serialized);
    return true;
  }

  try {
    const args = [key, serialized];
    if (opts.ex) {
      args.push('EX', String(opts.ex));
    }
    const result = await kvExec('SET', ...args);
    return result === 'OK';
  } catch (err) {
    console.error(`[kv] SET ${key} failed:`, err.message);
    kvSetFallback(key, serialized);
    return true; // fallback "succeeded" in storing locally
  }
}

/**
 * Delete a key from KV.
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export async function kvDel(key) {
  if (!KV_ENABLED) {
    kvDelFallback(key);
    return true;
  }

  try {
    const result = await kvExec('DEL', key);
    return result === 1;
  } catch (err) {
    console.error(`[kv] DEL ${key} failed:`, err.message);
    kvDelFallback(key);
    return true;
  }
}

/**
 * List keys matching a pattern.
 * @param {string} pattern — e.g. "client:*"
 * @returns {Promise<string[]>}
 */
export async function kvKeys(pattern) {
  if (!KV_ENABLED) {
    return kvKeysFallback(pattern);
  }

  try {
    const result = await kvExec('KEYS', pattern);
    return Array.isArray(result) ? result : [];
  } catch (err) {
    console.error(`[kv] KEYS ${pattern} failed:`, err.message);
    return kvKeysFallback(pattern);
  }
}

// =============================================================================
// /tmp file-based fallback (Vercel serverless ephemeral storage)
// =============================================================================

const KV_DIR = '/tmp/focusrunner-kv';

// In-memory storage for Edge Runtime (no /tmp access)
const memoryStore = new Map();

let fsModule = null;
let pathModule = null;
let fsAvailable = false;

function ensureFsLoaded() {
  if (fsModule !== undefined) return;
  try {
    // Use eval('require') to avoid the top-level import
    const createRequire = eval('require');
    fsModule = createRequire('fs');
    pathModule = createRequire('path');
    fsAvailable = true;
  } catch {
    fsModule = null;
    pathModule = null;
    fsAvailable = false;
  }
}

function ensureDir() {
  if (!fsAvailable) return;
  try {
    fsModule.mkdirSync(KV_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function kvPath(key) {
  ensureDir();
  // Sanitize key for filesystem
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return fsAvailable ? pathModule.join(KV_DIR, safeName) : `memory:${safeName}`;
}

// In-memory storage for Edge Runtime (no /tmp access)
const memoryStore = new Map();

function kvGetFallback(key) {
  if (!fsAvailable) {
    return memoryStore.get(key) || null;
  }
  const fpath = kvPath(key);
  try {
    if (!fsModule.existsSync(fpath)) return null;
    const raw = fsModule.readFileSync(fpath, 'utf-8');
    try { return JSON.parse(raw); } catch { return raw; }
  } catch {
    return null;
  }
}

function kvSetFallback(key, value) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  if (!fsAvailable) {
    memoryStore.set(key, serialized);
    return;
  }
  const fpath = kvPath(key);
  try {
    fsModule.writeFileSync(fpath, serialized, 'utf-8');
  } catch (err) {
    console.error(`[kv/fallback] SET ${key} failed:`, err.message);
  }
}

function kvDelFallback(key) {
  if (!fsAvailable) {
    memoryStore.delete(key);
    return;
  }
  const fpath = kvPath(key);
  try {
    if (fsModule.existsSync(fpath)) fsModule.unlinkSync(fpath);
  } catch (err) {
    console.error(`[kv/fallback] DEL ${key} failed:`, err.message);
  }
}

function kvKeysFallback(pattern) {
  ensureDir();
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
  
  if (!fsAvailable) {
    return Array.from(memoryStore.keys()).filter(k => regex.test(k));
  }
  
  try {
    const files = fsModule.readdirSync(KV_DIR);
    return files.filter(f => regex.test(f));
  } catch {
    return [];
  }
}
