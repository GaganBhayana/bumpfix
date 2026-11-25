# BumpFix tasks

Status values: `todo`, `review (PR #n)`, `done (PR #n)`, `blocked: <reason>`. Sizes: S (under 150 lines changed), M (150–400). One task per PR. M0 tasks are pure logic with no I/O.

## M0 Foundation

### BF-001 Semver parsing and range checks
- Status: review (PR #1)
- Size: M
- Depends on: none
- Goal: `src/version/semver.ts`: parse versions (incl. prerelease and build), compare, classify a bump as `major|minor|patch|prerelease`, and test simple npm ranges (`^`, `~`, `>=`, `<`, `||`, `x`).
- Acceptance: table-driven tests with 40+ cases, including `0.x` caret semantics.

### BF-002 Detect version bumps in `package.json` diffs
- Status: todo
- Size: S
- Depends on: BF-001
- Goal: `src/bump/npm.ts` compares old and new `package.json` objects and returns `{name, from, to, kind, section}` for dependencies, devDependencies, peerDependencies and optionalDependencies.
- Acceptance: tests for added, removed and changed packages and range-only changes.

### BF-003 Detect bumps in Python manifests
- Status: todo
- Size: M
- Depends on: BF-001
- Goal: `src/bump/python.ts` parses `requirements*.txt` lines (`==`, `>=`, `~=`, extras, markers, comments) and the `[project.dependencies]` array of `pyproject.toml` (minimal TOML subset) and diffs them.
- Acceptance: table-driven tests incl. extras and environment markers.

### BF-004 Recognise upgrade PRs
- Status: todo
- Size: S
- Depends on: BF-002
- Goal: `src/bump/detect.ts` decides whether a PR is an upgrade PR from author login (renovate[bot], dependabot[bot]), title patterns ("Bump x from a to b", "Update dependency x to v2") and changed files (manifests and lockfiles only).
- Acceptance: tests for each signal and for mixed PRs (not an upgrade).

### BF-005 TypeScript compiler error parser
- Status: todo
- Size: S
- Depends on: none
- Goal: `src/logs/tsc.ts` extracts diagnostics `{file, line, col, code, message, tool:'tsc'}` from `tsc` output, including multi-line messages and GitHub Actions log prefixes (timestamps, `##[error]`).
- Acceptance: tests on realistic log snippets written for the tests.

### BF-006 Jest and Vitest failure parser
- Status: todo
- Size: M
- Depends on: BF-005
- Goal: `src/logs/jest.ts` extracts failing test names, files, assertion messages and the first stack frame inside the repo.
- Acceptance: tests for Jest and Vitest output formats, including snapshot failures.

### BF-007 pytest and Python import error parser
- Status: todo
- Size: M
- Depends on: BF-005
- Goal: `src/logs/pytest.ts` extracts failures and errors (`ImportError`, `ModuleNotFoundError`, `AttributeError`, `TypeError`) with file and line from short and long tracebacks.
- Acceptance: tests for each error kind.

### BF-008 Changelog section extraction between versions
- Status: todo
- Size: M
- Depends on: BF-001
- Goal: `src/changelog/extract.ts` takes a CHANGELOG.md text and returns sections for versions in `(from, to]`, recognising common heading styles (`## 2.0.0`, `## [2.0.0] - date`, `# v2.0.0`), and flags "breaking" items.
- Acceptance: tests for each heading style and for missing versions.

### BF-009 Recipe schema and matcher
- Status: todo
- Size: M
- Depends on: BF-001, BF-005
- Goal: `src/recipes/` defines the recipe format (see PLAN.md), validates it, and matches recipes to a bump plus diagnostics by package, version ranges and symptom patterns, ranked by specificity.
- Acceptance: tests with 5 sample recipes in `recipes/` and matching/non-matching diagnostics.

### BF-010 Anti-cheat verifier
- Status: todo
- Size: M
- Depends on: none
- Goal: `src/verify/anticheat.ts` inspects a unified diff and rejects fixes that delete tests, add skips, add `any` casts or `@ts-ignore`/`@ts-expect-error` without a reason comment, or exceed a changed-lines budget.
- Acceptance: tests for each rule with small diffs.

### BF-011 Fix summary renderer
- Status: todo
- Size: S
- Depends on: BF-009, BF-010
- Goal: `src/report.ts` renders the commit message body and PR comment: bump table, diagnostics before/after, applied recipes or steps, checks run.
- Acceptance: snapshot tests.

## M1 Fix loop (outline, detailed by the weekly planning session)

- BF-012 Depend on forge-core; pipeline skeleton with fake collectors.
- BF-013 Fetch CI logs for a failing check and map to diagnostics.
- BF-014 Fetch release notes and changelogs from GitHub releases and registry metadata.
- BF-015 Call-site finder for APIs named in diagnostics.
- BF-016 Fix ladder: recipes → codemods → agent (budgeted), with verification loop.
- BF-017 Commit and comment on the upgrade PR.
- BF-018 Recipe candidate capture.
