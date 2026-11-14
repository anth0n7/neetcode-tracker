# Plan: building the NeetCode 250 Tracker

This plan lists the build stages. The app's rules are in [docs/SPEC.md](docs/SPEC.md),
and how we work together is in [CLAUDE.md](CLAUDE.md). Tick boxes as stages land.

## Where we are

| # | Stage | Status |
|---|---|---|
| 1 | Project setup | Done, pushed |
| 2 | Schema and seed | Done, pushed |
| 3 | Scheduler (pure rules, 33 tests) | Done, pushed |
| 4 | API (7 endpoints, same-origin checks) | Done, pushed |
| n/a | Verification setup (`npm run check`, isolated test DB, `CLAUDE.md`) | Done, pushed |
| 4b | Switch the scheduler to SM-2 | Done, merged to `main` (PR #1). 47 scheduler tests, migrations `0001` and `0002` applied everywhere, API on the new shape |
| n/a | Remove code comments, tighten docs | Done, merged to `main` (PR #2) |
| 5 | Today screen | Done, merged (PR #2). `npm run check` now includes `next build`. Behaviour checked by hand in a browser |
| 5b | Real data (fetch the 250 list) | Done, merged (PR #2). `data/neetcode250.json` has 250 entries (content and order checked by you) and is seeded into the real database (250 rows, safe to re-run) |
| 6a | Problems list | Done, merged (PR #3). Filters run in the browser through one shared `filterProblems`, mirrored to the URL, bad URL values ignored |
| 6b | Problem detail | Done, merged (PR #3). Insight editor, log form with early-rating warning, history with confirmed delete |
| 6c | Routes and look | Done, merged (PR #3). Commit 1: Problems is the home page, Today moved to `/today`, `/problems` redirects to `/`. Commit 2: redesign (refined table grouped by pattern with progress bars, shared style tokens, nav, Today and detail restyled). Screenshots checked in headless Chrome (light mode, wide and narrow); dark mode and phone widths under about 500px not seen |
| 7 | Progress screen (branch `stage-7-progress`) | Done, merged (PR #4). Donut, attempts-per-day chart (plain SVG, no new dependency) and per-pattern bars. Totals share `groupByPattern` and `sumGroups` with the Problems screen. You checked it in a browser on the test database. The `getProgress` refactor (one implementation of the counts) was discussed and skipped for now |
| 7b | UI polish | Done, merged (PR #5). Problems filter bar sticky on desktop only, difficulty dot on mobile rows, softer dark palette, Today rating buttons no longer cramped on mobile (shortcut badges hidden below `sm`). Checked in headless Chrome at 520px (dark) and wide; scrolling behaviour and widths under 500px not seen |
| 8 | Switch to SQLite (branch `stage-8-sqlite`) | Done, PR open. `npm run check` passes (306 tests); checked by hand on the sandbox and dev databases |
| 9 | Electron spike (throwaway branch) | |
| 10 | The Electron app | |
| 11 | Error pages and README | |

289 tests pass (as of the last commit of PR #3). The real database holds the 250 problems and no attempts. The dev
database holds 5 fake fixture problems.

## How we work (every stage)

1. **Plan first.** I explain the plan and any decisions; you say go.
2. **Tests first.** Write the failing test, watch it fail for the right reason, then make it pass.
3. **`npm run check` must pass.** It runs lint, typecheck and tests. Nothing is "done" without it.
4. **Check the stage by hand** where the spec says so (curl, browser) and report what I could not verify.
5. **Git follows `CLAUDE.md`.** Work on a branch, and never commit or push unless you ask.
6. **Finish with the report.** CLAUDE.md asks for the files changed, the riskiest part, and what was not tested.

## Decisions before Stage 5 (all made)

(Numbered U1 to U5, for "UI", so they are not confused with the spec's SM-2 decisions D1 to D9.)

Chosen: U1 (a), U2 (a), U3 as proposed, U4 as recommended (Stage 5b right after Stage 5), U5 yes (add `next build` to `check` once screens exist, so as part of Stage 5). The options are kept below for the record.

**U1. How do we test the screens?** Today is the first screen with real interaction.
- **(a) Recommended: pure logic plus a real browser check.** Keep the screen's behaviour (remove a row, undo, counts) in plain functions tested with Vitest, add no dependencies, and check the page in a real browser by hand.
  Cheapest, but the React wiring itself is only covered by hand.
- (b) Add `@testing-library/react` and `jsdom` (two dev dependencies) to test components in Vitest.
- (c) Add Playwright (heavier) for true end-to-end tests of the running app.

**U2. How should the Today list update?**
- **(a) Recommended:** the page loads the due list on the server, a small client component handles clicks, and after a rating the row disappears at once. The client calls the API in the background and puts the row back with an error message if the call fails.
- (b) Wait for the server before removing the row (simpler, feels slower).

**U3. Look and feel.** I'd use Tailwind, follow your system light/dark setting, keep it plain and fast (one screen, big rating buttons, keyboard shortcuts `1`/`2`/`3`). Say if you want something different.

**U4. When to fetch the real 250 list?** The spec leaves it to Stage 8.
- **Recommended: right after Stage 5** (a short Stage 5b), so Stages 6 and 7 are built and checked against real data (patterns, ordering, search) and not 5 fake problems.

**U5. Should `npm run check` also run `next build`?** It would catch problems the other three miss (route and page compile errors) but adds about 10 seconds. Recommended: yes, once screens exist.

## Stage 4b: Switch the scheduler to SM-2 (done, merged in PR #1)

The spec ([docs/SPEC.md](docs/SPEC.md), "Scheduling rules (SM-2)") records every decision (D1 to D9 in the spec), and all are confirmed and implemented. The goal was to stay as close to the original SM-2 as possible. The spec lists the differences under "How this differs from the original SM-2".

Each step went test-first:
1. Scheduler tests (`tests/scheduler.test.ts`): 47 tests, run against the old scheduler first (36 failed for the right reasons).
2. `lib/scheduler.ts` rewritten: 47 of 47 pass, and 8 deliberate rule breaks were all caught.
3. Migrations `0001` (add `ease_factor` and `repetitions`, drop `status`, make `next_review` required) and `0002` (check constraints `ease_factor >= 130`, `repetitions >= 0`), applied to the test, dev and real databases (all `review_state` tables were empty). `0000` was never edited.
4. `lib/attempts.ts`, `lib/queries.ts`, `lib/validate.ts` and the routes, plus a new `lib/api-shape.ts` that shows the ease factor as a decimal. `status=retired` is now a 400, and progress has no `retired` count.
5. Other tests (`attempts`, `queries`, `routes`, `test-database`, `validate`, new `schema` and `api-shape`) updated or added, with dates recomputed from the new worked example.
6. Verification. `npm run check` passes (lint, typecheck, 228 tests). Six deliberate breaks of the API and query logic were all caught. The curl check against a production build on the dev database matched the spec's worked example line by line, including an early Easy, a same-day repeat, undo, and a failure on a mastered problem. The dev and real databases were left clean.
7. Docs. The spec's DRAFT banner is gone, its decisions are marked confirmed, and this plan is updated.

## Stage 5: Today screen (`/today`)

Build the due list with title (linked out), pattern, days overdue, and the saved insight hidden behind Reveal. Each row has three rating buttons that log today's attempt in one click. The header shows the due count and solved count (e.g. `42 / 250`). An Undo toast (about 5 seconds) deletes the attempt just logged. "Show all" appears beyond 10 rows, and an empty state says "Nothing due today".

Tests first (adjusted by U1): the list state logic: rating removes a row and updates counts, Undo puts it back in order, a failed request restores the row, "Show all" toggles the limit.
Also: a thin check that the page's data call matches `GET /api/review/due`.

Check: rate a problem and watch it leave the list with a new date; Undo brings it back; a rating takes under 10 seconds from opening the app.

## Stage 5b: Real data (if U4 is accepted)

Build `scripts/fetch-neetcode250.ts`, a one-time pull from neetcode.io into `data/neetcode250.json`, and print a summary for your review: total, count per pattern, a few random entries. Nothing is written from memory. If neetcode.io blocks the pull, you paste the list instead.
Seed it into the real database only after you've approved the summary.

Tests first: the importer's parsing of a saved sample page (no network in tests); `seed.ts` already enforces exactly 250 entries.
Check: `npm run seed` loads 250; running it twice still gives 250; insights survive.

## Stage 6: Problems and detail (`/`, `/problems/[id]`)

- **Problems.** All problems, with filters for pattern, difficulty and status (unsolved, in review, mastered), title search, link out. Filters live in the URL so a filtered view can be bookmarked.
- **Detail.** Problem info, current schedule, editable insight, attempt history with a delete button per row, and the log form (rating, optional minutes, insight, optional date). The form warns before an Easy that won't count ("Not due until Nov 20, so an Easy won't change the schedule").

Tests first: the early-Easy warning rule (a pure function using the scheduler), filter parsing from the URL, history delete restoring state (already covered by the API tests).
Check: filters combine correctly; deleting the only attempt makes the problem unsolved again.

## Stage 7: Progress (`/progress`)

Per-pattern bars (solved, mastered, due), the last-7-days attempt count, overall totals.

Tests first: totals on this screen equal the Problems screen's counts for the same data (one shared query, so they cannot drift).
Check: totals match the Problems screen with real data.

## Stages 8 to 11: a standalone desktop app (replaces the old Stage 8)

Goal: a "NeetCode Tracker" desktop app for one person on this Mac. SQLite instead of Postgres, wrapped in Electron. No phone use, code signing, auto-update or start at login. One window that quits when closed. Dropped from the old Stage 8: launchd, `npm run deploy`, the web app manifest.

### Stage 8: Switch to SQLite (still a normal Next app in the browser)

- Driver `@libsql/client` on Drizzle 0.45. Postgres is removed completely (`pg`, the Docker test database, the old migrations). SQLite starts from one baseline migration.
- `DATABASE_PATH` (required, no default) names the SQLite file. Four files:
  - Real: `~/Library/Application Support/NeetCode Tracker/neetcode-tracker.db` (`npm start`). Not created until the whole app is finished.
  - Dev: `data/dev.db`, git-ignored, 5 fixture problems (`npm run dev`).
  - Sandbox: `data/sandbox.db`, git-ignored, for manual checks. `npm run sandbox:fill` rebuilds it with the 250 problems and sample attempts; `npm run start:sandbox` serves it on port 3002.
  - Tests: one `*.test.db` temp file per test file, deleted afterwards, behind a guard that refuses anything else.
- At startup (`instrumentation.ts`): back up (at most daily, keep 7, always before a pending migration), apply migrations, upsert the problem list.
- Tests first for backup, startup and foreign keys. Existing tests keep their expected values. Allowed test edits: the test setup, the database guard and its tests, and the database-specific parts of `tests/schema.test.ts`, `tests/seed.test.ts` and `tests/test-database.test.ts`, each shown for approval first.
- Your Postgres databases are left alone. Dropping them is asked about again once the app is in use.

Check: `npm run check` passes; the app shows the same numbers on the sandbox database as it did on Postgres.

### Stage 9: Electron spike (throwaway branch, not merged)

A standalone Next build, started by the app on a free `127.0.0.1` port, loaded in one window, built with plain `@electron/packager`.

Passes only if all four work: a double-click opens a window; Problems, Today and Progress load; an attempt writes to a SQLite file outside the app bundle; migrations run on an empty file. Stop and report once the three fallbacks are used up (the alternative build flag, the local signing command, Electron Forge). If it fails, keep the SQLite app in the browser and return to the manifest idea.

### Stage 10: The Electron app

Code in `electron/`, sharing the one `package.json`. App icon. One command builds the app and replaces the copy in `/Applications`. A database-path override so the app can be tried from the terminal against the sandbox file. Development stays `npm run dev` in a browser plus `npm run check`.

### Stage 11: Error pages and README

Readable error pages and a README a fresh clone can follow. Real attempts start after this stage.

Open risks (researched, not yet proven on a packaged app): whether the standalone build includes the native SQLite package; shipping the migrations folder and seed file with the app; whether an unsigned build launches on Apple Silicon without the local signing fallback.

## Definition of done (v1)

From the spec's acceptance checklist:
- [ ] 250 problems seeded, safe to re-run, insights survive
- [ ] Logging an attempt creates the attempt and the right schedule; Undo and history deletes restore the prior state
- [ ] Today shows only due problems, most overdue first, Hard first on ties
- [ ] Progress totals match the Problems screen
- [ ] The app opens from the Dock as its own window, with no editor or terminal open
- [ ] Not reachable from another device; real database has no fixture rows
- [ ] README lets a fresh clone run it
- [ ] Logging an attempt takes under 10 seconds; opening the app each morning shows an accurate list

## Risks and things to watch

- **Time zones and "today".** Everything uses the local calendar date at midnight. The scheduler never reads the clock, so every date rule is testable.
- **Next.js 16 differences.** `AGENTS.md` says this version differs from what I know, so I read the bundled docs in `node_modules/next/dist/docs/` before writing routes or pages.
- **The UI is the least-tested layer.** We chose U1 (a): only the pure logic is tested, and the React wiring is checked by hand.
- **Public repo.** No personal data, no `.env` files; commits use the GitHub noreply email.

## Not in v1

Accounts or sync, notifications, importing progress from NeetCode or LeetCode, scheduling beyond SM-2, an in-app code editor, editing attempts (delete and re-log instead).
