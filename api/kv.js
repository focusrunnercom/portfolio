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

import { readFileSync, writeFileSync, existsSync, unlinkSync, readdirSync, mkdirSync } from 'fs';
import { join } from 'path';

const KV_DIR = '/tmp/focusrunner-kv';

function ensureDir() {
  if (!existsSync(KV_DIR)) {
    try {
      mkdirSync(KV_DIR, { recursive: true });
    } catch {
      // ignore
    }
  }
}

function kvPath(key) {
  ensureDir();
  // Sanitize key for filesystem
  const safeName = key.replace(/[^a-zA-Z0-9_-]/g, '_');
  return join(KV_DIR, safeName);
}

function kvGetFallback(key) {
  const path = kvPath(key);
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    try { return JSON.parse(raw); } catch { return raw; }
  } catch {
    return null;
  }
}

function kvSetFallback(key, value) {
  const path = kvPath(key);
  try {
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value), 'utf-8');
  } catch (err) {
    console.error(`[kv/fallback] SET ${key} failed:`, err.message);
  }
}

function kvDelFallback(key) {
  const path = kvPath(key);
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch (err) {
    console.error(`[kv/fallback] DEL ${key} failed:`, err.message);
  }
}

function kvKeysFallback(pattern) {
  ensureDir();
  try {
    const files = readdirSync(KV_DIR);
    // Convert pattern to regex (simple glob)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return files.filter(f => regex.test(f));
  } catch {
    return [];
  }
}
