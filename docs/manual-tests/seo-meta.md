# Manual Test: SEO Meta Tags

## Test Environment
- **Browser**: Chrome (latest) with DevTools
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Chrome DevTools or SEO testing tool available
- [ ] Social media debugger tools accessible (Facebook, Twitter)

## Overview
This document covers manual testing of SEO meta tags across all pages of the MasonArt e-commerce platform, including:
- HTML document title
- Meta description
- Viewport and charset meta tags
- Open Graph meta tags (Facebook, LinkedIn)
- Twitter Card meta tags
- Canonical URLs
- Robots meta directives
- Other SEO-relevant meta tags

## Test Cases

---

## Basic Meta Tags

### TC-001: Document Title - Home Page

**Description**: Verify home page has appropriate title

**Steps**:
1. Navigate to http://localhost:3001/
2. Check document title in browser tab
3. Inspect `<title>` tag in page source

**Expected Result**:
- Title format: "MasonArt - Premium Art Prints & Posters" (or similar)
- Title length: 50-60 characters
- Brand name included
- Compelling and descriptive

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-002: Document Title - Product Listing Page

**Description**: Verify product listing page has appropriate title

**Steps**:
1. Navigate to http://localhost:3001/posters
2. Check document title
3. Navigate with filters: /posters?styles=abstract
4. Check if title updates

**Expected Result**:
- Base title: "Posters | MasonArt" or similar
- With filters: "Abstract Posters | MasonArt"
- Category-specific titles when filtering
- Brand name consistent

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Base Title: _______________
- Filtered Title: _______________

---

### TC-003: Document Title - Product Detail Page

**Description**: Verify product detail page has product-specific title

**Steps**:
1. Navigate to a product detail page
2. Check document title
3. Verify product name is included

**Expected Result**:
- Format: "{Product Name} | MasonArt"
- Product name prominent
- SEO-friendly keywords included
- 50-60 characters or fewer

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-004: Document Title - Cart Page

**Description**: Verify cart page has appropriate title

**Steps**:
1. Navigate to http://localhost:3001/cart
2. Check document title

**Expected Result**:
- Format: "Shopping Cart | MasonArt"
- Clear indication of page purpose
- Brand name included

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-005: Document Title - Checkout Page

**Description**: Verify checkout page has appropriate title

**Steps**:
1. Add item to cart
2. Navigate to checkout
3. Check document title

**Expected Result**:
- Format: "Checkout | MasonArt"
- Clear indication of checkout process
- No sensitive information in title

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-006: Document Title - User Account Pages

**Description**: Verify account pages have appropriate titles

**Steps**:
1. Navigate to /login
2. Check title
3. Navigate to /register
4. Navigate to /account (logged in)

**Expected Result**:
- Login: "Sign In | MasonArt"
- Register: "Create Account | MasonArt"
- Account: "My Account | MasonArt"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Login Title: _______________
- Register Title: _______________
- Account Title: _______________

---

### TC-007: Meta Description - Home Page

**Description**: Verify home page meta description

**Steps**:
1. Navigate to home page
2. Inspect `<meta name="description">` tag
3. Verify content is compelling and accurate

**Expected Result**:
- Description exists
- Length: 150-160 characters
- Contains brand keywords
- Compelling call to action
- No duplicate descriptions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________
- Length: ___ characters

---

### TC-008: Meta Description - Product Detail Page

**Description**: Verify product pages have unique meta descriptions

**Steps**:
1. Navigate to product detail page
2. Inspect meta description
3. Check multiple products have different descriptions

**Expected Result**:
- Description unique to product
- Contains product name
- May contain price or key features
- Compelling for click-through
- 150-160 characters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-009: Meta Description - Category Pages

**Description**: Verify category/filter pages have appropriate descriptions

**Steps**:
1. Navigate to /posters?styles=abstract
2. Inspect meta description
3. Navigate to other categories

**Expected Result**:
- Category-specific descriptions
- Describes available products
- Keywords relevant to category
- Unique per category

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-010: Viewport Meta Tag

**Description**: Verify viewport meta tag for responsive design

**Steps**:
1. Navigate to any page
2. Inspect `<meta name="viewport">` tag

**Expected Result**:
- Tag exists: `<meta name="viewport" content="width=device-width, initial-scale=1">`
- Allows user scaling (no maximum-scale restriction)
- Present on all pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Content: _______________

---

### TC-011: Charset Meta Tag

**Description**: Verify character encoding meta tag

**Steps**:
1. Navigate to any page
2. Inspect `<meta charset>` tag

**Expected Result**:
- Tag exists: `<meta charset="UTF-8">`
- Placed early in `<head>`
- Consistent across all pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Charset: _______________

---

### TC-012: Robots Meta Tag - Public Pages

**Description**: Verify robots meta tag allows indexing of public pages

**Steps**:
1. Navigate to home page
2. Inspect `<meta name="robots">` tag
3. Check product pages, category pages

**Expected Result**:
- Either no robots meta tag (defaults to index, follow)
- Or `<meta name="robots" content="index, follow">`
- All public pages indexable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home: _______________
- Products: _______________

---

### TC-013: Robots Meta Tag - Private Pages

**Description**: Verify robots meta tag prevents indexing of private pages

**Steps**:
1. Navigate to /cart
2. Inspect robots meta tag
3. Navigate to /checkout
4. Navigate to /account

**Expected Result**:
- Cart: `<meta name="robots" content="noindex, nofollow">`
- Checkout: `<meta name="robots" content="noindex, nofollow">`
- Account: `<meta name="robots" content="noindex, nofollow">`
- Login/Register may be noindex

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart: _______________
- Checkout: _______________
- Account: _______________

---

## Canonical URLs

### TC-014: Canonical URL - Home Page

**Description**: Verify canonical URL on home page

**Steps**:
1. Navigate to home page
2. Inspect `<link rel="canonical">` tag
3. Verify URL is absolute

**Expected Result**:
- Tag exists: `<link rel="canonical" href="https://masonart.com/">`
- Uses HTTPS
- Uses production domain (or correct environment)
- No trailing parameters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Canonical URL: _______________

---

### TC-015: Canonical URL - Product Pages

**Description**: Verify canonical URL on product detail pages

**Steps**:
1. Navigate to product page
2. Inspect canonical tag
3. Try adding query params (?ref=test)
4. Verify canonical stays clean

**Expected Result**:
- Canonical: "https://masonart.com/posters/{category}/{slug}"
- No query parameters in canonical
- Absolute URL
- Matches actual product URL

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Canonical URL: _______________

---

### TC-016: Canonical URL - Paginated Pages

**Description**: Verify canonical URLs on paginated listing pages

**Steps**:
1. Navigate to /posters?page=1
2. Navigate to /posters?page=2
3. Inspect canonical tags on each

**Expected Result**:
- Each page has own canonical (page-specific)
- Or all point to page 1 (consolidated)
- Consistent approach across pagination

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page 1 Canonical: _______________
- Page 2 Canonical: _______________

---

### TC-017: Canonical URL - Filtered Pages

**Description**: Verify canonical URLs with filters applied

**Steps**:
1. Navigate to /posters?styles=abstract
2. Navigate to /posters?styles=abstract&sort=price
3. Inspect canonical tags

**Expected Result**:
- Canonical may include primary filter
- Excludes sort/secondary parameters
- Or points to unfiltered page (SEO strategy)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Filtered Canonical: _______________

---

## Open Graph Tags

### TC-018: OG Title - All Pages

**Description**: Verify og:title meta tag across pages

**Steps**:
1. Navigate to home page
2. Inspect `<meta property="og:title">` tag
3. Check product pages, category pages

**Expected Result**:
- Tag exists on all public pages
- Content matches or similar to document title
- Character limit: 60-90 characters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home OG Title: _______________
- Product OG Title: _______________

---

### TC-019: OG Description - All Pages

**Description**: Verify og:description meta tag

**Steps**:
1. Navigate to various pages
2. Inspect `<meta property="og:description">` tags

**Expected Result**:
- Tag exists on all public pages
- Content matches or similar to meta description
- Compelling for social sharing
- 150-200 characters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-020: OG Type - Page Types

**Description**: Verify og:type meta tag for different page types

**Steps**:
1. Navigate to home page - inspect og:type
2. Navigate to product page - inspect og:type
3. Navigate to category page - inspect og:type

**Expected Result**:
- Home: `og:type = "website"`
- Product: `og:type = "product"` or "og:product"
- Category: `og:type = "website"`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home: _______________
- Product: _______________
- Category: _______________

---

### TC-021: OG Image - Home Page

**Description**: Verify og:image meta tag on home page

**Steps**:
1. Navigate to home page
2. Inspect `<meta property="og:image">` tag
3. Verify image URL is accessible

**Expected Result**:
- Tag exists with absolute URL
- Image is at least 1200x630 pixels (recommended)
- Image URL is accessible/valid
- Alt og:image:alt tag present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- OG Image URL: _______________
- Image accessible: [ ] Yes / [ ] No

---

### TC-022: OG Image - Product Pages

**Description**: Verify og:image shows product image

**Steps**:
1. Navigate to product page
2. Inspect og:image tag
3. Verify image is product-specific

**Expected Result**:
- Image is main product image
- High quality for social sharing
- og:image:width and og:image:height if specified
- Fallback image if product has no image

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product Image URL: _______________

---

### TC-023: OG URL - All Pages

**Description**: Verify og:url meta tag

**Steps**:
1. Navigate to various pages
2. Inspect `<meta property="og:url">` tags

**Expected Result**:
- Matches canonical URL
- Absolute URL with protocol
- Clean URL (no tracking params)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- OG URL: _______________

---

### TC-024: OG Site Name

**Description**: Verify og:site_name meta tag

**Steps**:
1. Navigate to any page
2. Inspect `<meta property="og:site_name">` tag

**Expected Result**:
- Tag exists: `og:site_name = "MasonArt"`
- Consistent across all pages
- Matches brand name

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Site Name: _______________

---

### TC-025: OG Locale

**Description**: Verify og:locale meta tag

**Steps**:
1. Navigate to any page
2. Inspect `<meta property="og:locale">` tag

**Expected Result**:
- Tag exists: `og:locale = "en_IN"` (or appropriate)
- Matches site language/region

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Locale: _______________

---

### TC-026: Product-Specific OG Tags

**Description**: Verify product-specific Open Graph tags on product pages

**Steps**:
1. Navigate to product detail page
2. Inspect product-related OG tags

**Expected Result**:
- `product:price:amount` = product price
- `product:price:currency` = "INR"
- `product:availability` = "in stock" or "out of stock"
- `product:brand` = "MasonArt" or artist name

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Amount: _______________
- Currency: _______________
- Availability: _______________

---

## Twitter Card Tags

### TC-027: Twitter Card Type

**Description**: Verify twitter:card meta tag

**Steps**:
1. Navigate to home page - inspect twitter:card
2. Navigate to product page - inspect twitter:card

**Expected Result**:
- Home: `twitter:card = "summary_large_image"`
- Product: `twitter:card = "summary_large_image"` or "product"
- Consistent card type for similar pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home Card Type: _______________
- Product Card Type: _______________

---

### TC-028: Twitter Title and Description

**Description**: Verify twitter:title and twitter:description tags

**Steps**:
1. Navigate to various pages
2. Inspect Twitter-specific title and description

**Expected Result**:
- twitter:title present (or falls back to og:title)
- twitter:description present (or falls back to og:description)
- Optimized for Twitter display

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Twitter Title: _______________
- Twitter Description: _______________

---

### TC-029: Twitter Image

**Description**: Verify twitter:image meta tag

**Steps**:
1. Navigate to various pages
2. Inspect twitter:image tag

**Expected Result**:
- Image URL present
- Minimum 280x150 pixels
- Maximum 4096x4096 pixels
- Falls back to og:image if not specified

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Twitter Image: _______________

---

### TC-030: Twitter Site Account

**Description**: Verify twitter:site meta tag

**Steps**:
1. Navigate to any page
2. Inspect `<meta name="twitter:site">` tag

**Expected Result**:
- Tag exists: `twitter:site = "@MasonArt"` (or company handle)
- Valid Twitter handle format
- Consistent across all pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Twitter Site: _______________

---

### TC-031: Twitter Creator Account

**Description**: Verify twitter:creator meta tag (if applicable)

**Steps**:
1. Navigate to product pages with artist attribution
2. Inspect `<meta name="twitter:creator">` tag

**Expected Result**:
- If artist has Twitter: twitter:creator = artist handle
- Otherwise may default to site handle
- Optional tag

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Twitter Creator: _______________

---

### TC-032: Twitter Product Labels

**Description**: Verify Twitter product label tags on product pages

**Steps**:
1. Navigate to product detail page
2. Inspect twitter:label1, twitter:data1, etc.

**Expected Result**:
- twitter:label1 = "Price"
- twitter:data1 = "Rs. X,XXX"
- twitter:label2 = "Availability" (optional)
- twitter:data2 = "In Stock" (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Label 1: _______________ Data 1: _______________
- Label 2: _______________ Data 2: _______________

---

## Facebook Debugger Validation

### TC-033: Facebook Sharing Preview

**Description**: Validate meta tags using Facebook Sharing Debugger

**Steps**:
1. Go to https://developers.facebook.com/tools/debug/
2. Enter home page URL
3. Click "Debug"
4. Review preview and warnings

**Expected Result**:
- No critical errors
- Image preview displays correctly
- Title and description appear
- og:type recognized

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Warnings: _______________
- Preview looks correct: [ ] Yes / [ ] No

---

### TC-034: Facebook Product Page Preview

**Description**: Validate product page with Facebook Debugger

**Steps**:
1. Use Facebook Sharing Debugger
2. Enter product page URL
3. Review preview

**Expected Result**:
- Product title visible
- Product image displayed
- Price information shown (if using product tags)
- No missing required tags warnings

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Preview: _______________

---

## Twitter Card Validator

### TC-035: Twitter Card Validator - Home Page

**Description**: Validate meta tags using Twitter Card Validator

**Steps**:
1. Go to https://cards-dev.twitter.com/validator
2. Enter home page URL
3. Click "Preview card"

**Expected Result**:
- Card renders correctly
- Large image displayed (if summary_large_image)
- Title and description visible
- No validation errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Card Type: _______________
- Preview correct: [ ] Yes / [ ] No

---

### TC-036: Twitter Card Validator - Product Page

**Description**: Validate product page with Twitter Card Validator

**Steps**:
1. Use Twitter Card Validator
2. Enter product page URL
3. Review card preview

**Expected Result**:
- Product image prominent
- Product title visible
- Price labels if configured
- Card renders as expected

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Preview: _______________

---

## Additional SEO Meta Tags

### TC-037: Theme Color Meta Tag

**Description**: Verify theme-color meta tag for mobile browsers

**Steps**:
1. Navigate to any page
2. Inspect `<meta name="theme-color">` tag

**Expected Result**:
- Tag exists with brand color
- Example: `<meta name="theme-color" content="#000000">`
- Affects mobile browser UI color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Theme Color: _______________

---

### TC-038: Author and Publisher Meta Tags

**Description**: Verify author/publisher meta tags

**Steps**:
1. Navigate to any page
2. Inspect author-related meta tags

**Expected Result**:
- `<meta name="author" content="MasonArt">` (optional)
- `<link rel="author" href="...">` (optional)
- Consistent attribution

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Author: _______________

---

### TC-039: Language Declaration

**Description**: Verify language is properly declared

**Steps**:
1. Navigate to any page
2. Inspect `<html lang="">` attribute
3. Check `<meta http-equiv="content-language">` (if exists)

**Expected Result**:
- `<html lang="en">` or `<html lang="en-IN">`
- Consistent across all pages
- Matches actual content language

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Language: _______________

---

### TC-040: Favicon and Apple Touch Icons

**Description**: Verify favicon and touch icon meta tags

**Steps**:
1. Navigate to any page
2. Inspect link tags for icons

**Expected Result**:
- `<link rel="icon" href="/favicon.ico">`
- `<link rel="apple-touch-icon" href="/apple-touch-icon.png">`
- Multiple sizes for different devices
- Icons accessible and properly formatted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Favicon: _______________
- Apple Touch Icon: _______________

---

### TC-041: Web App Manifest Link

**Description**: Verify web app manifest is linked

**Steps**:
1. Navigate to any page
2. Inspect `<link rel="manifest">` tag

**Expected Result**:
- `<link rel="manifest" href="/manifest.json">`
- Manifest file accessible
- Contains app metadata

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Manifest: _______________

---

## Cross-Page Consistency

### TC-042: Meta Tag Consistency

**Description**: Verify meta tags are consistent across pages

**Steps**:
1. Navigate to 5 different pages
2. Compare standard meta tags (viewport, charset, theme-color)
3. Note any inconsistencies

**Expected Result**:
- Viewport identical across pages
- Charset identical
- Theme-color identical
- Site name identical
- Only page-specific tags differ

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Inconsistencies found: _______________

---

### TC-043: Missing Meta Tags Check

**Description**: Verify no pages are missing critical meta tags

**Steps**:
1. Navigate through major pages
2. Check each has: title, description, og:title, og:image
3. List any pages missing tags

**Expected Result**:
- All pages have title
- All pages have description
- All public pages have OG tags
- No 404 pages missing meta tags

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Missing tags on: _______________

---

## Error Pages

### TC-044: 404 Page Meta Tags

**Description**: Verify 404 page has appropriate meta tags

**Steps**:
1. Navigate to /non-existent-page
2. Inspect meta tags

**Expected Result**:
- Title: "Page Not Found | MasonArt"
- robots: "noindex, nofollow"
- Description present
- OG tags optional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________
- Robots: _______________

---

### TC-045: 500 Error Page Meta Tags

**Description**: Verify error pages have appropriate meta tags

**Steps**:
1. Trigger a 500 error (if possible)
2. Inspect meta tags

**Expected Result**:
- Title: "Error | MasonArt"
- robots: "noindex, nofollow"
- User-friendly error page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## AI Generator Page

### TC-046: AI Generator Meta Tags

**Description**: Verify AI generation page has appropriate SEO tags

**Steps**:
1. Navigate to /ai-generator or similar
2. Inspect all meta tags

**Expected Result**:
- Title: "AI Poster Generator | MasonArt"
- Description: Describes AI features
- og:type: "website"
- Unique image if possible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________
- Description: _______________

---

## Admin Pages

### TC-047: Admin Pages - No Indexing

**Description**: Verify admin pages are not indexed

**Steps**:
1. Navigate to /admin (if accessible)
2. Inspect robots meta tag

**Expected Result**:
- `<meta name="robots" content="noindex, nofollow">`
- No OG tags necessary
- Login-protected pages noindex

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Robots: _______________

---

## Mobile-Specific Meta Tags

### TC-048: Mobile Viewport Behavior

**Description**: Verify viewport meta doesn't restrict mobile use

**Steps**:
1. Open page on mobile device
2. Try pinch-to-zoom
3. Inspect viewport meta

**Expected Result**:
- Zooming allowed (no user-scalable=no)
- No maximum-scale=1 restriction
- Accessibility-friendly viewport

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Zoom allowed: [ ] Yes / [ ] No

---

### TC-049: Apple Mobile Web App Meta Tags

**Description**: Verify Apple-specific meta tags for iOS

**Steps**:
1. Navigate to any page
2. Inspect Apple meta tags

**Expected Result**:
- `<meta name="apple-mobile-web-app-capable" content="yes">` (if PWA)
- `<meta name="apple-mobile-web-app-status-bar-style">`
- Consistent across pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- App Capable: _______________
- Status Bar Style: _______________

---

## SEO Tool Validation

### TC-050: Google Rich Results Test

**Description**: Validate pages with Google Rich Results Test

**Steps**:
1. Go to https://search.google.com/test/rich-results
2. Enter home page URL
3. Enter product page URL
4. Review results

**Expected Result**:
- No critical errors
- Product rich results detected on product pages
- Breadcrumb detected
- All required fields present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home Page Status: _______________
- Product Page Status: _______________

---

### TC-051: Lighthouse SEO Audit

**Description**: Run Lighthouse SEO audit on pages

**Steps**:
1. Open Chrome DevTools
2. Go to Lighthouse tab
3. Run SEO audit on home page
4. Run on product page

**Expected Result**:
- SEO score: 90+
- No critical issues
- All meta tags present
- Mobile-friendly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home Page Score: _______________
- Product Page Score: _______________
- Issues: _______________

---

## Issues Found

| ID | Description | Severity | Page | Status |
|----|-------------|----------|------|--------|
| | | | | |

## Summary

- **Total Test Cases**: 51
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Meta Tag Reference

**Required Meta Tags:**
- `<meta charset="UTF-8">`
- `<meta name="viewport" content="width=device-width, initial-scale=1">`
- `<title>Page Title | MasonArt</title>`
- `<meta name="description" content="...">`
- `<link rel="canonical" href="...">`

**Open Graph Tags:**
- `<meta property="og:title">`
- `<meta property="og:description">`
- `<meta property="og:image">`
- `<meta property="og:url">`
- `<meta property="og:type">`
- `<meta property="og:site_name">`

**Twitter Card Tags:**
- `<meta name="twitter:card">`
- `<meta name="twitter:title">`
- `<meta name="twitter:description">`
- `<meta name="twitter:image">`
- `<meta name="twitter:site">`

### Testing Tools
- Facebook Sharing Debugger: https://developers.facebook.com/tools/debug/
- Twitter Card Validator: https://cards-dev.twitter.com/validator
- Google Rich Results Test: https://search.google.com/test/rich-results
- Lighthouse: Chrome DevTools

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Title Optimization**:
   - Keep titles under 60 characters
   - Include primary keyword
   - Make each title unique

2. **Description Optimization**:
   - 150-160 characters
   - Include call to action
   - Unique per page

3. **Image Optimization**:
   - OG images: 1200x630 pixels
   - Twitter images: 1200x600 pixels
   - Compress for fast loading

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
