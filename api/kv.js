/**
 * Vercel KV Helper — uses @vercel/kv REST API via fetch
 *
 * Requires env vars (set in Vercel dashboard):
 *   KV_REST_API_URL  — e.g. "https://us1-able-seahorse-12345.upstash.io"
 *   KV_REST_API_TOKEN — Upstash REST API token
 *
 * Falls back to in-memory storage if KV is not configured.
 * Zero Node.js built-in imports — works in both Serverless and Edge Runtime.
 *
 * Usage:
 *   const { kvGet, kvSet, kvDel, kvKeys } = require('./kv');
 *   const config = await kvGet('client:client_miami');
 *   await kvSet('client:client_miami', { name: '...' });
 */

const KV_API_URL = process.env.KV_REST_API_URL || '';
const KV_API_TOKEN = process.env.KV_REST_API_TOKEN || '';
const KV_ENABLED = !!(KV_API_URL && KV_API_TOKEN);

/** In-memory fallback — survives per warm instance, zero deps */
const memoryStore = new Map();

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

async function kvGet(key) {
  if (KV_ENABLED) {
    try {
      const raw = await kvExec('GET', key);
      if (raw === null || raw === undefined) return null;
      if (typeof raw === 'string') {
        try { return JSON.parse(raw); } catch { return raw; }
      }
      return raw;
    } catch (err) {
      console.error(`[kv] GET ${key} failed:`, err.message);
    }
  }
  return memoryStore.get(key) || null;
}

async function kvSet(key, value, opts = {}) {
  const serialized = typeof value === 'string' ? value : JSON.stringify(value);
  memoryStore.set(key, value);
  if (KV_ENABLED) {
    try {
      const args = [key, serialized];
      if (opts.ex) args.push('EX', String(opts.ex));
      const result = await kvExec('SET', ...args);
      return result === 'OK';
    } catch (err) {
      console.error(`[kv] SET ${key} failed:`, err.message);
    }
  }
  return true;
}

async function kvDel(key) {
  memoryStore.delete(key);
  if (KV_ENABLED) {
    try {
      const result = await kvExec('DEL', key);
      return result === 1;
    } catch (err) {
      console.error(`[kv] DEL ${key} failed:`, err.message);
    }
  }
  return true;
}

async function kvKeys(pattern) {
  if (KV_ENABLED) {
    try {
      const result = await kvExec('KEYS', pattern);
      if (Array.isArray(result)) return result;
    } catch (err) {
      console.error(`[kv] KEYS ${pattern} failed:`, err.message);
    }
  }
  const regex = new RegExp('^' + pattern.replace(/\\*/g, '.*') + '$');
  return Array.from(memoryStore.keys()).filter(k => regex.test(k));
}

module.exports = { kvGet, kvSet, kvDel, kvKeys };
