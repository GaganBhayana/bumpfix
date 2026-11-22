# BumpFix plan

**Renovate opens the PR. BumpFix makes it green.**

BumpFix watches dependency-upgrade PRs (Renovate, Dependabot or manual bumps) that fail CI. It gathers what changed between the versions, applies known fixes first, lets an agent fix the rest inside the failing area, reruns the checks, and pushes a commit with an explanation. Every successful fix becomes a reusable recipe in a public library.

## Why

Major upgrades fail and sit for months; dependency debt becomes security debt. Renovate and Dependabot don't fix code. No well-known open-source tool closes that gap.

## Functional requirements

MVP (launch 12 Apr 2027):

1. Detect upgrade PRs: author is Renovate or Dependabot, or the diff only bumps versions in manifests and lockfiles. Parse which packages moved from which version to which.
2. Ecosystems: npm/pnpm/yarn (`package.json`) and Python (`pyproject.toml`, `requirements*.txt`) first.
3. Read the failing CI log and extract errors (TypeScript, ESLint, Jest/Vitest, pytest, mypy, import errors) into structured diagnostics with file and line.
4. Gather change context: release notes and changelog sections between the two versions, migration guides, and the call sites of APIs named in errors.
5. Fix in layers: (a) recipes from the library, (b) deterministic codemods, (c) an agent limited to files in diagnostics, with up to N attempts and a budget.
6. Verify: build, type-check and tests must pass; block "fixes" that delete or skip tests, loosen types to `any`, or exceed a diff budget.
7. Commit to the upgrade branch with a summary: what broke, which recipe or step fixed it, evidence, checks that passed.
8. Recipe capture: successful fixes become candidate recipes (package, version range, symptom pattern, fix pattern), reviewed before publishing.

Later: Maven/Gradle, Go, Cargo; risk lanes per package type; batch upgrades across repos; a public "what broke this week" report; recipe site with SEO pages.

## Non-functional requirements

| Area | Requirement |
| --- | --- |
| Safety | Never merges. Writes only to the upgrade branch. Commits clearly labelled as automated |
| Honesty | A fix counts only if all checks pass; anti-cheat checks (no deleted tests, no new `any`, no `@ts-ignore` without reason) |
| Cost | Budget per PR (default $1); stop after 3 failed attempts |
| Speed | First attempt within 15 minutes of red CI |
| Privacy | Code processed in the user's CI; hosted service sees metadata only |

## Architecture

```
upgrade PR + red CI ─► detect bump ─► parse CI log ─► gather context ─► fix ladder ─► verify ─► commit + summary ─► recipe candidate
                                                     (changelog, notes,    (recipes → codemods → agent)
                                                      call sites)
```

Pure logic (`src/bump/`, `src/logs/`, `src/changelog/`, `src/recipes/`, `src/verify/`) is unit-tested offline; I/O runs on forge-core.

## Recipe format

```yaml
id: next-14-to-15-async-request-apis
package: next
from: ">=14 <15"
to: ">=15 <16"
symptoms:
  - pattern: "Property 'get' does not exist on type 'Promise<ReadonlyRequestCookies>'"
fix:
  kind: codemod | patch | instructions
  ref: codemods/next15-async-cookies.ts
evidence: [PR links where it worked]
```

## Milestones

| Milestone | Target | Scope |
| --- | --- | --- |
| M0 Foundation | Jan 2027 (rotation) | Version parsing, manifest diffing, CI log parsers, changelog section extraction, recipe schema and matcher, anti-cheat verifier |
| M1 Fix loop | Mar 2027 | GitHub wiring, context gathering, fix ladder with agent, commit + summary |
| M2 Launch | 12 Apr 2027 | Python support, recipe site, 20 real fixes as case studies, launch |
| M3 After launch | Q2–Q3 2027 | More ecosystems, batch mode, weekly ecosystem report |
