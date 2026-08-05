#!/usr/bin/env python3
"""PreToolUse guard: keep test runs scoped so parallel agents don't peg the box.

Many Claude sessions work this single checkout on one 8-core Mac. Worker caps in
vitest.config.ts / playwright.config.ts bound a single run; they do nothing about
runs that never needed to happen. This hook is the enforcement half.

Three outcomes, in order of preference:

  repair  A run that is fine once narrowed — `playwright test <spec>` with no
          --project — is rewritten (adds --project=chromium) and proceeds.
  allow   Anything scoped, anything non-test, anything unparseable.
  deny    Only unbounded shapes: a pathless vitest run, the whole 42-spec e2e
          suite, a monorepo-wide `turbo run test`, or a watch-mode runner that
          would never exit.

Every deny names the scoped command to run instead, and every deny is escapable:
prefix `ALLOW_FULL_SUITE=1` when the whole suite is genuinely the point.
"""

import json
import os
import re
import shlex
import sys

ESCAPE = "ALLOW_FULL_SUITE"
OPERATORS = {"&&", "||", ";", "|", "&", "\n"}
# Wrappers that delegate to a real runner; strip them and look at what follows.
WRAPPERS = {"bunx", "npx", "time", "command", "nice", "env"}
# Flags that swallow the next token, so it is not a positional test path.
VALUE_FLAGS = {
    "--project", "--grep", "--grep-invert", "-g", "--workers", "--reporter",
    "--config", "-c", "--repeat-each", "--retries", "--timeout", "--shard",
    "--max-failures", "--output", "--pool", "--maxWorkers", "--minWorkers",
    "--dir", "--root", "--environment", "--coverage.reporter",
}
# Never second-guess these — they exit fast or are explicitly bounded.
INERT_FLAGS = {"--list", "--help", "-h", "--version", "-v", "--show-report"}


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


def strip_prefix(tokens):
    """Drop env assignments and wrappers; return (runner_tokens, env_names)."""
    env = []
    i = 0
    while i < len(tokens):
        tok = tokens[i]
        if "=" in tok and not tok.startswith("-") and tok.split("=")[0].isidentifier():
            env.append(tok.split("=")[0])
            i += 1
        elif tok in WRAPPERS:
            i += 1
        elif tok.endswith("/bunx") or tok.endswith("/npx"):
            i += 1
        else:
            break
    return tokens[i:], env


def basename(tok):
    return tok.rsplit("/", 1)[-1]


def positionals(args):
    """Args that are neither flags nor flag values — i.e. test path filters."""
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


def classify(tokens):
    """Return (kind, args) where kind is vitest | playwright | suite | None."""
    tokens, _ = strip_prefix(tokens)
    if not tokens:
        return None, []

    head = basename(tokens[0])
    rest = tokens[1:]

    # `node ./node_modules/.bin/vitest run ...`
    if head in {"node", "bun"} and rest and basename(rest[0]) in {"vitest", "playwright"}:
        head, rest = basename(rest[0]), rest[1:]

    # `pnpm exec vitest`, `pnpm dlx playwright`, `yarn playwright`
    if head in {"pnpm", "yarn", "npm"} and rest:
        if rest[0] in {"exec", "dlx", "run"} and len(rest) > 1:
            head, rest = basename(rest[1]), rest[2:]
        elif basename(rest[0]) in {"vitest", "playwright"}:
            head, rest = basename(rest[0]), rest[1:]

    if head == "vitest":
        return "vitest", rest
    if head == "playwright":
        return ("playwright", rest[1:]) if rest and rest[0] == "test" else (None, [])

    # `bun test` is bun's own runner: one process, seconds, no build. Only the
    # repo-root invocation (which walks every package) is a problem.
    if head == "bun" and rest and rest[0] == "test":
        return "bun-test", rest[1:]

    # Package-manager indirection that fans out to whole suites — `npm test`,
    # `bun run test`, `turbo run test`. Each resolves to a pathless vitest run
    # or a turbo fan-out, in any directory.
    joined = " ".join(rest)
    if head in {"bun", "npm", "pnpm", "yarn", "turbo"}:
        for pattern in ("turbo run test", "run test", "-r test", "test"):
            if joined == pattern or joined.startswith(pattern + " "):
                return "suite", rest
    return None, []


def check(kind, args, at_repo_root):
    """Return ('deny', reason) | ('repair', new_args, note) | None."""
    if any(f in args for f in INERT_FLAGS):
        return None

    if kind == "vitest":
        if "run" not in args and "--run" not in args:
            return ("deny",
                    "Watch-mode vitest never exits — it holds workers until the "
                    "session dies. Use `vitest run <path/to/file.test.ts>`.")
        if not [p for p in positionals(args) if p != "run"]:
            return ("deny",
                    "Pathless `vitest run` executes a package's entire suite "
                    "(888 tests in web) while other agents wait for cores.\n"
                    "  Scoped:   bunx vitest run packages/web/tests/styles.test.ts\n"
                    f"  Whole package, on purpose:  {ESCAPE}=1 bunx vitest run")

    if kind == "playwright":
        if "--ui" in args or "--debug" in args:
            return ("deny",
                    "Interactive Playwright modes (--ui/--debug) block the "
                    "session and hold a browser. Run headless with a spec path.")
        specs = positionals(args)
        targeted = specs or any(a in ("--grep", "-g") or a.startswith("--grep")
                                for a in args)
        if not targeted:
            return ("deny",
                    "A bare `playwright test` runs all 42 specs and boots dev "
                    "servers. E2E at that scale is feature-level work with one "
                    "owner, not per-ticket verification.\n"
                    "  Scoped:   ./scripts/run-tests.sh e2e --file=product-listing.spec.ts\n"
                    f"  Full suite, on purpose:  {ESCAPE}=1 bunx playwright test")
        if not any(a == "--project" or a.startswith("--project=") for a in args):
            return ("repair", args + ["--project=chromium"],
                    "added --project=chromium (without it one spec runs against "
                    "every browser project)")

    if kind == "suite":
        return ("deny",
                "That script resolves to a pathless `vitest run` (a package's "
                "whole suite) or a turbo fan-out that rebuilds all three "
                "packages first — turbo's `test` has dependsOn: [build], "
                "cache: false.\n"
                "  Scoped:   bunx vitest run packages/api/tests/lib/foo.test.ts\n"
                f"  Everything, on purpose:  {ESCAPE}=1 bun test")

    if kind == "bun-test" and at_repo_root and not positionals(args):
        return ("deny",
                "`bun test` at the repo root walks every package's test files. "
                "Run it from the package you mean, or name a path.\n"
                f"  Everything, on purpose:  {ESCAPE}=1 bun test")

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

        kind, args = classify(seg)
        if not kind:
            continue

        verdict = check(kind, args, os.path.abspath(cwd) == os.path.abspath(repo_root))
        if not verdict:
            continue
        if verdict[0] == "deny":
            deny(verdict[1])
        if verdict[0] == "repair":
            # Insert the flag right after `playwright test`, not at the end of
            # the command — a trailing append lands past any `| head` pipe.
            fixed, count = re.subn(r"(\bplaywright\s+test)\b",
                                   r"\1 --project=chromium", command, count=1)
            if count:
                repair(tool_input, fixed, verdict[2])

    allow()


if __name__ == "__main__":
    main()
