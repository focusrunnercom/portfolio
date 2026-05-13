# Deployment Guide — Landing Page

**Author:** CTO (FOC-96)
**Date:** 2026-05-12

---

## Prerequisites

- Node.js 18+ (for Vercel CLI)
- Vercel account (free tier)
- GoHighLevel sub-account set up per GHL-SETUP.md
- Make.com webhook endpoint ready

---

## Quick Deploy

### Option 1: Vercel CLI (Recommended)

```bash
# Install Vercel CLI if you haven't
npm install -g vercel

# Navigate to landing template
cd landing-template/

# Deploy to a NEW project (never touch production domains)
vercel --prod --name "focusrunner-{client-slug}" \
  --build-env SITE_NAME="{Client Name}" \
  --build-env WEBHOOK_ID="{make-webhook-id}" \
  --build-env META_PIXEL_ID="{meta-pixel-id}"
```

The `--name` flag creates a new project. The deploy URL will be:
`https://focusrunner-{client-slug}.vercel.app`

### Option 2: Vercel Dashboard

1. Go to [vercel.com](https://vercel.com) → **Add New** → **Project**
2. Import the `landing-template/` directory
3. Project name: `focusrunner-{client-slug}`
4. Framework preset: **Other**
5. Root directory: `landing-template/`
6. Deploy

---

## Environment Variables

Set these in Vercel for each client:

| Variable | Description | Example |
|----------|-------------|---------|
| `SITE_NAME` | Client's practice name | "Serenity Med Spa" |
| `WEBHOOK_ID` | Make.com webhook ID | "abc123def" |
| `META_PIXEL_ID` | Client's Meta Pixel ID | "1234567890" |

---

## Per-Client Customization

Edit `index.html` before deploying:

1. **`{Client Name}`** — Replace with practice name (appears in hero, title, footer)
2. **`{META_PIXEL_ID}`** — Replace with client's actual Meta Pixel ID
3. **`{WEBHOOK_ID}`** — Replace with Make.com webhook ID from MAKE-SCENARIOS.md
4. **`{year}`** — Current year
5. **Service dropdown** — Customize if client offers different treatments

---

## Post-Deployment QA

- [ ] Page loads at Vercel preview URL
- [ ] Form submits to Make.com webhook
- [ ] Thank-you page or redirect shows after submit
- [ ] Meta Pixel fires PageView on load
- [ ] Meta Pixel fires Lead event on form submit
- [ ] Mobile responsive (test on iPhone + Android)
- [ ] Lighthouse score > 85 (performance + accessibility)
- [ ] Chatbot widget loads after 3s delay

---

## Troubleshooting

| Issue | Likely Cause | Fix |
|-------|-------------|-----|
| 404 on deploy | Wrong root directory | Ensure Vercel points to `landing-template/` |
| Form 500 error | Wrong webhook URL | Check MAKE-SCENARIOS.md for correct endpoint |
| Meta Pixel not firing | Wrong Pixel ID | Verify ID in Meta Events Manager |

---

## Domain Setup (Optional)

For a branded URL (e.g., `book.{client-site}.com`):

1. Add custom domain in Vercel project settings
2. Point CNAME record to `cname.vercel-dns.com`
3. Wait for SSL provisioning (auto, ~5 min)
