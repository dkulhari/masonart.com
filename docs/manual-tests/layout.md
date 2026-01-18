# Manual Test: Root Layout (Header, Footer, Navigation)

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Application URL**: http://localhost:3001

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] Database seeded with test data
- [ ] Multiple browser sizes available for testing
- [ ] Keyboard accessible (for accessibility testing)

## Overview
This document covers manual testing of the MasonArt root layout components:
- Header with navigation
- Footer with links and newsletter
- Mobile responsive menu
- Accessibility features
- SEO meta tags

## Test Cases

---

## Header Component

### TC-001: Header Displays Logo

**Description**: Verify MasonArt logo is displayed correctly

**Steps**:
1. Navigate to any page
2. Check header for logo
3. Verify logo text and styling

**Expected Result**:
- Logo text shows "MasonArt"
- "Art" portion styled with primary color
- Logo is clickable
- Logo links to home page (/)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Header Logo Links to Home

**Description**: Verify logo click navigates to home page

**Steps**:
1. Navigate to a non-home page (e.g., /posters)
2. Click on the MasonArt logo
3. Verify navigation

**Expected Result**:
- Navigation to "/" occurs
- Home page loads
- No page refresh (client-side routing)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-003: Desktop Navigation Links Present

**Description**: Verify all desktop navigation links are visible

**Steps**:
1. Open site on desktop viewport (>768px)
2. Check header for navigation links

**Expected Result**:
Navigation links visible:
- Posters (/posters)
- Create (/create) - with Sparkles icon
- Gallery (/gallery)
- About (/about)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Links Present: _______________

---

### TC-004: Desktop Nav - Posters Link

**Description**: Verify Posters navigation link works

**Steps**:
1. Click on "Posters" link in header
2. Verify navigation

**Expected Result**:
- Navigates to /posters
- Link shows active state when on /posters page
- No page refresh

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-005: Desktop Nav - Create Link

**Description**: Verify Create navigation link works

**Steps**:
1. Click on "Create" link in header
2. Verify navigation and icon

**Expected Result**:
- Sparkles icon displayed next to "Create" text
- Navigates to /create
- Link shows active state
- AI poster generator page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-006: Desktop Nav - Gallery Link

**Description**: Verify Gallery navigation link works

**Steps**:
1. Click on "Gallery" link in header
2. Verify navigation

**Expected Result**:
- Navigates to /gallery
- Link shows active state
- Gallery page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-007: Desktop Nav - About Link

**Description**: Verify About navigation link works

**Steps**:
1. Click on "About" link in header
2. Verify navigation

**Expected Result**:
- Navigates to /about
- Link shows active state
- About page loads

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-008: Cart Icon Display

**Description**: Verify cart icon is displayed in header

**Steps**:
1. Check header for cart icon
2. Verify icon appearance

**Expected Result**:
- Shopping cart icon visible
- Icon is a clickable link
- Icon has appropriate size (h-5 w-5)
- Hover state changes background

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Cart Icon: _______________

---

### TC-009: Cart Icon Badge - Empty Cart

**Description**: Verify cart badge behavior with empty cart

**Steps**:
1. Clear cart (if items present)
2. Check cart icon in header

**Expected Result**:
- No badge displayed when cart is empty
- Just cart icon visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Hidden: _______________

---

### TC-010: Cart Icon Badge - Items in Cart

**Description**: Verify cart badge shows item count

**Steps**:
1. Add items to cart
2. Check cart icon badge
3. Add more items

**Expected Result**:
- Badge appears when items added
- Badge shows correct item count
- Badge updates in real-time
- Badge styled with primary color background

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Count: _______________

---

### TC-011: Cart Icon Badge - 99+ Items

**Description**: Verify cart badge caps at 99+

**Steps**:
1. Add 100+ items to cart (or simulate)
2. Check badge display

**Expected Result**:
- Badge shows "99+" instead of actual number
- Prevents overflow issues
- Badge remains readable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Badge Display: _______________

---

### TC-012: Cart Icon Link

**Description**: Verify cart icon navigates to cart page

**Steps**:
1. Click on cart icon in header
2. Verify navigation

**Expected Result**:
- Navigates to /cart
- Cart page loads
- No page refresh

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-013: Account Icon Display

**Description**: Verify account/user icon is displayed

**Steps**:
1. Check header for user icon
2. Verify icon appearance

**Expected Result**:
- User icon visible on desktop
- Icon is clickable
- Icon has appropriate size
- Hover state changes background

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Account Icon: _______________

---

### TC-014: Account Icon Link

**Description**: Verify account icon navigates to account page

**Steps**:
1. Click on user icon in header
2. Verify navigation

**Expected Result**:
- Navigates to /account
- Account page loads
- No page refresh

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation: _______________

---

### TC-015: Header Sticky Behavior

**Description**: Verify header stays fixed on scroll

**Steps**:
1. Navigate to page with scrollable content
2. Scroll down the page
3. Observe header behavior

**Expected Result**:
- Header remains visible at top
- sticky top-0 positioning applied
- z-index: 50 keeps header above content
- Background with backdrop blur effect

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sticky Header: _______________

---

### TC-016: Header Background Blur

**Description**: Verify header has backdrop blur effect

**Steps**:
1. Scroll page so content is behind header
2. Observe header background

**Expected Result**:
- Semi-transparent background (95% opacity)
- Backdrop blur applied
- Content behind header is blurred
- Border at bottom visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Blur Effect: _______________

---

## Mobile Navigation

### TC-017: Mobile Menu Button Visible

**Description**: Verify mobile menu button appears on mobile

**Steps**:
1. Resize browser to mobile width (<768px)
2. Check for hamburger menu button

**Expected Result**:
- Menu icon (hamburger) visible
- Desktop nav hidden
- Cart icon still visible
- Menu button has proper touch target (h-10 w-10)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Menu: _______________

---

### TC-018: Mobile Menu Toggle Open

**Description**: Verify mobile menu opens when clicked

**Steps**:
1. On mobile viewport
2. Click hamburger menu button
3. Observe menu state

**Expected Result**:
- Menu expands below header
- Icon changes to X (close icon)
- aria-expanded becomes true
- Mobile nav links appear

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Menu Opens: _______________

---

### TC-019: Mobile Menu Toggle Close

**Description**: Verify mobile menu closes when clicked again

**Steps**:
1. Open mobile menu
2. Click X button to close
3. Observe menu state

**Expected Result**:
- Menu collapses
- Icon changes back to hamburger
- aria-expanded becomes false
- Mobile nav links hidden

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Menu Closes: _______________

---

### TC-020: Mobile Nav Links Present

**Description**: Verify all mobile navigation links are present

**Steps**:
1. Open mobile menu
2. Check all navigation links

**Expected Result**:
Links visible:
- Posters
- Create with AI (with Sparkles icon)
- Gallery
- About
- Account (with User icon)
Divider line present between main nav and account

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Links: _______________

---

### TC-021: Mobile Nav Link Closes Menu

**Description**: Verify clicking a mobile nav link closes the menu

**Steps**:
1. Open mobile menu
2. Click on any navigation link
3. Observe menu behavior

**Expected Result**:
- Navigation occurs
- Menu closes automatically
- New page loads
- Menu icon returns to hamburger

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Menu Auto-Close: _______________

---

### TC-022: Mobile Cart Icon Visible

**Description**: Verify cart icon visible on mobile (outside menu)

**Steps**:
1. On mobile viewport with menu closed
2. Check for cart icon

**Expected Result**:
- Cart icon visible next to hamburger menu
- Badge displays if items in cart
- Cart icon is clickable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Cart: _______________

---

## Footer Component

### TC-023: Footer Brand Section

**Description**: Verify footer brand/description section

**Steps**:
1. Scroll to footer
2. Check brand section

**Expected Result**:
- MasonArt logo displayed
- Logo links to home page
- Description text present
- Social media icons visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Brand Section: _______________

---

### TC-024: Footer Social Links

**Description**: Verify social media links work

**Steps**:
1. Check social icons in footer
2. Click each social link

**Expected Result**:
Social links present:
- Instagram (opens instagram.com)
- Facebook (opens facebook.com)
- Twitter (opens twitter.com)
All open in new tab (target="_blank")
rel="noopener noreferrer" for security

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Social Links: _______________

---

### TC-025: Footer Shop Section

**Description**: Verify Shop links section

**Steps**:
1. Check footer Shop section
2. Click each link

**Expected Result**:
Links present:
- All Posters (/posters)
- Abstract Art (/posters?style=abstract)
- Botanical (/posters?style=botanical)
- Minimalist (/posters?style=minimalist)
- Create with AI (/create)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shop Links: _______________

---

### TC-026: Footer Company Section

**Description**: Verify Company links section

**Steps**:
1. Check footer Company section
2. Click each link

**Expected Result**:
Links present:
- About Us (/about)
- Contact (/contact)
- FAQs (/faq)
- Shipping Info (/shipping)
- Returns & Refunds (/returns)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Company Links: _______________

---

### TC-027: Footer Newsletter Section

**Description**: Verify newsletter signup section

**Steps**:
1. Check newsletter section in footer
2. Verify form elements

**Expected Result**:
- Section title: "Stay Updated"
- Description text present
- Email input field with placeholder
- Subscribe button with Mail icon
- Form is functional (even if not implemented)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Newsletter Section: _______________

---

### TC-028: Newsletter Form Validation

**Description**: Verify newsletter form validates email

**Steps**:
1. Leave email field empty
2. Click Subscribe
3. Try invalid email format
4. Try valid email

**Expected Result**:
- Empty field triggers required validation
- Invalid email triggers format validation
- Valid email submits (no error)
- HTML5 email type validation active

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Validation: _______________

---

### TC-029: Footer Copyright

**Description**: Verify copyright notice

**Steps**:
1. Check bottom of footer
2. Verify copyright text

**Expected Result**:
- Copyright symbol present
- Current year displayed (2026)
- "MasonArt. All rights reserved." text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Copyright: _______________

---

### TC-030: Footer Legal Links

**Description**: Verify legal/policy links

**Steps**:
1. Check bottom section of footer
2. Click each legal link

**Expected Result**:
Links present:
- Privacy Policy (/privacy)
- Terms of Service (/terms)
- Cookie Policy (/cookies)
All links navigable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Legal Links: _______________

---

## Root Layout Structure

### TC-031: Page Structure

**Description**: Verify correct page structure with header/main/footer

**Steps**:
1. Inspect page HTML structure
2. Verify semantic elements

**Expected Result**:
- `<header>` element present
- `<main>` element present
- `<footer>` element present
- Correct nesting and order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Structure: _______________

---

### TC-032: Main Content Flex-Grow

**Description**: Verify main content fills available space

**Steps**:
1. Navigate to page with minimal content
2. Check layout behavior

**Expected Result**:
- Main content has flex-1 class
- Footer stays at bottom
- No gap between content and footer on short pages

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Flex Layout: _______________

---

### TC-033: Minimum Height Full Screen

**Description**: Verify layout fills viewport height

**Steps**:
1. Navigate to page
2. Check viewport coverage

**Expected Result**:
- min-h-screen on body/container
- Page fills at least full viewport
- No white space below footer

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Full Height: _______________

---

## 404 Not Found Page

### TC-034: 404 Page Display

**Description**: Verify 404 page renders for unknown routes

**Steps**:
1. Navigate to non-existent URL (e.g., /nonexistent123)
2. Verify 404 page content

**Expected Result**:
- 404 heading displayed
- "Page not found" message
- Description text
- "Go Home" button present
- Header and footer still visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- 404 Page: _______________

---

### TC-035: 404 Go Home Button

**Description**: Verify Go Home button works on 404 page

**Steps**:
1. Navigate to 404 page
2. Click "Go Home" button

**Expected Result**:
- Navigates to home page (/)
- Home page loads correctly
- Button styled appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Go Home: _______________

---

## Error Page

### TC-036: Error Page Display

**Description**: Verify error page renders on errors

**Steps**:
1. Trigger an error (e.g., component that throws)
2. Verify error page content

**Expected Result**:
- "Error" heading displayed (destructive color)
- "Something went wrong" message
- Error message in code block
- "Go Home" button present
- Header and footer still visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Error Page: _______________

---

## Accessibility

### TC-037: Keyboard Navigation - Header

**Description**: Verify header is keyboard navigable

**Steps**:
1. Press Tab from beginning of page
2. Navigate through header elements

**Expected Result**:
- All links are focusable
- Focus order is logical (logo, nav links, cart, account)
- Focus styles visible
- Can activate links with Enter

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Keyboard Nav: _______________

---

### TC-038: ARIA Labels - Cart Icon

**Description**: Verify cart icon has appropriate ARIA label

**Steps**:
1. Inspect cart icon element
2. Check aria-label attribute

**Expected Result**:
- aria-label present: "Shopping cart"
- When items in cart: "Shopping cart, X items"
- Label is descriptive for screen readers

**Actual Result**:
- [ ] PASS / [ ] FAIL
- ARIA Label: _______________

---

### TC-039: ARIA Labels - Account Icon

**Description**: Verify account icon has ARIA label

**Steps**:
1. Inspect account icon element
2. Check aria-label attribute

**Expected Result**:
- aria-label present: "Account"
- Label is descriptive

**Actual Result**:
- [ ] PASS / [ ] FAIL
- ARIA Label: _______________

---

### TC-040: ARIA Labels - Mobile Menu

**Description**: Verify mobile menu button has ARIA attributes

**Steps**:
1. On mobile, inspect menu button
2. Check ARIA attributes

**Expected Result**:
- aria-label: "Open menu" (when closed)
- aria-label: "Close menu" (when open)
- aria-expanded: false/true
- Button type="button"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- ARIA Attributes: _______________

---

### TC-041: ARIA Labels - Social Links

**Description**: Verify social media links have ARIA labels

**Steps**:
1. Inspect social link elements in footer
2. Check aria-label attributes

**Expected Result**:
Each social link has aria-label:
- "Instagram"
- "Facebook"
- "Twitter"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Social Labels: _______________

---

### TC-042: Form Label - Newsletter Email

**Description**: Verify newsletter input has accessible label

**Steps**:
1. Inspect newsletter email input
2. Check for label association

**Expected Result**:
- Hidden label with sr-only class
- Label text: "Email address"
- Label linked to input via htmlFor/id

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Form Label: _______________

---

### TC-043: Skip to Content

**Description**: Check for skip to main content link

**Steps**:
1. Focus on very first element of page
2. Check for skip link

**Expected Result**:
- Skip to main content link (recommended)
- If present, should skip to main element
- If not present, note as potential improvement

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Skip Link: _______________

---

## SEO Meta Tags

### TC-044: Document Title

**Description**: Verify page title is set

**Steps**:
1. Check browser tab
2. Inspect `<title>` element

**Expected Result**:
- Title: "MasonArt | Premium Posters & Frames"
- Title in browser tab

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Title: _______________

---

### TC-045: Meta Description

**Description**: Verify meta description is set

**Steps**:
1. Inspect `<head>` section
2. Find meta name="description"

**Expected Result**:
- Description present
- Contains keywords: "premium posters", "custom frames", "AI-generated art"
- Reasonable length (50-160 chars)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Description: _______________

---

### TC-046: Open Graph Tags

**Description**: Verify Open Graph meta tags

**Steps**:
1. Inspect `<head>` section
2. Find og: meta tags

**Expected Result**:
- og:title present
- og:description present
- og:type: website
- og:site_name: MasonArt

**Actual Result**:
- [ ] PASS / [ ] FAIL
- OG Tags: _______________

---

### TC-047: Twitter Card Tags

**Description**: Verify Twitter Card meta tags

**Steps**:
1. Inspect `<head>` section
2. Find twitter: meta tags

**Expected Result**:
- twitter:card: summary_large_image
- twitter:title present
- twitter:description present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Twitter Tags: _______________

---

### TC-048: Viewport Meta Tag

**Description**: Verify viewport is configured for mobile

**Steps**:
1. Inspect `<head>` section
2. Find viewport meta tag

**Expected Result**:
- viewport meta present
- width=device-width
- initial-scale=1

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Viewport: _______________

---

### TC-049: Theme Color Meta Tag

**Description**: Verify theme color is set

**Steps**:
1. Inspect `<head>` section
2. Find theme-color meta tag

**Expected Result**:
- theme-color present
- Value: #f97316 (MasonArt brand orange)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Theme Color: _______________

---

## Favicons and Icons

### TC-050: Favicon Present

**Description**: Verify favicon loads

**Steps**:
1. Check browser tab for favicon
2. Inspect head for favicon link

**Expected Result**:
- favicon.ico linked
- Icon visible in browser tab

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Favicon: _______________

---

### TC-051: PNG Favicons

**Description**: Verify PNG favicons for different sizes

**Steps**:
1. Inspect `<head>` section
2. Find PNG favicon links

**Expected Result**:
- 32x32 PNG favicon linked
- 16x16 PNG favicon linked
- Correct type="image/png" attribute

**Actual Result**:
- [ ] PASS / [ ] FAIL
- PNG Favicons: _______________

---

### TC-052: Apple Touch Icon

**Description**: Verify Apple touch icon for iOS

**Steps**:
1. Inspect `<head>` section
2. Find apple-touch-icon link

**Expected Result**:
- apple-touch-icon linked
- Size: 180x180
- Proper file path

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Apple Icon: _______________

---

### TC-053: Web Manifest

**Description**: Verify web app manifest is linked

**Steps**:
1. Inspect `<head>` section
2. Find manifest link

**Expected Result**:
- rel="manifest" link present
- Points to site.webmanifest
- File loads without errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Manifest: _______________

---

## Responsive Design

### TC-054: Desktop Layout (>1024px)

**Description**: Verify layout at desktop width

**Steps**:
1. Set viewport to 1920px wide
2. Check all layout elements

**Expected Result**:
- Full desktop navigation visible
- Mobile menu hidden
- Footer 4-column grid
- Container with proper max-width

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Desktop Layout: _______________

---

### TC-055: Tablet Layout (768-1024px)

**Description**: Verify layout at tablet width

**Steps**:
1. Set viewport to 768px wide
2. Check all layout elements

**Expected Result**:
- Desktop navigation still visible (md breakpoint)
- Footer adapts to 2-column
- Container padding adjusts

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Tablet Layout: _______________

---

### TC-056: Mobile Layout (<768px)

**Description**: Verify layout at mobile width

**Steps**:
1. Set viewport to 375px wide
2. Check all layout elements

**Expected Result**:
- Mobile hamburger menu visible
- Desktop nav hidden
- Footer single column
- Full-width components

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Mobile Layout: _______________

---

## Performance

### TC-057: Header/Footer Render Time

**Description**: Verify layout components render quickly

**Steps**:
1. Clear cache
2. Refresh page
3. Check for layout shift

**Expected Result**:
- Header renders immediately
- Footer renders with content
- No cumulative layout shift
- Smooth initial render

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Render Time: _______________

---

### TC-058: Navigation Performance

**Description**: Verify client-side navigation is fast

**Steps**:
1. Click navigation links
2. Measure page transition time

**Expected Result**:
- Near-instant navigation
- No full page reload
- Loading states if data needed
- Smooth transitions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigation Speed: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 58
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Browser Version: _______________
- Device/OS: _______________
- Screen Resolution: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Accessibility**:
   - Consider adding skip-to-content link
   - Ensure all interactive elements have visible focus
   - Test with screen reader

2. **Mobile Experience**:
   - Verify touch targets are 44x44px minimum
   - Test gesture navigation
   - Check menu animation smoothness

3. **Performance**:
   - Monitor bundle size
   - Consider lazy loading footer
   - Test on slow connections

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
