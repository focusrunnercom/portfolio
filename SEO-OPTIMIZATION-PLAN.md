# SEO Optimization Plan — focusrunner.io

**Date:** 2026-06-04  
**Owner:** CTO (FOC-1160)  
**Target Audience:** Miami med spa owners searching for patient acquisition help

---

## 1. Current State Audit

### Title Tag
```
CURRENT: FocusRunner — AI Patient Acquisition for Med Spas | [15+ Leads in 30 Days]
LENGTH:  72 chars ❌ (exceeds 60-char limit)
ISSUES:  Contains brackets, which reduce CTR in SERPs. Too long — Google truncates at ~60 chars.
```

### Meta Description
```
CURRENT: [Free Audit] Deploy AI-powered patient acquisition in 7 days. 287% conversion
         improvement. 78% lower cost per lead. $2,500/mo — results guaranteed.
LENGTH:  156 chars ✓ (within 160 limit)
ISSUES:  Brackets in snippet. Unverified percentage claims. Missing geo-intent.
```

### H1
```
CURRENT: "Your med spa. Fully booked." (34 chars)
ISSUES:  No primary keyword. Zero semantic signal for "patient acquisition" or "Miami."
         Google uses H1 as a strong ranking signal.
```

### Schema Markup
```
PRESENT: Organization, WebSite, FAQPage, Person
MISSING: LocalBusiness (critical for local Miami SEO)
ISSUES:  No address, phone, geo-coordinates. No areaServed.
```

### Current Keywords (passive)
Based on meta and content, the site passively targets:
- "patient acquisition for med spas"
- "AI patient acquisition system"
- "medical aesthetics"
- "qualified leads"

None are geo-targeted to Miami.

---

## 2. Optimized Metadata

### Title Tag (60 chars max)

```
PROPOSED: Med Spa Patient Acquisition Miami | AI Lead Generation
LENGTH:   58 chars ✓
KEYWORDS: "med spa patient acquisition" | "Miami" | "AI lead generation"
```

**Rationale:** Primary keyword first, geo-modifier second, value proposition third. No brackets. Truncates properly on mobile and desktop SERPs.

### Meta Description (160 chars max)

```
PROPOSED: FocusRunner deploys AI-powered patient acquisition systems for Miami med spas.
         15+ qualified leads in 30 days — guaranteed. Free audit. $2,500/mo flat.
LENGTH:   154 chars ✓
```

**Rationale:** Brand + geo + value proposition + credibility signal + CTA. Benefit-driven. No unverified percentage claims.

### H1 Optimization

```
PROPOSED: Med Spa Patient Acquisition — Miami's AI-Powered Lead System
LENGTH:   60 chars
```

**Alternative (short):**
```
PROPOSED: AI Patient Acquisition for Miami Med Spas
LENGTH:   43 chars
```

**Rationale:** Primary keyword "med spa patient acquisition" + "Miami" + "AI" in H1. Signals relevance to both Google and searchers.

---

## 3. Five Target Keywords with Search Intent

| # | Keyword | Volume (est.) | Intent | Priority | Target Page |
|---|---------|--------------|--------|----------|-------------|
| 1 | `med spa marketing Miami` | Medium | Commercial | **P0** | Homepage (hero/H1) |
| 2 | `medical spa patient acquisition` | Medium | Commercial | **P0** | Homepage (H1/meta) |
| 3 | `aesthetic clinic lead generation` | Low-Med | Commercial | **P1** | Homepage (How It Works) |
| 4 | `Miami med spa advertising` | Low-Med | Commercial | **P1** | Blog post / landing page |
| 5 | `how to get more patients med spa` | High | Informational | **P1** | Blog post |

### Keyword Details

**1. "med spa marketing Miami"**
- Intent: Med spa owner in Miami looking for marketing help
- Searcher profile: 35-55, owns or manages a med spa, frustrated with current marketing
- Competition: Moderate (local agencies bidding)
- Content: H1, meta description, H2 headings, body copy

**2. "medical spa patient acquisition"**
- Intent: Owner who understands "marketing" isn't enough — they need patients
- Searcher profile: Sophisticated buyer, comparing agencies vs in-house
- Competition: High (national)
- Content: Primary keyword in title, meta, H1, schema

**3. "aesthetic clinic lead generation"**
- Intent: Looking for lead gen specifically (not branding)
- Searcher profile: May be broader than med spa (plastic surgeons, derm clinics)
- Competition: Moderate
- Content: "How It Works" section, case studies

**4. "Miami med spa advertising"**
- Intent: Location-specific paid ads, wants local expertise
- Searcher profile: Miami-based, cares about local market dynamics
- Competition: Low-Med
- Content: Blog post: "Miami Med Spa Advertising: What Works in 2026"

**5. "how to get more patients med spa"**
- Intent: Top-of-funnel, problem-aware but not solution-aware
- Searcher profile: New owner or struggling practice
- Competition: Very High (national blogs, directories)
- Content: Blog post: "How to Get More Patients for Your Med Spa in 2026"

---

## 4. LocalBusiness Schema Markup

Replace the generic `Organization` schema with `LocalBusiness` for Miami geo-targeting:

```json
{
  "@context": "https://schema.org",
  "@type": "LocalBusiness",
  "name": "FocusRunner AI",
  "description": "AI-powered patient acquisition for med spas in Miami. 15+ qualified leads in 30 days — guaranteed. $2,500/mo.",
  "url": "https://focusrunner.io",
  "telephone": "+1-786-000-0000",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Miami, FL",
    "addressLocality": "Miami",
    "addressRegion": "FL",
    "postalCode": "33101",
    "addressCountry": "US"
  },
  "areaServed": {
    "@type": "City",
    "name": "Miami",
    "sameAs": "https://en.wikipedia.org/wiki/Miami"
  },
  "geo": {
    "@type": "GeoCoordinates",
    "latitude": "25.7617",
    "longitude": "-80.1918"
  },
  "openingHours": "Mo-Fr 09:00-18:00",
  "priceRange": "$$$",
  "sameAs": [
    "https://www.linkedin.com/company/focusrunner-io/",
    "https://www.instagram.com/focusrunner.io/",
    "https://www.facebook.com/1079570161912638",
    "https://x.com/DotSunLLC"
  ],
  "makesOffer": {
    "@type": "Offer",
    "itemOffered": {
      "@type": "Service",
      "name": "AI Patient Acquisition System",
      "description": "Complete AI-powered patient acquisition system deployed in 7 days. Includes landing page, AI chatbot, SMS sequences, ad campaigns, and CRM integration.",
      "offers": {
        "@type": "Offer",
        "price": "2500.00",
        "priceCurrency": "USD",
        "priceValidUntil": "2026-12-31"
      }
    }
  }
}
```

**Deployment note:** This replaces the Organization schema block (lines 334-346 in index.html). Keep the WebSite, FAQPage, and Person schemas as-is.

---

## 5. Open Graph / Social Sharing Optimization

Current OG tags are solid. Minor improvements:

### Current Issues
- `og:image` points to an SVG, which some platforms (LinkedIn) don't render well
- Missing `og:locale` tag

### Recommended Fixes

```html
<!-- Add locale -->
<meta property="og:locale" content="en_US">

<!-- Keep existing, but ensure og:image fallback -->
<meta property="og:image" content="https://focusrunner.io/og-image.png">
<meta property="og:image:type" content="image/png">
```

**Note:** Generate a 1200x630 PNG version of the OG image for LinkedIn compatibility.

---

## 6. On-Page Content Optimizations

### Heading Hierarchy Audit

```
CURRENT:                    PROPOSED:
H1: "Your med spa..."       H1: "Med Spa Patient Acquisition — Miami's AI-Powered Lead System"
H2: "How It Works"          H2: "How Our AI Patient Acquisition System Works"
H2: "The Offer Stack"       H2: "Complete Patient Acquisition Stack — $2,500/mo"
H2: "The Guarantee"         H2: "15+ Leads in 30 Days — Or It's Free"
H2: "By the Numbers"        H2: "Patient Acquisition Results by the Numbers"
H2: "Built For"             H2: "Built for High-Ticket Medical Aesthetics"
H2: "Team"                  H2: "AI Agent Team" (unchanged — branded)
H2: "Case Studies"          H2: "Miami Med Spa Case Studies"
H2: "What Our Clients Say" ✓ (keep)
```

### Body Copy — Keyword Placement

| Location | Keyword to Add |
|----------|---------------|
| Hero paragraph | "Miami med spa patient acquisition" |
| "How It Works" first paragraph | "medical spa lead generation" |
| "Built For" section | "Miami aesthetic clinics" |
| "Case Studies" intro | "patient acquisition results" |
| FAQ (last question) | "Miami med spa advertising costs" |

---

## 7. Technical SEO Checklist

- [x] Canonical URL set to `https://focusrunner.io`
- [x] Sitemap submitted (8 URLs, lastmod 2026-05-24)
- [x] Robots.txt allows all crawlers + AI bots
- [x] HTTPS enforced (Vercel)
- [x] G-8ETM567BFC GA4 tracking
- [x] GSC property verified
- [ ] **Action:** Update sitemap lastmod after deploying SEO changes
- [ ] **Action:** Add new blog pages to sitemap
- [ ] **Action:** Submit updated sitemap to GSC
- [ ] **Action:** Verify structured data in Rich Results Test: https://search.google.com/test/rich-results

---

## 8. Implementation Order

| Step | Change | File | Effort | Priority |
|------|--------|------|--------|----------|
| 1 | Replace title tag (58 chars) | `index.html` | 1 min | **P0** |
| 2 | Replace meta description (154 chars) | `index.html` | 1 min | **P0** |
| 3 | Replace H1 with keyword-optimized version | `index.html` | 1 min | **P0** |
| 4 | Replace Organization schema with LocalBusiness | `index.html` | 5 min | **P0** |
| 5 | Add `og:locale` + PNG fallback | `index.html` | 2 min | **P1** |
| 6 | Update H2 headings for keyword placement | `index.html` | 5 min | **P1** |
| 7 | Add geo-keyword to hero paragraph | `index.html` | 2 min | **P1** |
| 8 | Update sitemap lastmod + resubmit to GSC | `sitemap.xml` | 2 min | **P1** |
| 9 | Create blog post: "Miami Med Spa Advertising Guide" | new file | 2 hours | **P2** |
| 10 | Create blog post: "How to Get More Patients Med Spa" | new file | 2 hours | **P2** |

---

## 9. Success Metrics (30-Day Targets)

| Metric | Pre-Optimization | Target (30 days) |
|--------|-----------------|------------------|
| GSC clicks/week | TBD | +25% |
| Impressions for "Miami med spa" queries | TBD | Appear in top 50 |
| Avg position for target keywords | TBD | Within top 30 |
| Organic sessions/week | TBD | +20% |
| Local pack visibility (Miami) | None | Appear for "med spa marketing" |

**Review cadence:** Weekly via SEO-MONITORING-SETUP.md process (see `/docs/SEO-MONITORING-SETUP.md`).

---

**Dependencies:** None. All changes are to static HTML.  
**Free Tools Only:** ✅ All tools used (GSC, GA4, PageSpeed Insights) are free tier.  
**Risk:** Low. Changes are additive. Revertible by git.  
**Next Action:** Implement steps 1-8, commit to `main`, verify deploy via Vercel.
