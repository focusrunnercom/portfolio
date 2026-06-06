# SEO Monitoring Setup — FOC-868

## Overview

Weekly monitoring of GSC, GA4, and Vercel edge performance. Automated data collection feeds into Obsidian for trend analysis.

## 1. Google Search Console Setup ✅

### Status: CONFIGURED
- **Property**: https://focusrunner.io/
- **Verified via**: DNS TXT (recommend retaining)
- **Sitemap submitted**: `/sitemap.xml`

### Weekly Manual Check (5 min)
1. Go to https://search.google.com/search-console/about
2. Click "focusrunner.io" property
3. Note in Obsidian:
   - **Performance tab**: Top queries, avg position, CTR, clicks
   - **Coverage tab**: Check for indexing issues, excluded pages
   - **Core Web Vitals tab**: LCP, FID, CLS status
   - **Sitemap**: Confirm lastmod date recent

### Automated Pull (requires setup)
```bash
# OAuth2 credentials needed: ~/.focusrunner/gsc-credentials.json (service account)
cd focusrunner-site
python scripts/seo-monitor.py
```

## 2. Google Analytics 4 Setup ✅

### Status: CONFIGURED
- **Property ID**: 465033044
- **Tracking ID**: G-8ETM567BFC (deployed in index.html)
- **Measurement**: Sessions, bounce rate, conversions, traffic source

### Weekly Manual Check (5 min)
1. Go to https://analytics.google.com (GA4 property)
2. Check dashboard for:
   - Total sessions (last 7 days)
   - Top traffic sources (organic, social, direct)
   - Conversion rate
   - Bounce rate by source
   - Top pages by session count

### Key Metrics to Track
| Metric | Target | Current |
|--------|--------|---------|
| Weekly Sessions | 50+ | TBD |
| Organic Sessions % | 30%+ | TBD |
| Conversion Rate | 2%+ | TBD |
| Bounce Rate | <50% | TBD |
| Avg Session Duration | 2min+ | TBD |

## 3. Vercel Edge Performance

### Cache Headers ✅ DEPLOYED
**File**: `vercel.json` (lines 66-106)

Current config:
```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=3600, s-maxage=86400" },
        { "key": "X-Content-Type-Options", "value": "nosniff" },
        { "key": "X-Frame-Options", "value": "DENY" },
        { "key": "X-XSS-Protection", "value": "1; mode=block" }
      ]
    },
    {
      "source": "/blog/(.*)",
      "headers": [
        { "key": "Cache-Control", "value": "public, max-age=604800, s-maxage=2592000" }
      ]
    }
  ]
}
```

### Compression ✅
- **Brotli**: Automatic (Vercel default)
- **HTTP/2**: Automatic (Vercel default)
- **HTTP/3**: Automatic (Vercel default)

### Monthly Audit Checklist
- [ ] Run PageSpeed Insights: https://pagespeed.web.dev/?url=https%3A%2F%2Ffocusrunner.io%2F
  - Check: LCP (< 2.5s), FID (< 100ms), CLS (< 0.1)
- [ ] Check Vercel Analytics dashboard:
  - Edge request count, Cache hit ratio
  - Origin request timing
  - Bandwidth usage
- [ ] Verify robots.txt: `https://focusrunner.io/robots.txt`
- [ ] Verify sitemap: `https://focusrunner.io/sitemap.xml`
- [ ] Verify JSON-LD: `https://focusrunner.io/` (right-click → inspect → search "Organization")

## 4. Cron Schedule (Unix/Linux)

### Setup
```bash
# Edit crontab
crontab -e

# Add this line (runs weekly, Monday 09:00 UTC)
0 9 * * 1 cd /home/ai13/focusrunner-site && /usr/bin/python3 scripts/seo-monitor.py >> logs/seo-monitor.log 2>&1
```

### Manual Run
```bash
cd /home/ai13/focusrunner-site
python3 scripts/seo-monitor.py
```

## 5. Sitemap Management

### Update Sitemap When:
- New blog post published
- Major content update (title, meta, content > 20%)
- New top-level page added

### How to Update
```bash
cd /home/ai13/focusrunner-site

# Verify current sitemap is valid
curl -s https://focusrunner.io/sitemap.xml | head -20

# Update lastmod timestamp if blog changed
sed -i "s/<lastmod>.*<\/lastmod>/<lastmod>$(date +%Y-%m-%d)<\/lastmod>/g" sitemap.xml

# Push to GitHub and Vercel will auto-deploy
git add sitemap.xml
git commit -m "chore: update sitemap lastmod — new blog content"
git push origin main
```

### Resubmit to GSC
1. Go to GSC → Sitemaps
2. Click "Add new sitemap"
3. Enter: `https://focusrunner.io/sitemap.xml`
4. Verify submission confirmed

## 6. Core Web Vitals Monitoring

### How to Check
- **Official**: https://search.google.com/search-console → Core Web Vitals report
- **Real-time**: https://pagespeed.web.dev/
- **Lab data**: Same PageSpeed Insights page

### Targets
- **LCP (Largest Contentful Paint)**: < 2.5s ✅
- **FID (First Input Delay)**: < 100ms ✅
- **CLS (Cumulative Layout Shift)**: < 0.1 ✅

### Current Status
Run this weekly:
```bash
# Install Lighthouse CLI
npm install -g @lhci/cli@^0.9.0

# Audit focusrunner.io
lhci autorun --config lighthouse-ci.json
```

## 7. Weekly Monitoring Checklist

Every **Monday morning** (or on schedule):

- [ ] **GSC Check** (5 min)
  - Top queries from last 7 days
  - New indexing issues?
  - Core Web Vitals status
  
- [ ] **GA4 Check** (5 min)
  - Weekly sessions count
  - Traffic by source
  - Conversion rate
  
- [ ] **Vercel Edge** (2 min)
  - PageSpeed Insights score
  - Cache hit ratio (if available in analytics)
  
- [ ] **Sitemap** (1 min)
  - Verify XML valid: `curl -s https://focusrunner.io/sitemap.xml | head -5`
  - Verify resubmitted after content changes
  
- [ ] **Log Results** (2 min)
  - Update Obsidian: `03-Knowledge/SEO/SEO-Monitoring-Weekly.md`
  - Document trends, new issues
  
- [ ] **Action Items**
  - Identify high-value queries with low CTR → optimize title/meta
  - Check pages with high position (30+) → improve ranking content
  - Review bounce rate by source → optimize landing experience

## 8. Troubleshooting

### GSC shows "Exclude by 'noindex'"
- Check meta tag: `<meta name="robots" content="noindex">`
- Remove if page should be indexed

### GA4 shows 0 sessions
- Verify tracking snippet in `index.html` (should have `G-8ETM567BFC`)
- Check browser console for gtag errors
- Wait 24h for data to populate

### PageSpeed score dropped
- Check: largest JS file, unused CSS, image sizes
- Run: `npm run build` to regenerate dist/
- Check cache headers are correct

## 9. Success Metrics (30-day targets)

| Metric | Baseline | Month 1 Target | Status |
|--------|----------|----------------|--------|
| Indexed pages | 5-10 | 10-20 | TBD |
| GSC clicks/week | 20-50 | 50-150 | TBD |
| GA4 sessions/week | 50-100 | 150-300 | TBD |
| Organic CTR | 5-15% | 15-25% | TBD |
| Core Web Vitals | Pass | All Green | TBD |
| Avg Position | 30-40 | 15-25 | TBD |

---

**Owner**: CTO (FOC-868)  
**Status**: ✅ Configuration complete, awaiting data collection  
**Next Review**: 2026-06-06 (weekly)
