# Manual Test: JSON-LD Structured Data

## Test Environment
- **Browser**: Chrome (latest) with DevTools
- **Viewport**: Desktop (1920x1080)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products (various prices, categories)
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] Chrome DevTools or JSON-LD validator available
- [ ] Google Rich Results Test accessible

## Overview
This document covers manual testing of JSON-LD structured data across all pages of the chobi.art e-commerce platform, including:
- Organization schema
- WebSite schema
- Product schema
- BreadcrumbList schema
- FAQPage schema (if applicable)
- SearchAction schema
- Offer/AggregateOffer schema
- LocalBusiness schema (if applicable)
- Review/AggregateRating schema (if applicable)

## Test Cases

---

## JSON-LD Basics

### TC-001: JSON-LD Script Tag Present

**Description**: Verify JSON-LD script tag exists on pages

**Steps**:
1. Navigate to home page
2. Open DevTools (F12)
3. Search for `<script type="application/ld+json">`
4. Verify JSON-LD content

**Expected Result**:
- At least one JSON-LD script tag present
- Type is exactly "application/ld+json"
- Content is valid JSON
- No syntax errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Number of JSON-LD scripts: _______________

---

### TC-002: JSON-LD Valid JSON Format

**Description**: Verify JSON-LD content is valid JSON

**Steps**:
1. Navigate to any page
2. Extract JSON-LD script content
3. Validate JSON using JSON.parse() or online validator

**Expected Result**:
- Valid JSON syntax
- No trailing commas
- Properly escaped strings
- No undefined values

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation errors: _______________

---

### TC-003: JSON-LD @context

**Description**: Verify @context property is correct

**Steps**:
1. Inspect JSON-LD content
2. Check @context value

**Expected Result**:
- @context: "https://schema.org" or "http://schema.org"
- Present in all JSON-LD objects
- Consistent across pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- @context value: _______________

---

## Organization Schema

### TC-004: Organization Schema - Home Page

**Description**: Verify Organization schema on home page

**Steps**:
1. Navigate to home page
2. Find JSON-LD with @type: "Organization"
3. Inspect all properties

**Expected Result**:
```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "chobi.art",
  "url": "https://chobi.art",
  "logo": "https://chobi.art/logo.png",
  "sameAs": [
    "https://facebook.com/chobi",
    "https://instagram.com/chobi",
    "https://twitter.com/chobi"
  ]
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Name: _______________
- URL: _______________
- Logo: _______________
- Social profiles present: [ ] Yes / [ ] No

---

### TC-005: Organization - Contact Information

**Description**: Verify contact information in Organization schema

**Steps**:
1. Inspect Organization JSON-LD
2. Check for contactPoint

**Expected Result**:
- contactPoint array present (if applicable)
- telephone number if provided
- email if provided
- contactType specified

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Contact info: _______________

---

### TC-006: Organization - Address (if applicable)

**Description**: Verify address in Organization schema

**Steps**:
1. Inspect Organization JSON-LD
2. Check for address property

**Expected Result**:
- PostalAddress type
- streetAddress, addressLocality, addressRegion
- postalCode, addressCountry
- All accurate to business location

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Address present: [ ] Yes / [ ] No

---

## WebSite Schema

### TC-007: WebSite Schema - Home Page

**Description**: Verify WebSite schema on home page

**Steps**:
1. Navigate to home page
2. Find JSON-LD with @type: "WebSite"
3. Inspect properties

**Expected Result**:
```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "chobi.art",
  "url": "https://chobi.art",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://chobi.art/search?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Name: _______________
- URL: _______________
- SearchAction present: [ ] Yes / [ ] No

---

### TC-008: SearchAction Schema

**Description**: Verify SearchAction in WebSite schema

**Steps**:
1. Find WebSite JSON-LD
2. Inspect potentialAction

**Expected Result**:
- @type: "SearchAction"
- target URL template with {search_term_string}
- query-input specifies required parameter
- Target URL matches actual search functionality

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search target: _______________

---

## Product Schema

### TC-009: Product Schema - Basic Properties

**Description**: Verify basic Product schema on product pages

**Steps**:
1. Navigate to product detail page
2. Find JSON-LD with @type: "Product"
3. Inspect basic properties

**Expected Result**:
```json
{
  "@context": "https://schema.org",
  "@type": "Product",
  "name": "Product Name",
  "description": "Product description",
  "sku": "PRODUCT-SKU",
  "image": ["https://..."],
  "brand": {
    "@type": "Brand",
    "name": "chobi.art"
  }
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Name: _______________
- SKU: _______________
- Brand: _______________

---

### TC-010: Product Schema - Images

**Description**: Verify product images in schema

**Steps**:
1. Inspect Product JSON-LD
2. Check image property

**Expected Result**:
- image is array or URL
- All images are absolute URLs
- Primary image included
- High-quality images (recommended 1200x1200)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Number of images: _______________
- Image URLs valid: [ ] Yes / [ ] No

---

### TC-011: Product Schema - Description

**Description**: Verify product description in schema

**Steps**:
1. Inspect Product JSON-LD
2. Check description property

**Expected Result**:
- description property present
- Matches or relates to visible description
- No HTML tags (plain text)
- Appropriate length

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description preview: _______________

---

### TC-012: Offer Schema - Single Price

**Description**: Verify Offer schema for products with single price

**Steps**:
1. Navigate to product with single variant
2. Inspect offers property in Product JSON-LD

**Expected Result**:
```json
"offers": {
  "@type": "Offer",
  "url": "https://chobi.art/posters/...",
  "priceCurrency": "INR",
  "price": "1499",
  "availability": "https://schema.org/InStock",
  "seller": {
    "@type": "Organization",
    "name": "chobi.art"
  }
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price: _______________
- Currency: _______________
- Availability: _______________

---

### TC-013: AggregateOffer Schema - Price Range

**Description**: Verify AggregateOffer for products with multiple prices

**Steps**:
1. Navigate to product with multiple sizes/variants
2. Inspect offers property

**Expected Result**:
```json
"offers": {
  "@type": "AggregateOffer",
  "priceCurrency": "INR",
  "lowPrice": "999",
  "highPrice": "4999",
  "offerCount": "5",
  "availability": "https://schema.org/InStock"
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Low Price: _______________
- High Price: _______________
- Offer Count: _______________

---

### TC-014: Offer - Availability Status

**Description**: Verify availability reflects actual stock

**Steps**:
1. Navigate to in-stock product
2. Check availability in JSON-LD
3. Navigate to out-of-stock product (if exists)
4. Check availability

**Expected Result**:
- In Stock: "https://schema.org/InStock"
- Out of Stock: "https://schema.org/OutOfStock"
- Pre-order: "https://schema.org/PreOrder" (if applicable)
- Matches visible stock status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- In-stock product: _______________
- Out-of-stock product: _______________

---

### TC-015: Offer - Price Validity

**Description**: Verify price validity dates (if applicable)

**Steps**:
1. Inspect Offer JSON-LD
2. Check for priceValidUntil

**Expected Result**:
- priceValidUntil in ISO 8601 format (if present)
- Future date or not present
- Matches any visible sale end date

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Price Valid Until: _______________

---

### TC-016: Product - Category

**Description**: Verify product category in schema

**Steps**:
1. Inspect Product JSON-LD
2. Check category property

**Expected Result**:
- category present: "Posters > Abstract" or similar
- Matches visible category/breadcrumb
- Google Product Category (if applicable)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Category: _______________

---

### TC-017: Product - Additional Properties

**Description**: Verify additional product properties

**Steps**:
1. Inspect full Product JSON-LD
2. Check for additional properties

**Expected Result**:
- material (paper type, if applicable)
- size (dimensions)
- color (if relevant)
- additionalProperty for custom attributes

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Additional properties: _______________

---

## BreadcrumbList Schema

### TC-018: BreadcrumbList - Home Page

**Description**: Verify BreadcrumbList on home page (if applicable)

**Steps**:
1. Navigate to home page
2. Search for BreadcrumbList JSON-LD

**Expected Result**:
- Home page may not have breadcrumb
- If present, single item: Home

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Breadcrumb present: [ ] Yes / [ ] No

---

### TC-019: BreadcrumbList - Category Page

**Description**: Verify BreadcrumbList on category pages

**Steps**:
1. Navigate to /posters
2. Inspect BreadcrumbList JSON-LD

**Expected Result**:
```json
{
  "@type": "BreadcrumbList",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "name": "Home",
      "item": "https://chobi.art/"
    },
    {
      "@type": "ListItem",
      "position": 2,
      "name": "Posters",
      "item": "https://chobi.art/posters"
    }
  ]
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Number of items: _______________
- Positions correct: [ ] Yes / [ ] No

---

### TC-020: BreadcrumbList - Product Page

**Description**: Verify BreadcrumbList on product detail pages

**Steps**:
1. Navigate to product page
2. Inspect BreadcrumbList JSON-LD
3. Verify all levels present

**Expected Result**:
- Home > Posters > Category > Product
- Positions sequential (1, 2, 3, 4)
- Each item has name and item (URL)
- Last item may omit item URL (current page)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Breadcrumb path: _______________

---

### TC-021: BreadcrumbList - URL Validity

**Description**: Verify breadcrumb URLs are valid

**Steps**:
1. Extract all breadcrumb item URLs
2. Verify each URL is absolute
3. Test URLs are accessible

**Expected Result**:
- All URLs absolute (start with https://)
- All URLs resolve correctly
- Match canonical URLs

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Invalid URLs found: _______________

---

## ItemList Schema (Category Pages)

### TC-022: ItemList - Product Listing

**Description**: Verify ItemList schema on category/listing pages

**Steps**:
1. Navigate to /posters
2. Find JSON-LD with @type: "ItemList"
3. Inspect structure

**Expected Result**:
```json
{
  "@type": "ItemList",
  "numberOfItems": 20,
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "...",
        "url": "..."
      }
    }
  ]
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Number of items: _______________
- Products in list: _______________

---

### TC-023: ItemList - Pagination

**Description**: Verify ItemList handles pagination

**Steps**:
1. Navigate to /posters?page=1
2. Inspect ItemList
3. Navigate to /posters?page=2
4. Verify different items

**Expected Result**:
- Each page has unique ItemList
- numberOfItems reflects current page
- Positions start at 1 on each page (or continuous)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Page 1 items: _______________
- Page 2 items: _______________

---

## Review and Rating Schema

### TC-024: AggregateRating - Product

**Description**: Verify AggregateRating on products (if reviews exist)

**Steps**:
1. Navigate to product with reviews
2. Inspect Product JSON-LD for aggregateRating

**Expected Result**:
```json
"aggregateRating": {
  "@type": "AggregateRating",
  "ratingValue": "4.5",
  "reviewCount": "25",
  "bestRating": "5",
  "worstRating": "1"
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Rating Value: _______________
- Review Count: _______________

---

### TC-025: Review Schema - Individual Reviews

**Description**: Verify individual Review schema (if applicable)

**Steps**:
1. Navigate to product with reviews
2. Check for review property in Product JSON-LD

**Expected Result**:
```json
"review": [{
  "@type": "Review",
  "author": {
    "@type": "Person",
    "name": "John Doe"
  },
  "reviewRating": {
    "@type": "Rating",
    "ratingValue": "5"
  },
  "reviewBody": "Review text..."
}]
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Reviews present: [ ] Yes / [ ] No
- Number of reviews in schema: _______________

---

## FAQPage Schema

### TC-026: FAQPage Schema (if applicable)

**Description**: Verify FAQPage schema on FAQ or help pages

**Steps**:
1. Navigate to FAQ or help page
2. Find FAQPage JSON-LD
3. Inspect questions and answers

**Expected Result**:
```json
{
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "Question text?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Answer text..."
    }
  }]
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- FAQ page exists: [ ] Yes / [ ] No
- Number of questions: _______________

---

## LocalBusiness Schema (if applicable)

### TC-027: LocalBusiness Schema

**Description**: Verify LocalBusiness schema (if physical location)

**Steps**:
1. Navigate to contact or about page
2. Find LocalBusiness JSON-LD

**Expected Result**:
- name, address, telephone
- openingHoursSpecification
- geo coordinates (if applicable)
- priceRange (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- LocalBusiness present: [ ] Yes / [ ] No

---

## Multiple Schemas

### TC-028: Multiple Schema Objects

**Description**: Verify handling of multiple JSON-LD objects

**Steps**:
1. Navigate to product page
2. Count JSON-LD script tags
3. Verify each is valid

**Expected Result**:
- Multiple schemas allowed (Product, BreadcrumbList, Organization)
- Can be separate script tags
- Or single script with @graph array

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Schema types found: _______________

---

### TC-029: @graph Array Usage

**Description**: Verify @graph array if used for multiple schemas

**Steps**:
1. Check if @graph is used
2. Validate all items in graph

**Expected Result**:
```json
{
  "@context": "https://schema.org",
  "@graph": [
    { "@type": "Organization", ... },
    { "@type": "WebSite", ... },
    { "@type": "Product", ... }
  ]
}
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Using @graph: [ ] Yes / [ ] No

---

## Validation Tools

### TC-030: Google Rich Results Test - Home Page

**Description**: Validate home page with Google Rich Results Test

**Steps**:
1. Go to https://search.google.com/test/rich-results
2. Enter home page URL
3. Review all detected schemas
4. Check for errors/warnings

**Expected Result**:
- No errors
- Organization detected
- WebSite with SearchAction detected (sitelinks search box)
- All required fields present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Detected schemas: _______________
- Errors: _______________
- Warnings: _______________

---

### TC-031: Google Rich Results Test - Product Page

**Description**: Validate product page with Google Rich Results Test

**Steps**:
1. Use Rich Results Test
2. Enter product page URL
3. Review Product rich result

**Expected Result**:
- Product rich result detected
- All required fields (name, image, offers)
- No critical errors
- Review data valid (if present)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product detected: [ ] Yes / [ ] No
- Errors: _______________

---

### TC-032: Schema.org Validator

**Description**: Validate JSON-LD with Schema.org validator

**Steps**:
1. Go to https://validator.schema.org/
2. Paste JSON-LD content
3. Review validation results

**Expected Result**:
- Valid according to Schema.org
- All types recognized
- Properties correctly used
- No unknown properties warnings

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation status: _______________

---

### TC-033: JSON-LD Playground

**Description**: Test JSON-LD in JSON-LD Playground

**Steps**:
1. Go to https://json-ld.org/playground/
2. Paste JSON-LD
3. Verify expanded/compacted forms

**Expected Result**:
- No JSON-LD processing errors
- Correct expansion
- @context resolves properly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Processing successful: [ ] Yes / [ ] No

---

## Page-Specific Testing

### TC-034: Home Page - Complete Schema

**Description**: Verify all expected schemas on home page

**Steps**:
1. Navigate to home page
2. List all JSON-LD schemas present

**Expected Result**:
- Organization
- WebSite with SearchAction
- Optional: LocalBusiness, ItemList (featured products)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Schemas present: _______________

---

### TC-035: Category Page - Complete Schema

**Description**: Verify all expected schemas on category pages

**Steps**:
1. Navigate to /posters
2. List all JSON-LD schemas

**Expected Result**:
- BreadcrumbList
- ItemList (product collection)
- Organization (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Schemas present: _______________

---

### TC-036: Product Page - Complete Schema

**Description**: Verify all expected schemas on product pages

**Steps**:
1. Navigate to product detail page
2. List all JSON-LD schemas

**Expected Result**:
- Product (with Offer/AggregateOffer)
- BreadcrumbList
- Organization (optional)
- Review/AggregateRating (if reviews exist)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Schemas present: _______________

---

### TC-037: Cart/Checkout Pages

**Description**: Verify JSON-LD handling on transactional pages

**Steps**:
1. Navigate to /cart
2. Navigate to /checkout
3. Check for JSON-LD

**Expected Result**:
- No Product schemas (not product pages)
- Organization optional
- BreadcrumbList optional
- No sensitive data in schema

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-038: AI Generator Page

**Description**: Verify JSON-LD on AI generator page

**Steps**:
1. Navigate to AI generator page
2. Inspect JSON-LD

**Expected Result**:
- WebPage or SoftwareApplication type (optional)
- BreadcrumbList
- No Product schema (not a product)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Schemas present: _______________

---

## Edge Cases

### TC-039: Product Without Image

**Description**: Verify schema handles products without images

**Steps**:
1. Find or create product without image
2. Inspect Product JSON-LD

**Expected Result**:
- image may be placeholder or omitted
- No schema errors
- Google Rich Results Test handles gracefully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Handling: _______________

---

### TC-040: Out of Stock Product

**Description**: Verify schema reflects out of stock status

**Steps**:
1. Navigate to out-of-stock product
2. Verify availability in Offer schema

**Expected Result**:
- availability: "https://schema.org/OutOfStock"
- Matches visible stock status
- Google interprets correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Availability: _______________

---

### TC-041: Product with Special Characters

**Description**: Verify schema handles special characters

**Steps**:
1. Navigate to product with special characters in name
2. Inspect JSON-LD encoding

**Expected Result**:
- Special characters properly escaped
- No JSON syntax errors
- Displays correctly in rich results

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Encoding correct: [ ] Yes / [ ] No

---

### TC-042: Very Long Description

**Description**: Verify schema handles long descriptions

**Steps**:
1. Navigate to product with long description
2. Check description in JSON-LD

**Expected Result**:
- Full description included
- Or truncated appropriately
- No schema errors
- Valid JSON

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description handling: _______________

---

## Data Accuracy

### TC-043: Price Accuracy

**Description**: Verify JSON-LD prices match displayed prices

**Steps**:
1. Navigate to product page
2. Compare visible price with schema price
3. Check multiple products

**Expected Result**:
- All prices match exactly
- Currency consistent (INR)
- No rounding errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Discrepancies: _______________

---

### TC-044: Stock Accuracy

**Description**: Verify availability matches actual stock

**Steps**:
1. Compare visible stock status with schema
2. Check in-stock and out-of-stock products

**Expected Result**:
- Schema availability matches displayed
- Updates when stock changes (if dynamic)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Accuracy: _______________

---

### TC-045: URL Consistency

**Description**: Verify all URLs in schema are correct

**Steps**:
1. Extract all URLs from JSON-LD
2. Verify they're absolute
3. Verify they resolve correctly

**Expected Result**:
- All URLs absolute
- All URLs valid
- Match canonical URLs
- Use production domain

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Invalid URLs: _______________

---

## Performance

### TC-046: JSON-LD Size

**Description**: Verify JSON-LD doesn't bloat page size

**Steps**:
1. Measure total JSON-LD size on page
2. Check if it impacts performance

**Expected Result**:
- Reasonable size (< 50KB typical)
- Not duplicating excessive data
- Gzip compressed on delivery

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total JSON-LD size: _______________

---

### TC-047: Server-Side vs Client-Side

**Description**: Verify JSON-LD is server-rendered

**Steps**:
1. View page source (not DevTools)
2. Search for JSON-LD in source
3. Compare with client-rendered DOM

**Expected Result**:
- JSON-LD present in initial HTML
- Server-side rendered for SEO
- Googlebot can access without JS

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Server-rendered: [ ] Yes / [ ] No

---

## Issues Found

| ID | Description | Severity | Page | Status |
|----|-------------|----------|------|--------|
| | | | | |

## Summary

- **Total Test Cases**: 47
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Schema.org Type Reference

**Common Types Used:**
- Organization
- WebSite
- Product
- Offer / AggregateOffer
- BreadcrumbList
- ListItem
- Review
- AggregateRating
- SearchAction
- FAQPage (optional)

### Required Product Properties (Google)
- name
- image
- offers (with price, priceCurrency, availability)

### Recommended Product Properties
- description
- sku
- brand
- aggregateRating
- review

### Testing Tools
- Google Rich Results Test: https://search.google.com/test/rich-results
- Schema.org Validator: https://validator.schema.org/
- JSON-LD Playground: https://json-ld.org/playground/

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Product Schema Enhancement**:
   - Add review schema when reviews implemented
   - Consider adding material/size as additionalProperty

2. **Breadcrumb Improvements**:
   - Ensure consistent breadcrumb on all pages
   - Include filtered category in breadcrumb path

3. **Performance**:
   - Consider lazy-loading JSON-LD for non-critical schemas
   - Minify JSON-LD in production

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
