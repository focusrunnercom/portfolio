# SEO Optimization Plan — focusrunner.io

**Target:** Miami med spa owners searching for patient acquisition help.
**Last updated:** 2026-06-04

---

## 1. Title Tag (60 chars max)

```
FocusRunner — AI Patient Acquisition for Med Spas | 15+ Leads/30 Days
```
**Current:** `FocusRunner — AI Patient Acquisition for Med Spas | [15+ Leads in 30 Days]`  
**Fix:** Remove brackets, use exact char budget. Keywords: AI Patient Acquisition, Med Spas.

---

## 2. Meta Description (160 chars max)

```
AI-powered patient acquisition for med spas. 15+ qualified leads in 30 days or it's free. $2,500/mo — landing page, AI chatbot, SMS follow-ups included.
```
**Current:** `[Free Audit] Deploy AI-powered patient acquisition in 7 days. 287% conversion improvement. 78% lower cost per lead. $2,500/mo — results guaranteed.`  
**Fix:** Drop vague stats, add concrete deliverables and guarantee. Include "med spa" keyword.

---

## 3. On-Page SEO

### H1
**Current:** `Your med spa. Fully booked.`  
**Recommendation:** Keep. Strong emotional hook. Primary keyword "med spa" is present.

### H2 Distribution
- How It Works — ✓ descriptive
- The Offer Stack — ⚠ rename to "Med Spa Patient Acquisition Pricing" for keyword inclusion
- The Guarantee — ✓ descriptive
- Built For — ✓ targets niches

### Keyword Density Targets
| Keyword | Target Density | Current |
|---------|---------------|---------|
| med spa / med spas | 8-12 | ~15 ✓ |
| patient acquisition | 6-10 | ~5 ⚠ low |
| AI patient acquisition | 3-5 | ~3 ✓ |
| Miami med spa | 3-5 | 1 ❌ missing |

**Action:** Add 2-3 "Miami med spa" keyword placements naturally in hero subtitle and How It Works section.

---

## 4. Technical SEO

### Current Status
- ✅ HTTPS enforced (Vercel auto)
- ✅ robots.txt present (meta robots: index, follow)
- ✅ Canonical URL set
- ✅ JSON-LD structured data (Organization, WebSite, FAQPage, Person)
- ✅ OG tags / Twitter cards
- ✅ Google Analytics (G-8ETM567BFC)
- ✅ Sitemap: needs verification
- ❌ Missing: Google Search Console verification
- ❌ Missing: Schema for LocalBusiness or MedicalBusiness

### Actions
1. **Add LocalBusiness schema** — target Miami geo with `"areaServed": {"@type": "City", "name": "Miami"}` 
2. **Verify sitemap.xml** exists and is submitted to GSC
3. **Add alt text audit** — ensure all images have descriptive alt attributes
4. **PageSpeed:** Vercel auto-optimizes, but audit Lighthouse scores monthly

---

## 5. Content SEO

### Blog Pages (Existing)
| Page | Target Keyword | Status |
|------|---------------|--------|
| `/blog/how-to-acquire-a-med-spa.html` | how to acquire a med spa | Published |
| `/blog/state-of-med-spa-acquisition-2026.html` | med spa acquisition 2026 | Published |
| `/blog/med-spa-valuation-methods.html` | med spa valuation methods | Published |
| `/blog/ai-marketing-medical-aesthetics.html` | AI marketing medical aesthetics | Published |
| `/blog/med-spa-patient-acquisition-costs.html` | med spa patient acquisition costs | Published |
| `/blog/case-study-template.html` | — template | Not indexed |

### Recommendations
- Add 2 more blog posts/month targeting long-tail keywords
- Interlink blog posts with contextually relevant anchor text
- Each blog post needs a unique meta description

### FAQ Section (JSON-LD)
✅ Implemented inline. Five Q&A pairs covering core prospect questions.  
**Recommendation:** Add FAQ section to visible page content (not just JSON-LD) for Google People Also Ask snippets.

---

## 6. Local SEO (Miami Focus)

- **Google Business Profile:** Verify and optimize for "AI patient acquisition Miami" — currently no GMB profile exists
- **Local citations:** Submit to Yelp, HealthGrades, Realself directories
- **NAP consistency:** FocusRunner is remote/virtual — use consistent business address if available
- **Local landing page:** Create `/miami-med-spa-patient-acquisition.html` targeting Miami-Dade geo modifiers

---

## 7. Backlink Strategy

### Current
- LinkedIn company page (focusrunner-io)
- X/Twitter profile
- Instagram profile
- Facebook page

### Targets
1. Guest post on med spa industry blogs (2/month)
2. HARO / Connectively responses for "med spa marketing" queries
3. Directory submissions: Clutch, G2, ProductHunt, SourceForge

---

## 8. Monitoring & KPIs

| Metric | Target | Tool |
|--------|--------|------|
| Organic clicks/month | 500+ | Google Search Console |
| Avg. position (med spa keywords) | < 15 | Google Search Console |
| Indexed pages | All blog + pages | GSC Coverage report |
| Bounce rate | < 60% | GA4 |
| Lead conversions from organic | 10+/month | CRM / leads.json |

---

## 9. Implementation Priority

1. **Critical:** Fix meta description, add "Miami med spa" keyword placement, add LocalBusiness schema
2. **High:** GSC verification, sitemap submission, GMB profile
3. **Medium:** Blog cadence (2/month), local landing page, FAQ visible content
4. **Ongoing:** Backlink outreach, keyword rank monitoring, PageSpeed audit

---

*Executed by Technical Director on behalf of CTO (FOC-1160).*
