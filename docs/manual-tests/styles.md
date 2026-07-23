# Manual Test: Styles (Tailwind CSS & PostCSS)

## Test Environment
- **Browser**: Chrome (latest)
- **Viewport**: Desktop (1920x1080) and Mobile (375x667)
- **Date**: 2026-01-19
- **Tester**: Manual QA Testing / Claude Chrome Extension
- **Application URL**: http://localhost:3001
- **Theme**: Light and Dark modes

## Prerequisites
- [ ] Dev server running at http://localhost:3001
- [ ] Browser DevTools accessible (F12 or Cmd+Option+I)
- [ ] Tailwind CSS build process working
- [ ] PostCSS processing configured

## Overview
This document covers manual testing of the chobii.art Tailwind CSS styling system:
- CSS Custom Properties (CSS Variables)
- Tailwind Configuration
- PostCSS Processing
- Light/Dark Theme Support
- Custom Utilities and Components
- Responsive Design Utilities

## Test Cases

---

## CSS Custom Properties

### TC-001: Light Mode CSS Variables Load

**Description**: Verify light mode CSS variables are defined and applied

**Steps**:
1. Navigate to any page on the site
2. Open browser DevTools (Elements panel)
3. Select the `:root` element
4. Inspect computed styles for CSS variables

**Expected Result**:
- `--background` is defined: `0 0% 100%` (white)
- `--foreground` is defined: `222.2 84% 4.9%` (dark blue-gray)
- `--primary` is defined: `25 95% 53%` (warm amber/terracotta)
- `--border` is defined: `214.3 31.8% 91.4%`
- `--radius` is defined: `0.5rem`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-002: Dark Mode CSS Variables

**Description**: Verify dark mode CSS variables are applied when dark class is present

**Steps**:
1. Navigate to any page
2. Add `dark` class to `<html>` element in DevTools
3. Inspect computed styles for CSS variables

**Expected Result**:
- `--background` changes to: `222.2 84% 4.9%` (dark blue-gray)
- `--foreground` changes to: `210 40% 98%` (light)
- `--primary` changes to: `25 95% 58%` (slightly lighter amber)
- `--border` changes to: `217.2 32.6% 17.5%`
- Visual theme switches to dark

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Notes: _______________

---

### TC-003: Brand Color Scale

**Description**: Verify chobii.art brand color scale is defined

**Steps**:
1. Open DevTools, inspect `:root` CSS variables
2. Look for brand color scale variables

**Expected Result**:
- `--brand` defined (25 95% 53%)
- `--brand-50` through `--brand-950` defined
- Full 11-shade color scale available
- Colors transition from light (50) to dark (950)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Brand Colors Present: _______________

---

### TC-004: Semantic Color Variables

**Description**: Verify semantic color variables are defined

**Steps**:
1. Inspect CSS variables in DevTools

**Expected Result**:
All semantic colors defined:
- `--destructive` and `--destructive-foreground`
- `--success` and `--success-foreground`
- `--warning` and `--warning-foreground`
- `--muted` and `--muted-foreground`
- `--accent` and `--accent-foreground`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Missing Variables: _______________

---

### TC-005: Chart Colors

**Description**: Verify chart color variables are defined

**Steps**:
1. Inspect CSS variables in DevTools

**Expected Result**:
- `--chart-1` through `--chart-5` defined
- All colors are distinct for data visualization
- Light mode: warm tones (12, 173, 197, 43, 27)
- Dark mode: different set (220, 160, 30, 280, 340)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Chart Colors: _______________

---

### TC-006: Sidebar Variables

**Description**: Verify sidebar color variables are defined

**Steps**:
1. Inspect CSS variables in DevTools

**Expected Result**:
All sidebar variables defined:
- `--sidebar-background`
- `--sidebar-foreground`
- `--sidebar-primary` and `--sidebar-primary-foreground`
- `--sidebar-accent` and `--sidebar-accent-foreground`
- `--sidebar-border` and `--sidebar-ring`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Sidebar Variables: _______________

---

### TC-007: Typography Variables

**Description**: Verify font family variables are defined

**Steps**:
1. Inspect CSS variables in DevTools
2. Check computed styles on body

**Expected Result**:
- `--font-sans` defined: 'Inter', system-ui, sans-serif
- `--font-heading` defined: 'Inter', system-ui, sans-serif
- Body uses font-sans

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fonts Applied: _______________

---

## Base Styles

### TC-008: Body Base Styles

**Description**: Verify body has correct base styles applied

**Steps**:
1. Open DevTools
2. Select body element
3. Check computed styles

**Expected Result**:
- Background: uses `--background` color
- Text color: uses `--foreground` color
- Antialiased text rendering
- Font feature settings applied

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Body Styles: _______________

---

### TC-009: Image Max-Width Constraint

**Description**: Verify images don't overflow their containers

**Steps**:
1. Navigate to page with images (product page)
2. Resize browser window
3. Check image behavior

**Expected Result**:
- Images constrained to max-width: 100%
- Height: auto maintained
- No horizontal overflow

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Images Constrained: _______________

---

### TC-010: Focus Visible Styles

**Description**: Verify focus styles are accessible and visible

**Steps**:
1. Navigate to page with interactive elements
2. Use Tab key to navigate
3. Observe focus states on buttons/links

**Expected Result**:
- Focus outline visible using ring styles
- Ring uses `--ring` color
- Ring offset of 2px
- No default outline (replaced with ring)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Focus Style: _______________

---

### TC-011: Text Selection Styles

**Description**: Verify custom text selection styling

**Steps**:
1. Navigate to any page with text
2. Select some text with mouse
3. Observe selection highlight

**Expected Result**:
- Selection uses primary color at 20% opacity
- Custom selection background applied
- Text remains readable when selected

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Selection Color: _______________

---

### TC-012: Smooth Scrolling

**Description**: Verify smooth scroll behavior is enabled

**Steps**:
1. Navigate to a page with internal anchor links
2. Click an anchor link
3. Observe scroll behavior

**Expected Result**:
- Page scrolls smoothly to anchor
- scroll-behavior: smooth applied to html
- No jarring jumps

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Smooth Scroll: _______________

---

## Component Classes

### TC-013: Container Narrow Class

**Description**: Verify container-narrow utility class works

**Steps**:
1. Find or create element with `container-narrow` class
2. Check computed styles in DevTools

**Expected Result**:
- max-width: 4xl (56rem/896px)
- margin: auto (centered)
- padding-x: responsive (4/6/8 based on breakpoint)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Max Width: _______________

---

### TC-014: Container Wide Class

**Description**: Verify container-wide utility class works

**Steps**:
1. Find or create element with `container-wide` class
2. Check computed styles in DevTools

**Expected Result**:
- max-width: 7xl (80rem/1280px)
- margin: auto (centered)
- padding-x: responsive (4/6/8 based on breakpoint)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Max Width: _______________

---

### TC-015: Skeleton Loading Class

**Description**: Verify skeleton loading animation works

**Steps**:
1. Find or create element with `skeleton` class
2. Observe animation

**Expected Result**:
- Pulsing animation applied
- Background color: muted
- Border radius applied
- Smooth animation loop

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Animation: _______________

---

### TC-016: Poster Aspect Ratio Classes

**Description**: Verify poster aspect ratio utilities work

**Steps**:
1. Test elements with poster aspect ratio classes
2. Verify each aspect ratio

**Expected Result**:
- `.poster-portrait`: aspect-ratio 2/3
- `.poster-landscape`: aspect-ratio 3/2
- `.poster-square`: aspect-ratio 1/1
- `.poster-panoramic`: aspect-ratio 16/9

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Aspect Ratios Applied: _______________

---

### TC-017: Card Hover Effect

**Description**: Verify card-hover utility class works

**Steps**:
1. Find or create card element with `card-hover` class
2. Hover over the card
3. Observe transition effects

**Expected Result**:
- Shadow increases on hover
- Card translates up (-translate-y-1)
- Transition duration: 200ms
- Smooth animation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Hover Effect: _______________

---

### TC-018: Gradient Text Class

**Description**: Verify gradient-text utility class works

**Steps**:
1. Find or create element with `gradient-text` class
2. Observe text styling

**Expected Result**:
- Text has gradient from brand-500 to brand-700
- Background-clip: text applied
- Text color: transparent
- Gradient visible in text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Gradient Visible: _______________

---

## Custom Utilities

### TC-019: Scrollbar Hide Utility

**Description**: Verify scrollbar-hide utility works

**Steps**:
1. Create scrollable element with `scrollbar-hide` class
2. Add overflow content
3. Check scrollbar visibility

**Expected Result**:
- Content remains scrollable
- Scrollbar not visible
- Works in Chrome (webkit) and Firefox

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Scrollbar Hidden: _______________

---

### TC-020: Scrollbar Thin Utility

**Description**: Verify scrollbar-thin utility works

**Steps**:
1. Create scrollable element with `scrollbar-thin` class
2. Add overflow content
3. Check scrollbar styling

**Expected Result**:
- Thin scrollbar (1.5 width/height)
- Custom colors: muted-foreground at 30%
- Hover state: 50% opacity
- Rounded scrollbar thumb

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Scrollbar Style: _______________

---

### TC-021: Text Balance Utility

**Description**: Verify text-balance utility works

**Steps**:
1. Find or create heading with `text-balance` class
2. Check text wrapping behavior

**Expected Result**:
- text-wrap: balance applied
- Lines break more evenly
- Avoids orphaned words

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Text Balanced: _______________

---

### TC-022: Glass Effect Utility

**Description**: Verify glass effect utility works

**Steps**:
1. Create element with `glass` class over content
2. Check visual effect

**Expected Result**:
- Background: background color at 80% opacity
- Backdrop blur: md (12px)
- Semi-transparent frosted glass effect

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Glass Effect: _______________

---

### TC-023: Line Clamp Utilities

**Description**: Verify line-clamp utilities work

**Steps**:
1. Test elements with line-clamp-1, line-clamp-2, line-clamp-3
2. Add long text content
3. Verify clamping

**Expected Result**:
- `.line-clamp-1`: truncates after 1 line
- `.line-clamp-2`: truncates after 2 lines
- `.line-clamp-3`: truncates after 3 lines
- Ellipsis shown at truncation point

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Line Clamp Working: _______________

---

### TC-024: No-Select Utility

**Description**: Verify no-select utility prevents text selection

**Steps**:
1. Create element with `no-select` class
2. Try to select text content

**Expected Result**:
- Text cannot be selected
- user-select: none applied
- Works across browsers (webkit, moz)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Selection Disabled: _______________

---

## Animation Utilities

### TC-025: Animation Delay Utilities

**Description**: Verify animation delay utilities work

**Steps**:
1. Create animated elements with delay classes
2. Trigger animations
3. Observe staggered timing

**Expected Result**:
- `.animation-delay-100`: 100ms delay
- `.animation-delay-200`: 200ms delay
- `.animation-delay-300`: 300ms delay
- `.animation-delay-500`: 500ms delay
- `.animation-delay-700`: 700ms delay
- `.animation-delay-1000`: 1000ms delay

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Delays Applied: _______________

---

### TC-026: Fade Animations

**Description**: Verify fade-in and fade-out animations work

**Steps**:
1. Apply animate-fade-in to element
2. Observe animation

**Expected Result**:
- fade-in: 0% to 100% opacity
- fade-out: 100% to 0% opacity
- Duration: 0.3s
- Ease-out timing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Fade Animations: _______________

---

### TC-027: Slide Animations

**Description**: Verify slide animations work

**Steps**:
1. Test slide-in-from-top, bottom, left, right
2. Observe each animation

**Expected Result**:
- slide-in-from-top: -100% to 0 translateY
- slide-in-from-bottom: 100% to 0 translateY
- slide-in-from-left: -100% to 0 translateX
- slide-in-from-right: 100% to 0 translateX
- Duration: 0.3s, ease-out

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Slide Animations: _______________

---

### TC-028: Accordion Animations

**Description**: Verify accordion animations work

**Steps**:
1. Find accordion component using these animations
2. Open/close accordion
3. Observe height transitions

**Expected Result**:
- accordion-down: height 0 to content height
- accordion-up: content height to 0
- Uses Radix accordion height variable
- Duration: 0.2s, ease-out

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Accordion Animations: _______________

---

### TC-029: Shimmer Animation

**Description**: Verify shimmer loading animation works

**Steps**:
1. Create element with shimmer animation
2. Observe animation

**Expected Result**:
- Shimmer moves left to right
- translateX: 0% to 100%
- Duration: 2s infinite
- Loading skeleton effect

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Shimmer Animation: _______________

---

### TC-030: Pulse Animation

**Description**: Verify pulse animation works

**Steps**:
1. Create element with animate-pulse
2. Observe animation

**Expected Result**:
- Opacity: 100% to 50% to 100%
- Duration: 2s infinite
- Cubic-bezier timing
- Subtle breathing effect

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Pulse Animation: _______________

---

### TC-031: Spin Animation

**Description**: Verify spin animation works

**Steps**:
1. Create element with animate-spin
2. Observe animation

**Expected Result**:
- Rotates 0deg to 360deg
- Duration: 1s infinite
- Linear timing
- Continuous rotation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Spin Animation: _______________

---

## Tailwind Configuration

### TC-032: Extended Spacing Values

**Description**: Verify custom spacing values work

**Steps**:
1. Test elements with spacing-18, spacing-88, spacing-128
2. Check computed values

**Expected Result**:
- `18`: 4.5rem (72px)
- `88`: 22rem (352px)
- `128`: 32rem (512px)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Custom Spacing: _______________

---

### TC-033: Extended Aspect Ratios

**Description**: Verify custom aspect ratio values work

**Steps**:
1. Test elements with aspect-poster, aspect-poster-landscape, etc.
2. Check computed aspect ratios

**Expected Result**:
- `poster`: 2/3
- `poster-landscape`: 3/2
- `poster-square`: 1/1
- `poster-panoramic`: 16/9

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Aspect Ratios: _______________

---

### TC-034: Background Image Gradients

**Description**: Verify custom gradient background images work

**Steps**:
1. Test elements with bg-gradient-radial and bg-gradient-conic
2. Verify gradient rendering

**Expected Result**:
- `gradient-radial`: radial-gradient with gradient stops
- `gradient-conic`: conic-gradient from 180deg
- Gradients render correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Gradients: _______________

---

### TC-035: Container Configuration

**Description**: Verify Tailwind container settings

**Steps**:
1. Test element with `container` class
2. Check centering and padding

**Expected Result**:
- Centered (margin: auto)
- Padding: 2rem
- Max-width at 2xl: 1400px

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Container Config: _______________

---

### TC-036: Border Radius Variables

**Description**: Verify border radius variables work

**Steps**:
1. Test elements with rounded-sm, rounded-md, rounded-lg
2. Check computed border-radius

**Expected Result**:
- `rounded-lg`: var(--radius) = 0.5rem
- `rounded-md`: calc(var(--radius) - 2px) = 0.375rem
- `rounded-sm`: calc(var(--radius) - 4px) = 0.25rem

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Border Radius: _______________

---

## Print Styles

### TC-037: Print Hidden Utility

**Description**: Verify print-hidden utility works

**Steps**:
1. Add `print-hidden` class to element
2. Print preview page (Cmd/Ctrl + P)
3. Verify element visibility

**Expected Result**:
- Element visible on screen
- Element hidden in print preview
- display: none in print media

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Print Hidden: _______________

---

### TC-038: Print Only Utility

**Description**: Verify print-only utility works

**Steps**:
1. Add `print-only` class to element
2. Check visibility on screen vs print preview

**Expected Result**:
- Element hidden on screen
- Element visible in print preview
- display: block in print media

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Print Only: _______________

---

## Responsive Design

### TC-039: Responsive Container Padding

**Description**: Verify container padding responds to breakpoints

**Steps**:
1. Find element with container-wide class
2. Resize browser to different widths
3. Check padding changes

**Expected Result**:
- Mobile: px-4 (1rem)
- Tablet (sm): px-6 (1.5rem)
- Desktop (lg): px-8 (2rem)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Responsive Padding: _______________

---

### TC-040: Mobile Menu Display

**Description**: Verify responsive visibility utilities work

**Steps**:
1. Navigate to page with header
2. Check mobile vs desktop display

**Expected Result**:
- Desktop nav: visible (md:flex)
- Mobile menu button: hidden on desktop (md:hidden)
- Mobile nav: visible only on mobile

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Responsive Display: _______________

---

## PostCSS Integration

### TC-041: Tailwind Directives Processed

**Description**: Verify Tailwind directives are processed

**Steps**:
1. Check compiled CSS output
2. Verify no raw @tailwind directives remain

**Expected Result**:
- @tailwind base: processed
- @tailwind components: processed
- @tailwind utilities: processed
- No compile errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Directives Processed: _______________

---

### TC-042: Autoprefixer Working

**Description**: Verify autoprefixer adds vendor prefixes

**Steps**:
1. Check compiled CSS
2. Look for -webkit-, -moz- prefixes on appropriate properties

**Expected Result**:
- Flexbox properties prefixed
- Transform properties prefixed
- User-select prefixed
- Backdrop-filter prefixed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Prefixes Added: _______________

---

## shadcn/ui Compatibility

### TC-043: HSL Color Format

**Description**: Verify colors use HSL format for shadcn/ui compatibility

**Steps**:
1. Check CSS variable format
2. Verify hsl() usage in Tailwind classes

**Expected Result**:
- Variables defined as HSL values without hsl()
- Used with hsl(var(--name)) in config
- Compatible with shadcn/ui theming

**Actual Result**:
- [ ] PASS / [ ] FAIL
- HSL Format: _______________

---

### TC-044: Component Styling Consistency

**Description**: Verify shadcn/ui component styles work correctly

**Steps**:
1. Navigate to page with buttons, inputs, cards
2. Verify consistent styling

**Expected Result**:
- Buttons use primary color
- Inputs use border/input colors
- Cards use card colors
- Focus rings consistent

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Component Styles: _______________

---

## Performance

### TC-045: CSS Bundle Size

**Description**: Verify CSS bundle size is reasonable

**Steps**:
1. Open DevTools Network tab
2. Refresh page
3. Check CSS file size

**Expected Result**:
- CSS file loads quickly
- Size reasonable (< 100KB minified)
- No duplicate rules
- Purged unused styles

**Actual Result**:
- [ ] PASS / [ ] FAIL
- CSS Size: _______________

---

### TC-046: No Flash of Unstyled Content (FOUC)

**Description**: Verify styles load before content renders

**Steps**:
1. Clear cache
2. Refresh page on slow connection
3. Observe page load

**Expected Result**:
- No flash of unstyled content
- Styles apply immediately
- Critical CSS inline or preloaded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- FOUC Present: _______________

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary

- **Total Test Cases**: 46
- **Passed**: _______________
- **Failed**: _______________
- **Blocked**: _______________
- **Pass Rate**: _______________%

## Notes

### Test Environment Details
- Tailwind CSS Version: _______________
- PostCSS Version: _______________
- Browser: _______________

### Additional Observations
_______________________________________________
_______________________________________________
_______________________________________________

## Recommendations

1. **Theme System**:
   - Test dark mode toggle functionality
   - Verify system preference detection
   - Test high contrast mode support

2. **Performance**:
   - Monitor CSS bundle size growth
   - Consider CSS splitting for large applications
   - Test critical CSS extraction

3. **Accessibility**:
   - Ensure color contrast ratios meet WCAG
   - Verify focus states are visible
   - Test with forced colors mode

## Sign-Off

- **Tested By**: _______________
- **Date**: _______________
- **Status**: [ ] Approved / [ ] Rejected
- **Comments**: _______________
