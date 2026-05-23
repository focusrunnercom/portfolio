# Dogfood QA Report: focusrunner.io

**Date:** 2026-05-21 22:05 UTC
**URL:** https://focusrunner.io
**Scope:** Full site — HTML structure, all links, API endpoints, JS/CSS/performance
**Tools:** curl, grep, node, W3C Nu HTML Checker

---

## Executive Summary

**10 issues found:** 2 Critical, 2 Medium, 6 Low

| Severity | Count |
|----------|-------|
| Critical | 2     |
| Medium   | 2     |
| Low      | 6     |

The site loads fast (~175ms avg), all external links resolve, and all API endpoints respond correctly. The two critical issues are structural HTML violations that browsers auto-recover from but which degrade SEO, accessibility, and validator compliance.

---

## Issue #1 — CRITICAL — Missing closing `</style>` and `</head>` tags + No opening `<body>` tag

**URL:** https://focusrunner.io
**Severity:** Critical
**Category:** HTML / Structural

**Description:**
The deployed HTML document is structurally invalid. It has:

- `<style>` opening tag but **NO** `</style>` closing tag (1 open, 0 close)
- `<head>` opening tag but **NO** `</head>` closing tag (1 open, 0 close)
- `<body>` closing tag (`</body>`) but **NO** `<body>` opening tag (0 open, 1 close)

This means the entire page content (nav, sections, footer) is technically inside an unclosed `<head>` element. Browsers will auto-recover and render the page visually, but assistive technologies, screen readers, search engine crawlers, and validators will receive an invalid DOM.

**Evidence:**
```
<style>: open=1, close=0
<head>:  open=1, close=0
<body>:  open=0, close=1
```

Verified by:
- Raw byte-level HTML inspection confirming the tags are absent from the live response
- Comparison with local `index.html` which has all three tags correctly

**Steps to Reproduce:**
1. `curl -sS https://focusrunner.io`
2. Run `grep -c '<body>'` or check tag balance
3. Validate at https://validator.w3.org/nu/?doc=https://focusrunner.io

**Expected:**
```
</style>
</head>
<body>
```

**Actual:**
CSS content flows directly from `<head>` into the page body with no structural boundary.

**Suggested Fix:**
Verify the Vercel deployment deliverable. Local `index.html` has the correct tags — the deployed version may be a stale build or was served with a Vercel transformation that stripped them. Re-deploy from latest `origin/main`.

---

## Issue #2 — CRITICAL — Invalid SVG favicon `href` value (W3C validation error)

**URL:** https://focusrunner.io
**Severity:** Critical
**Category:** HTML / Validation

**Description:**
The inline SVG favicon uses unescaped `<` and `>` characters inside the `href` attribute value. According to HTML spec and W3C validator: *"Bad value for attribute 'href' on element 'link': Illegal character after 'ta:'. '<' is not allowed."*

**Evidence:**
```
<link rel="icon" href="data:image/svg+xml,<svg xmlns='...'><text ...>&gt;_</text></svg>">
```

The `>` in `&gt;` and `<svg`, `<rect`, `<text` tags are illegal characters in the `href` attribute.

**Steps to Reproduce:**
Validate at: https://validator.w3.org/nu/?doc=https://focusrunner.io

**Expected:**
The SVG should be URL-encoded: `data:image/svg+xml,%3Csvg%20xmlns=%27...`

**Suggested Fix:**
Replace the unescaped SVG in the href with:
```
data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='8' fill='%230d120f'/%3E%3Ctext x='32' y='46' font-family='monospace' font-size='40' font-weight='bold' fill='%236eff8a' text-anchor='middle'%3E%3E_%3C/text%3E%3C/svg%3E
```

---

## Issue #3 — MEDIUM — No `<h1>` tag (hero uses only `<h2>`)

**URL:** https://focusrunner.io
**Severity:** Medium
**Category:** SEO

**Description:**
The page has no `<h1>` element. The hero section uses an `<h2>` with class-based styling as the primary heading. Search engines rely on `<h1>` as the primary page topic indicator.

**Evidence:**
```
<h1> tags: 0
<h2> tags: 8
<h3> tags: 21
<h4> tags: 17
```

The hero "heading" is rendered as: `<h2 class="hero-title">AI systems that <em>fill your books</em> — every day.</h2>`

**Steps to Reproduce:**
1. Load page
2. Inspect heading hierarchy in DevTools or by grep
3. Note absence of `<h1>`

**Expected:**
One `<h1>` should contain the page's primary keyword-rich title (e.g., "AI Patient Acquisition for Med Spas").

**Suggested Fix:**
Change the hero `<h2 class="hero-title">` to `<h1 class="hero-title">` and adjust heading levels throughout the document.

---

## Issue #4 — MEDIUM — Heading level skip: `<h4>` follows `<h2>` directly (no `<h3>` in between)

**URL:** https://focusrunner.io
**Severity:** Medium
**Category:** Accessibility / SEO

**Description:**
In the "Niches We Serve" section, `<h4>` follows `<h2>` directly, skipping heading level 3. This violates WCAG 2.4.6 (Headings and Labels) and creates an inconsistent outline for screen readers.

**Evidence (from W3C validator):**
```
"The heading 'h4' (with computed level 4) follows the heading 'h2' (with computed level 2), skipping 1 heading level."
```

**Affected section:**
```html
<section id="niches">
  <h2>Niches We Serve</h2>
  ...
  <h4>Dermatology</h4>
```

**Steps to Reproduce:**
Validate at: https://validator.w3.org/nu/?doc=https://focusrunner.io

**Expected:**
Use `<h3>` for niche cards instead of `<h4>`, or add an `<h3>` sub-heading between `<h2>` and `<h4>`.

**Suggested Fix:**
Change `<h4>` to `<h3>` in the "Niches We Serve" grid section (lines containing `💉`, `🦷`, etc.).

---

## Issue #5 — LOW — No `og:image` or `twitter:image` meta tags

**URL:** https://focusrunner.io
**Severity:** Low
**Category:** Social Sharing

**Description:**
When the URL is shared on social media (Facebook, X/Twitter, LinkedIn, Discord), no image is attached to the preview card due to missing `og:image` and `twitter:image` meta tags.

**Evidence:**
```
og:image: NOT FOUND
twitter:image: NOT FOUND
```

The page has `og:title`, `og:description`, `twitter:title`, and `twitter:description`, but no image.

**Steps to Reproduce:**
1. Paste https://focusrunner.io into LinkedIn, Slack, or X
2. Observe the preview card has no image

**Expected:**
A 1200x630px branded image should appear in all social previews.

**Suggested Fix:**
Add:
```html
<meta property="og:image" content="https://focusrunner.io/og-image.png">
<meta name="twitter:image" content="https://focusrunner.io/og-image.png">
```
Create a 1200x630px OG image and place it at `public/og-image.png`.

---

## Issue #6 — LOW — No `font-display` property on web fonts (FOIT risk)

**URL:** https://focusrunner.io
**Severity:** Low
**Category:** Performance / UX

**Description:**
The page loads JetBrains Mono from Google Fonts but does not set `font-display: swap`. Users on slow connections will experience a Flash of Invisible Text (FOIT) for up to 3 seconds before text becomes visible.

**Evidence:**
```css
font-family: 'JetBrains Mono', monospace;
```
Used throughout the CSS without `font-display` on the Google Fonts stylesheet.

**Steps to Reproduce:**
1. Open DevTools and throttle network to "Slow 3G"
2. Reload — see invisible text until font download completes

**Expected:**
Text should render immediately in fallback monospace, then swap to JetBrains Mono when loaded.

**Suggested Fix:**
Append `&display=swap` to the Google Fonts URL:
```
https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap
```

---

## Issue #7 — LOW — Section without `<h2>`-`<h6>` heading

**URL:** https://focusrunner.io
**Severity:** Low
**Category:** Accessibility

**Description:**
One `<section>` element lacks an identifying heading. The W3C validator reports: *"Section lacks heading. Consider using h2-h6 elements to add identifying headings to all sections."*

**Affected section:** `<section style="padding-top:0;">` (the "How It Works" / terminal demo section)

**Steps to Reproduce:**
1. Run W3C validation
2. Note warning about section lacking heading

**Expected:**
Every `<section>` should have a heading for accessibility.

**Suggested Fix:**
Add an `<h2>` heading (can be visually hidden with CSS) to the terminal section, or replace `<section>` with `<div>` if it doesn't need a heading.

---

## Issue #8 — LOW — LinkedIn profile URL returns HTTP 999 (rate-limited)

**URL:** https://www.linkedin.com/company/focusrunner-io/
**Severity:** Low
**Category:** Social / External Link

**Description:**
The LinkedIn link in the footer returns HTTP 999 (LinkedIn rate-limiting) when accessed without a browser session. This is a LinkedIn-imposed restriction on programmatic access, but the link itself is correct.

**Evidence:**
```
https://www.linkedin.com/company/focusrunner-io/ → HTTP 999
```

The link works fine in a real browser.

**Expected:** No action needed — this is a LinkedIn policy, not a site bug. Flagged for awareness only.

---

## Issue #9 — LOW — Stale `public/chat-widget.js` differs from root `chat-widget.js`

**URL:** https://focusrunner.io/public/chat-widget.js
**Severity:** Low
**Category:** Maintenance

**Description:**
There are two copies of the chat widget:
- Root: `/home/ai13/focusrunnercom/portfolio/chat-widget.js` — 18,345 bytes (live, served at `/chat-widget.js`)
- Public: `/home/ai13/focusrunnercom/portfolio/public/chat-widget.js` — 12,571 bytes (stale, served at `/public/chat-widget.js`)

The nline `index.html` references `/chat-widget.js` (root), not `/public/chat-widget.js`. The stale version in `public/` should be removed to eliminate confusion.

**Steps to Reproduce:**
```bash
ls -la chat-widget.js          # 18345 bytes
ls -la public/chat-widget.js   # 12571 bytes
curl -sS https://focusrunner.io/public/chat-widget.js | wc -c  # 12571
curl -sS https://focusrunner.io/chat-widget.js | wc -c         # 18345
```

**Suggested Fix:**
Delete `public/chat-widget.js` since it's unused and out of date.

---

## Issue #10 — LOW — `public/ig/` directory contents not accessible via web

**URL:** https://focusrunner.io/public/ig/ig-1.jpg
**Severity:** Low
**Category:** Content

**Description:**
The Instagram post images in `public/ig/` are not served by Vercel. The directory exists locally with 6 images (1,138 bytes) but none are accessible from the live site (all return 404). If these are intended to be served for social media or embedding, they need correct routing.

**Evidence:**
```
https://focusrunner.io/public/ig/ig-1.jpg → HTTP 404
```

**Note:** If these images are only used by the CMO automation pipeline and not referenced from the website, this is not a bug — flagging for awareness.

---

## Summary Table

| #  | Severity | Category       | Description                                       | URL                     |
|----|----------|----------------|---------------------------------------------------|-------------------------|
| 1  | CRITICAL | HTML Structure | Missing `</style>`, `</head>`, `<body>` tags       | `/`                     |
| 2  | CRITICAL | HTML Validation| Invalid chars in SVG favicon `href`               | `/` (favicon link)      |
| 3  | MEDIUM   | SEO            | No `<h1>` heading                                 | `/` (hero section)      |
| 4  | MEDIUM   | Accessibility  | Heading level skip `<h2>`→`<h4>`                  | `/` (#niches section)   |
| 5  | LOW      | Social Sharing | No `og:image` or `twitter:image`                  | `/` (meta tags)         |
| 6  | LOW      | Performance    | No `font-display: swap` — FOIT risk               | `/` (Google Fonts)      |
| 7  | LOW      | Accessibility  | Section without heading                           | `/` (terminal section)  |
| 8  | LOW      | External Link  | LinkedIn returns HTTP 999 (rate-limited)          | `/` (footer)            |
| 9  | LOW      | Maintenance    | Stale `public/chat-widget.js` differs from root   | `/public/chat-widget.js`|
| 10 | LOW      | Content        | `public/ig/` images not served (maybe intended)   | `/public/ig/*.jpg`      |

---

## Testing Notes

**What passed:**
- All API endpoints return correct HTTP status codes and valid JSON
- `/api/health` — 200 OK, reports correct env state
- `/api/chat` — 200 OK, responds with qualification questions
- `/api/webhook` — 202 Accepted with valid payload, 400 with validation errors on invalid payloads
- `/api/leads` — 200 OK, returns lead array
- `/api/analytics` — 200 OK
- CORS headers present on all API endpoints (`Access-Control-Allow-Origin: *`)
- HTTPS redirect works (HTTP→HTTPS 308, www→apex 307)
- 404 returns proper NOT_FOUND
- All social media links resolve (Facebook 200, X/Twitter 200, Instagram 200, LinkedIn 999 = rate-limit, not broken)
- `focusrunner.com` redirects to `focusrunner.io` correctly
- Google Fonts CSS renders successfully (723 bytes)
- Chat widget JS syntax-valid (18,345 bytes, parses clean)
- Inline JS syntactically valid
- No localhost/internal IP references
- Viewport meta, lang, canonical, og:title/description all correct
- No duplicate IDs
- No mixed HTTP content
- Average page load: ~174ms (Vercel edge cache)

**What was not tested:**
- Browser-based visual/rendering QA (browser tools unavailable)
- Real user flow through chat widget (requires WebSocket/browser interaction)
- Responsive layout at specific breakpoints (no mobile emulation available)
- Accessibility screen reader testing
- Performance on slow connections (FOIT theory only)
- Cross-browser rendering
