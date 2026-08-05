#!/usr/bin/env python3
"""Battery for .claude/hooks/guard-test-scope.py"""
import json
import subprocess
import sys

HOOK = "/Users/dhruv/work/masonart.com/.claude/hooks/guard-test-scope.py"
ROOT = "/Users/dhruv/work/masonart.com"
WEB = ROOT + "/packages/web"
SHARED = ROOT + "/packages/shared"

# (command, cwd, expected) expected in {"allow", "deny", "repair"}
CASES = [
    # --- must be denied: unbounded runs
    ("bunx vitest run", WEB, "deny"),
    ("pnpm vitest run", WEB, "deny"),
    ("node ./node_modules/.bin/vitest run", WEB, "deny"),
    ("bunx vitest", WEB, "deny"),                       # watch mode
    ("bunx playwright test", ROOT, "deny"),
    ("bunx playwright test --project=chromium", ROOT, "deny"),   # still 42 specs
    ("bun test", ROOT, "deny"),
    ("turbo run test", ROOT, "deny"),
    ("npm test", ROOT, "deny"),
    ("bun run test", WEB, "deny"),                      # script = pathless vitest
    ("pnpm -r test", ROOT, "deny"),
    ("bunx playwright test tests/e2e/x.spec.ts --ui", ROOT, "deny"),
    ("cd packages/web && bunx vitest run", ROOT, "deny"),

    # --- must be repaired, not blocked
    ("bunx playwright test tests/e2e/product-listing.spec.ts", ROOT, "repair"),
    ("npx playwright test tests/e2e/auth.spec.ts --reporter=line", ROOT, "repair"),
    ("bunx playwright test tests/e2e/x.spec.ts --reporter=line | head -5", ROOT, "repair"),
    ("bunx playwright test tests/e2e/x.spec.ts > /tmp/out.log 2>&1", ROOT, "repair"),

    # --- must pass untouched
    ("bunx vitest run packages/web/tests/styles.test.ts", ROOT, "allow"),
    ("cd packages/web && bunx vitest run tests/styles.test.ts", ROOT, "allow"),
    ("bunx vitest run tests/styles.test.ts", WEB, "allow"),
    ("./scripts/run-tests.sh e2e --file=auth.spec.ts", ROOT, "allow"),
    ("./scripts/run-tests.sh e2e", ROOT, "allow"),
    ("ALLOW_FULL_SUITE=1 bunx vitest run", WEB, "allow"),
    ("ALLOW_FULL_SUITE=1 bun test", ROOT, "allow"),
    ("bunx playwright test --list tests/e2e/x.spec.ts", ROOT, "allow"),
    ("bunx playwright test tests/e2e/x.spec.ts --project=chromium", ROOT, "allow"),
    ("bunx playwright test -g 'reveal' --project=chromium", ROOT, "allow"),
    ("bun test", SHARED, "allow"),                      # bun runner, one process
    ("bun test tests/foo.test.ts", ROOT, "allow"),
    ("git commit -m 'test: bunx vitest run everything'", ROOT, "allow"),
    ('grep -rn "vitest run" docs/', ROOT, "allow"),
    ("echo 'bun test' > /tmp/notes.txt", ROOT, "allow"),
    ("bunx vitest --version", ROOT, "allow"),
    ("bunx playwright show-report", ROOT, "allow"),
    ("git status", ROOT, "allow"),
    ("ps -Ao command | grep vitest", ROOT, "allow"),
    ("cat file with 'unbalanced quote", ROOT, "allow"),
]


def run(cmd, cwd):
    payload = json.dumps({
        "tool_name": "Bash",
        "cwd": cwd,
        "tool_input": {"command": cmd, "description": "x"},
    })
    p = subprocess.run([sys.executable, HOOK], input=payload,
                       capture_output=True, text=True)
    if p.returncode != 0:
        return "error", p.stderr.strip()[:200]
    out = p.stdout.strip()
    if not out:
        return "allow", ""
    data = json.loads(out)
    hso = data.get("hookSpecificOutput", {})
    if hso.get("permissionDecision") == "deny":
        return "deny", hso.get("permissionDecisionReason", "").split("\n")[0]
    if "updatedInput" in hso:
        return "repair", hso["updatedInput"]["command"]
    return "allow", ""


fails = 0
for cmd, cwd, want in CASES:
    got, detail = run(cmd, cwd)
    ok = got == want
    fails += 0 if ok else 1
    mark = "ok  " if ok else "FAIL"
    where = cwd.replace(ROOT, ".") or "."
    print(f"{mark} [{want:6}->{got:6}] ({where}) {cmd}")
    if not ok or got != "allow":
        print(f"        {detail}")

print(f"\n{len(CASES) - fails}/{len(CASES)} passed")
sys.exit(1 if fails else 0)
