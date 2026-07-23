# Manual Test: Home Page

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **URL**: http://localhost:3001

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] API server running at http://localhost:3000
- [ ] Database seeded with test products (for featured section)
- [ ] Docker services (PostgreSQL, Redis) running

## Overview
This document covers manual testing of the chobii.art home page, including:
- Hero section with CTAs
- Featured products grid
- Shop by style categories
- AI generator promo section
- Value propositions
- Newsletter subscription form

## Test Cases

---

## Hero Section

### TC-001: Hero Section Renders Correctly

**Description**: Verify the hero section displays all required elements

**Steps**:
1. Navigate to http://localhost:3001
2. Observe the hero section at the top of the page

**Expected Result**:
- Background gradient visible (brand-50 to brand-100)
- AI badge "New: AI Poster Generator" visible with Sparkles icon
- Main headline "Transform Your Space with Premium Art" displayed
- Subheadline text about curated collection visible
- "Shop Posters" primary CTA button visible
- "Create with AI" secondary CTA button visible
- Trust indicators (rating, shipping, returns) visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Shop Posters CTA Button

**Description**: Verify "Shop Posters" button navigates to product listing

**Steps**:
1. Navigate to home page
2. Click the "Shop Posters" button in hero section
3. Observe navigation

**Expected Result**:
- Button has hover state (bg-primary/90)
- Navigation to /posters page
- URL updates correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-003: Create with AI CTA Button

**Description**: Verify "Create with AI" button navigates to AI generator

**Steps**:
1. Navigate to home page
2. Click the "Create with AI" button in hero section
3. Observe navigation

**Expected Result**:
- Button has hover state (border-brand-400, bg-brand-50)
- Navigation to /create page
- URL updates correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-004: Trust Indicators Display

**Description**: Verify trust indicators are correctly displayed

**Steps**:
1. Navigate to home page
2. Scroll to see trust indicators below CTAs

**Expected Result**:
- 5 yellow star icons with "4.9/5 from 2,000+ reviews"
- Truck icon with "Free shipping over Rs.999"
- Shield icon with "30-day returns"
- All text legible in muted-foreground color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Featured Products Section

### TC-005: Featured Products Load

**Description**: Verify featured products section loads products from API

**Steps**:
1. Navigate to home page
2. Scroll down to "Featured Collection" section

**Expected Result**:
- Section header "Featured Collection" visible
- Subheading "Handpicked favorites loved by our customers" visible
- Product grid displays up to 8 products
- "View all" link visible on desktop

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Products Loaded: _______________

---

### TC-006: Product Card Display

**Description**: Verify product cards display correct information

**Steps**:
1. Navigate to home page
2. Examine individual product cards in featured section

**Expected Result**:
- Product image with correct aspect ratio based on orientation
- "Featured" badge for featured products
- Product title (line-clamp-1)
- Style tags (if any)
- Price displayed as "From Rs.X,XXX"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-007: Product Card Hover States

**Description**: Verify product card hover interactions

**Steps**:
1. Navigate to home page
2. Hover over product cards in featured section

**Expected Result**:
- Card has hover shadow effect (card-hover class)
- Image scales to 105% on hover
- Title color changes to brand-600 on hover

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-008: Product Card Navigation

**Description**: Verify clicking product card navigates to product detail

**Steps**:
1. Navigate to home page
2. Click on any product card in featured section

**Expected Result**:
- Navigation to /posters/{product-slug}
- Product detail page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-009: Empty Featured Products State

**Description**: Verify placeholder displays when no featured products

**Steps**:
1. Clear featured products from database
2. Navigate to home page
3. Scroll to featured section

**Expected Result**:
- "Coming Soon" placeholder displays
- Palette icon visible
- "Our featured collection is being curated" message
- Link to create with AI visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-010: View All Link (Desktop)

**Description**: Verify "View all" link on desktop viewport

**Steps**:
1. Navigate to home page at desktop resolution
2. Click "View all" link in featured section header

**Expected Result**:
- Link visible only on desktop (hidden sm:flex)
- Navigation to /posters page
- ChevronRight icon displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-011: View All Link (Mobile)

**Description**: Verify "View all products" link on mobile viewport

**Steps**:
1. Navigate to home page at mobile resolution (375x667)
2. Scroll to end of featured products
3. Click "View all products" link

**Expected Result**:
- Link visible below product grid on mobile
- Navigation to /posters page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Categories Section

### TC-012: Shop by Style Section Display

**Description**: Verify categories section renders correctly

**Steps**:
1. Navigate to home page
2. Scroll to "Shop by Style" section

**Expected Result**:
- Section header "Shop by Style" visible
- Subheading "Find the perfect piece for your aesthetic" visible
- 4 category cards displayed (Abstract, Nature, Minimalist, Typography)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-013: Category Card Display

**Description**: Verify individual category cards display correctly

**Steps**:
1. Navigate to home page
2. Examine category cards in Shop by Style section

**Expected Result**:
- Each card has gradient background
- Category name displayed (Abstract, Nature, Minimalist, Typography)
- Description text visible (e.g., "Bold, expressive art pieces")
- "Explore" text appears on hover

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-014: Category Card Navigation

**Description**: Verify clicking category cards navigates with filter

**Steps**:
1. Navigate to home page
2. Click on "Abstract" category card

**Expected Result**:
- Navigation to /posters?styles=abstract
- URL contains styles query parameter
- Products filtered by selected style

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

### TC-015: Category Card Hover Effects

**Description**: Verify category card hover animations

**Steps**:
1. Navigate to home page
2. Hover over category cards

**Expected Result**:
- Background scales to 105% on hover
- "Explore" text fades in
- Transition is smooth (duration-300)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## AI Generator Promo Section

### TC-016: AI Section Display

**Description**: Verify AI generator promo section renders correctly

**Steps**:
1. Navigate to home page
2. Scroll to AI generator promo section

**Expected Result**:
- Dark brand gradient background (brand-600 to brand-800)
- Sparkles icon in glass container
- Headline "Create Your Own Masterpiece" visible
- Description text about AI poster generator
- 3 feature cards visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-017: AI Features Cards

**Description**: Verify feature cards display correctly

**Steps**:
1. Navigate to home page
2. Examine feature cards in AI section

**Expected Result**:
- 3 cards displayed in grid (mobile: 1 col, sm: 3 cols)
- "Easy to use" - "No design skills needed"
- "Multiple styles" - "From abstract to realistic"
- "Print ready" - "High-quality output"
- Cards have glass effect (bg-white/10 backdrop-blur)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-018: Start Creating CTA

**Description**: Verify "Start Creating" button navigates to AI generator

**Steps**:
1. Navigate to home page
2. Click "Start Creating" button in AI section

**Expected Result**:
- Button has white background with brand-700 text
- Hover state reduces opacity slightly
- Navigation to /create page

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Navigated URL: _______________

---

## Value Propositions Section

### TC-019: Value Props Display

**Description**: Verify value propositions section renders correctly

**Steps**:
1. Navigate to home page
2. Scroll to "Why Choose chobii.art?" section

**Expected Result**:
- Section header "Why Choose chobii.art?" visible
- Subheading "We're committed to bringing art into every home"
- 4 value proposition cards displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-020: Value Prop Cards Content

**Description**: Verify each value prop card displays correctly

**Steps**:
1. Navigate to home page
2. Examine each value proposition card

**Expected Result**:
- Premium Quality: Palette icon, museum-grade paper description
- Free Shipping: Truck icon, free delivery over Rs.999
- 30-Day Returns: Shield icon, full refund guarantee
- AI-Powered Creation: Sparkles icon, custom artwork description
- Icons have brand-100 background, brand-600 color

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-021: Value Prop Card Hover States

**Description**: Verify value prop card hover interactions

**Steps**:
1. Navigate to home page
2. Hover over value proposition cards

**Expected Result**:
- Card border changes to brand-200
- Shadow effect appears
- Icon background changes to brand-500, icon to white

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Newsletter Section

### TC-022: Newsletter Section Display

**Description**: Verify newsletter section renders correctly

**Steps**:
1. Navigate to home page
2. Scroll to bottom newsletter section

**Expected Result**:
- Section has border-t and muted background
- Headline "Stay Inspired" visible
- Subheadline about updates and inspiration
- Email input field present
- Subscribe button visible
- Privacy notice text present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-023: Newsletter Email Input

**Description**: Verify email input field functionality

**Steps**:
1. Navigate to home page
2. Enter email in newsletter input
3. Observe focus states

**Expected Result**:
- Placeholder "Enter your email" visible
- Input has focus ring on focus
- Email format required (type="email")

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-024: Newsletter Form Submission

**Description**: Verify newsletter form submission behavior

**Steps**:
1. Navigate to home page
2. Enter valid email in newsletter input
3. Click Subscribe button

**Expected Result**:
- Form submission prevented (e.preventDefault)
- No page navigation
- Form ready for future implementation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-025: Newsletter Invalid Email

**Description**: Verify email validation on newsletter form

**Steps**:
1. Navigate to home page
2. Enter invalid email (e.g., "invalid")
3. Click Subscribe button

**Expected Result**:
- Browser's native email validation triggers
- Form does not submit
- User prompted to enter valid email

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## SEO & Meta Tags

### TC-026: Page Title

**Description**: Verify correct page title

**Steps**:
1. Navigate to home page
2. Check browser tab / document.title

**Expected Result**:
- Title: "chobii.art | Premium Posters & Custom Frames"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Actual Title: _______________

---

### TC-027: Meta Description

**Description**: Verify meta description tag

**Steps**:
1. Navigate to home page
2. Inspect page source for meta description

**Expected Result**:
- Description includes "premium posters", "custom frames", "AI-generated art"
- Compelling marketing copy

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Meta Description: _______________

---

### TC-028: Open Graph Tags

**Description**: Verify Open Graph meta tags for social sharing

**Steps**:
1. Navigate to home page
2. Inspect page source for og: meta tags

**Expected Result**:
- og:title present
- og:description present
- og:type = "website"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-029: Twitter Card Tags

**Description**: Verify Twitter Card meta tags

**Steps**:
1. Navigate to home page
2. Inspect page source for twitter: meta tags

**Expected Result**:
- twitter:card = "summary_large_image"
- twitter:title present
- twitter:description present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Responsive Design

### TC-030: Mobile Layout (375px)

**Description**: Verify home page layout on mobile devices

**Steps**:
1. Set viewport to 375x667 (iPhone SE)
2. Navigate to home page
3. Scroll through all sections

**Expected Result**:
- Hero headline is smaller (text-4xl vs lg:text-6xl)
- CTAs stack vertically
- Product grid shows 2 columns
- Categories show 2 columns
- All text readable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-031: Tablet Layout (768px)

**Description**: Verify home page layout on tablet devices

**Steps**:
1. Set viewport to 768x1024 (iPad)
2. Navigate to home page
3. Scroll through all sections

**Expected Result**:
- Medium headline size
- Proper spacing and margins
- Product grid adapts appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-032: Desktop Layout (1920px)

**Description**: Verify home page layout on desktop

**Steps**:
1. Set viewport to 1920x1080
2. Navigate to home page
3. Scroll through all sections

**Expected Result**:
- Maximum container width applied
- Large headlines (text-6xl)
- 4-column product grid
- All sections centered appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Performance

### TC-033: Page Load Time

**Description**: Verify acceptable page load time

**Steps**:
1. Open DevTools Network tab
2. Hard refresh home page
3. Observe load time

**Expected Result**:
- Initial content visible within 2 seconds
- Full page load within 4 seconds
- No blocking resources

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load Time: _______________

---

### TC-034: Lazy Loading Images

**Description**: Verify images use lazy loading

**Steps**:
1. Navigate to home page
2. Inspect product images in DevTools

**Expected Result**:
- Product images have loading="lazy" attribute
- Images load as user scrolls
- Above-fold images may be eager

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Accessibility

### TC-035: Keyboard Navigation

**Description**: Verify home page is keyboard navigable

**Steps**:
1. Navigate to home page
2. Press Tab to navigate through interactive elements
3. Press Enter to activate links/buttons

**Expected Result**:
- All CTAs are keyboard accessible
- Focus visible on focused elements
- Logical tab order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-036: Screen Reader Compatibility

**Description**: Verify proper semantic HTML for screen readers

**Steps**:
1. Navigate to home page
2. Inspect HTML structure

**Expected Result**:
- Proper heading hierarchy (h1, h2, h3)
- Buttons and links have appropriate labels
- Images have alt text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Error States

### TC-037: API Error Handling

**Description**: Verify graceful handling when API fails

**Steps**:
1. Stop the API server
2. Navigate to home page
3. Observe featured products section

**Expected Result**:
- Page still loads without crashing
- Featured products section shows empty state
- Other sections render normally

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 37
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Node Version: _______________
- Browser Version: _______________
- Screen Resolution: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Performance**:
   - Implement image optimization for product images
   - Consider skeleton loading states for better perceived performance

2. **Accessibility**:
   - Ensure all interactive elements have visible focus states
   - Add aria-labels where needed

3. **UX Improvements**:
   - Consider adding loading indicators for async actions
   - Add animations for section transitions

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
