/**
 * Vercel Edge Function: KV Client
 * In-memory + Vercel KV-backed multi-tenant config resolution.
 *
 * This module provides a consistent KV interface used by all API endpoints.
 * When Vercel KV (@vercel/kv) is available, it uses real persisted storage.
 * When running locally or KV isn't configured, it falls back to env vars.
 */

// KV prefix constants
const PREFIX_CLIENT = 'client:';
const PREFIX_ANALYTICS = 'analytics:';
const PREFIX_LEADS = 'leads:';
const PREFIX_COUNTERS = 'counters:';

// Client ID resolution
export function resolveClientId(request) {
  const clientId = request.headers.get('X-Client-Id') || 'client_default';
  return { clientId };
}

// Multi-tenant client config resolution
export async function resolveClient(request) {
  const clientId = resolveClientId(request).clientId;
  
  try {
    // Try Vercel KV first
    const { kvGet } = await tryKV();
    const config = await kvGet(`${PREFIX_CLIENT}${clientId}`);
    if (config) {
      return { config: typeof config === 'string' ? JSON.parse(config) : config, clientId, fromKV: true };
    }
  } catch (e) {
    // KV not available — fall through to env var defaults
  }

  // Fallback: default config from environment
  return {
    config: {
      active: true,
      name: 'Default Client',
      ai: {
        system_prompt: null,
        model: process.env.CHAT_MODEL || 'deepseek-chat',
        temperature: 0.7,
        max_tokens: 500,
      },
      booking_url: process.env.BOOKING_URL || 'https://focusrunner.io',
      custom_fields: {},
    },
    clientId,
    fromKV: false,
  };
}

// KV storage operations
async function tryKV() {
  try {
    const { kv } = await import('@vercel/kv');
    return {
      kvGet: async (key) => kv.get(key),
      kvSet: async (key, value) => kv.set(key, typeof value === 'string' ? value : JSON.stringify(value)),
      kvDel: async (key) => kv.del(key),
      kvLpush: async (key, value) => kv.lpush(key, typeof value === 'string' ? value : JSON.stringify(value)),
      kvIncr: async (key) => kv.incr(key),
      kvLrange: async (key, start, stop) => kv.lrange(key, start, stop),
      kvLlen: async (key) => kv.llen(key),
    };
  } catch (e) {
    throw new Error('KV not available: ' + e.message);
  }
}

// Lazy KV getter — only loads @vercel/kv when first used
let kvInstance = null;

async function getKV() {
  if (!kvInstance) {
    kvInstance = await tryKV();
  }
  return kvInstance;
}

// Named exports matching the import signatures used across the API

export async function kvGet(key) {
  const k = await getKV();
  return k.kvGet(key);
}

export async function kvSet(key, value) {
  const k = await getKV();
  return k.kvSet(key, value);
}

export async function kvDel(key) {
  const k = await getKV();
  return k.kvDel(key);
}

export async function kvLpush(key, value) {
  const k = await getKV();
  return k.kvLpush(key, value);
}

export async function kvIncr(key) {
  const k = await getKV();
  return k.kvIncr(key);
}

export async function kvLrange(key, start = 0, stop = -1) {
  const k = await getKV();
  return k.kvLrange(key, start, stop);
}

export async function kvLlen(key) {
  const k = await getKV();
  return k.kvLlen(key);
}
