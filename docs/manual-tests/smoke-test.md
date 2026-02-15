# Interactive Manual Smoke Test Suite

This document is designed to be executed by an AI Agent guiding a human tester.
**Agent Instructions:** detailed steps are for your reference. For the user, summarize the "Goal" and guiding them step-by-step only if requested.

## Prerequisites & Setup

**Agent Step:** Ensure the environment is ready for testing.
1.  **Run Setup Script:** Execute `./scripts/run-tests.sh setup` in the terminal.
    - This will start Docker services, run migrations, and launch the dev servers.
    - It will exit when ready and display the server URLs.
2.  **Verify Output:** Confirm the script outputs "SETUP COMPLETE".

## 1. Public Visitor Journey

### ST-001: Homepage & Navigation
**Goal:** Verify the landing page and core navigation work.
- [ ] Open Home Page (`/`). Verify Hero section and "Shop Posters" CTA are visible.
- [ ] Click "Shop Posters". Verify navigation to Product Listing page (`/posters`).

### ST-002: Catalog & Filtering
**Goal:** Verify product browsing and filtering.
- [ ] On Product Listing page, click a category filter (e.g., "Abstract"). Verify list updates.
- [ ] Click on any Product Card. Verify navigation to Product Detail page.

### ST-003: Add to Cart
**Goal:** Verify purchasing flow initiation.
- [ ] On Product Detail page, select a size/frame option (if available).
- [ ] Click "Add to Cart". Verify success message/toast.
- [ ] Verify Cart drawer/icon updates with item count.

## 2. Authentication Flow

### ST-004: User Login
**Goal:** Verify user authentication.
- [ ] Navigate to Login page (`/login`).
- [ ] Enter valid credentials (or use test account).
- [ ] Click Login. Verify redirection to Home or Dashboard.
- [ ] Verify User Profile icon is visible in header.

## 3. Checkout Process

### ST-005: Checkout Initiation
**Goal:** Verify checkout flow can be started.
- [ ] Go to Cart. Click "Checkout".
- [ ] Verify Checkout page loads.
- [ ] Verify "Shipping Address" form is visible.

## 4. AI Generator (Critical Feature)

### ST-006: AI Generator Load
**Goal:** Verify the AI Generator interface loads.
- [ ] Navigate to AI Generator (`/create`).
- [ ] Verify Prompt Input area is visible.
- [ ] Verify "Style Preset" options are clickable.
