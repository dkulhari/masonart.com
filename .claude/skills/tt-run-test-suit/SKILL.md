---
name: tt-run-test-suit
description: Run tests by suite, classify failures as test bugs vs app bugs, and log tickets via TickeTrack.
allowed-tools:
  - mcp__ticketrack__createTicket
  - mcp__ticketrack__createFeature
  - mcp__ticketrack__listFeatures
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - AskUserQuestion
  - Read
  - Bash
---

# /tt-run-test-suit - Suite-Based Test Runner

Runs tests by feature suite, classifies failures, and logs tickets via TickeTrack MCP.

## Arguments

```
$ARGUMENTS: [--suite=<name|all>]
```

- `--suite=auth` - Run specific suite
- `--suite=all` - Run all suites in order
- No argument - Interactive selection prompt

**Example**: `/tt-run-test-suit` or `/tt-run-test-suit --suite=payment`

## Test Suites

Each suite maps directly to a test file in `tests/e2e/`:

| # | Suite | Test File(s) | Feature | Description |
|---|-------|--------------|---------|-------------|
| 1 | auth | `auth.spec.ts` | `authentication` | Login, register, authentication |
| 2 | account | `account.spec.ts` | `authentication` | User profile management |
| 3 | products | `product-detail.spec.ts`, `product-listing.spec.ts` | `product-catalog` | Product catalog |
| 4 | cart | `cart.spec.ts` | `cart-checkout` | Shopping cart |
| 5 | checkout | `checkout.spec.ts` | `cart-checkout` | Checkout flow |
| 6 | payment | `payment.spec.ts` | `cart-checkout` | Payment processing |
| 7 | orders | `order-confirmation.spec.ts`, `guest-order-tracking.spec.ts` | `order-tracking-notifications` | Order management |
| 8 | ai | `ai-generator.spec.ts`, `ai-history.spec.ts` | `ai-generation` | AI poster generation |
| 9 | reviews | `reviews.spec.ts` | `user-reviews` | Customer reviews |
| 10 | approval | `admin-approvals.spec.ts`, `customer-approval.spec.ts` | `photo-approval-workflow` | Photo approval workflow |
| 11 | wallet | `wallet.spec.ts` | `wallet-system` | Wallet system |
| 12 | admin-auth | `admin-auth.spec.ts` | `authentication` | Admin login flow |
| 13 | admin-dashboard | `admin-dashboard.spec.ts` | `admin-panel` | Admin dashboard metrics |
| 14 | admin-orders | `admin-orders.spec.ts` | `admin-panel` | Admin order management |
| 15 | admin-products | `admin-products.spec.ts` | `product-catalog` | Admin product CRUD |
| 16 | admin-reviews | `admin-reviews.spec.ts` | `user-reviews` | Admin review moderation |
| 17 | seo | `seo-meta.spec.ts`, `seo-jsonld.spec.ts`, `robots.spec.ts`, `sitemap.spec.ts` | `seo` | SEO tests |
| 18 | layout | `layout.spec.ts`, `home.spec.ts` | `frontend-ui` | UI layout tests |
| 19 | admin-all | *(all admin-*.spec.ts)* | *(varies)* | All admin tests combined |

**Note**: Test counts are discovered at runtime from Playwright output (e.g., "Running 172 tests").

## Workflow

### Step 1: Suite Selection

If `--suite` not provided, present interactive selection:

```
Select test suite(s) to run:
- All suites (in order)
- auth
- account
- products
- cart
- checkout
- payment
- orders
- ai
- reviews
- approval
- wallet
- admin-auth
- admin-dashboard
- admin-orders
- admin-products
- admin-reviews
- admin-all (runs all 5 admin files)
- seo
- layout
```

Use `AskUserQuestion` tool with multiSelect enabled for suite selection.

### Step 2: Run Tests

Every command in this step uses the project test entry point convention
documented in `/tt-work-ticket` ("The project test entry point") — a bounded
runner taking `--file=` and `--max-failures=`. **Confirm it exists first:**

```bash
test -x ./scripts/run-tests.sh && echo present || echo absent
```

If absent, translate each command below into the project's own runner from its
`CLAUDE.md`, keeping the two things this skill's logic depends on: one file per
invocation, and a per-file failure cap. The suite lists and the aggregation
rules are unaffected — only the command changes. What the file names refer to
is also the project's business; the `.spec.ts` names below are illustrative,
not a required layout.

For each selected suite, run the corresponding test file(s):

```bash
# Single file suite
./scripts/run-tests.sh e2e --file=auth.spec.ts --max-failures=10

# Multi-file suite (run each file separately)
./scripts/run-tests.sh e2e --file=product-detail.spec.ts --max-failures=10
./scripts/run-tests.sh e2e --file=product-listing.spec.ts --max-failures=10
```

**Multi-file Suite Handling:**

For suites with multiple files (products, orders, ai, approval, admin-all, seo, layout):

1. Run each file with a **separate** `--file=` call
2. **Aggregate results** across all files in the suite:
   - Sum total passed/failed counts
   - Collect all failures into a single list
   - Track which file each failure came from
3. The `--max-failures=10` limit applies **per file**, not per suite
4. If one file hits max failures, continue to next file in suite

**Example for admin-all suite (5 files):**
```bash
./scripts/run-tests.sh e2e --file=admin-auth.spec.ts --max-failures=10
./scripts/run-tests.sh e2e --file=admin-dashboard.spec.ts --max-failures=10
./scripts/run-tests.sh e2e --file=admin-orders.spec.ts --max-failures=10
./scripts/run-tests.sh e2e --file=admin-products.spec.ts --max-failures=10
./scripts/run-tests.sh e2e --file=admin-reviews.spec.ts --max-failures=10
```

**Note**: Running individual admin suites (admin-auth, admin-dashboard, etc.) is preferred over admin-all when debugging specific functionality, as failures get logged to the correct feature.

Capture full output from each run including all failures.

### Step 3: Parse Failures

Extract from test output:
- `test_file`: Full path to test file
- `test_name`: Test description/name
- `line`: Line number
- `error`: Error message
- `test_key`: Unique identifier `{filename}:{test_name}`

**Playwright failure pattern**:
```
✘  1 [chromium] › tests/e2e/payment.spec.ts:45:5 › Payment › should process card (15s)
    Error: expect(received).toBeVisible()
```

### Step 4: Classify Each Failure

**Test Bug Indicators** (log under `testsuite-bug-{suite}`):
- "Timeout" / "TimeoutError"
- "locator" / "selector" / "Element not found"
- "waiting for" / "waitFor"
- "Navigation" / "net::ERR"
- "browserContext" / "page.goto"
- Test setup/teardown failures
- "expect.toBeVisible" on timing-sensitive elements
- "strict mode violation" (multiple elements matched)

**App Bug Indicators** (log under actual feature):
- "expected X to equal Y" (value assertions)
- "500" / "400" / HTTP errors
- "ValidationError" / schema failures
- "undefined is not" / null reference in app code
- Business logic assertion failures
- API response mismatches

### Step 5: Ensure Feature Exists

Before logging a test bug, check if feature exists:

```
1. Call mcp__ticketrack__listFeatures with outputFormat: "json"
2. Check if "testsuite-bug-{suite}" exists in response
3. If not, call mcp__ticketrack__createFeature:
   - name: "testsuite-bug-{suite}"
   - description: "Test infrastructure bugs for {suite} test suite"
   - priority: "low"
```

### Step 6: Create Tickets

**For test bugs:**

```
mcp__ticketrack__createTicket:
  feature: "testsuite-bug-{suite}"
  title: "Test Bug: {test-name} - {issue-type}"
  type: "bug"
  labels: ["test-bug", "e2e", "{suite}"]
  description: |
    ## Test Failure
    **File**: `{test-file}`
    **Test**: {test-name}
    **Line**: {line-number}

    ## Error (Test Infrastructure Issue)
    ```
    {error-message}
    ```

    ## Classification
    This is a **test bug** - likely a flaky selector, timing issue, or mock problem.
```

**For app bugs:**

Detect feature from test file name (order matters - more specific patterns first):

| File Pattern | Feature |
|--------------|---------|
| `admin-auth` | `authentication` |
| `admin-dashboard` | `admin-panel` |
| `admin-orders` | `admin-panel` |
| `admin-products` | `product-catalog` |
| `admin-reviews` | `user-reviews` |
| `admin-approvals` | `photo-approval-workflow` |
| `customer-approval` | `photo-approval-workflow` |
| `guest-order-tracking` | `order-tracking-notifications` |
| `order-confirmation` | `cart-checkout` |
| `cart` | `cart-checkout` |
| `checkout` | `cart-checkout` |
| `auth` | `authentication` |
| `product` | `product-catalog` |
| `review` | `user-reviews` |
| `ai` | `ai-generation` |
| `wallet` | `wallet-system` |
| `payment` | `cart-checkout` |
| `seo`, `robots`, `sitemap` | `seo` |
| `layout`, `home` | `frontend-ui` |
| `account` | `authentication` |

```
mcp__ticketrack__createTicket:
  feature: "{detected-feature}"
  title: "Bug: {test-name} failing"
  type: "bug"
  labels: ["bug", "e2e", "{suite}"]
  description: |
    ## Test Failure
    **File**: `{test-file}`
    **Test**: {test-name}
    **Line**: {line-number}

    ## Error (Application Bug)
    ```
    {error-message}
    ```

    ## Classification
    This is an **app bug** - business logic, API error, or validation issue.
```

### Step 7: Summary Report

After processing all suites, output summary:

**For single-file suites:**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test Suite Results: {suite}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ Passed: {pass_count}/{total} tests
❌ Failed: {fail_count} tests

📋 Tickets Created:

Test Suite Bugs (testsuite-bug-{suite}):
  #{id}: {title}
  #{id}: {title}

App Bugs ({feature}):
  #{id}: {title}
  #{id}: {title}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

**For multi-file suites (aggregated results):**
```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Test Suite Results: admin-all (5 files)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Files:
  admin-auth.spec.ts: 45/45 ✅ → authentication
  admin-dashboard.spec.ts: 120/122 (2 failed) → admin-panel
  admin-orders.spec.ts: 98/100 (2 failed) → admin-panel
  admin-products.spec.ts: 85/85 ✅ → product-catalog
  admin-reviews.spec.ts: 32/32 ✅ → user-reviews

✅ Passed: 380/384 tests (aggregated)
❌ Failed: 4 tests

📋 Tickets Created:
  admin-panel:
    #142: Bug: Dashboard stats not loading
    #143: Bug: Order filter not working
  ...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

If multiple suites run, show aggregate at the end:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Overall Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Suites Run: {count}
Total Passed: {pass}
Total Failed: {fail}

Test Suite Bugs: {count} tickets
App Bugs: {count} tickets

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

## Notes

- Does NOT auto-fix - only logs tickets for manual review or `/tt-work-ticket`
- Uses `--file=` option in `scripts/run-tests.sh e2e` for precise test execution
- Creates `testsuite-bug-*` features as needed
- All tickets created with `type: "bug"`
- Test counts are discovered at runtime from Playwright output ("Running N tests")
- Multi-file suites aggregate pass/fail counts across all files
- The `--max-failures` limit is per-file, not per-suite
