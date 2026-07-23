# Manual Test: XML Sitemap

## Test Environment
- **Browser/Tool**: Chrome / cURL / Postman
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/sitemap.xml

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products
- [ ] Docker services (PostgreSQL, Redis) running
- [ ] XML validator tool available
- [ ] Google Search Console access (for production testing)

## Overview
This document covers manual testing of the XML sitemap for the chobi.art e-commerce platform, including:
- Sitemap accessibility
- XML format validation
- URL completeness
- Priority and changefreq settings
- Lastmod dates
- Sitemap index (if applicable)
- Integration with robots.txt
- Google Search Console submission

## Test Cases

---

## Sitemap Accessibility

### TC-001: Sitemap URL Access

**Description**: Verify sitemap is accessible at standard URL

**Steps**:
1. Navigate to http://localhost:3001/sitemap.xml
2. Verify response loads
3. Check HTTP status code

**Expected Result**:
- Status code: 200 OK
- Content-Type: application/xml or text/xml
- XML content displayed
- No authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status code: _______________
- Content-Type: _______________

---

### TC-002: Sitemap Response Headers

**Description**: Verify correct HTTP headers for sitemap

**Steps**:
1. Use cURL or DevTools to inspect headers
2. `curl -I http://localhost:3001/sitemap.xml`

**Expected Result**:
- Content-Type: application/xml; charset=utf-8
- Cache-Control appropriate (e.g., max-age=3600)
- No authentication headers required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Headers: _______________

---

### TC-003: Sitemap Compression

**Description**: Verify sitemap supports gzip compression

**Steps**:
1. Send request with Accept-Encoding: gzip
2. `curl -H "Accept-Encoding: gzip" http://localhost:3001/sitemap.xml`
3. Check Content-Encoding header

**Expected Result**:
- Content-Encoding: gzip (if supported)
- Compressed response smaller than uncompressed
- Decompresses correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Compression supported: [ ] Yes / [ ] No

---

## XML Format Validation

### TC-004: XML Well-Formed

**Description**: Verify sitemap is well-formed XML

**Steps**:
1. Download sitemap.xml
2. Validate with XML validator
3. Check for syntax errors

**Expected Result**:
- Valid XML document
- Proper XML declaration: `<?xml version="1.0" encoding="UTF-8"?>`
- All tags properly closed
- No encoding errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- XML valid: [ ] Yes / [ ] No
- Errors: _______________

---

### TC-005: Sitemap Namespace

**Description**: Verify correct sitemap namespace

**Steps**:
1. Inspect sitemap root element
2. Check xmlns attribute

**Expected Result**:
```xml
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
```
- Correct namespace declared
- Optional: xmlns:image, xmlns:news, xmlns:xhtml for extensions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Namespace: _______________

---

### TC-006: Sitemap Schema Validation

**Description**: Validate sitemap against XSD schema

**Steps**:
1. Download sitemap XSD from sitemaps.org
2. Validate sitemap against schema
3. Note any violations

**Expected Result**:
- Validates against sitemap XSD
- All required elements present
- No schema violations

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Schema valid: [ ] Yes / [ ] No

---

## URL Structure

### TC-007: URL Element Structure

**Description**: Verify URL elements have correct structure

**Steps**:
1. Inspect individual `<url>` elements
2. Check required and optional children

**Expected Result**:
```xml
<url>
  <loc>https://chobi.art/page</loc>
  <lastmod>2026-01-19</lastmod>
  <changefreq>weekly</changefreq>
  <priority>0.8</priority>
</url>
```
- loc (required)
- lastmod (recommended)
- changefreq (optional)
- priority (optional)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Structure: _______________

---

### TC-008: URL Format - Absolute URLs

**Description**: Verify all URLs are absolute

**Steps**:
1. Check multiple `<loc>` values
2. Verify all start with protocol

**Expected Result**:
- All URLs start with https:// (or http:// for dev)
- No relative URLs
- Full domain included
- Consistent protocol throughout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sample URLs: _______________

---

### TC-009: URL Encoding

**Description**: Verify URLs are properly encoded

**Steps**:
1. Check URLs with special characters
2. Verify URL encoding

**Expected Result**:
- Spaces encoded as %20
- Special characters properly escaped
- & encoded as &amp; in XML
- No broken URLs

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Encoding correct: [ ] Yes / [ ] No

---

### TC-010: Canonical URLs Only

**Description**: Verify sitemap contains only canonical URLs

**Steps**:
1. Compare sitemap URLs with canonical tags on pages
2. Check for duplicates

**Expected Result**:
- Only canonical versions included
- No URL parameters (no ?ref=, etc.)
- No duplicate URLs
- Matches canonical link elements

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Duplicates found: _______________

---

## Page Coverage

### TC-011: Home Page Included

**Description**: Verify home page is in sitemap

**Steps**:
1. Search sitemap for home page URL
2. Verify it exists with high priority

**Expected Result**:
- Home page URL: https://chobi.art/
- Priority: 1.0 (highest)
- changefreq: daily or weekly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Priority: _______________
- Changefreq: _______________

---

### TC-012: Product Listing Pages Included

**Description**: Verify category/listing pages are in sitemap

**Steps**:
1. Search for /posters URL
2. Check for category pages

**Expected Result**:
- /posters included
- /posters?styles=abstract type pages (if static)
- Or dynamic filtering not in sitemap
- Priority: 0.8-0.9

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Listing pages found: _______________

---

### TC-013: All Product Pages Included

**Description**: Verify all product detail pages are in sitemap

**Steps**:
1. Count product URLs in sitemap
2. Compare with total products in database
3. Check sample product URLs

**Expected Result**:
- All published products included
- Draft/hidden products excluded
- URLs match product page structure
- Count matches active product count

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product URLs in sitemap: _______________
- Products in database: _______________

---

### TC-014: Static Pages Included

**Description**: Verify important static pages are in sitemap

**Steps**:
1. Search for static page URLs
2. Verify presence of key pages

**Expected Result**:
- About page (if exists)
- Contact page (if exists)
- FAQ page (if exists)
- Terms/Privacy pages (if exists)
- All public static pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Static pages found: _______________

---

### TC-015: AI Generator Page

**Description**: Verify AI generator page is handled appropriately

**Steps**:
1. Search for AI generator URL
2. Decide if it should be indexed

**Expected Result**:
- If public feature: included in sitemap
- If user-specific: excluded
- Appropriate priority if included

**Actual Result**:
- [ ] PASS / [ ] FAIL
- AI generator in sitemap: [ ] Yes / [ ] No

---

### TC-016: Excluded Pages Verification

**Description**: Verify private pages are NOT in sitemap

**Steps**:
1. Search for cart URLs
2. Search for checkout URLs
3. Search for account URLs
4. Search for admin URLs

**Expected Result**:
- /cart NOT in sitemap
- /checkout NOT in sitemap
- /account NOT in sitemap
- /admin NOT in sitemap
- Login/register optionally excluded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Private pages found: _______________

---

### TC-017: 404 Pages Not Included

**Description**: Verify 404 error pages are not in sitemap

**Steps**:
1. Check sitemap for non-existent product slugs
2. Verify all URLs resolve to real pages

**Expected Result**:
- No 404 URLs in sitemap
- All sitemap URLs return 200 OK

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Dead URLs found: _______________

---

## Lastmod Dates

### TC-018: Lastmod Format

**Description**: Verify lastmod dates use correct format

**Steps**:
1. Inspect lastmod values
2. Verify format compliance

**Expected Result**:
- W3C date format: YYYY-MM-DD
- Or with time: YYYY-MM-DDTHH:MM:SS+00:00
- Valid dates (not future dates)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Format: _______________

---

### TC-019: Lastmod Accuracy

**Description**: Verify lastmod reflects actual content updates

**Steps**:
1. Note lastmod of a product
2. Update product in admin
3. Check if sitemap lastmod updates

**Expected Result**:
- Lastmod updates when content changes
- Reflects actual modification time
- Not always current date (static dates for unchanged content)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Updates accurately: [ ] Yes / [ ] No

---

### TC-020: Lastmod - Different Pages

**Description**: Verify lastmod varies appropriately by page type

**Steps**:
1. Compare lastmod across page types
2. Check home vs product vs static

**Expected Result**:
- Home page: recent lastmod
- Product pages: per-product lastmod
- Static pages: when last edited
- Not all same date (unless newly created)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Variance: _______________

---

## Priority Settings

### TC-021: Priority Range

**Description**: Verify priority values are within valid range

**Steps**:
1. Check all priority values
2. Verify range 0.0 to 1.0

**Expected Result**:
- All priorities between 0.0 and 1.0
- Decimal format (e.g., 0.5, 0.8)
- No invalid values

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Range valid: [ ] Yes / [ ] No

---

### TC-022: Priority Hierarchy

**Description**: Verify priority reflects page importance

**Steps**:
1. Check home page priority
2. Check product page priorities
3. Check static page priorities

**Expected Result**:
- Home page: 1.0 (highest)
- Category pages: 0.8-0.9
- Product pages: 0.6-0.8
- Static pages: 0.3-0.5
- Logical hierarchy maintained

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Home: _______________
- Products: _______________
- Static: _______________

---

## Changefreq Settings

### TC-023: Changefreq Values

**Description**: Verify changefreq uses valid values

**Steps**:
1. Check all changefreq values
2. Verify valid enumeration

**Expected Result**:
- Valid values: always, hourly, daily, weekly, monthly, yearly, never
- Appropriate for page type
- Consistent usage

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Values used: _______________

---

### TC-024: Changefreq Appropriateness

**Description**: Verify changefreq matches content update frequency

**Steps**:
1. Review changefreq by page type
2. Assess accuracy

**Expected Result**:
- Home page: daily or weekly
- Product pages: weekly or monthly
- Static pages: monthly or yearly
- Matches actual update patterns

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Appropriate: [ ] Yes / [ ] No

---

## Sitemap Size and Limits

### TC-025: URL Count Limit

**Description**: Verify sitemap doesn't exceed 50,000 URL limit

**Steps**:
1. Count total URLs in sitemap
2. Verify under 50,000

**Expected Result**:
- Total URLs < 50,000
- If more products, sitemap index used
- Each sitemap file under limit

**Actual Result**:
- [ ] PASS / [ ] FAIL
- URL count: _______________

---

### TC-026: File Size Limit

**Description**: Verify sitemap doesn't exceed 50MB uncompressed

**Steps**:
1. Check sitemap file size
2. Verify under 50MB

**Expected Result**:
- Uncompressed size < 50MB
- Gzip compressed served if large
- Reasonable size for content

**Actual Result**:
- [ ] PASS / [ ] FAIL
- File size: _______________

---

## Sitemap Index (if applicable)

### TC-027: Sitemap Index Structure

**Description**: Verify sitemap index if multiple sitemaps

**Steps**:
1. Check if sitemapindex is used
2. Inspect structure

**Expected Result**:
```xml
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap>
    <loc>https://chobi.art/sitemap-products.xml</loc>
    <lastmod>2026-01-19</lastmod>
  </sitemap>
</sitemapindex>
```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Uses sitemap index: [ ] Yes / [ ] No
- Child sitemaps: _______________

---

### TC-028: Child Sitemap Accessibility

**Description**: Verify all child sitemaps are accessible

**Steps**:
1. Get URLs from sitemap index
2. Access each child sitemap
3. Verify valid responses

**Expected Result**:
- All child sitemaps return 200 OK
- All are valid XML
- All within size limits

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Child sitemaps status: _______________

---

## Dynamic Content

### TC-029: New Product in Sitemap

**Description**: Verify new products appear in sitemap

**Steps**:
1. Note current product count in sitemap
2. Add new product via admin
3. Refresh/regenerate sitemap
4. Verify new product appears

**Expected Result**:
- New product URL added
- Appears within reasonable time
- Correct URL format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Update delay: _______________

---

### TC-030: Deleted Product Removed

**Description**: Verify deleted products removed from sitemap

**Steps**:
1. Delete or unpublish a product
2. Regenerate sitemap
3. Search for deleted product URL

**Expected Result**:
- Deleted product URL removed
- No orphan URLs
- Removed within reasonable time

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Removal delay: _______________

---

### TC-031: Sitemap Generation Frequency

**Description**: Verify sitemap updates appropriately

**Steps**:
1. Check sitemap generation method
2. Is it static or dynamic?
3. Verify freshness

**Expected Result**:
- Dynamic: Generated on request or cached
- Static: Regenerated on content changes
- Freshness appropriate for SEO

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Generation method: _______________

---

## Robots.txt Integration

### TC-032: Sitemap in Robots.txt

**Description**: Verify sitemap referenced in robots.txt

**Steps**:
1. Navigate to /robots.txt
2. Find Sitemap directive

**Expected Result**:
```
Sitemap: https://chobi.art/sitemap.xml
```
- Sitemap URL absolute
- Matches actual sitemap location
- At end of robots.txt typically

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sitemap directive: _______________

---

### TC-033: Multiple Sitemap References

**Description**: Verify all sitemaps referenced if using index

**Steps**:
1. Check robots.txt for sitemap references
2. If using index, verify main reference

**Expected Result**:
- Single sitemap: Direct reference
- Sitemap index: Reference to index only
- Or multiple Sitemap: directives

**Actual Result**:
- [ ] PASS / [ ] FAIL
- References found: _______________

---

## URL Validation

### TC-034: All URLs Accessible

**Description**: Verify all sitemap URLs are accessible

**Steps**:
1. Extract all URLs from sitemap
2. Check HTTP status for each (sample or all)
3. Note any errors

**Expected Result**:
- All URLs return 200 OK
- No 404 errors
- No 500 errors
- No redirects (or redirects to canonical)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Broken URLs: _______________

---

### TC-035: HTTPS URLs Only

**Description**: Verify sitemap uses HTTPS URLs (production)

**Steps**:
1. Check protocol on all URLs
2. Verify HTTPS for production

**Expected Result**:
- Production: All URLs use HTTPS
- Development: HTTP acceptable
- Consistent protocol throughout

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Protocol: _______________

---

### TC-036: Trailing Slash Consistency

**Description**: Verify consistent trailing slash usage

**Steps**:
1. Check URLs for trailing slash patterns
2. Verify consistency with canonical URLs

**Expected Result**:
- Consistent trailing slash usage
- Matches site's canonical URL pattern
- No mixed usage within sitemap

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pattern: _______________

---

## Google Search Console

### TC-037: Sitemap Submission

**Description**: Verify sitemap can be submitted to Google Search Console

**Steps**:
1. Access Google Search Console
2. Navigate to Sitemaps section
3. Submit sitemap URL

**Expected Result**:
- Sitemap accepted for processing
- No fetch errors
- URLs discovered

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Submission status: _______________

---

### TC-038: Google Coverage Report

**Description**: Check sitemap URLs in Google coverage

**Steps**:
1. Wait for Google to process sitemap
2. Check Coverage report
3. Note indexed vs submitted

**Expected Result**:
- URLs being discovered
- No critical errors
- Indexing progressing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Indexed/Submitted: _______________

---

## Performance

### TC-039: Sitemap Load Time

**Description**: Verify sitemap loads quickly

**Steps**:
1. Measure time to fetch sitemap
2. Test with cache cleared

**Expected Result**:
- Load time < 2 seconds
- Acceptable for search engine bots
- Not blocking other resources

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load time: _______________

---

### TC-040: Caching Behavior

**Description**: Verify sitemap caching

**Steps**:
1. Fetch sitemap, note response time
2. Fetch again, compare time
3. Check cache headers

**Expected Result**:
- Appropriate caching (1-24 hours typical)
- Cache-Control header present
- Faster subsequent requests

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cache duration: _______________

---

## Edge Cases

### TC-041: Empty Sitemap Handling

**Description**: Verify sitemap behavior with no products

**Steps**:
1. Clear all products (test environment)
2. Check sitemap

**Expected Result**:
- Still valid XML
- Contains at least home page
- No errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Handling: _______________

---

### TC-042: Unicode in URLs

**Description**: Verify sitemap handles Unicode URLs

**Steps**:
1. Create product with Unicode in slug (if allowed)
2. Check sitemap encoding

**Expected Result**:
- Properly encoded UTF-8
- Valid XML
- URL accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Unicode handling: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 42
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Sitemap Specifications
- Maximum 50,000 URLs per sitemap
- Maximum 50MB uncompressed file size
- Must be valid XML
- UTF-8 encoding required
- Absolute URLs required

### Valid Changefreq Values
- always
- hourly
- daily
- weekly
- monthly
- yearly
- never

### Testing Tools
- Google Search Console: https://search.google.com/search-console
- Screaming Frog SEO Spider (sitemap validation)
- XML Sitemap Validator: https://www.xml-sitemaps.com/validate-xml-sitemap.html

### cURL Commands
```bash
# Fetch sitemap
curl http://localhost:3001/sitemap.xml

# Check headers
curl -I http://localhost:3001/sitemap.xml

# Check with compression
curl -H "Accept-Encoding: gzip" --compressed http://localhost:3001/sitemap.xml

# Validate XML
curl http://localhost:3001/sitemap.xml | xmllint --noout -
```

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Sitemap Updates**:
   - Implement automatic regeneration on content changes
   - Consider caching with appropriate TTL

2. **Optimization**:
   - Use sitemap index if approaching URL limits
   - Implement gzip compression

3. **Monitoring**:
   - Set up Google Search Console alerts
   - Monitor sitemap fetch errors

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
