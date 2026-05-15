/**
 * Instagram Graph API endpoint for Paperclip agents.
 * POST /api/instagram — create a media post (single image or carousel).
 * GET  /api/instagram — health check with account info.
 *
 * Required env vars:
 *   INSTAGRAM_TOKEN — long-lived Facebook Graph API token with:
 *     - instagram_basic
 *     - instagram_content_publish
 *     - pages_read_engagement
 *     - pages_show_list
 *
 * Setup (one-time):
 *   1. Facebook App with Instagram Graph API enabled
 *   2. Facebook Page connected to Instagram Business Account
 *   3. Token with above permissions via Graph API Explorer
 */

const https = require('https');

const TOKEN = process.env.INSTAGRAM_TOKEN || '';
const API_BASE = 'graph.facebook.com';
const API_VERSION = 'v19.0';

function graphGet(path) {
  return new Promise((resolve, reject) => {
    const url = `/${API_VERSION}${path}${path.includes('?') ? '&' : '?'}access_token=${TOKEN}`;
    https.get({ hostname: API_BASE, path: url }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(data)); }
      });
    }).on('error', reject);
  });
}

function graphPost(path, body) {
  return new Promise((resolve, reject) => {
    const postData = new URLSearchParams({ ...body, access_token: TOKEN }).toString();
    const req = https.request({
      hostname: API_BASE, path: `/${API_VERSION}${path}`,
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Content-Length': Buffer.byteLength(postData) }
    }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch(e) { reject(new Error(data)); }
      });
    });
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

// Find Instagram Business Account ID from connected Facebook Pages
async function getIGAccount() {
  // Step 1: Get Facebook Pages
  const pages = await graphGet('/me/accounts?fields=id,name,instagram_business_account{id,username}');
  if (!pages.data || !pages.data.length) {
    throw new Error('No Facebook Pages found. Connect a FB Page with Instagram Business Account.');
  }

  // Step 2: Find first page with IG account
  for (const page of pages.data) {
    if (page.instagram_business_account) {
      return {
        pageId: page.id,
        pageName: page.name,
        igUserId: page.instagram_business_account.id,
        igUsername: page.instagram_business_account.username,
      };
    }
  }
  throw new Error('No Instagram Business Account found on any Page. Connect IG to your FB Page.');
}

// Create a single image post
async function createImagePost(igUserId, imageUrl, caption) {
  // Step 1: Create media container
  const container = await graphPost(`/${igUserId}/media`, {
    image_url: imageUrl,
    caption: caption || '',
  });

  if (!container.id) throw new Error('Failed to create media container: ' + JSON.stringify(container));

  // Step 2: Publish
  const publish = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: container.id,
  });

  return publish;
}

// Create a carousel post (multiple images)
async function createCarouselPost(igUserId, imageUrls, caption) {
  // Step 1: Create individual containers
  const containerIds = [];
  for (const url of imageUrls) {
    const c = await graphPost(`/${igUserId}/media`, {
      image_url: url,
      is_carousel_item: 'true',
    });
    if (!c.id) throw new Error('Carousel container failed: ' + JSON.stringify(c));
    containerIds.push(c.id);
  }

  // Step 2: Create carousel container
  const carousel = await graphPost(`/${igUserId}/media`, {
    media_type: 'CAROUSEL',
    caption: caption || '',
    children: containerIds.join(','),
  });

  if (!carousel.id) throw new Error('Carousel creation failed: ' + JSON.stringify(carousel));

  // Step 3: Publish
  const publish = await graphPost(`/${igUserId}/media_publish`, {
    creation_id: carousel.id,
  });

  return publish;
}

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  // Health check
  if (req.method === 'GET') {
    if (!TOKEN) return res.status(500).json({ error: 'INSTAGRAM_TOKEN not configured' });
    try {
      const user = await graphGet('/me?fields=id,name');
      const ig = await getIGAccount().catch(() => null);
      return res.status(200).json({
        status: 'ok',
        endpoint: '/api/instagram',
        user: user,
        instagram: ig,
        ready: !!ig,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  // Post media
  if (req.method === 'POST') {
    if (!TOKEN) return res.status(500).json({ error: 'INSTAGRAM_TOKEN not configured' });

    const body = req.body;
    const imageUrl = body.image_url || body.imageUrl;
    const imageUrls = body.image_urls || body.imageUrls;
    const caption = body.caption || '';

    if (!imageUrl && (!imageUrls || !imageUrls.length)) {
      return res.status(400).json({ error: 'image_url (single) or image_urls (carousel) required' });
    }

    try {
      const ig = await getIGAccount();
      let result;

      if (imageUrls && imageUrls.length > 1) {
        result = await createCarouselPost(ig.igUserId, imageUrls, caption);
      } else {
        result = await createImagePost(ig.igUserId, imageUrl || imageUrls[0], caption);
      }

      return res.status(200).json({
        success: true,
        id: result.id,
        instagram: `https://instagram.com/${ig.igUsername}`,
        account: ig,
      });
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
