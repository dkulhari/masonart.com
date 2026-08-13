---
name: tt-guard-tests
description: Install a project-fitted PreToolUse guard that keeps test runs scoped, so parallel agents cannot saturate one machine. Run once per project after the skills are installed, and again whenever a new test runner appears.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
---

# /tt-guard-tests - Install the test-scope guard

Writes a `PreToolUse` Bash hook that stops an agent from running an unscoped
test suite, generates a battery proving the hook behaves, and wires it into
`.claude/settings.json`.

## Why this exists

`/tt-implement-feature` runs several tickets at once, each in its own agent, on
one machine. Every one of those agents is told to verify its work by running
tests. Nothing stops three of them from each starting a full suite.

Measured, on an 8-core laptop: **load average 58**, from one pathless unit-test
run (~7 forks), one browser spec running against five browser projects, a
second concurrent browser run, and a whole-workspace run leaked from a session
killed the day before. Every one was an agent doing exactly what its skill said.

Worker caps in a runner's config bound a *single* run. They do nothing about
runs that never needed to happen. This hook is the other half.

## When to run

- Once per project, after the ticketrack skills are installed.
- Again when the project gains a test runner it did not have before.
- Re-running is safe: it rewrites the hook and battery, and merges into
  `.claude/settings.json` rather than replacing it.

## What gets installed

```
.claude/hooks/guard-test-scope.py        the guard
.claude/hooks/test-guard-test-scope.py   the battery, standalone
.claude/settings.json                    PreToolUse wiring, merged
```

---

## Step 1: Detect this project's runners

Do not assume. Read what is actually here.

```
Read:  package.json (scripts + devDependencies), pyproject.toml, go.mod,
       Gemfile, Cargo.toml, composer.json, Makefile
Glob:  vitest.config.*, jest.config.*, playwright.config.*, cypress.config.*,
       karma.conf.*, pytest.ini, tox.ini, setup.cfg, .rspec, phpunit.xml
Glob:  turbo.json, nx.json, lerna.json, pnpm-workspace.yaml   (fan-out risk)
Glob:  scripts/run-tests.sh, bin/test, Makefile               (entry points)
```

For each runner found, record five things. These are what the rules need:

| Question | Why it matters |
|---|---|
| How is it actually invoked here? | `pnpm vitest`, `bunx vitest`, `poetry run pytest` — the rule matches the binary, but the *scoped example* must be a command that works in this repo |
| Does a pathless invocation run everything? | Decides `requires: "path"` |
| Does it fan out over a matrix? | Browser projects, Python versions, Go build tags — decides `repair` |
| Is there a watch mode that never exits? | Decides `watch_unless` |
| Does a package script fan out to the whole workspace? | Decides the `FANOUT` block |

**Also check for a bounded entry point** — `scripts/run-tests.sh` or equivalent
that takes a file filter and caps workers. If one exists, its invocation is the
scoped example the deny messages should name. If not, name the raw scoped
command; do not invent a script that isn't there.

State what you found before writing anything:

```
Detected runners:
  vitest      pnpm --filter <pkg> exec vitest run <path>   pathless = whole package
  playwright  bunx playwright test <spec> --project=...    5 browser projects
  turbo       turbo run test                               fans out, rebuilds first
Entry point: none (no scripts/run-tests.sh)
```

---

## Step 2: Write the guard

Write `.claude/hooks/guard-test-scope.py`. The engine below is fixed — copy it
verbatim. Only the `RULES` and `FANOUT` block between the generated markers
changes, and it changes to match Step 1.

### The contract — every property here was learned the hard way

1. **Repair beats refusal.** A run that is fine once narrowed gets the flag
   inserted and proceeds. Insert it **after the matched subcommand, by
   rewriting the original command string** — appending to the end lands past a
   `| head` pipe and breaks the command.
2. **Every deny names the scoped command to run instead.** A deny that only
   says "no" gets worked around, not obeyed.
3. **One escape hatch.** `ALLOW_FULL_SUITE=1` as a prefix. A deliberate full
   run is never blocked, only made explicit.
4. **Fail open, always.** Missing python3, missing file, malformed stdin,
   unbalanced quotes, an exception anywhere — allow. Degrading to *no
   enforcement* is survivable; degrading to *no Bash* ends the session.
5. **False positives are the failure mode that loses trust.** `grep -rn "vitest
   run" docs/`, `git commit -m 'test: run pytest'`, and a cheap single-process
   runner in a package directory must all pass clean. One wrong deny and the
   next agent reaches for the escape hatch by reflex.

### The rule schema

```python
{
  "match": ["vitest"],            # token sequence identifying the runner
  "subcommands": ["run"],         # tokens that are not path filters
  "requires": "path",             # "path" | "path_or_filter" | "none"
  "filter_flags": ["--grep"],     # count as targeting, for path_or_filter
  "watch_unless": ["run"],        # deny unless one of these is present
  "forbid_flags": ["--ui"],       # deny outright — interactive, never exits
  "deny_positional": ["./..."],   # positionals that mean "everything"
  "repair": "--project=chromium", # insert when targeted but unfiltered
  "deny_always": False,           # nothing to narrow — fan-out, interactive
  "root_only": False,             # only unbounded at the repo root
  "scoped": "pnpm vitest run packages/x/tests/a.test.ts",   # REAL command
  "why": "a pathless run executes the package's entire suite",
}
```

### The engine

````python
#!/usr/bin/env python3
"""PreToolUse guard: keep test runs scoped so parallel agents don't peg the box.

Generated by /tt-guard-tests. Edit RULES and FANOUT, not the engine below.

Three outcomes, in order of preference:

  repair  A run that is fine once narrowed is rewritten and proceeds.
  allow   Anything scoped, anything non-test, anything unparseable.
  deny    Only unbounded shapes — and every deny names the scoped command.

Escape hatch: prefix ALLOW_FULL_SUITE=1 when the whole suite is the point.
Fail open: anything unexpected allows the command. No enforcement beats no Bash.
"""

import json
import os
import re
import shlex
import sys

ESCAPE = "ALLOW_FULL_SUITE"

# ─── generated for this project ──────────────────────────────────────────────
RULES = [
    # filled in from Step 1
]

FANOUT = {
    # Package-manager indirection that resolves to a whole-workspace run.
    # Keep only the heads this project actually has — a rule for a task runner
    # that isn't installed denies a command that would have failed anyway.
    "heads": ["pnpm", "npm", "yarn", "bun", "turbo", "nx", "make"],
    "patterns": ["test", "run test", "-r test", "turbo run test"],
    # Matched against the LAST token, to catch the flagged forms a prefix
    # match misses: `pnpm --filter <pkg> test`.
    "suffixes": ["test"],
    "scoped": "",   # REAL scoped command for this project
    "why": "",      # what it actually costs here
}
# ─── end generated ───────────────────────────────────────────────────────────

OPERATORS = {"&&", "||", ";", "|", "&", "\n"}
# Wrappers that delegate to a real runner; strip them and look at what follows.
WRAPPERS = {"npx", "bunx", "pnpx", "time", "command", "nice", "env", "sudo"}
# Package managers that reach a runner via `exec` / `run` / `dlx`.
PM_HEADS = {"pnpm", "npm", "yarn", "bun", "poetry", "uv", "bundle", "pdm", "rye"}
PM_SUBS = {"exec", "dlx", "x", "run"}
# Flags that swallow the next token, so it is not a positional path.
VALUE_FLAGS = {
    "--project", "--grep", "--grep-invert", "-g", "-k", "-m", "--workers",
    "--reporter", "--config", "-c", "--repeat-each", "--retries", "--timeout",
    "--shard", "--max-failures", "--maxfail", "--output", "--pool", "--run",
    "--maxWorkers", "--minWorkers", "--dir", "--root", "--environment",
    "--testNamePattern", "-t", "--spec", "--browser", "--tags", "--example",
}
# Never second-guess these — they exit fast or are explicitly bounded.
INERT_FLAGS = {
    "--list", "--help", "-h", "--version", "-v", "--show-report",
    "--dry-run", "--collect-only", "--co",
}


def emit(payload):
    print(json.dumps(payload))
    sys.exit(0)


def allow():
    sys.exit(0)


def deny(reason):
    emit({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    })


def repair(tool_input, new_command, note):
    updated = dict(tool_input)
    updated["command"] = new_command
    emit({
        "systemMessage": f"test-scope guard: {note}",
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
            "permissionDecisionReason": note,
            "updatedInput": updated,
        },
    })


def segments(tokens):
    """Split a token stream on shell operators."""
    current, out = [], []
    for tok in tokens:
        if tok in OPERATORS:
            if current:
                out.append(current)
            current = []
        else:
            current.append(tok)
    if current:
        out.append(current)
    return out


def basename(tok):
    return tok.rsplit("/", 1)[-1]


def strip_prefix(tokens):
    """Drop env assignments and pure wrappers."""
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if "=" in tok and not tok.startswith("-") and tok.split("=")[0].isidentifier():
            i += 1
        elif basename(tok) in WRAPPERS:
            i += 1
        else:
            break
    return tokens[i:]


def positionals(args):
    """Args that are neither flags nor flag values — i.e. path filters."""
    out, skip = [], False
    for arg in args:
        if skip:
            skip = False
            continue
        if arg.startswith("-"):
            if arg in VALUE_FLAGS:
                skip = True
            continue
        out.append(arg)
    return out


def strip_pm_flags(rest):
    """Skip a package manager's own flags — `--filter <pkg>`, `-C <dir>`.

    Without this, `pnpm --filter x exec vitest run` reads `--filter` as the
    runner name, matches nothing, and sails through unscoped.
    """
    i = 0
    while i < len(rest) and rest[i].startswith("-"):
        # `--filter=<pkg>` carries its value; `--filter <pkg>` eats the next token
        if "=" not in rest[i] and i + 1 < len(rest) and not rest[i + 1].startswith("-"):
            i += 2
        else:
            i += 1
    return rest[i:]


def match_rule(head, rest):
    """Return (rule, args) when the token stream starts with a rule's match."""
    for rule in RULES:
        seq = rule["match"]
        if basename(head) != seq[0]:
            continue
        if len(seq) > 1:
            if rest[: len(seq) - 1] != seq[1:]:
                continue
            return rule, rest[len(seq) - 1:]
        return rule, rest
    return None, []


def classify(tokens):
    """Return (rule, args). A fan-out script yields the synthetic FANOUT rule."""
    tokens = strip_prefix(tokens)
    if not tokens:
        return None, []

    head, rest = basename(tokens[0]), tokens[1:]

    # Fan-out is checked BEFORE unwrapping `run`, or `pnpm run test` would
    # unwrap to a bare `test` and match nothing at all.
    if head in FANOUT["heads"]:
        joined = " ".join(rest)
        for pattern in FANOUT["patterns"]:
            if joined == pattern or joined.startswith(pattern + " "):
                return {"deny_always": True, **FANOUT}, rest
        # `pnpm --filter <pkg> test` — the fan-out hides behind a flag, so a
        # prefix match misses it. The trailing word is the tell.
        if rest and rest[-1] in FANOUT.get("suffixes", []):
            return {"deny_always": True, **FANOUT}, rest

    # `pnpm exec vitest`, `poetry run pytest`, `bundle exec rspec` — after the
    # package manager's own flags, which are not the runner.
    if head in PM_HEADS and rest:
        rest = strip_pm_flags(rest)
        if not rest:
            return None, []
        if rest[0] in PM_SUBS and len(rest) > 1:
            head, rest = basename(rest[1]), rest[2:]
        else:
            head, rest = basename(rest[0]), rest[1:]

    # `node ./node_modules/.bin/vitest run ...`
    if head in {"node", "bun"} and rest:
        head, rest = basename(rest[0]), rest[1:]

    return match_rule(head, rest)


def has_flag(args, flag):
    return any(a == flag or a.startswith(flag + "=") for a in args)


def check(rule, args, at_repo_root):
    """Return ('deny', reason) | ('repair', flag, note) | None."""
    if any(f in args for f in INERT_FLAGS):
        return None

    scoped = rule.get("scoped", "")
    escape_line = f"\n  Everything, on purpose:  {ESCAPE}=1 <your command>"
    scoped_line = f"\n  Scoped:   {scoped}" if scoped else ""

    # Shapes with nothing to narrow: a workspace fan-out script, an interactive
    # runner. Checked before the positional logic, which would otherwise read
    # the `test` in `pnpm test` as a path filter and let it through.
    if rule.get("deny_always"):
        return ("deny",
                rule.get("why", "This runs the whole workspace.")
                + scoped_line + escape_line)

    for flag in rule.get("forbid_flags", []):
        if flag in args:
            return ("deny",
                    f"`{flag}` is interactive: it holds the session open and "
                    f"never exits. Run headless against one target."
                    + scoped_line)

    watch = rule.get("watch_unless")
    if watch and not any(w in args for w in watch):
        return ("deny",
                "Watch mode never exits — it holds workers until the session "
                "dies." + scoped_line)

    for bad in rule.get("deny_positional", []):
        if bad in args:
            return ("deny",
                    f"`{bad}` means every package in the workspace. "
                    f"{rule.get('why', '')}" + scoped_line + escape_line)

    subs = set(rule.get("subcommands", []))
    targets = [p for p in positionals(args) if p not in subs]
    filters = rule.get("filter_flags", [])
    targeted = bool(targets) or any(has_flag(args, f) for f in filters)

    requires = rule.get("requires", "none")
    unbounded = (requires == "path" and not targets) or \
                (requires == "path_or_filter" and not targeted)

    if unbounded and (not rule.get("root_only") or at_repo_root):
        return ("deny",
                f"{rule.get('why', 'This runs far more than the ticket touched.')}"
                + scoped_line + escape_line)

    fix = rule.get("repair")
    if fix and targeted:
        flag = fix.split("=")[0]
        if not has_flag(args, flag):
            return ("repair", fix,
                    f"added {fix} (without it one target runs against the "
                    f"whole matrix)")

    return None


def main():
    try:
        payload = json.load(sys.stdin)
    except Exception:
        allow()

    if payload.get("tool_name") != "Bash":
        allow()

    tool_input = payload.get("tool_input") or {}
    command = tool_input.get("command") or ""
    if not command.strip():
        allow()

    if ESCAPE in command:
        allow()

    try:
        tokens = shlex.split(command, comments=False)
    except ValueError:
        allow()  # unbalanced quotes / heredoc — not ours to judge

    # .../<repo>/.claude/hooks/guard-test-scope.py → <repo>
    repo_root = os.path.dirname(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    )
    cwd = payload.get("cwd") or os.getcwd()

    for seg in segments(tokens):
        if not seg:
            continue
        # `cd packages/web && vitest run` — the cd decides whether the next
        # segment is a repo-root run or a package-local one.
        if seg[0] == "cd" and len(seg) > 1:
            cwd = os.path.abspath(os.path.join(cwd, os.path.expanduser(seg[1])))
            continue

        rule, args = classify(seg)
        if not rule:
            continue

        verdict = check(rule, args,
                        os.path.abspath(cwd) == os.path.abspath(repo_root))
        if not verdict:
            continue
        if verdict[0] == "deny":
            deny(verdict[1])
        if verdict[0] == "repair":
            # Insert after the matched subcommand, NOT at the end of the
            # command — a trailing append lands past any `| head` pipe.
            seq = r"\s+".join(re.escape(t) for t in rule["match"])
            fixed, count = re.subn(rf"(\b{seq})\b", rf"\1 {verdict[1]}",
                                   command, count=1)
            if count:
                repair(tool_input, fixed, verdict[2])

    allow()


if __name__ == "__main__":
    try:
        main()
    except SystemExit:
        raise
    except Exception:
        allow()   # property 4: never turn a guard bug into a dead session
````

### Rule catalogue

Take only the entries for runners Step 1 actually found. Replace every `scoped`
with a command that works **in this repo** — a scoped example naming a file that
does not exist is worse than none.

```python
# vitest — pathless run executes the whole package; watch mode never exits
{"match": ["vitest"], "subcommands": ["run"], "requires": "path",
 "watch_unless": ["run", "--run"],
 "why": "A pathless `vitest run` executes the package's entire suite while "
        "other agents wait for cores.",
 "scoped": "<pnpm|bunx> vitest run path/to/file.test.ts"},

# jest — same shape, different flag for name filtering
{"match": ["jest"], "requires": "path_or_filter",
 "filter_flags": ["-t", "--testNamePattern", "--testPathPattern"],
 "watch_unless": [],
 "why": "A bare `jest` run walks every testMatch path in the project.",
 "scoped": "npx jest path/to/file.test.js"},

# playwright — one spec against every configured browser project
{"match": ["playwright", "test"], "requires": "path_or_filter",
 "filter_flags": ["--grep", "-g"], "forbid_flags": ["--ui", "--debug"],
 "repair": "--project=chromium",
 "why": "A bare `playwright test` runs every spec and boots dev servers. "
        "E2E at that scale is feature-level work with one owner.",
 "scoped": "npx playwright test tests/e2e/thing.spec.ts --project=chromium"},

# cypress — same, and `open` is the interactive trap
{"match": ["cypress", "run"], "requires": "path_or_filter",
 "filter_flags": ["--spec"], "repair": "--browser=chrome",
 "why": "A bare `cypress run` executes every spec in the integration folder.",
 "scoped": "npx cypress run --spec cypress/e2e/thing.cy.ts"},
{"match": ["cypress", "open"], "deny_always": True,
 "why": "`cypress open` is interactive: it holds the session and a browser, "
        "and never exits.",
 "scoped": "npx cypress run --spec cypress/e2e/thing.cy.ts"},

# pytest — -k and -m are filters, so they count as targeting
{"match": ["pytest"], "requires": "path_or_filter",
 "filter_flags": ["-k", "-m"],
 "why": "A bare `pytest` collects the whole rootdir, and with xdist it forks "
        "per core.",
 "scoped": "pytest tests/test_thing.py::test_case"},

# go test — ./... is the whole module
{"match": ["go", "test"], "requires": "path", "deny_positional": ["./..."],
 "filter_flags": ["-run"],
 "why": "`go test ./...` compiles and runs every package in the module.",
 "scoped": "go test ./internal/thing -run TestThing"},

# rspec — pathless run is the whole spec directory
{"match": ["rspec"], "requires": "path_or_filter",
 "filter_flags": ["-e", "--example", "-t", "--tag"],
 "why": "A bare `rspec` runs the entire spec directory.",
 "scoped": "bundle exec rspec spec/models/thing_spec.rb:42"},

# cargo test — workspace-wide unless a target is named
{"match": ["cargo", "test"], "requires": "path_or_filter",
 "filter_flags": ["--test", "--package", "-p"],
 "why": "A bare `cargo test` builds and tests every crate in the workspace.",
 "scoped": "cargo test --package thing --test integration"},
```

---

## Step 3: Write the battery

Write `.claude/hooks/test-guard-test-scope.py`. It drives the real hook as a
subprocess over stdin — the same path Claude Code uses — so it tests the entry
point rather than a copy of the logic.

**Every runner in `RULES` needs at least one deny case and one allow case.** The
false-positive cases at the bottom are not optional; they are the ones that
protect the guard's credibility.

````python
#!/usr/bin/env python3
"""Battery for guard-test-scope.py. Standalone: `python3 <this file>`.

Each case is (expected, command, why). Expected is one of:
  "deny"    the guard must refuse, with a scoped alternative in the message
  "repair"  the guard must rewrite the command and let it through
  "allow"   the guard must not interfere
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
GUARD = os.path.join(HERE, "guard-test-scope.py")
REPO = os.path.dirname(os.path.dirname(HERE))

CASES = [
    # ── denied: unbounded ────────────────────────────────────────────────
    ("deny", "<pathless unit run>", "whole package for a three-line diff"),
    ("deny", "<watch-mode run>", "never exits, holds workers"),
    ("deny", "<workspace fan-out script>", "every package, often after a build"),

    # ── repaired: fine once narrowed ─────────────────────────────────────
    ("repair", "<matrix run naming one target>", "one target, whole matrix"),
    ("repair", "<matrix run naming one target> | head -20",
     "flag must land after the subcommand, not past the pipe"),

    # ── allowed: already scoped ──────────────────────────────────────────
    ("allow", "<scoped unit run>", "names a path"),
    ("allow", "<scoped matrix run with filter>", "already filtered"),
    ("allow", "ALLOW_FULL_SUITE=1 <pathless unit run>", "escape hatch"),

    # ── allowed: false positives that must never be denied ───────────────
    ("allow", 'grep -rn "vitest run" docs/', "the word, not the command"),
    ("allow", "git commit -m 'test: run pytest on the new module'",
     "commit message mentioning a runner"),
    ("allow", 'echo "pytest" > notes.txt', "a string, not an invocation"),
    ("allow", "cat file-with-'unbalanced-quote", "unparseable — not ours"),
    ("allow", "ls -la", "nothing to do with tests"),
    ("allow", "<runner> --help", "inert flag, exits immediately"),
    ("allow", "<runner> --list", "inert flag, enumerates only"),
]


def run(command, cwd=REPO):
    payload = json.dumps({
        "tool_name": "Bash",
        "tool_input": {"command": command},
        "cwd": cwd,
    })
    proc = subprocess.run([sys.executable, GUARD], input=payload,
                          capture_output=True, text=True, timeout=10)
    out = proc.stdout.strip()
    if not out:
        return "allow", None
    try:
        parsed = json.loads(out)
    except json.JSONDecodeError:
        return "malformed", out
    hook = parsed.get("hookSpecificOutput", {})
    decision = hook.get("permissionDecision")
    if decision == "deny":
        return "deny", hook.get("permissionDecisionReason", "")
    if "updatedInput" in hook:
        return "repair", hook["updatedInput"]["command"]
    return "allow", None


def main():
    failures = []
    for expected, command, why in CASES:
        actual, detail = run(command)
        if actual != expected:
            failures.append(f"{expected} != {actual}  |  {command}\n    ({why})")
            continue
        # A deny that does not name an alternative is a deny that gets ignored.
        if expected == "deny" and "Scoped:" not in (detail or ""):
            failures.append(f"deny without a scoped alternative  |  {command}")
        # A repaired command must stay one command — the flag goes after the
        # subcommand, never past a pipe.
        if expected == "repair" and "|" in command:
            before_pipe = (detail or "").split("|")[0]
            if "--" not in before_pipe:
                failures.append(f"repair landed past the pipe  |  {detail}")

    print(f"{len(CASES) - len(failures)}/{len(CASES)} passed")
    for f in failures:
        print(f"  FAIL  {f}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
````

---

## Step 4: Wire it into settings.json

**Merge. Never overwrite** — the file may already hold `enabledPlugins`,
permissions, other hooks.

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/guard-test-scope.py\" 2>/dev/null || true",
            "timeout": 10,
            "statusMessage": "Checking test scope"
          }
        ]
      }
    ]
  }
}
```

Two details in that command string carry the fail-open property, and both are
easy to drop by accident:

- `2>/dev/null` — a stack trace on stderr must not become the decision.
- `|| true` — a missing python3 or a missing script exits non-zero, and a
  non-zero PreToolUse hook blocks the call. Without this, uninstalling python3
  would block every Bash command in the project.

Merge with `jq`, falling back to `node`, then `python3`:

```bash
jq '.hooks.PreToolUse += [$new]' --argjson new "$ENTRY" .claude/settings.json
```

If the file already has a `PreToolUse` entry with `matcher: "Bash"` running this
same script, replace that entry rather than appending a second copy.

---

## Step 5: Run the battery — this is a gate

```bash
python3 .claude/hooks/test-guard-test-scope.py
```

<HARD-GATE>
Do not report this skill as done on a red battery, and do not report it as done
without running the battery at all. A guard nobody proved is a guard nobody
should trust — and one that denies wrongly is worse than none, because the next
agent learns to reach for the escape hatch by reflex.

If a case fails, fix the rule or the case — whichever is actually wrong — and
re-run. Report the final count.
</HARD-GATE>

Then confirm the two properties a green battery does not cover:

```bash
# Fail-open: with the script gone, Bash still works
mv .claude/hooks/guard-test-scope.py /tmp/ && ls && mv /tmp/guard-test-scope.py .claude/hooks/

# Live: the guard is actually wired, not just present
<a pathless run this project's rules should deny>
```

---

## Step 6: Record the project's scoped commands

The guard says no. Something has to say yes. Add a short block to the project's
`CLAUDE.md` naming the scoped commands agents should reach for:

```markdown
## Test Commands

Every test command names what it runs. `.claude/hooks/guard-test-scope.py`
enforces this on every Bash call.

- Unit:  <the real scoped command for this project>
- E2E:   <the real scoped command, one target>
- Whole suite, deliberately: ALLOW_FULL_SUITE=1 <command>

Before a long run, check nothing else is already saturating the box:

    uptime                      # load average above core count means wait
    ps -Ao pcpu,etime,command | grep -E "<runners>" | grep -v grep | head
```

Without this the guard is half a system: agents know what they cannot do and
have to guess at what they can.

---

## Reporting

```
Test-scope guard installed.

  Runners:  vitest (path required), playwright (project filter, repaired)
  Fan-out:  turbo run test, pnpm -r test
  Battery:  17/17 passed
  Wiring:   .claude/settings.json PreToolUse merged (1 existing hook kept)
  Escape:   ALLOW_FULL_SUITE=1
```

## Error handling

- **No test runner found**: say so and stop. Do not install a guard with an
  empty rule set — it would be dead weight that looks like protection.
- **No python3**: install the files anyway and say the guard is inert until
  python3 exists. The `|| true` wiring means an inert guard costs nothing.
- **`.claude/settings.json` is malformed JSON**: do not rewrite it. Report the
  parse error and leave the hook unwired; the file is the user's.
