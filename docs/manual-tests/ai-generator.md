# Manual Test: AI Poster Generator Page

## Test Environment
- **Browser**: Chrome (latest), Firefox (latest), Safari (latest)
- **Viewport**: Desktop (1920x1080), Tablet (768x1024), Mobile (375x667)
- **URL**: http://localhost:3001/create
- **Date**: 2026-01-28
- **Tester**: Manual QA / Claude Chrome Extension

## Prerequisites
- [x] Dev server running at http://localhost:3001
- [x] Database seeded with test data
- [x] Redis running for queue processing
- [ ] User account with AI credits available (for generation tests)
- [ ] Test images in storage for completed generations

## Test Cases

---

### Section: Page Header

### TC-001: Page Header Display

**Description**: Verify the page header section displays correctly

**Steps**:
1. Navigate to `/create`
2. Verify header section is visible
3. Check heading text and icon

**Expected Result**:
- Page header section visible
- "Create AI Poster" heading displayed
- Sparkles icon displayed in rounded container
- Description text: "Describe your vision and let AI bring it to life"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-002: Page Title and Meta

**Description**: Verify page title and meta description

**Steps**:
1. Navigate to `/create`
2. Check browser tab title
3. Inspect meta description

**Expected Result**:
- Title contains "Create AI Poster" and "MasonArt"
- Meta description mentions AI poster generation
- Open Graph tags present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Prompt Input

### TC-003: Prompt Textarea Display

**Description**: Verify prompt input textarea is displayed and functional

**Steps**:
1. Navigate to `/create`
2. Locate prompt input section
3. Verify label, textarea, and placeholder

**Expected Result**:
- "Your Prompt" label visible
- Textarea with id "prompt-input" visible
- Placeholder text: "Describe the poster you want to create..."
- Character count shows "0/500"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-004: Character Count Updates

**Description**: Verify character count updates as user types

**Steps**:
1. Navigate to `/create`
2. Type "Test prompt text" in textarea
3. Verify character count

**Expected Result**:
- Character count updates to "16/500"
- Count updates in real-time

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-005: Character Count Near Limit

**Description**: Verify warning when approaching character limit

**Steps**:
1. Navigate to `/create`
2. Enter 410+ characters (80% of limit)
3. Check character count styling

**Expected Result**:
- Character count changes to amber/warning color
- Shows "410/500" or similar
- Visual indication of approaching limit

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-006: Character Limit Exceeded

**Description**: Verify error when exceeding character limit

**Steps**:
1. Navigate to `/create`
2. Enter 501+ characters
3. Check for error message

**Expected Result**:
- Character count shows error styling (red)
- Error message: "Prompt exceeds maximum length"
- Generate button disabled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-007: Examples Button Toggle

**Description**: Verify example prompts panel toggles

**Steps**:
1. Navigate to `/create`
2. Click "Examples" button
3. Verify panel opens
4. Click "Examples" button again
5. Verify panel closes

**Expected Result**:
- Examples button visible
- Panel opens on first click showing "Click an example to use it"
- Panel closes on second click

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-008: Example Prompts Display

**Description**: Verify example prompts are displayed

**Steps**:
1. Navigate to `/create`
2. Click "Examples" button
3. Count example prompts

**Expected Result**:
- 6 example prompt buttons displayed
- Examples cover different styles/subjects
- Each example is clickable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-009: Select Example Prompt

**Description**: Verify selecting an example populates the prompt

**Steps**:
1. Navigate to `/create`
2. Click "Examples" button
3. Click first example prompt
4. Verify textarea is populated

**Expected Result**:
- Prompt textarea filled with example text
- Character count updates
- Examples panel closes
- Generate button becomes enabled

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-010: Negative Prompt Toggle

**Description**: Verify negative prompt section toggle

**Steps**:
1. Navigate to `/create`
2. Locate "Advanced: Negative Prompt" button
3. Click to expand
4. Verify negative prompt input appears

**Expected Result**:
- Toggle button visible
- Clicking expands negative prompt section
- Textarea with id "negative-prompt-input" visible
- Character count shows "0/300"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-011: Negative Prompt Input

**Description**: Verify negative prompt accepts input

**Steps**:
1. Navigate to `/create`
2. Expand negative prompt section
3. Enter "blurry, low quality, text"
4. Verify input is accepted

**Expected Result**:
- Text entered successfully
- Character count updates
- Input value matches entered text

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Style Selector

### TC-012: Style Preset Section Display

**Description**: Verify style preset section is displayed

**Steps**:
1. Navigate to `/create`
2. Locate "Style Preset" section
3. Verify heading and content

**Expected Result**:
- "Style Preset" heading (h3) visible
- Category filter buttons visible
- Style preset cards visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-013: Category Filter Buttons

**Description**: Verify all category filter buttons are present

**Steps**:
1. Navigate to `/create`
2. Locate category filter buttons

**Expected Result**:
- "All Styles" button visible
- "Artistic" button visible
- "Photographic" button visible
- "Illustrative" button visible
- "Decorative" button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-014: Default Category Selection

**Description**: Verify "All Styles" is selected by default

**Steps**:
1. Navigate to `/create`
2. Check category filter state

**Expected Result**:
- "All Styles" button has primary/selected styling
- All style presets are shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-015: Filter Styles by Category

**Description**: Verify filtering styles by category works

**Steps**:
1. Navigate to `/create`
2. Click "Artistic" category
3. Verify styles are filtered
4. Click "Illustrative" category
5. Verify styles change

**Expected Result**:
- Selected category gets primary styling
- Only styles in selected category shown
- "Botanical" visible in Illustrative category

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-016: All Style Presets Display

**Description**: Verify all 15 style presets are displayed

**Steps**:
1. Navigate to `/create`
2. Ensure "All Styles" is selected
3. Verify all style options

**Expected Result**:
- Wabi-Sabi style visible
- Abstract Expression style visible
- Botanical style visible
- Geometric Modern style visible
- Vintage Poster style visible
- Pop Art style visible
- Watercolor style visible
- Photography style visible
- Line Art style visible
- Typography style visible
- Ink Wash style visible (new)
- Digital Art style visible (new)
- Minimalist Modern style visible (new)
- Impressionist style visible (new)
- Art Deco style visible (new)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-017: Style Card Information

**Description**: Verify style cards show name and description

**Steps**:
1. Navigate to `/create`
2. Examine style cards

**Expected Result**:
- Each card shows style name
- Each card shows brief description
- Wabi-Sabi shows "Minimalist, organic aesthetics"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-018: Default Style Selection

**Description**: Verify a style is selected by default

**Steps**:
1. Navigate to `/create`
2. Check style selection state

**Expected Result**:
- One style has selected indicator (border-primary, ring-2)
- Wabi-Sabi is selected by default

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-019: Change Style Selection

**Description**: Verify clicking a style changes selection

**Steps**:
1. Navigate to `/create`
2. Click on "Botanical" style card
3. Verify selection changes

**Expected Result**:
- Botanical card gets selected styling
- Previous selection removed
- Selection indicator visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-020: Premium Style Badges

**Description**: Verify premium styles show PRO badge

**Steps**:
1. Navigate to `/create`
2. Look for PRO badges on style cards

**Expected Result**:
- At least one style shows "PRO" badge
- Badge visible on premium-only styles

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Aspect Ratio Selector

### TC-021: Aspect Ratio Section Display

**Description**: Verify aspect ratio section is displayed

**Steps**:
1. Navigate to `/create`
2. Locate "Aspect Ratio" section

**Expected Result**:
- "Aspect Ratio" heading (h3) visible
- Four aspect ratio options visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-022: All Aspect Ratio Options

**Description**: Verify all 4 aspect ratio options are displayed

**Steps**:
1. Navigate to `/create`
2. Check aspect ratio buttons

**Expected Result**:
- Square (1:1) option visible
- Portrait (2:3) option visible
- Landscape (3:2) option visible
- Panoramic (16:9) option visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-023: Default Aspect Ratio Selection

**Description**: Verify Portrait is selected by default

**Steps**:
1. Navigate to `/create`
2. Check aspect ratio selection state

**Expected Result**:
- Portrait option has selected styling (border-primary)
- Other options have default styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024: Change Aspect Ratio Selection

**Description**: Verify clicking changes aspect ratio selection

**Steps**:
1. Navigate to `/create`
2. Click on "Square" option
3. Verify selection changes

**Expected Result**:
- Square option gets selected styling
- Portrait loses selected styling

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Color Palette Selector

### TC-024a: Color Palette Section Display

**Description**: Verify color palette section is displayed

**Steps**:
1. Navigate to `/create`
2. Locate "Color Palette" section

**Expected Result**:
- "Color Palette" heading (h3) visible
- System palette options visible
- "Custom" option visible
- Currently selected palette highlighted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024b: System Color Palettes

**Description**: Verify all 8 system color palettes are displayed

**Steps**:
1. Navigate to `/create`
2. Check color palette options

**Expected Result**:
- "None" option visible (default)
- "Warm Sunset" palette visible
- "Cool Ocean" palette visible
- "Forest" palette visible
- "Vintage" palette visible
- "Monochrome" palette visible
- "Pastel" palette visible
- "Vibrant" palette visible
- Each shows 3-5 color swatches

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024c: Select System Palette

**Description**: Verify selecting a system palette works

**Steps**:
1. Navigate to `/create`
2. Click on "Warm Sunset" palette
3. Verify selection changes

**Expected Result**:
- Warm Sunset card gets selected styling (border-primary)
- Previous selection removed
- Color swatches displayed in card

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024d: Custom Palette Creation

**Description**: Verify custom palette creation flow

**Steps**:
1. Navigate to `/create`
2. Click "Custom" palette option
3. Add 3-8 colors using color picker
4. Save custom palette

**Expected Result**:
- Color picker opens on click
- Can add multiple colors (3-8)
- Save button enabled with valid colors
- Custom palette saved and selectable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024e: Custom Palette Validation

**Description**: Verify custom palette requires 3-8 colors

**Steps**:
1. Navigate to `/create`
2. Try to save with 2 colors
3. Try to save with 9 colors

**Expected Result**:
- Error message for < 3 colors
- Cannot add more than 8 colors
- Validation message displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Reference Image Uploader

### TC-024f: Reference Image Section Display

**Description**: Verify reference image upload section is displayed

**Steps**:
1. Navigate to `/create`
2. Locate "Reference Image" section

**Expected Result**:
- "Reference Image (Optional)" heading visible
- Upload area with dropzone visible
- Weight slider visible
- Cost indicator visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024g: Reference Image Upload

**Description**: Verify reference image upload works

**Steps**:
1. Navigate to `/create`
2. Click upload area or drag image
3. Select valid image (JPEG/PNG/WebP, < 10MB)

**Expected Result**:
- File picker opens on click
- Accepts JPEG, PNG, WebP formats
- Image preview displayed after upload
- Remove button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024h: Reference Image Weight Slider

**Description**: Verify weight slider functionality

**Steps**:
1. Upload a reference image
2. Adjust weight slider (0.3 - 1.0)

**Expected Result**:
- Slider range: 0.3 to 1.0
- Default value: 0.5
- Weight value displayed
- Tooltip explains weight impact

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024i: Reference Image File Validation

**Description**: Verify file type and size validation

**Steps**:
1. Try uploading invalid file type (PDF, GIF)
2. Try uploading file > 10MB

**Expected Result**:
- Error message for invalid file type
- Error message for file too large
- "Accepted formats: JPEG, PNG, WebP (max 10MB)"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024j: Reference Image Cost Display

**Description**: Verify additional cost indicator

**Steps**:
1. Upload a reference image
2. Check cost display

**Expected Result**:
- "+2 credits" indicator visible
- Cost updates generation total
- Tooltip explains img2img cost

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Prompt Suggestions

### TC-024k: Prompt Suggestions Section Display

**Description**: Verify prompt suggestions section is displayed

**Steps**:
1. Navigate to `/create`
2. Locate "Suggestions" area near prompt input

**Expected Result**:
- "Suggestions" or "Ideas" label visible
- Suggestion pills/buttons displayed
- Refresh/shuffle button visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024l: Style-Based Suggestions

**Description**: Verify suggestions change with style selection

**Steps**:
1. Select "Watercolor" style
2. Note suggestions displayed
3. Change to "Pop Art" style
4. Note suggestions change

**Expected Result**:
- Suggestions refresh on style change
- Suggestions relevant to selected style
- 6 suggestions per style (curated)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024m: Click Suggestion to Insert

**Description**: Verify clicking suggestion populates prompt

**Steps**:
1. Navigate to `/create`
2. Click on a suggestion pill

**Expected Result**:
- Suggestion text inserted into prompt textarea
- Character count updates
- Generate button becomes enabled
- Suggestion pill shows "used" state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024n: Refresh Suggestions

**Description**: Verify refresh button loads new suggestions

**Steps**:
1. Note current suggestions
2. Click refresh/shuffle button
3. Verify new suggestions appear

**Expected Result**:
- New set of suggestions loaded
- Animation during refresh
- Different suggestions displayed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024o: Popular Suggestion Indicator

**Description**: Verify popular suggestions are marked

**Steps**:
1. View suggestion pills
2. Look for "popular" indicators

**Expected Result**:
- Some suggestions show "popular" or fire icon
- Popular suggestions highlighted
- Based on usage analytics

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Generate Button

### TC-025: Generate Button Display

**Description**: Verify Generate button is displayed

**Steps**:
1. Navigate to `/create`
2. Locate Generate button

**Expected Result**:
- "Generate Poster" button visible
- Wand icon displayed in button
- Variations text below: "Each generation creates 4 unique variations"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-026: Generate Button Disabled - Empty Prompt

**Description**: Verify button is disabled when prompt is empty

**Steps**:
1. Navigate to `/create`
2. Ensure prompt textarea is empty
3. Check button state

**Expected Result**:
- Button has disabled/muted styling
- Button shows cursor-not-allowed or bg-muted class

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-027: Generate Button Disabled - Short Prompt

**Description**: Verify button is disabled when prompt is too short

**Steps**:
1. Navigate to `/create`
2. Enter "ab" (2 characters) in prompt
3. Check button state

**Expected Result**:
- Button remains disabled/muted
- Minimum 3 characters required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-028: Generate Button Enabled - Valid Prompt

**Description**: Verify button is enabled with valid prompt

**Steps**:
1. Navigate to `/create`
2. Enter "A beautiful sunset over mountains"
3. Check button state

**Expected Result**:
- Button has primary/enabled styling
- Button is clickable
- No cursor-not-allowed class

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Results Section

### TC-029: Empty Results State

**Description**: Verify empty state when no generations exist

**Steps**:
1. Navigate to `/create`
2. Locate results section
3. Check empty state display

**Expected Result**:
- "No generations yet" message visible
- Description: "Enter a prompt, choose your style, and click generate"
- Image placeholder icon visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030: Results Section Layout

**Description**: Verify results section layout on desktop

**Steps**:
1. Navigate to `/create` on desktop
2. Check two-column layout

**Expected Result**:
- Form on left side
- Results on right side
- Grid layout with lg:grid-cols-2

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Upscaling UI (Results)

### TC-030a: Upscale Button Display

**Description**: Verify upscale button on completed generations

**Steps**:
1. Generate an image (or view completed generation)
2. Hover over result image
3. Check for upscale button

**Expected Result**:
- Upscale button visible on hover
- "Upscale" text or icon displayed
- Dropdown arrow indicates options

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030b: Upscale Options Dropdown

**Description**: Verify upscale size options

**Steps**:
1. Click upscale button on a result
2. View dropdown options

**Expected Result**:
- "2x" option visible (5 credits)
- "4x" option visible (10 credits)
- Credit cost displayed for each option
- Resulting dimensions shown

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030c: Upscale 2x Selection

**Description**: Verify 2x upscale works

**Steps**:
1. Click upscale button
2. Select "2x" option
3. Wait for completion

**Expected Result**:
- Confirmation or immediate start
- Progress indicator shown
- Costs 5 credits
- Image doubles in dimensions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030d: Upscale 4x Selection

**Description**: Verify 4x upscale works

**Steps**:
1. Click upscale button
2. Select "4x" option
3. Wait for completion

**Expected Result**:
- Confirmation or immediate start
- Progress indicator shown
- Costs 10 credits
- Image quadruples in dimensions

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030e: Upscaling Progress Overlay

**Description**: Verify progress display during upscaling

**Steps**:
1. Start an upscale operation
2. Observe the image card

**Expected Result**:
- Overlay appears on image
- Progress bar or spinner visible
- "Upscaling..." text displayed
- Cannot start another upscale on same image

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030f: Upscaled Badge

**Description**: Verify upscaled images show badge

**Steps**:
1. View an upscaled image

**Expected Result**:
- "Upscaled 2x" or "Upscaled 4x" badge visible
- Badge shows upscale factor
- Different styling from original

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030g: Wallet Balance Display

**Description**: Verify wallet balance shown near upscale

**Steps**:
1. View results section
2. Check for wallet balance indicator

**Expected Result**:
- Current credit balance visible
- Updates after upscale operation
- Low balance warning if < 10 credits

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030h: Insufficient Credits for Upscale

**Description**: Verify error when insufficient credits

**Steps**:
1. Ensure wallet has < 5 credits
2. Try to upscale 2x

**Expected Result**:
- Error message displayed
- "Insufficient credits" text
- Link to add credits/top up wallet
- Upscale not started

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030i: Upscale in Image Preview Modal

**Description**: Verify upscale available in full preview

**Steps**:
1. Click image to open preview modal
2. Check for upscale options

**Expected Result**:
- Upscale button in modal toolbar
- Same 2x/4x options available
- Works same as card upscale

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Tips Section

### TC-031: Tips Section Display

**Description**: Verify tips section is displayed

**Steps**:
1. Navigate to `/create`
2. Scroll to tips section

**Expected Result**:
- "Tips for Better Results" heading visible
- Tips displayed in grid layout (2 columns on larger screens)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-032: All Tips Displayed

**Description**: Verify all 4 tips are displayed

**Steps**:
1. Navigate to `/create`
2. Check for each tip

**Expected Result**:
- "Be Descriptive" tip visible with description
- "Try Different Styles" tip visible
- "Use Negative Prompts" tip visible
- "Iterate" tip visible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-033: Tip Content

**Description**: Verify tip content is helpful

**Steps**:
1. Navigate to `/create`
2. Read "Be Descriptive" tip description

**Expected Result**:
- Description includes guidance about colors, mood, composition
- Content is actionable and helpful

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Responsive Design

### TC-034: Mobile Layout (375px)

**Description**: Verify page layout on mobile

**Steps**:
1. Set viewport to 375x667
2. Navigate to `/create`
3. Check all elements visible

**Expected Result**:
- Page header visible
- Prompt input visible and usable
- Style selector visible
- Aspect ratio selector visible
- Generate button visible
- Layout stacks vertically

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Screenshots:

---

### TC-035: Mobile Style Grid

**Description**: Verify style cards grid on mobile

**Steps**:
1. Set viewport to 375x667
2. Navigate to `/create`
3. Check style grid layout

**Expected Result**:
- Style cards in 2-column grid
- Cards are readable and tappable
- Grid adapts to screen width

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-036: Mobile Aspect Ratio Grid

**Description**: Verify aspect ratio buttons on mobile

**Steps**:
1. Set viewport to 375x667
2. Navigate to `/create`
3. Check aspect ratio layout

**Expected Result**:
- 2-column grid on mobile
- 4-column grid on larger screens
- Buttons are tappable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-037: Tablet Layout (768px)

**Description**: Verify page layout on tablet

**Steps**:
1. Set viewport to 768x1024
2. Navigate to `/create`
3. Check layout

**Expected Result**:
- All sections visible
- Layout adapts appropriately
- Touch targets are adequate

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Screenshots:

---

### TC-038: Desktop Layout (1280px)

**Description**: Verify two-column layout on desktop

**Steps**:
1. Set viewport to 1280x800
2. Navigate to `/create`
3. Check layout

**Expected Result**:
- Two-column grid layout
- Form on left, results on right
- Comfortable spacing

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Screenshots:

---

### Section: Accessibility

### TC-039: Heading Hierarchy

**Description**: Verify proper heading structure

**Steps**:
1. Navigate to `/create`
2. Use accessibility inspector or check headings

**Expected Result**:
- Exactly one h1 ("Create AI Poster")
- h3 elements for subsections (Style Preset, Aspect Ratio, Tips)
- Proper hierarchy maintained

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-040: Form Labels

**Description**: Verify form inputs have accessible labels

**Steps**:
1. Navigate to `/create`
2. Check label associations

**Expected Result**:
- Prompt textarea has label with for="prompt-input"
- Label text: "Your Prompt"
- Negative prompt has label when expanded

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-041: Keyboard Navigation

**Description**: Verify page is keyboard navigable

**Steps**:
1. Navigate to `/create`
2. Press Tab repeatedly
3. Navigate through interactive elements

**Expected Result**:
- Focus moves through all interactive elements
- Focus visible on each element
- Logical tab order

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-042: Button Roles

**Description**: Verify buttons have correct type

**Steps**:
1. Navigate to `/create`
2. Inspect Generate button

**Expected Result**:
- Generate button has type="button"
- Style selection buttons are accessible
- Category filter buttons are accessible

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Navigation & Integration

### TC-043: Navigation from Home Hero CTA

**Description**: Verify navigation from home page hero

**Steps**:
1. Navigate to `/`
2. Click "Create with AI" CTA in hero
3. Verify navigation

**Expected Result**:
- Clicks navigates to `/create`
- Page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-044: Navigation from Home AI Section

**Description**: Verify navigation from home page AI section

**Steps**:
1. Navigate to `/`
2. Scroll to AI section
3. Click "Start Creating" button

**Expected Result**:
- Navigates to `/create`
- Page loads correctly

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Form Interaction Flow

### TC-045: Complete Form Configuration

**Description**: Verify complete form configuration flow

**Steps**:
1. Navigate to `/create`
2. Enter prompt: "A serene Japanese garden with cherry blossoms"
3. Select "Botanical" style
4. Select "Square" aspect ratio
5. Expand and enter negative prompt: "blurry, text"
6. Check Generate button

**Expected Result**:
- All selections reflected in form
- Generate button is enabled
- Ready to submit

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-046: Use Example and Generate Flow

**Description**: Verify using example prompt flow

**Steps**:
1. Navigate to `/create`
2. Click "Examples"
3. Select first example
4. Verify prompt populated
5. Check Generate button enabled

**Expected Result**:
- Example populates prompt
- Character count updates
- Generate button enabled
- Panel closes after selection

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-047: Filter and Select Style Flow

**Description**: Verify filtering styles and selecting

**Steps**:
1. Navigate to `/create`
2. Click "Illustrative" category
3. Verify filter applied
4. Select "Botanical" style

**Expected Result**:
- Category filter highlighted
- Only Illustrative styles shown
- Botanical selectable and selected

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Performance

### TC-048: Page Load Time

**Description**: Verify page loads within acceptable time

**Steps**:
1. Clear browser cache
2. Navigate to `/create`
3. Measure load time until interactive

**Expected Result**:
- Page loads in < 3 seconds
- Main content visible quickly
- Form interactive within 3 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Load time: ___ms

---

### TC-049: No JavaScript Errors

**Description**: Verify no JavaScript errors on load

**Steps**:
1. Open browser console
2. Navigate to `/create`
3. Wait for page to fully load
4. Check console for errors

**Expected Result**:
- No critical JavaScript errors
- Network errors (API unavailable) acceptable
- No unhandled promise rejections

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Errors found:

---

### TC-050: Form Responsiveness

**Description**: Verify form responds quickly to input

**Steps**:
1. Navigate to `/create`
2. Type quickly in prompt textarea
3. Click rapidly between style options

**Expected Result**:
- No noticeable lag in typing
- Style selection updates immediately
- Character count updates in real-time

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: Error States

### TC-051: Page Load Without API

**Description**: Verify page handles API unavailability

**Steps**:
1. Stop API server
2. Navigate to `/create`
3. Verify page state

**Expected Result**:
- Page still loads
- Form is usable
- Error message may appear on generation attempt

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-052: Error Container Structure

**Description**: Verify error display area exists

**Steps**:
1. Navigate to `/create`
2. Inspect for error container element

**Expected Result**:
- Error container available (hidden when no error)
- Styled appropriately for destructive/error state

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### Section: SEO

### TC-053: Open Graph Title

**Description**: Verify Open Graph title meta tag

**Steps**:
1. Navigate to `/create`
2. Inspect og:title meta tag

**Expected Result**:
- og:title meta tag present
- Contains "Create AI Poster"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Value:

---

### TC-054: Open Graph Description

**Description**: Verify Open Graph description meta tag

**Steps**:
1. Navigate to `/create`
2. Inspect og:description meta tag

**Expected Result**:
- og:description meta tag present
- Describes AI poster generation feature

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Value:

---

### TC-055: Meta Description

**Description**: Verify meta description for SEO

**Steps**:
1. Navigate to `/create`
2. Inspect meta description tag

**Expected Result**:
- Description meta tag present
- Contains "AI" and "poster" keywords
- Appropriate length (120-160 characters)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Value:

---

### Section: Browser Compatibility

### TC-056: Chrome Compatibility

**Description**: Verify page works in Chrome

**Steps**:
1. Open page in Chrome (latest)
2. Test all functionality

**Expected Result**:
- All features work correctly
- No visual issues
- Forms functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Chrome version:
- Issues:

---

### TC-057: Firefox Compatibility

**Description**: Verify page works in Firefox

**Steps**:
1. Open page in Firefox (latest)
2. Test all functionality

**Expected Result**:
- All features work correctly
- No visual issues
- Forms functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Firefox version:
- Issues:

---

### TC-058: Safari Compatibility

**Description**: Verify page works in Safari

**Steps**:
1. Open page in Safari (latest)
2. Test all functionality

**Expected Result**:
- All features work correctly
- No visual issues
- Forms functional

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Safari version:
- Issues:

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary
- Total Test Cases: 82
- Passed: ___
- Failed: ___
- Blocked: ___
- Pass Rate: ___%

## Notes
- Page URL: `/create`
- Style presets: 15 total (Wabi-Sabi, Abstract Expression, Botanical, Geometric Modern, Vintage Poster, Pop Art, Watercolor, Photography, Line Art, Typography, Ink Wash, Digital Art, Minimalist Modern, Impressionist, Art Deco)
- Aspect ratios: 4 options (Square 1:1, Portrait 2:3, Landscape 3:2, Panoramic 16:9)
- Default style: Wabi-Sabi
- Default aspect ratio: Portrait
- Prompt limits: 3-500 characters
- Negative prompt limit: 300 characters
- Example prompts: 6 available
- Prompt suggestions: 90 curated (6 per style × 15 styles)
- Categories: All Styles, Artistic, Photographic, Illustrative, Decorative
- Tips: 4 tips for better results
- Color palettes: 8 system + custom (3-8 colors)
- Reference image: JPEG/PNG/WebP, max 10MB, weight 0.3-1.0
- Upscaling: 2x (5 credits) or 4x (10 credits)

## Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Tester | | | |
| Dev Lead | | | |
| Product Owner | | | |
