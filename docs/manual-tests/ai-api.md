# Manual Test: AI Generation API

## Test Environment
- **Browser/Tool**: Postman / cURL / Thunder Client
- **API Base URL**: http://localhost:3000
- **Date**: 2026-01-19
- **Tester**: Manual QA

## Prerequisites
- [x] Dev server running at http://localhost:3000
- [x] Database seeded with test data
- [x] Redis running for queue processing
- [ ] User account with AI credits available
- [ ] Admin user credentials available (for management tests)

## Test Cases

### TC-001: Get Style Presets (Public)

**Description**: Verify unauthenticated users can retrieve available style presets

**Steps**:
1. Send GET request to `/api/ai/style-presets`
2. Verify response status is 200
3. Check response contains array of style presets

**Expected Result**:
- Status code: 200
- Response body contains:
  - `items` array with style preset objects
  - Each preset has: `id`, `name`, `description`, `category`, `isPremium`
  - Includes presets: minimalist, wabi-sabi, botanical, geometric, vintage-poster, pop-art, watercolor, line-art, photography-inspired, typography

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-002: Get Aspect Ratios (Public)

**Description**: Verify unauthenticated users can retrieve available aspect ratios

**Steps**:
1. Send GET request to `/api/ai/aspect-ratios`
2. Verify response status is 200
3. Check response contains all 4 aspect ratio options

**Expected Result**:
- Status code: 200
- Response body contains:
  - `items` array with exactly 4 aspect ratios
  - Each ratio has: `id`, `name`, `ratio`, `description`
  - Includes: square (1:1), portrait (2:3), landscape (3:2), panoramic (16:9)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-003: Submit Generation Request - Success

**Description**: Verify authenticated user can submit an AI generation request

**Steps**:
1. Authenticate as user with AI credits
2. Send POST request to `/api/ai/generate` with valid data:
   ```json
   {
     "prompt": "A serene mountain landscape at sunset with vibrant colors",
     "stylePreset": "minimalist",
     "aspectRatio": "landscape",
     "variationCount": 4
   }
   ```
3. Include authentication token in headers

**Expected Result**:
- Status code: 201 or 202
- Response contains:
  - `id` (UUID of the generation)
  - `status` (queued or processing)
  - `promptText` (sanitized prompt)
  - `stylePreset` (minimalist)
  - `aspectRatio` (landscape)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-004: Submit Generation Without Authentication

**Description**: Verify unauthenticated generation requests are rejected

**Steps**:
1. Send POST request to `/api/ai/generate` without authentication token
2. Include valid generation data in body

**Expected Result**:
- Status code: 401
- Error message indicates authentication required
- Error response format: `{ "error": "..." }`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-005: Validate Prompt Minimum Length

**Description**: Verify prompt validation for minimum length (3 characters)

**Steps**:
1. Authenticate as user
2. Send POST request to `/api/ai/generate` with:
   ```json
   {
     "prompt": "ab",
     "stylePreset": "minimalist",
     "aspectRatio": "square"
   }
   ```

**Expected Result**:
- Status code: 400
- Error message indicates prompt too short
- Minimum length: 3 characters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-006: Validate Prompt Maximum Length

**Description**: Verify prompt validation for maximum length (500 characters)

**Steps**:
1. Authenticate as user
2. Send POST request to `/api/ai/generate` with prompt of 501+ characters
3. Generate test string: "a" repeated 501 times

**Expected Result**:
- Status code: 400
- Error message indicates prompt too long
- Maximum length: 500 characters

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-007: Validate Style Preset

**Description**: Verify invalid style presets are rejected

**Steps**:
1. Authenticate as user
2. Send POST request to `/api/ai/generate` with:
   ```json
   {
     "prompt": "Valid prompt text",
     "stylePreset": "invalid-preset",
     "aspectRatio": "square"
   }
   ```

**Expected Result**:
- Status code: 400
- Error message indicates invalid style preset
- Lists valid preset options

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-008: Validate Aspect Ratio

**Description**: Verify invalid aspect ratios are rejected

**Steps**:
1. Authenticate as user
2. Send POST request to `/api/ai/generate` with:
   ```json
   {
     "prompt": "Valid prompt text",
     "stylePreset": "minimalist",
     "aspectRatio": "invalid-ratio"
   }
   ```

**Expected Result**:
- Status code: 400
- Error message indicates invalid aspect ratio
- Valid options: square, portrait, landscape, panoramic

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-009: Validate Variation Count Range

**Description**: Verify variation count is between 1-8

**Steps**:
1. Authenticate as user
2. Test with `variationCount: 0` (should fail)
3. Test with `variationCount: 10` (should fail)
4. Test with `variationCount: 4` (should pass)

**Expected Result**:
- variationCount < 1: 400 error
- variationCount > 8: 400 error
- variationCount 1-8: Accepted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-010: Submit Generation with Negative Prompt

**Description**: Verify negative prompt is accepted and processed

**Steps**:
1. Authenticate as user
2. Send POST request to `/api/ai/generate` with:
   ```json
   {
     "prompt": "A beautiful sunset",
     "negativePrompt": "blurry, low quality, distorted, text",
     "stylePreset": "photography-inspired",
     "aspectRatio": "landscape"
   }
   ```

**Expected Result**:
- Status code: 201 or 202
- Generation created with negative prompt stored
- Negative prompt used during image generation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-011: Submit Generation with Color Palette

**Description**: Verify color palette is accepted (max 5 colors)

**Steps**:
1. Authenticate as user
2. Send POST request with:
   ```json
   {
     "prompt": "Abstract art composition",
     "stylePreset": "abstract-expression",
     "aspectRatio": "square",
     "colorPalette": ["#FF5733", "#33FF57", "#3357FF"]
   }
   ```

**Expected Result**:
- Status code: 201 or 202
- Color palette stored with generation
- Colors influence generated image

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-012: Reject Excessive Color Palette

**Description**: Verify color palette limited to 5 colors maximum

**Steps**:
1. Authenticate as user
2. Send POST request with 6 colors in palette:
   ```json
   {
     "prompt": "Test prompt",
     "stylePreset": "minimalist",
     "aspectRatio": "square",
     "colorPalette": ["#FF0000", "#00FF00", "#0000FF", "#FFFF00", "#FF00FF", "#00FFFF"]
   }
   ```

**Expected Result**:
- Status code: 400
- Error message indicates max 5 colors allowed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-013: Submit Generation with Seed

**Description**: Verify seed value enables reproducible generations

**Steps**:
1. Authenticate as user
2. Send POST request with:
   ```json
   {
     "prompt": "Mountain landscape",
     "stylePreset": "minimalist",
     "aspectRatio": "landscape",
     "seed": 12345
   }
   ```
3. Submit another generation with same seed

**Expected Result**:
- Status code: 201 or 202
- Seed value stored with generation
- Same seed produces similar/identical results

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-014: Validate Seed Range

**Description**: Verify seed must be non-negative integer

**Steps**:
1. Authenticate as user
2. Test with `seed: -1` (should fail)
3. Test with `seed: 0` (should pass)
4. Test with `seed: 2147483647` (max int, should pass)

**Expected Result**:
- Negative seed: 400 error
- Zero and positive integers: Accepted

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-015: List User Generations - Authentication Required

**Description**: Verify only authenticated users can list their generations

**Steps**:
1. Send GET request to `/api/ai/generations` without authentication
2. Verify 401 response

**Expected Result**:
- Status code: 401
- Error message indicates authentication required

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-016: List User Generations - Success

**Description**: Verify authenticated user can list their generations

**Steps**:
1. Authenticate as user
2. Send GET request to `/api/ai/generations`
3. Verify paginated response

**Expected Result**:
- Status code: 200
- Response contains:
  - `items` array with generation objects
  - `total` count
  - `page` and `pageSize`
  - `totalPages`, `hasNextPage`, `hasPreviousPage`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-017: List Generations with Pagination

**Description**: Verify pagination works correctly

**Steps**:
1. Authenticate as user
2. Send GET request to `/api/ai/generations?page=1&pageSize=5`
3. Verify response contains max 5 items
4. Send request for page 2
5. Verify different generations are returned

**Expected Result**:
- Status code: 200
- Correct page and pageSize values returned
- Different items on different pages
- Max pageSize: 50

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-018: List Generations with Status Filter

**Description**: Verify filtering by generation status

**Steps**:
1. Authenticate as user
2. Send GET request to `/api/ai/generations?status=completed`
3. Verify all returned items have status "completed"
4. Test with other statuses: queued, processing, failed, cancelled

**Expected Result**:
- Status code: 200
- All items match the specified status

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-019: List Generations with Style Filter

**Description**: Verify filtering by style preset

**Steps**:
1. Authenticate as user
2. Send GET request to `/api/ai/generations?stylePreset=minimalist`
3. Verify all returned items have stylePreset "minimalist"

**Expected Result**:
- Status code: 200
- All items match the specified style preset

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-020: Get Generation by ID - Success

**Description**: Verify user can retrieve their own generation by ID

**Steps**:
1. Authenticate as user
2. Create a generation and note the ID
3. Send GET request to `/api/ai/generations/{id}`

**Expected Result**:
- Status code: 200
- Response contains complete generation details:
  - `id`, `userId`, `promptText`, `negativePrompt`
  - `stylePreset`, `aspectRatio`, `colorMood`
  - `status`, `images` array
  - `createdAt`, `completedAt`

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-021: Get Generation - Access Denied

**Description**: Verify user cannot access another user's private generation

**Steps**:
1. Authenticate as User A
2. Create a generation with visibility "private"
3. Authenticate as User B
4. Attempt to GET User A's generation

**Expected Result**:
- Status code: 403 or 404
- Error message indicates access denied or not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-022: Get Generation Status

**Description**: Verify generation job status polling endpoint

**Steps**:
1. Authenticate as user
2. Create a new generation
3. Send GET request to `/api/ai/status/{id}`
4. Poll until status changes

**Expected Result**:
- Status code: 200
- Response contains:
  - `status`: queued → processing → completed (or failed)
  - `progress`: 0-100 percentage (if available)
  - `estimatedTimeRemaining` (if available)

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-023: Select Image from Generation

**Description**: Verify user can select a specific image from generation

**Steps**:
1. Authenticate as user
2. Create a completed generation with multiple images
3. Send POST request to `/api/ai/generations/{id}/select` with:
   ```json
   {
     "imageId": "img-001"
   }
   ```

**Expected Result**:
- Status code: 200
- Selected image marked as primary
- Image available for ordering

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-024: Select Image - Invalid Image ID

**Description**: Verify error when selecting non-existent image

**Steps**:
1. Authenticate as user
2. Send POST to `/api/ai/generations/{id}/select` with invalid imageId

**Expected Result**:
- Status code: 400 or 404
- Error message indicates image not found

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-025: Update Generation Visibility

**Description**: Verify user can change generation visibility

**Steps**:
1. Authenticate as user
2. Create a generation (default visibility: private)
3. Send PATCH request to `/api/ai/generations/{id}/visibility` with:
   ```json
   {
     "visibility": "public"
   }
   ```

**Expected Result**:
- Status code: 200
- Visibility updated to "public"
- Generation now appears in public gallery

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-026: Validate Visibility Options

**Description**: Verify valid visibility options: private, public, unlisted

**Steps**:
1. Authenticate as user
2. Test each valid visibility option
3. Test invalid visibility option

**Expected Result**:
- private, public, unlisted: Accepted
- Invalid option: 400 error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-027: Delete Generation - Success

**Description**: Verify user can delete their own generation

**Steps**:
1. Authenticate as user
2. Create a generation
3. Send DELETE request to `/api/ai/generations/{id}`
4. Verify generation is removed

**Expected Result**:
- Status code: 200 or 204
- Generation no longer retrievable
- Associated images deleted from storage

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-028: Cancel In-Progress Generation

**Description**: Verify user can cancel a queued/processing generation

**Steps**:
1. Authenticate as user
2. Submit a generation request
3. Immediately send DELETE request to cancel

**Expected Result**:
- Status code: 200
- Generation status changes to "cancelled"
- Queue job removed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-029: Get Public Gallery

**Description**: Verify public gallery endpoint is accessible without authentication

**Steps**:
1. Send GET request to `/api/ai/gallery` (no auth)
2. Verify public generations are returned

**Expected Result**:
- Status code: 200
- Response contains paginated gallery items:
  - `items` array with public generations
  - `total`, `page`, `pageSize`, `totalPages`
- Only shows generations with visibility "public"

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-030: Gallery Pagination

**Description**: Verify gallery pagination parameters

**Steps**:
1. Send GET request to `/api/ai/gallery?page=1&pageSize=12`
2. Verify pagination works correctly
3. Test max pageSize (50)
4. Test invalid page (0 or negative)

**Expected Result**:
- Valid pagination: 200 with correct items
- pageSize > 50: 400 error
- page < 1: 400 error

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-031: Gallery Sort by Recent

**Description**: Verify gallery can be sorted by recent

**Steps**:
1. Send GET request to `/api/ai/gallery?sortBy=recent`
2. Verify items are sorted by createdAt descending

**Expected Result**:
- Status code: 200
- Most recent items first

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-032: Gallery Sort by Popular

**Description**: Verify gallery can be sorted by popularity

**Steps**:
1. Send GET request to `/api/ai/gallery?sortBy=popular`
2. Verify items are sorted by popularity metrics

**Expected Result**:
- Status code: 200
- Most popular/viewed items first

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-033: Gallery Filter by Style

**Description**: Verify gallery can be filtered by style preset

**Steps**:
1. Send GET request to `/api/ai/gallery?stylePreset=minimalist`
2. Verify all items have stylePreset "minimalist"

**Expected Result**:
- Status code: 200
- All items match the specified style

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-034: Invalid Gallery Sort Value

**Description**: Verify invalid sortBy value is rejected

**Steps**:
1. Send GET request to `/api/ai/gallery?sortBy=invalid`

**Expected Result**:
- Status code: 400
- Error message lists valid options: recent, popular

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-035: UUID Format Validation

**Description**: Verify generation ID must be valid UUID format

**Steps**:
1. Authenticate as user
2. Send GET request to `/api/ai/generations/invalid-uuid`
3. Send GET request to `/api/ai/generations/not-a-uuid-format`

**Expected Result**:
- Status code: 400
- Error message indicates invalid UUID format

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-036: HTTP Method Validation - Generate Endpoint

**Description**: Verify /api/ai/generate only accepts POST

**Steps**:
1. Send GET request to `/api/ai/generate`
2. Send PUT request to `/api/ai/generate`
3. Send DELETE request to `/api/ai/generate`

**Expected Result**:
- GET: 404 or 405
- PUT: 401 or 404 or 405
- DELETE: 401 or 404 or 405

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-037: HTTP Method Validation - Gallery Endpoint

**Description**: Verify /api/ai/gallery only accepts GET

**Steps**:
1. Send POST request to `/api/ai/gallery`
2. Send PUT request to `/api/ai/gallery`
3. Send DELETE request to `/api/ai/gallery`

**Expected Result**:
- POST: 404 or 405
- PUT: 404 or 405
- DELETE: 404 or 405

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-038: Content-Type Validation

**Description**: Verify API requires application/json for POST/PATCH requests

**Steps**:
1. Authenticate as user
2. Send POST to `/api/ai/generate` with `Content-Type: text/plain`
3. Send POST without Content-Type header

**Expected Result**:
- Invalid content type: 400 or 415 error
- Missing content type: Handled appropriately

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-039: Response Headers

**Description**: Verify all responses have correct headers

**Steps**:
1. Send GET request to `/api/ai/style-presets`
2. Check response headers

**Expected Result**:
- Content-Type: application/json; charset=utf-8
- CORS headers present
- Cache headers appropriate for endpoint

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-040: CORS Preflight Request

**Description**: Verify OPTIONS requests are handled for CORS

**Steps**:
1. Send OPTIONS request to `/api/ai/generate`
2. Include Origin header

**Expected Result**:
- Status code: 200 or 204
- Access-Control-Allow-Methods header present
- Access-Control-Allow-Headers header present

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-041: Unicode Characters in Prompt

**Description**: Verify prompts with Unicode characters are handled

**Steps**:
1. Authenticate as user
2. Send POST with prompt containing Unicode:
   ```json
   {
     "prompt": "A beautiful painting with cherry blossoms",
     "stylePreset": "watercolor",
     "aspectRatio": "portrait"
   }
   ```

**Expected Result**:
- Status code: 201 or 202
- Unicode characters preserved
- Generation created successfully

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-042: Special Characters in Prompt

**Description**: Verify prompts with special characters are handled safely

**Steps**:
1. Authenticate as user
2. Send POST with prompt containing special chars:
   ```json
   {
     "prompt": "Art with @#$%^&*() symbols and \"quotes\" and <script>test</script>",
     "stylePreset": "pop-art",
     "aspectRatio": "square"
   }
   ```

**Expected Result**:
- Status code: 201 or 202
- Special characters sanitized/escaped
- No injection vulnerabilities

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-043: Error Response Format

**Description**: Verify error responses follow consistent format

**Steps**:
1. Trigger various error conditions
2. Check response format consistency

**Expected Result**:
- All errors return JSON format
- Error object contains: `error` message
- No internal details/stack traces exposed

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-044: Performance - Style Presets Endpoint

**Description**: Verify style-presets endpoint responds quickly

**Steps**:
1. Send GET request to `/api/ai/style-presets`
2. Measure response time

**Expected Result**:
- Response time < 500ms
- Response is cacheable

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Response time: ___ms

---

### TC-045: Performance - Concurrent Requests

**Description**: Verify API handles concurrent requests

**Steps**:
1. Send 10 concurrent GET requests to `/api/ai/gallery`
2. Verify all complete successfully

**Expected Result**:
- All requests complete with 200
- Total time < 5 seconds
- No server errors

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Total time: ___ms

---

### TC-046: AI Credits Check

**Description**: Verify generation fails when user has no AI credits

**Steps**:
1. Authenticate as user with 0 AI credits
2. Attempt to submit a generation

**Expected Result**:
- Status code: 402 or 403
- Error message indicates insufficient credits
- Prompt to purchase credits

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-047: Premium Style Preset Access

**Description**: Verify non-premium users cannot use premium styles

**Steps**:
1. Authenticate as non-premium user
2. Attempt to generate with premium style preset

**Expected Result**:
- Status code: 403
- Error message indicates premium required
- List of available non-premium styles

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-048: Generation with Color Mood

**Description**: Verify color mood parameter is accepted

**Steps**:
1. Authenticate as user
2. Send POST with colorMood:
   ```json
   {
     "prompt": "Mountain landscape",
     "stylePreset": "minimalist",
     "aspectRatio": "landscape",
     "colorMood": "warm"
   }
   ```

**Expected Result**:
- Status code: 201 or 202
- Color mood influences generation

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-049: Generation Queue Priority

**Description**: Verify premium users have priority queue access

**Steps**:
1. Submit generation as non-premium user
2. Submit generation as premium user
3. Verify processing order

**Expected Result**:
- Premium user's generation processed first
- Queue position reflects priority

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

### TC-050: Gallery Cache Behavior

**Description**: Verify gallery responses are cached appropriately

**Steps**:
1. Send GET request to `/api/ai/gallery`
2. Send same request again immediately
3. Check for cache headers or fromCache field

**Expected Result**:
- Cache-Control headers present
- Second request may return cached data
- Cache TTL: ~60 seconds

**Actual Result**:
- [ ] PASS / [ ] FAIL
- Observations:

---

## Issues Found

| ID | Description | Severity | Status |
|----|-------------|----------|--------|
| | | | |

## Summary
- Total Test Cases: 50
- Passed: ___
- Failed: ___
- Blocked: ___
- Pass Rate: ___%

## Notes
- Authentication token format: `Bearer {token}` or session cookie
- Valid style presets: wabi-sabi, abstract-expression, botanical, vintage-poster, minimalist, geometric, watercolor, line-art, pop-art, photography-inspired, typography
- Valid aspect ratios: square (1:1), portrait (2:3), landscape (3:2), panoramic (16:9)
- Generation statuses: queued, processing, completed, failed, cancelled
- Visibility options: private, public, unlisted
- Default variation count: 4 (max: 8)
- Prompt length: 3-500 characters
- Max color palette: 5 colors
- Gallery cache TTL: 60 seconds
