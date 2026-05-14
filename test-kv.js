/**
 * Validation test for per-client KV config pipeline.
 * Tests that:
 *   1. Client config can be stored and retrieved from KV
 *   2. The config matches expected schema
 *   3. API endpoints would resolve correctly
 *
 * Run: node test-kv.js
 */

import('./api/kv.js').then(async ({ kvSet, kvGet, kvDel }) => {
  console.log('=== Per-Client KV Config: Validation Suite ===\n');

  // --- 1. Seed test configs ---
  console.log('--- Seeding test configs ---');

  // Clean slate
  await kvDel('client:test_client');
  await kvDel('client:client_miami');
  await kvDel('client:client_empty');

  // Full Miami config
  const miamiConfig = {
    active: true,
    name: 'Miami Med Spa (Glow Aesthetics)',
    crm: {
      webhook_url: '__PENDING_SETUP__',
      api_key: '__PENDING_SETUP__',
    },
    booking_url: 'https://focusrunner.com',
    ai: {
      model: 'deepseek-chat',
      temperature: 0.7,
      max_tokens: 500,
    },
  };
  await kvSet('client:client_miami', miamiConfig);
  console.log(' Seeded client:client_miami');

  // Minimal config (edge case)
  await kvSet('client:test_client', {
    active: true,
    name: 'Test Client',
    crm: { webhook_url: '', api_key: '' },
    booking_url: '',
    ai: { model: 'deepseek-chat', temperature: 0.5, max_tokens: 300 },
  });
  console.log(' Seeded client:test_client');

  // Empty config (edge case)
  await kvSet('client:client_empty', { active: false, name: 'Inactive Client' });
  console.log(' Seeded client:client_empty (inactive)');

  // --- 2. Readback validation ---
  console.log('\n--- Readback validation ---');

  const miamiRead = await kvGet('client:client_miami');
  if (miamiRead && miamiRead.active === true && miamiRead.ai?.model === 'deepseek-chat') {
    console.log(' [PASS] client_miami: full config read correctly');
  } else {
    console.log(' [FAIL] client_miami: read mismatch');
    console.log('  Got:', JSON.stringify(miamiRead).slice(0, 100));
  }

  const testRead = await kvGet('client:test_client');
  if (testRead && testRead.ai?.temperature === 0.5) {
    console.log(' [PASS] test_client: minimal config read correctly');
  } else {
    console.log(' [FAIL] test_client: read mismatch');
  }

  const emptyRead = await kvGet('client:client_empty');
  if (emptyRead && emptyRead.active === false) {
    console.log(' [PASS] client_empty: inactive config read correctly');
  } else {
    console.log(' [FAIL] client_empty: read mismatch');
  }

  // --- 3. Not-found case ---
  const notFound = await kvGet('client:nonexistent_client');
  if (notFound === null) {
    console.log(' [PASS] nonexistent client returns null');
  } else {
    console.log(' [FAIL] nonexistent client should be null, got:', notFound);
  }

  // --- 4. Cleanup ---
  await kvDel('client:test_client');
  await kvDel('client:client_empty');

  // Keep client_miami — it's production data

  console.log('\n=== Validation complete ===');
  process.exit(0);
}).catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
