# Plan: building the NeetCode 250 Tracker

This is the plan of action. The rules of the app live in [docs/SPEC.md](docs/SPEC.md);
how we work together lives in [CLAUDE.md](CLAUDE.md). Tick boxes as stages land.

## Where we are

| # | Stage | Status |
|---|---|---|
| 1 | Project setup | Done, pushed |
| 2 | Schema and seed | Done, pushed |
| 3 | Scheduler (pure rules, 33 tests) | Done, pushed |
| 4 | API (7 endpoints, same-origin checks) | Done, committed, **not pushed** |
| — | Verification setup (`npm run check`, isolated test DB, `CLAUDE.md`) | Done, committed, **not pushed** |
| 5 | Today screen | **Next** |
| 6 | Problems and detail screens | |
| 7 | Progress screen | |
| 8 | Real data, polish, running it as an app | |

189 tests pass. The 250-problem list has **not** been fetched yet; the dev database holds
5 fake fixture problems.

## How we work (every stage)

1. **Plan first.** I explain the plan and any decisions; you say go.
2. **Tests first.** Write the failing test, watch it fail for the right reason, then make it pass.
3. **Comments in plain language** in every file, explaining why, not just what.
4. **`npm run check` must pass** (lint, typecheck, tests). Nothing is "done" without it.
5. **Check the stage by hand** where the spec says so (curl, browser) and report what I could not verify.
6. **Commit locally, then wait.** I never push until you approve that commit.
7. **Finish with the report** from CLAUDE.md: files changed, riskiest part, what was not tested.

## Decisions needed before Stage 5

These touch dependencies or visible behaviour, so they are yours to make.

**D1. How do we test the screens?** Today is the first screen with real interaction.
- **(a) Recommended: pure logic + a real browser look.** Keep the screen's behaviour (remove a row, undo, counts) in plain functions tested with Vitest, add no dependencies, and check the page in a real browser by hand.
  Cheapest, but the React wiring itself is only covered by hand.
- (b) Add `@testing-library/react` + `jsdom` (two dev dependencies) to test components in Vitest.
- (c) Add Playwright (heavier) for true end-to-end tests of the running app.

**D2. How should the Today list update?**
- **(a) Recommended:** the page loads the due list on the server, a small client component handles clicks, and after a rating the row disappears at once (calling the API in the background and putting it back with an error message if it fails).
- (b) Wait for the server before removing the row (simpler, feels slower).

**D3. Look and feel.** I'd use Tailwind, follow your system light/dark setting, keep it plain and fast (one screen, big rating buttons, keyboard shortcuts `1`/`2`/`3`). Say if you want something different.

**D4. When to fetch the real 250 list?** The spec leaves it to Stage 8.
- **Recommended: right after Stage 5** (a short Stage 5b), so Stages 6 and 7 are built and checked against real data (patterns, ordering, search) and not 5 fake problems.

**D5. Should `npm run check` also run `next build`?** It would catch problems the other three miss (route and page compile errors) but adds about 10 seconds. Recommended: yes, once screens exist.

## Stage 5: Today screen (`/`)

Build: the due list with title (linked out), pattern, days overdue, and the saved insight hidden behind **Reveal**; three rating buttons per row that log today's attempt in one click; header with due count and solved count (e.g. `42 / 250`); **Undo** toast (about 5 seconds) that deletes the attempt just logged; "Show all" beyond 10; empty state ("Nothing due today").

Tests first (adjusted by D1): the list state logic: rating removes a row and updates counts, Undo puts it back in order, a failed request restores the row, "Show all" toggles the limit.
Also: a thin check that the page's data call matches `GET /api/review/due`.

Check: rate a problem and watch it leave the list with a new date; Undo brings it back; a rating takes under 10 seconds from opening the app.

## Stage 5b: Real data (if D4 is accepted)

Build `scripts/fetch-neetcode250.ts`, a one-time pull from neetcode.io into `data/neetcode250.json`, and print a summary for **your** review: total, count per pattern, a few random entries. Nothing is written from memory. If neetcode.io blocks the pull, you paste the list instead.
Seed it into the real database only after you've approved the summary.

Tests first: the importer's parsing of a saved sample page (no network in tests); `seed.ts` already enforces exactly 250 entries.
Check: `npm run seed` loads 250; running it twice still gives 250; insights survive.

## Stage 6: Problems and detail (`/problems`, `/problems/[id]`)

- **Problems:** all problems, filters for pattern, difficulty and status (unsolved, in review, mastered, retired), title search, link out. Filters live in the URL so a filtered view can be bookmarked.
- **Detail:** problem info, current schedule, editable insight, attempt history with a delete button per row, and the log form (rating, optional minutes, insight, optional date). The form warns before an Easy that won't count ("Not due until Nov 20, so an Easy won't change the schedule").

Tests first: the early-Easy warning rule (a pure function using the scheduler), filter parsing from the URL, history delete restoring state (already covered by the API tests).
Check: filters combine correctly; deleting the only attempt makes the problem unsolved again.

## Stage 7: Progress (`/progress`)

Per-pattern bars (solved, mastered, retired, due), the last-7-days attempt count, overall totals.

Tests first: totals on this screen equal the Problems screen's counts for the same data (one shared query, so they cannot drift).
Check: totals match the Problems screen with real data.

## Stage 8: Polish and running it as an app

- Empty states and readable error messages.
- `npm run deploy` (migrate, build, restart) and `scripts/install-launchd.sh` (starts at login, restarts on crash, absolute paths, logs in `~/Library/Logs/neetcode-tracker/`).
- Web app manifest and icon so it installs as its own window.
- README with setup steps that a fresh clone can follow.

Check: restart the Mac and the app is at `localhost:3000` without opening an editor; it is not reachable from another device; the real database has no fixture rows; **a fresh clone runs by following the README** (I will try this in an empty folder).

## Definition of done (v1)

From the spec's acceptance checklist:
- [ ] 250 problems seeded, safe to re-run, insights survive
- [ ] Logging an attempt creates the attempt and the right schedule; Undo and history deletes restore the prior state
- [ ] Today shows only due problems, most overdue first, Hard first on ties
- [ ] Progress totals match the Problems screen
- [ ] After a restart the app is at `localhost:3000` with no editor open
- [ ] Not reachable from another device; real database has no fixture rows
- [ ] README lets a fresh clone run it
- [ ] Logging an attempt takes under 10 seconds; opening the app each morning shows an accurate list

## Risks and things to watch

- **Time zones and "today".** Everything uses the local calendar date at midnight. The scheduler never reads the clock, so every date rule is testable.
- **Next.js 16 differences.** `AGENTS.md` says this version differs from what I know, so I read the bundled docs in `node_modules/next/dist/docs/` before writing routes or pages.
- **The UI is the least-tested layer** unless we pick D1 (b) or (c).
- **Public repo.** No personal data, no `.env` files; commits use the GitHub noreply email.
- **Unpushed work.** Stage 4 and the verification setup are committed but waiting for your push approval.

## Not in v1

Accounts or sync, notifications, importing progress from NeetCode or LeetCode, fancier scheduling (SM-2), an in-app code editor, editing attempts (delete and re-log instead).
