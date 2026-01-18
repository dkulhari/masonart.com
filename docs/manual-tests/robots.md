# Manual Test: Robots.txt

## Test Environment
- **Browser/Tool**: Chrome / cURL / Postman
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001/robots.txt

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Understanding of robots.txt syntax
- [ ] Google Search Console access (for production testing)
- [ ] Robots.txt tester tool available

## Overview
This document covers manual testing of the robots.txt file for the MasonArt e-commerce platform, including:
- File accessibility
- Syntax validation
- User-agent directives
- Allow/Disallow rules
- Sitemap reference
- Crawl-delay (if applicable)
- Security considerations
- Compliance with intended crawling behavior

## Test Cases

---

## Robots.txt Accessibility

### TC-001: Robots.txt URL Access

**Description**: Verify robots.txt is accessible at root URL

**Steps**:
1. Navigate to http://localhost:3001/robots.txt
2. Verify response loads
3. Check HTTP status code

**Expected Result**:
- Status code: 200 OK
- Plain text content displayed
- No authentication required
- Located at root of domain

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Status code: _______________

---

### TC-002: Robots.txt Content-Type

**Description**: Verify correct Content-Type header

**Steps**:
1. Check response headers
2. `curl -I http://localhost:3001/robots.txt`

**Expected Result**:
- Content-Type: text/plain
- Or text/plain; charset=utf-8
- Not HTML or other formats

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Content-Type: _______________

---

### TC-003: Robots.txt Response Time

**Description**: Verify robots.txt loads quickly

**Steps**:
1. Measure response time
2. Test multiple times

**Expected Result**:
- Response time < 500ms
- Consistently fast
- No server errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response time: _______________

---

### TC-004: Robots.txt Case Sensitivity

**Description**: Verify robots.txt accessible regardless of case

**Steps**:
1. Try /robots.txt
2. Try /Robots.txt
3. Try /ROBOTS.TXT

**Expected Result**:
- Primary: /robots.txt works
- Case variants may redirect or 404
- Googlebot uses lowercase

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Case handling: _______________

---

## Syntax Validation

### TC-005: Valid Syntax

**Description**: Verify robots.txt has valid syntax

**Steps**:
1. Review robots.txt content
2. Check for syntax errors
3. Use robots.txt tester tool

**Expected Result**:
- Valid robots.txt syntax
- No typos in directives
- Proper line endings
- No encoding issues

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Syntax valid: [ ] Yes / [ ] No

---

### TC-006: Comment Usage

**Description**: Verify comments are properly formatted

**Steps**:
1. Check for comments in file
2. Verify # prefix used correctly

**Expected Result**:
- Comments start with #
- Comments explain intent
- No inline issues

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Comments present: [ ] Yes / [ ] No

---

### TC-007: Line Ending Format

**Description**: Verify consistent line endings

**Steps**:
1. Download robots.txt
2. Check line endings (LF or CRLF)

**Expected Result**:
- Consistent line endings
- Unix (LF) or Windows (CRLF)
- No mixed line endings

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Line endings: _______________

---

### TC-008: Encoding

**Description**: Verify UTF-8 encoding

**Steps**:
1. Check file encoding
2. Look for special characters

**Expected Result**:
- UTF-8 encoded
- No BOM (Byte Order Mark)
- No encoding errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Encoding: _______________

---

## User-Agent Directives

### TC-009: Wildcard User-Agent

**Description**: Verify wildcard user-agent rule exists

**Steps**:
1. Find `User-agent: *` rule
2. Check associated directives

**Expected Result**:
```
User-agent: *
Allow: /
Disallow: /admin
Disallow: /api/
```
- Wildcard user-agent present
- Default rules for all bots
- Clear Allow/Disallow patterns

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Wildcard rules: _______________

---

### TC-010: Googlebot Rules

**Description**: Verify Googlebot-specific rules (if any)

**Steps**:
1. Search for `User-agent: Googlebot`
2. Check if different from wildcard

**Expected Result**:
- May have Googlebot-specific rules
- Or inherits from wildcard
- If present, more permissive or restrictive as needed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Googlebot rules: _______________

---

### TC-011: Bingbot Rules

**Description**: Verify Bingbot-specific rules (if any)

**Steps**:
1. Search for `User-agent: Bingbot`
2. Check rules

**Expected Result**:
- May have Bingbot-specific rules
- Or inherits from wildcard
- Appropriate for Bing indexing needs

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Bingbot rules: _______________

---

### TC-012: Bad Bot Blocking

**Description**: Verify malicious bots are blocked (if applicable)

**Steps**:
1. Check for blocked user-agents
2. Common bad bots: AhrefsBot, SemrushBot, etc.

**Expected Result**:
- May block aggressive scrapers
- Or allow all bots
- Business decision on blocking

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Blocked bots: _______________

---

## Allow/Disallow Rules

### TC-013: Public Pages Allowed

**Description**: Verify public pages are allowed for crawling

**Steps**:
1. Check rules for home page
2. Check rules for product pages
3. Check rules for category pages

**Expected Result**:
- Home page: Allowed (/ or no disallow)
- Product pages: Allowed (/posters/)
- Category pages: Allowed
- All public SEO pages crawlable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Public pages allowed: [ ] Yes / [ ] No

---

### TC-014: Admin Pages Disallowed

**Description**: Verify admin pages are blocked

**Steps**:
1. Check for `Disallow: /admin`
2. Verify rule blocks admin section

**Expected Result**:
- `Disallow: /admin` or `Disallow: /admin/`
- All admin paths blocked
- Prevents indexing of admin interface

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Admin blocked: [ ] Yes / [ ] No

---

### TC-015: API Routes Disallowed

**Description**: Verify API endpoints are blocked from crawling

**Steps**:
1. Check for `Disallow: /api/`
2. Verify API paths blocked

**Expected Result**:
- `Disallow: /api/` or `Disallow: /api`
- API endpoints not indexed
- Prevents crawling of JSON responses

**Actual Result**:
- [ ] PASS / [ ] FAIL
- API blocked: [ ] Yes / [ ] No

---

### TC-016: Cart/Checkout Disallowed

**Description**: Verify cart and checkout pages are blocked

**Steps**:
1. Check for cart disallow rule
2. Check for checkout disallow rule

**Expected Result**:
- `Disallow: /cart`
- `Disallow: /checkout`
- Transactional pages not indexed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart blocked: [ ] Yes / [ ] No
- Checkout blocked: [ ] Yes / [ ] No

---

### TC-017: Account Pages Disallowed

**Description**: Verify user account pages are blocked

**Steps**:
1. Check for account disallow rule
2. Check for profile/settings rules

**Expected Result**:
- `Disallow: /account`
- `Disallow: /profile` (if exists)
- Personal pages not indexed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Account blocked: [ ] Yes / [ ] No

---

### TC-018: Search Pages Handling

**Description**: Verify search results pages handling

**Steps**:
1. Check rules for /search path
2. Check for query parameter handling

**Expected Result**:
- May allow: /search (for sitelinks search box)
- May disallow: /search?q= (to prevent thin content)
- Business decision on search indexing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Search handling: _______________

---

### TC-019: Filtered URLs Handling

**Description**: Verify handling of URLs with parameters

**Steps**:
1. Check for query parameter rules
2. Check Disallow patterns with wildcards

**Expected Result**:
- May use: `Disallow: /*?`
- Or specific parameter disallows
- Prevents parameter-based duplicates

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Parameter handling: _______________

---

### TC-020: Static Assets Handling

**Description**: Verify static assets are crawlable

**Steps**:
1. Check rules for /assets/, /images/, /static/
2. Verify CSS/JS not blocked

**Expected Result**:
- CSS and JS files allowed (for rendering)
- Images allowed (for image search)
- No blanket static resource blocks

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Static assets allowed: [ ] Yes / [ ] No

---

### TC-021: AI Generator Page Handling

**Description**: Verify AI generator page crawling rules

**Steps**:
1. Check rules for /ai-generator or similar
2. Determine if should be indexed

**Expected Result**:
- If public feature: Allowed
- If user-specific content: May disallow
- Matches SEO strategy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- AI generator handling: _______________

---

## Sitemap Directive

### TC-022: Sitemap Reference Present

**Description**: Verify sitemap is referenced in robots.txt

**Steps**:
1. Find `Sitemap:` directive
2. Check URL is correct

**Expected Result**:
```
Sitemap: https://masonart.com/sitemap.xml
```
- Sitemap directive present
- Absolute URL used
- Correct sitemap location

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sitemap URL: _______________

---

### TC-023: Sitemap URL Accessible

**Description**: Verify referenced sitemap URL works

**Steps**:
1. Extract sitemap URL from robots.txt
2. Navigate to that URL
3. Verify sitemap loads

**Expected Result**:
- Sitemap URL returns 200 OK
- Valid XML sitemap
- Matches actual sitemap

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sitemap accessible: [ ] Yes / [ ] No

---

### TC-024: Multiple Sitemaps (if applicable)

**Description**: Verify all sitemaps are referenced

**Steps**:
1. Check for multiple Sitemap: directives
2. Or sitemap index reference

**Expected Result**:
- If using sitemap index: Single reference
- If multiple sitemaps: All referenced
- All URLs valid

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sitemap references: _______________

---

## Crawl-Delay Directive

### TC-025: Crawl-Delay Setting

**Description**: Check for Crawl-delay directive

**Steps**:
1. Search for `Crawl-delay:` directive
2. Note value if present

**Expected Result**:
- Crawl-delay optional
- If present: reasonable value (1-10 seconds)
- Note: Google ignores Crawl-delay

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Crawl-delay present: [ ] Yes / [ ] No
- Value: _______________

---

## Rule Precedence

### TC-026: Allow Overrides Disallow

**Description**: Verify Allow rules can override Disallow

**Steps**:
1. Check for conflicting rules
2. Verify more specific rules take precedence

**Expected Result**:
- More specific paths override general
- Allow can override Disallow for specific paths
- Example:
  ```
  Disallow: /admin/
  Allow: /admin/public/
  ```

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Precedence correct: [ ] Yes / [ ] No

---

### TC-027: Wildcard Pattern Usage

**Description**: Verify wildcard patterns work correctly

**Steps**:
1. Check for * wildcards in rules
2. Check for $ end-of-URL patterns
3. Test with robots.txt tester

**Expected Result**:
- `*` matches any characters
- `$` matches end of URL
- Patterns interpreted correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Wildcards used: _______________

---

## Google Search Console Testing

### TC-028: Google Robots.txt Tester

**Description**: Test robots.txt with Google's tester

**Steps**:
1. Access Google Search Console
2. Navigate to robots.txt Tester (legacy tool or URL Inspection)
3. Test various URLs

**Expected Result**:
- No errors in robots.txt
- Key URLs allowed as expected
- Blocked URLs blocked as expected

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Test results: _______________

---

### TC-029: Test Product Page

**Description**: Verify product page is allowed

**Steps**:
1. Use robots.txt tester
2. Enter product page URL
3. Check if allowed

**Expected Result**:
- Product page: Allowed
- Googlebot can crawl
- No unexpected blocks

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Product URL status: _______________

---

### TC-030: Test Admin Page

**Description**: Verify admin page is blocked

**Steps**:
1. Use robots.txt tester
2. Enter admin page URL
3. Check if blocked

**Expected Result**:
- Admin page: Blocked
- Googlebot cannot crawl
- Rule effective

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Admin URL status: _______________

---

### TC-031: Test Cart/Checkout Page

**Description**: Verify transactional pages are blocked

**Steps**:
1. Test /cart URL
2. Test /checkout URL

**Expected Result**:
- Cart: Blocked
- Checkout: Blocked
- Both non-indexable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart status: _______________
- Checkout status: _______________

---

## Environment Differences

### TC-032: Development vs Production

**Description**: Verify appropriate rules for each environment

**Steps**:
1. Check development robots.txt
2. Check production robots.txt (if accessible)
3. Compare rules

**Expected Result**:
- Development: May block all (`Disallow: /`)
- Staging: Should block all
- Production: Allows public pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Dev rules: _______________
- Prod rules: _______________

---

### TC-033: Staging Environment Block

**Description**: Verify staging/preview environments are blocked

**Steps**:
1. Check staging domain robots.txt
2. Verify full site blocked

**Expected Result**:
- Staging: `Disallow: /` (block everything)
- Prevents duplicate content indexing
- Protects test content

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Staging blocked: [ ] Yes / [ ] No / [ ] N/A

---

## Security Considerations

### TC-034: No Sensitive Path Disclosure

**Description**: Verify robots.txt doesn't reveal sensitive paths

**Steps**:
1. Review all Disallow rules
2. Check for sensitive information

**Expected Result**:
- No internal-only paths revealed
- No security through obscurity reliance
- Generic blocks (like /admin) are fine

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sensitive paths disclosed: _______________

---

### TC-035: Authentication Pages

**Description**: Verify authentication pages are handled appropriately

**Steps**:
1. Check rules for /login, /register, /reset-password

**Expected Result**:
- May allow: Index login for SEO
- May disallow: Prevent session-related issues
- Consistent approach

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Auth page handling: _______________

---

## Completeness Check

### TC-036: All Critical Paths Covered

**Description**: Verify all important paths have rules

**Steps**:
1. List all site sections
2. Verify each has appropriate rule
3. Check for missing sections

**Expected Result**:
- Public pages: Allowed
- Admin: Blocked
- API: Blocked
- Cart/Checkout: Blocked
- Account: Blocked
- Assets: Allowed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Missing rules: _______________

---

### TC-037: No Conflicting Rules

**Description**: Verify no contradictory rules

**Steps**:
1. Review all rules
2. Check for conflicts
3. Test edge cases

**Expected Result**:
- No contradictory Allow/Disallow
- Clear precedence where overlap
- Logical rule structure

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Conflicts found: _______________

---

## Edge Cases

### TC-038: Case Sensitivity in Paths

**Description**: Verify path case handling

**Steps**:
1. Test /Admin vs /admin
2. Note robots.txt uses case-sensitive paths

**Expected Result**:
- Paths are case-sensitive
- Rules match intended paths
- Consistent with URL structure

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Case handling: _______________

---

### TC-039: Trailing Slash Handling

**Description**: Verify trailing slash consistency

**Steps**:
1. Check rules with/without trailing slashes
2. Test path matching

**Expected Result**:
- `/admin` blocks /admin and /admin/*
- `/admin/` blocks only /admin/*
- Consistent with intended behavior

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Trailing slash handling: _______________

---

### TC-040: Empty Robots.txt

**Description**: Verify behavior if robots.txt is empty

**Steps**:
1. Consider what happens if file is empty
2. Understand default behavior

**Expected Result**:
- Empty file = allow all crawling
- Should have explicit rules
- Better than missing file

**Actual Result**:
- [ ] PASS / [ ] FAIL
- File has content: [ ] Yes / [ ] No

---

## Integration Testing

### TC-041: Meta Robots Tag Consistency

**Description**: Verify robots.txt aligns with meta robots tags

**Steps**:
1. Compare robots.txt rules
2. Compare with meta robots on pages
3. Ensure consistency

**Expected Result**:
- Consistent approach
- robots.txt blocks + meta noindex = redundant but OK
- No conflicts (robots.txt allows, meta blocks is fine)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Consistency: _______________

---

### TC-042: X-Robots-Tag Header Check

**Description**: Verify no conflicting X-Robots-Tag headers

**Steps**:
1. Check HTTP headers on key pages
2. Look for X-Robots-Tag

**Expected Result**:
- If present, consistent with robots.txt
- No conflicts in directives
- Clear crawling strategy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- X-Robots-Tag used: [ ] Yes / [ ] No

---

## Documentation

### TC-043: Robots.txt Documented

**Description**: Verify robots.txt configuration is documented

**Steps**:
1. Check internal documentation
2. Look for robots.txt explanation

**Expected Result**:
- Purpose documented
- Rules explained
- Update process defined

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Documentation exists: [ ] Yes / [ ] No

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 43
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Robots.txt Reference

**Basic Structure:**
```
# Comment
User-agent: *
Allow: /
Disallow: /admin/
Disallow: /api/
Disallow: /cart
Disallow: /checkout
Disallow: /account

Sitemap: https://masonart.com/sitemap.xml
```

**Common Directives:**
- `User-agent:` - Specify which bot
- `Allow:` - Allow path crawling
- `Disallow:` - Block path crawling
- `Sitemap:` - Sitemap location
- `Crawl-delay:` - Request delay (not Google)

**Pattern Matching:**
- `*` - Matches any sequence
- `$` - Matches end of URL
- `/` - Matches path start

### Testing Tools
- Google Search Console: https://search.google.com/search-console
- Robots.txt Tester: https://www.google.com/webmasters/tools/robots-testing-tool
- Bing Webmaster Tools: https://www.bing.com/webmasters
- Technical SEO Tools (Screaming Frog, etc.)

### cURL Commands
```bash
# Fetch robots.txt
curl http://localhost:3001/robots.txt

# Check headers
curl -I http://localhost:3001/robots.txt

# Check response time
curl -w "Time: %{time_total}s\n" -o /dev/null -s http://localhost:3001/robots.txt
```

### Important Notes
- robots.txt is advisory, not enforced
- Malicious bots may ignore robots.txt
- Don't rely on robots.txt for security
- Google caches robots.txt for up to 24 hours

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Security**:
   - Don't rely on robots.txt to hide sensitive content
   - Use proper authentication and authorization

2. **Optimization**:
   - Keep rules simple and clear
   - Comment complex rules
   - Test with Google Search Console

3. **Maintenance**:
   - Review robots.txt periodically
   - Update when adding new sections
   - Test after changes

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
