---
name: tt-debug-browser
description: Debug and investigate pages using agent-browser. Useful for understanding page structure, capturing state, and diagnosing test failures.
allowed-tools:
  - mcp__ticketrack__showTicketDetails
  - mcp__ticketrack__addComment
  - mcp__plugin_claude-mem_mcp-search__search
  - mcp__plugin_claude-mem_mcp-search__timeline
  - mcp__plugin_claude-mem_mcp-search__get_observations
  - AskUserQuestion
  - Read
  - Bash
---

# /tt-debug-browser - Browser Debugging Assistant

Uses `agent-browser` CLI to inspect pages, capture snapshots, and diagnose issues during development.

## Arguments

```
$ARGUMENTS: [<url-or-page>] [--ticket=<id>]
```

- `<url-or-page>`: URL or page name to inspect (e.g., `/checkout`, `http://localhost:3001/admin`)
- `--ticket=<id>`: Optional ticket ID to attach findings to

**Examples**:
- `/tt-debug-browser /checkout` - Inspect checkout page
- `/tt-debug-browser /admin/orders --ticket=142` - Debug and attach to ticket
- `/tt-debug-browser` - Interactive mode, asks what to debug

## Prerequisites

Ensure dev servers are running. This uses the project test entry point
convention documented in `/tt-work-ticket` ("The project test entry point"):

```bash
test -x ./scripts/run-tests.sh && ./scripts/run-tests.sh setup
```

If the project has no such script, start its dev servers the way its `CLAUDE.md`
says — the requirement is a reachable app, not this particular command.

This starts Docker, DB, and dev servers at:
- Web: http://localhost:3001
- API: http://localhost:3000

## Workflow

### Step 1: Parse Arguments

If no URL provided, ask user:
```
What would you like to debug?
- Checkout flow
- Payment page
- Admin dashboard
- Admin orders
- Custom URL (specify)
```

### Step 2: Navigate and Capture

```bash
# Use persistent profile to maintain auth state
PROFILE="$HOME/.masonart-debug"

# Navigate to page
agent-browser --profile "$PROFILE" open "{url}"

# Wait for page to stabilize
agent-browser wait --load networkidle

# Capture accessibility snapshot (interactive elements only)
agent-browser snapshot -i -c > /tmp/debug-snapshot.txt

# Take screenshot
agent-browser screenshot /tmp/debug-screenshot.png
```

### Step 3: Analyze Page State

Read the snapshot and provide analysis:

1. **Element inventory**: List key interactive elements with their refs
2. **Form state**: Check if forms have values, validation errors
3. **Loading state**: Look for spinners, skeleton loaders, loading text
4. **Error indicators**: Find error messages, alerts, toast notifications
5. **API state**: Check for failed requests (if visible in UI)

### Step 4: Common Debug Tasks

Based on the page, offer relevant actions:

**For checkout/payment pages:**
```bash
# Check cart state
agent-browser get text "[data-testid='cart-summary']"

# Check form validation
agent-browser get text ".error-message"

# Check button state
agent-browser get attr "button[type='submit']" "disabled"
```

**For admin pages:**
```bash
# Check table data loaded
agent-browser get count "table tbody tr"

# Check filters applied
agent-browser get text ".active-filters"

# Check pagination
agent-browser get text ".pagination-info"
```

**For auth issues:**
```bash
# Check if logged in
agent-browser get text "[data-testid='user-menu']"

# Check for auth errors
agent-browser get text ".auth-error"
```

### Step 5: Network Inspection

```bash
# Start capturing network
agent-browser open "{url}"

# Get recent network requests
agent-browser network requests

# Check for failed requests
agent-browser network requests --failed
```

### Step 6: Fill Forms for Testing

If debugging a form issue:

```bash
# Fill checkout form with test data
agent-browser fill "[name='name']" "Test User"
agent-browser fill "[name='email']" "test@example.com"
agent-browser fill "[name='phone']" "9999999999"
agent-browser fill "[name='address']" "123 Test Street"
agent-browser fill "[name='city']" "Mumbai"
agent-browser fill "[name='pincode']" "400001"

# Take screenshot after fill
agent-browser screenshot /tmp/debug-filled.png
```

### Step 7: Report Findings

Output structured findings:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🔍 Debug Report: {page}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 URL: {url}
📸 Screenshot: /tmp/debug-screenshot.png

📋 Page State:
  - Loading: {complete|in-progress}
  - Auth: {logged-in|logged-out|admin}
  - Errors visible: {yes|no}

🎯 Key Elements Found:
  @e1: Submit button (enabled)
  @e2: Email input (filled: test@example.com)
  @e3: Error message: "Invalid phone number"

⚠️ Issues Detected:
  1. Form validation error on phone field
  2. Submit button disabled due to validation

💡 Suggested Actions:
  - Check phone validation regex in CheckoutForm.tsx
  - Verify API accepts this phone format

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

### Step 8: Attach to Ticket (if --ticket provided)

If ticket ID provided, add comment:

```yaml
mcp__ticketrack__addComment:
  ticketId: {ticket-id}
  comment: |
    ## Browser Debug Session

    **URL**: {url}
    **Screenshot**: [attached]

    ### Findings
    {findings-summary}

    ### Element Snapshot
    ```
    {key-elements}
    ```

    ### Suggested Fix
    {suggestion}
```

## Saved Auth Profiles

The skill uses persistent profiles to maintain login state:

| Profile | Purpose | Path |
|---------|---------|------|
| customer | Customer login | `~/.masonart-customer` |
| admin | Admin login | `~/.masonart-admin` |
| guest | No auth (fresh) | (no profile) |

**To save a new profile:**
```bash
# Login manually
agent-browser --profile ~/.masonart-admin open http://localhost:3001/admin/login
agent-browser fill "[name='email']" "admin@masonart.com"
agent-browser fill "[name='password']" "adminpass"
agent-browser click "button[type='submit']"
agent-browser wait --url "**/admin/dashboard"

# Profile is now saved automatically
```

## Quick Commands

| Command | Description |
|---------|-------------|
| `/tt-debug-browser /checkout` | Debug checkout page |
| `/tt-debug-browser /admin` | Debug admin dashboard |
| `/tt-debug-browser /cart` | Debug cart page |
| `/tt-debug-browser --ticket=42` | Debug and attach to ticket |

## Integration with Other Skills

- Use before `/tt-work-ticket` to understand failure context
- Use after `/tt-run-test-suit` to investigate specific failures
- Findings can be added as ticket comments

## Notes

- Requires `agent-browser` CLI installed globally
- Uses `setup` command to keep servers running
- Screenshots saved to `/tmp/` for easy access
- Profiles persist auth state across sessions
