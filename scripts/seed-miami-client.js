/**
 * Seed Miami client config into Vercel KV via the /api/client-config endpoint.
 *
 * Run locally:
 *   ADMIN_API_KEY="your-key" node scripts/seed-miami-client.js
 *
 * For production, after deployment:
 *   ADMIN_API_KEY="$(vercel env pull .env && grep ADMIN_API_KEY .env | cut -d= -f2 | tr -d '"')" \
 *   node scripts/seed-miami-client.js
 *
 * Or run against production:
 *   ADMIN_API_KEY="..." node scripts/seed-miami-client.js https://focusrunner.io
 */

const BASE_URL = process.argv[2] || 'http://localhost:3000';
const ADMIN_API_KEY = process.env.ADMIN_API_KEY || '';

if (!ADMIN_API_KEY) {
  console.error('ERROR: ADMIN_API_KEY env var is required');
  console.error('Usage: ADMIN_API_KEY="x" node scripts/seed-miami-client.js [base_url]');
  process.exit(1);
}

const MIAMI_CONFIG = {
  active: true,
  name: 'Miami Med Spa (Glow Aesthetics)',
  crm: {
    webhook_url: process.env.GHL_WEBHOOK_URL || '__PENDING_SETUP__',
    api_key: process.env.GHL_API_KEY || '__PENDING_SETUP__',
  },
  booking_url: 'https://focusrunner.io',
  ai: {
    model: 'deepseek-chat',
    temperature: 0.7,
    max_tokens: 500,
  },
};

async function seed() {
  console.log(`Seeding Miami client config to ${BASE_URL}/api/client-config`);
  console.log(`  Client name: ${MIAMI_CONFIG.name}`);
  console.log(`  Webhook URL: ${MIAMI_CONFIG.crm.webhook_url.slice(0, 40)}...`);
  console.log();

  const res = await fetch(`${BASE_URL}/api/client-config`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Admin-Key': ADMIN_API_KEY,
    },
    body: JSON.stringify({
      clientId: 'client_miami',
      config: MIAMI_CONFIG,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error(`ERROR ${res.status}:`, JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log('SUCCESS: Miami client config seeded');
  console.log(JSON.stringify(data, null, 2));

  // Verify by reading back
  console.log('\n--- Verifying readback ---');
  const verify = await fetch(`${BASE_URL}/api/client-config?clientId=client_miami`, {
    headers: { 'X-Admin-Key': ADMIN_API_KEY },
  });
  const verifyData = await verify.json();
  if (verifyData.config?.name === MIAMI_CONFIG.name) {
    console.log('PASS: Config readback matches');
  } else {
    console.log('FAIL: Config readback mismatch');
    console.log(JSON.stringify(verifyData, null, 2));
    process.exit(1);
  }

  console.log('\nDone. Miami client is now configured in Vercel KV.');
  console.log('Test with: curl https://focusrunner.io/api/client-config?clientId=client_miami');
}

seed().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
