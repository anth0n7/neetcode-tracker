# NeetCode 250 Tracker build spec

A single-user web app that tracks the NeetCode 250 problem list and shows each day which solved problems to review again.

## Core features

- Mark a problem solved and rate the attempt: **Easy**, **Struggled**, or **Needed solution**.
- Save a one-line key insight per problem (the idea, not the code).
- A **Due today** screen driven by the SM-2 spaced-repetition algorithm.
- Progress by pattern, so weak areas are visible.

**Done when** the 250 problems are seeded, logging an attempt takes under 10 seconds, and opening the app each morning shows an accurate review list.

**Users:** one person, running locally. No sign-up, no multi-user support.

---

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router) + TypeScript |
| Database | Local PostgreSQL 17 (Homebrew), database `neetcode_tracker` |
| Queries | Drizzle ORM on node-postgres (`pg`) |
| Styling | Tailwind CSS |
| Tests | Vitest |

### Layout

```
/app                        pages: /, /problems, /problems/[id], /progress
/app/api                    route handlers
/lib/scheduler.ts           pure scheduling functions (no DB, no clock)
/lib/db.ts                  connection and queries
/lib/config.ts              constants (DUE_LIMIT = 10)
/db/schema.ts               table definitions
/data/neetcode250.json      real seed file (committed)
/data/fixture.json          ~5-problem fixture for development
/scripts/fetch-neetcode250.ts  one-time pull from neetcode.io
/scripts/seed.ts            upserts a seed file into the database
/scripts/install-launchd.sh writes the login agent
/tests/scheduler.test.ts
/docs/SPEC.md               this file
```

`scheduler.ts` takes `today` as a parameter and never reads the clock or the database.

---

## Running it

### Two databases

| Database | Env file | Used by | Seeded with |
|---|---|---|---|
| `neetcode_tracker` | `.env.local` | `npm start`, `npm run deploy`, `npm run seed` | `data/neetcode250.json` only |
| `neetcode_tracker_dev` | `.env.development.local` | `npm run dev`, `npm run db:migrate:dev`, `npm run seed:dev` | `data/fixture.json` |

Next.js loads `.env.development.local` over `.env.local` under `next dev`. Scripts that run outside Next (seed, Drizzle migrations) load the env file explicitly with `@next/env`'s `loadEnvConfig(dir, dev)`, so `seed:dev` and `db:migrate:dev` pass `dev = true`. `seed.ts` refuses to load `fixture.json` unless the target database name ends in `_dev` or `_test` (the automated tests' database), so fixture rows can never reach the real database.

### Steps

1. **One-time setup.** Run `createdb neetcode_tracker` and `createdb neetcode_tracker_dev`. Put `DATABASE_URL=postgres://localhost:5432/neetcode_tracker` in `.env.local` and `DATABASE_URL=postgres://localhost:5432/neetcode_tracker_dev` in `.env.development.local`. Run migrations on both, then `npm run seed:dev` (fixture). Seed the real database only once the real list exists.
2. **Development.** `npm run dev` runs `next dev -p 3001 -H 127.0.0.1`, so it never collides with the always-running app on 3000.
3. **Deploy.** `npm run deploy` runs migrations on the real database, `next build`, then `launchctl kickstart -k gui/$UID/<label>` to restart the agent.
4. **Auto-start.** `scripts/install-launchd.sh` writes a LaunchAgent into `~/Library/LaunchAgents` that runs `npm start` at login with `KeepAlive`. It uses absolute paths (`/usr/local/bin/node` and the project directory) because launchd does not load the shell profile. Logs go to `~/Library/Logs/neetcode-tracker/`. Postgres is already a Homebrew launchd service, so it is up at login.
5. **Localhost only.** `npm start` runs `next start -p 3000 -H 127.0.0.1` (the agent calls `npm start`, so it inherits this). Without that flag, `next start` listens on all interfaces. The app has no login and has delete endpoints, so anyone on the same network could change the data.
6. **App feel.** A web app manifest and icon, so Chrome's *Install app* or Safari's *Add to Dock* opens it in its own window.

---

## Data model

### `problems` (seed fields and one user field)

| Field | Type | Notes |
|---|---|---|
| id | integer PK | Stable id from the seed file |
| position | integer | Order in the NeetCode list |
| title | text | e.g. "Two Sum" |
| slug | text unique | **LeetCode** slug |
| url | text | **neetcode.io** problem link |
| pattern | text | e.g. "Sliding Window" |
| difficulty | text | Easy, Medium, or Hard |
| insight | text, nullable | Current key insight (user-owned) |

The seed upsert writes only the seed fields; it never touches `insight`.

### `attempts` (append-only history; rows can be deleted, never edited)

| Field | Type | Notes |
|---|---|---|
| id | integer PK | |
| problem_id | integer FK to problems.id | |
| attempted_on | date | Defaults to today; never in the future |
| rating | text | `easy`, `struggled`, `needed_solution` |
| minutes | integer, nullable | Optional timer value |
| insight | text, nullable | Insight as written at this attempt (history) |

### `review_state` (one row per problem with at least one attempt)

| Field | Type | Notes |
|---|---|---|
| problem_id | integer PK, FK | |
| interval_days | integer | Current gap between reviews, in whole days |
| ease_factor | integer | SM-2 ease factor in **hundredths** (250 = 2.50); never below 130 |
| repetitions | integer | Passes in a row since the last failure (SM-2's `n`) |
| next_review | date | Due when this is today or earlier |
| last_reviewed | date | Date of the latest attempt |
| times_reviewed | integer | Count of all attempts, including early ones |

`review_state` is a derived cache. It is always the output of `replay()` over the problem's attempts (see below) and is never updated incrementally.

There is no `status` column. The status is worked out from the row (see below), so there is one source of truth. The database itself enforces `ease_factor >= 130` and `repetitions >= 0` (check constraints), as a safety net in case code ever writes a bad schedule.

The ease factor is stored as a whole number of hundredths so the rounding is exact. With a decimal, 45 x 2.90 could come out as 130.49999 and round the wrong way; with integers it is always exactly 130.5, which rounds up to 131.

### Insight rules

- Logging an attempt with a non-empty insight copies it to `problems.insight`.
- `PATCH /insight` edits `problems.insight` directly.
- Deleting an attempt never changes `problems.insight`.

### Problem status (for filters and progress)

| Status | Meaning |
|---|---|
| unsolved | no `review_state` row |
| in review | has a row and `interval_days` is under 28 |
| mastered | has a row and `interval_days` is 28 or more (still scheduled; it comes back when due) |

"Solved" = any status other than unsolved. There is no "retired" status. SM-2 keeps every problem scheduled, at gaps that keep growing.

---

## Seed data

The list is never written from memory.

1. `scripts/fetch-neetcode250.ts` pulls the NeetCode 250 list from neetcode.io's public pages into `data/neetcode250.json`, then prints a summary (total, count per pattern, a few random entries) for a human check. If neetcode.io blocks the pull, the list is copied in by hand instead.
2. Entry shape:
   ```json
   {
     "id": 1,
     "position": 1,
     "title": "Contains Duplicate",
     "slug": "contains-duplicate",
     "url": "https://neetcode.io/problems/duplicate-integer",
     "pattern": "Arrays & Hashing",
     "difficulty": "Easy"
   }
   ```
3. `scripts/seed.ts <file>` upserts by id; re-running never duplicates rows or touches attempts or insights.
4. It fails if any entry is missing a field. For `neetcode250.json` it also fails unless there are exactly 250 entries. `data/fixture.json` (~5 problems) is exempt from the count, is used for development until the real list exists, and may only be seeded into a throwaway database (a name ending in `_dev` or `_test`).

---

## Scheduling rules (SM-2)

All logic lives in `lib/scheduler.ts`. "Today" is the local calendar date, rolling over at **midnight**. Dates are `YYYY-MM-DD`.

### Decisions

SM-2 (SuperMemo 2) was designed for flashcards graded 0 to 5. Adapting it to three buttons and to coding problems involves choices. All of them are confirmed and implemented, and the Recommended column holds the answer that was chosen. The goal is to stay as close to the original SM-2 as possible, except where you chose otherwise (D3).

| # | Decision | Recommended | Alternative | Status |
|---|---|---|---|---|
| D1 | Rating to SM-2 quality (0 to 5) | Easy = 5, Struggled = 3 (a pass, barely), Needed solution = 1 (a fail) | Struggled = 2, so both non-Easy ratings fail, which is closest to today's behaviour | **Confirmed** (the original grade meanings: 5 perfect, 3 correct with serious difficulty, 1 incorrect but remembered on seeing the answer) |
| D2 | What a failure does | Repetitions back to 0, next review in 1 day, ease factor **unchanged** (the original SM-2 wording) | Also lower the ease factor by the formula (it would fall by 0.54 per fail) | **Confirmed** (the original wording, step 6) |
| D3 | Reviewing before it is due | A failure always applies; a pass is logged but changes nothing (today's rule) | Treat every review the same, which lets cramming inflate the ease factor | **Confirmed** |
| D4 | "Mastered" and "retired" | Drop "retired" and the 90-day recheck. "Mastered" becomes a label for a scheduled gap of 28+ days. No maximum gap | Keep a "retired" state after some gap; or cap the gap (e.g. 180 days) | **Confirmed** (drop retired) |
| D5 | Schema | New migration: add `ease_factor` (integer, hundredths) and `repetitions`; drop `status`; make `next_review` NOT NULL; check constraints `ease_factor >= 130` and `repetitions >= 0` | Keep a stored `status` column | **Confirmed** (migrations `0001`, `0002`) |
| D6 | API | `reviewState` gains `easeFactor` and `repetitions` and loses `status`; filter `status=retired` is no longer valid; progress loses its `retired` counts | Keep `retired` in the API as always zero | **Confirmed** (implemented) |
| D7 | Existing tests | Replace the scheduler tests that encode rules we are removing (7/14/28/90-day ladder, "retired"); update the other tests' setup | Keep both rule sets (not recommended) | **Confirmed** (tests may be replaced, red first) |
| D8 | Same-day repeats | Logged but change nothing (this replaces step 7 of the original, which repeats items graded below 4 until they score 4 or more) | Keep a same-day relearn queue on the Today screen | **Confirmed** |
| D9 | Which ease factor builds the next gap | The one from **before** this review's update | The one after the update | **Confirmed** |

### The algorithm

SM-2 keeps three numbers per problem: the gap in days (`interval_days`), how many passes in a row (`repetitions`), and the **ease factor** (EF), how quickly the gap should grow. A new problem starts at EF 2.50.

**Quality.** Each rating becomes an SM-2 quality `q`:

| Rating | q | Counts as |
|---|---|---|
| Easy | 5 | pass |
| Struggled | 3 | pass (barely) |
| Needed solution | 1 | fail |

A pass is `q >= 3`. Next review is the attempt's date plus the new interval (so a backdated attempt schedules from its own date).

**Applying one attempt.** Let `prev` be the current state (none for an unsolved problem) and `d` the attempt's `attempted_on`.

1. **Same-day repeat** (the problem already has an attempt on `d`): the attempt is logged (it counts in `times_reviewed`) but changes nothing. The first attempt of a day decides; later ones that day are only recorded. (A repeat pass would be early anyway, so in practice this only matters for failures.)
2. **Fail** (`q < 3`): `repetitions = 0`, `interval = 1`, EF unchanged (250 if this is the first attempt). This applies even before the problem is due and even if its gap was long (unless it is a same-day repeat, rule 1).
3. **Early pass** (not the first attempt and `d < prev.next_review`): the attempt is logged (it counts in `times_reviewed` and sets `last_reviewed`) but the schedule does not change.
4. **Pass that counts** (first attempt, or `d >= prev.next_review`):
   - `repetitions` was 0: `interval = 1`
   - `repetitions` was 1: `interval = 6`
   - otherwise: `interval = round(prev.interval x prev.EF)`, using the EF from **before** this review, rounded half up
   - then `repetitions + 1`, and the EF is updated: `EF = EF + (0.1 - (5 - q) x (0.08 + (5 - q) x 0.02))`, never below 1.30

In whole hundredths the EF change is `10 - (5 - q) x (8 + (5 - q) x 2)`, which is +10 for Easy and -14 for Struggled.

Status (for filters and progress) comes from the row. No row means unsolved, `interval_days < 28` means in review, and `interval_days >= 28` means mastered.

### How this differs from the original SM-2

The original (Wozniak, 1990) has seven steps. Steps 1 to 6 are implemented as written, with these adaptations and ambiguities:

- **Three buttons, not six grades.** Easy = 5, Struggled = 3, Needed solution = 1 (original meanings: 5 perfect response; 3 correct response recalled with serious difficulty; 1 incorrect response, but remembered on seeing the answer). Grades 0, 2 and 4 are not used.
- **Early reviews (your choice, D3).** The original has no concept of an early review. Here a failure always applies and a pass before the due date is logged but changes nothing.
- **Failure and the ease factor.** Step 6 says to start the item over "without changing the E-Factor", so a failure leaves it as it is. Step 5 could be read as updating it after every repetition; some implementations do. This spec follows the step 6 wording.
- **Which ease factor builds the next gap.** The original does not say whether the interval uses the factor from before or after this review's update. This spec uses the factor from **before** (D9, confirmed; also what the widely used reference pseudocode does).
- **Whole days and exact rounding.** The original multiplies freely; here gaps are whole days, rounded half up, using whole hundredths for the ease factor.
- **"Mastered" is only a label** (gap of 28+ days). It does not change the schedule. The original has no end point, and neither does this.
- **Step 7 is replaced** (D8). The original repeats, on the same day, items graded below 4 until they score 4 or more. Here a same-day repeat is logged but changes nothing.

### Replay

`replay(attempts) -> reviewState | null` sorts attempts by `attempted_on`, then `id`, and folds the rule above over them. With no attempts it returns `null`, which means the problem is unsolved and the row is deleted.

Every write (log attempt, delete attempt) runs in one transaction. The transaction writes the attempt change, loads the problem's attempts, calls `replay()`, then upserts or deletes the `review_state` row.

### Due logic

- Due when `next_review <= today`. Every problem with a row is eventually due again.
- Sort: most overdue first, then Hard before Medium before Easy, then list position.
- Missed days are not rescheduled; the problem shows as overdue.
- Show at most `DUE_LIMIT` (10) by default, with a "Show all" toggle.

### Worked example

| Day | Rating | q | Repetitions | New interval | EF | Next review | Note |
|---|---|---|---|---|---|---|---|
| 0 | Needed solution | 1 | 0 | 1 | 2.50 | Day 1 | first attempt, a fail |
| 1 | Struggled | 3 | 1 | 1 | 2.36 | Day 2 | pass, EF -0.14 |
| 2 | Easy | 5 | 2 | 6 | 2.46 | Day 8 | second pass is always 6 days |
| 8 | Easy | 5 | 3 | 15 | 2.56 | Day 23 | round(6 x 2.46) = 15 |
| 23 | Easy | 5 | 4 | 38 | 2.66 | Day 61 | round(15 x 2.56) = 38; mastered |
| 61 | Easy | 5 | 5 | 101 | 2.76 | Day 162 | round(38 x 2.66) = 101 |

Variations:
- An Easy on day 20 (before Day 23) is logged but changes nothing.
- A second attempt on the same day as an earlier one is logged but changes nothing, even a Needed solution.
- A Needed solution on day 100 (while mastered) gives repetitions 0, interval 1, next review Day 101, EF still 2.76.
- First attempt Easy gives Day 1, then Day 7 (interval 6), then Day 23 (interval 16), then interval 45 (EF 2.80 and 2.90).
- Struggled on every review lowers the EF by 0.14 each time until it hits the 1.30 floor (after 9 reviews).
- Rounding: 45 x 2.90 = 130.5 rounds up to 131.

---

## Screens

| Screen | Route | Contents |
|---|---|---|
| Problems (home) | `/` | All 250 grouped by pattern, each group with its solved count and progress bar. Filters for pattern, difficulty, status (unsolved, in review, mastered) and title search. Links to neetcode.io. `/problems` redirects here. |
| Today | `/today` | Due problems: title, pattern, days overdue, insight hidden behind "Reveal". Three rating buttons per row (one click logs the attempt for today). Header: due count and solved count (e.g. 42 / 250). With nothing solved yet, it points to the Problems page. |
| Problem detail | `/problems/[id]` | Problem info, current state, editable insight, attempt history with a delete button per row, and a form to log an attempt (rating, optional minutes, insight, optional date). |
| Progress | `/progress` | Per-pattern bars: solved, mastered, due. Attempts in the last 7 days. |

### Behavior

- After a rating on Today, the row leaves the list without a full reload and an Undo toast shows for about 5 seconds. Undo deletes that attempt (replay restores the state) and the row returns.
- On the detail form, if Easy is selected and the problem is not due, show: "Not due until <date>, so an Easy rating won't change the schedule."
- Deleting the only attempt returns the problem to unsolved.
- Unsolved problems never appear in Today.

---

## API

JSON route handlers under `/app/api`. Dates are `YYYY-MM-DD`.

| Method and path | Purpose | Body / query |
|---|---|---|
| GET `/api/problems` | List with status and next_review | `pattern`, `difficulty`, `status`, `q` |
| GET `/api/problems/:id` | One problem with attempts and review state | |
| POST `/api/problems/:id/attempts` | Log an attempt, replay | `rating`, `minutes?`, `insight?`, `attempted_on?` |
| DELETE `/api/problems/:id/attempts/:attemptId` | Delete an attempt, replay | |
| PATCH `/api/problems/:id/insight` | Edit `problems.insight` | `insight` |
| GET `/api/review/due` | Due today or earlier | `limit?`, `all?` |
| GET `/api/progress` | Per-pattern counts | |

Validation: `rating` must be `easy`, `struggled`, or `needed_solution` (400); a future or impossible `attempted_on` is 400; unknown problem ids, or an attempt id that does not belong to the problem, return 404.

### API details

- **Review state shape.** `reviewState` is `{ intervalDays, easeFactor, repetitions, nextReview, lastReviewed, timesReviewed }`. `easeFactor` is shown as a decimal (2.5), though it is stored in hundredths. There is no `status` field; problem rows carry a derived `status` of `unsolved`, `in review` or `mastered`, and the `status` filter accepts those three.
- **Naming.** Request bodies use `attempted_on` (as above); every response uses camelCase (`nextReview`, `intervalDays`, `daysOverdue`, ...).
- **Responses.** Errors are `{ "error": "message" }`. `POST .../attempts` returns `201 { attemptId, reviewState }` (the `attemptId` is what Undo deletes). `DELETE` returns `{ reviewState }` (`null` when the problem went back to unsolved). `PATCH .../insight` returns `{ insight }`. `GET /api/review/due` returns `{ total, items }`, where `total` is the full due count and `items` is cut to the limit. `GET /api/progress` returns `{ totals, patterns }`, with patterns in NeetCode order and `totals.attemptsLast7Days` counting today and the 6 days before.
- **Bad input.** All fields are checked before the database is touched, so a bad request saves nothing. Malformed or non-numeric ids are 404. `insight` is trimmed, at most 500 characters, and blank means "none"; `PATCH` requires the `insight` field to be present. `minutes` is a whole number from 0 to 1440.
- **Request safety.** The app has no login, so every route rejects (403) any request whose `Host` is not `localhost`, `127.0.0.1` or `[::1]` (this stops DNS rebinding). Requests that change data (POST, PATCH, DELETE) are also rejected if a browser says they came from another origin (`Origin` differs from `Host`, or `Sec-Fetch-Site` is not `same-origin`/`none`). Requests with no `Origin` (curl, scripts) are allowed.
- **Concurrency.** Logging or deleting an attempt locks the problem's row for the length of its transaction, so two simultaneous requests for one problem take turns.
- **Today.** "Today" is the local calendar date (`lib/today.ts`), rolling over at midnight. Only the routes call it; the scheduler is always handed the date.
- **Caching.** `cacheComponents` is switched off in `next.config.ts`, so routes always run fresh. All API routes build as dynamic.

---

## Build order

Explain the plan before each stage; check each before starting the next. Git follows `CLAUDE.md` (work on a branch; never commit or push unless asked).

1. **Setup.** Next.js, Tailwind, Drizzle, Vitest, both databases and both env files, dev on 127.0.0.1:3001, start on 127.0.0.1:3000. Create the public GitHub repo `neetcode-tracker` and push. *Check:* dev server runs and a test passes.
2. **Schema and seed.** Three tables, `seed.ts`, `fixture.json`. *Check:* seeding the fixture into the dev database twice leaves the same rows; insights survive a re-seed; seeding the fixture against `neetcode_tracker` is refused.
3. **Scheduler.** `applyAttempt` and `replay` with tests. *Check:* all scheduler tests pass.
4. **API.** All endpoints, writes in one transaction with replay. *Check:* curl a sequence of attempts and a delete; `next_review` matches the rules.
5. **Today screen.** Due list, Reveal, rating buttons, Undo toast. *Check:* rating removes the row and updates its date; Undo restores it.
6. **Problems and detail.** Filters, search, history with delete, insight editing, early-Easy warning. *Check:* filters combine correctly.
7. **Progress.** Per-pattern counts. *Check:* totals match the Problems screen.
8. **Real data and polish.** Fetch and verify the 250 list, seed it, empty states, errors, `install-launchd.sh`, `npm run deploy`, logging, manifest, README. *Check:* a fresh clone runs by following the README.

**SM-2 switch (done, between stages 4 and 5).** Scheduler tests came first, then `lib/scheduler.ts`, then new migrations `0001` (SM-2 columns) and `0002` (value checks), never editing `0000`; `attempts.ts`, `queries.ts`, validation and the API moved to the new shape; the stage 4 curl check re-run against a production build and matching the worked example. See `plan.md`.

---

## Tests

### Scheduler

- First attempt: Easy gives interval 1, repetitions 1, EF 2.60. Struggled gives interval 1, repetitions 1, EF 2.36. Needed solution gives interval 1, repetitions 0, EF 2.50.
- The worked example produces exactly its table, including mastered on day 23.
- Second pass in a row gives 6 days; later passes give `round(interval x EF)`.
- Rounding is exact and half rounds up (45 x 2.90 = 131).
- The EF never goes below 1.30, even after many Struggled ratings.
- A failure leaves the EF unchanged, resets repetitions to 0 and the interval to 1.
- A failure always applies: before the due date, and on a mastered problem (but not as a same-day repeat).
- An early pass is logged (`times_reviewed`, `last_reviewed`) but changes nothing else.
- A second attempt on the same day is logged but changes nothing, including a failure; the first attempt of the day decides; deleting it lets the next one count.
- An overdue pass counts and schedules from `attempted_on`.
- Replay sorts by date then id, so out-of-order and same-day attempts give the same result.
- Replay of no attempts returns null; replaying the first n - 1 attempts restores the previous row.
- Due on its `next_review` date and not the day before; a problem of any gap becomes due again.
- Status is derived: no row = unsolved; interval 27 = in review; interval 28 = mastered.

### Test layout

- `tests/scheduler.test.ts`, `today.test.ts`, `validate.test.ts`, `request-check.test.ts`: pure unit tests, no database.
- `tests/attempts.test.ts`, `queries.test.ts`: database tests run inside a transaction that is always rolled back, using throwaway problems with high ids.
- `tests/routes.test.ts`: calls the real route handlers; creates its three throwaway problems before each test.
- `tests/seed.test.ts`: runs the seed script as a command against the test database.
- `tests/test-database.test.ts`: a small end-to-end example proving the test database, migrations and per-test reset work.
- `tests/schema.test.ts`: the shape of `review_state` after the migrations (columns, required fields, no `status`) and its two check constraints.
- `tests/api-shape.test.ts`: the ease factor shown to API clients as a decimal.

### Test database

Tests never touch the dev or real database. They use a throwaway Postgres 17 in Docker (`docker-compose.test.yml`): port 5433, bound to 127.0.0.1, storage in memory (tmpfs), so stopping it wipes everything.

- `tests/test-db.ts` holds the one allowed URL (`postgres://test:test@localhost:5433/neetcode_tracker_test`) and a guard that throws unless host, port and database name all match exactly. There is no environment variable to override it.
- `tests/global-setup.ts` runs once: it checks the guard, confirms `current_database()`, and applies the migrations in `/drizzle`.
- `tests/setup-env.ts` points `DATABASE_URL` at the test database for every test file (and re-checks the guard).
- `tests/setup-db.ts` truncates every table in the `public` schema before every test.
- No mocking of the database anywhere.

### Commands

- `npm run check`: lint, then typecheck, then start the test database (`test:db:up`), then all tests; stops at the first failure. Needs Docker running.
- `npm run test:db:up` / `npm run test:db:down`: start / stop (and wipe) the test database.
- `npm test`: just the tests (the test database must already be up).

### Acceptance checklist

- [ ] Seed loads exactly 250 problems and is safe to re-run; insights survive.
- [ ] Logging an attempt creates an attempt row and the correct review_state row.
- [ ] Deleting an attempt (Undo or history) restores the prior state; deleting the last one makes the problem unsolved.
- [ ] Today shows only problems due today or earlier, most overdue first, Hard first on ties.
- [ ] Progress totals match the Problems screen.
- [ ] After a restart, the app is available at localhost:3000 without opening an editor.
- [ ] The app is not reachable from another device on the network (listens on 127.0.0.1 only).
- [ ] The real database contains no fixture rows.
- [ ] The README lets a fresh clone run the app.

---

## Out of scope for v1

- User accounts, sync across devices, or hosting
- Notifications or email reminders
- Importing progress from NeetCode or LeetCode
- Scheduling beyond SM-2 (e.g. FSRS, per-pattern tuning)
- An in-app code editor or test runner
- Editing attempts (delete and re-log instead)
