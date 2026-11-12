# NeetCode 250 Tracker – Build Spec

A single-user web app that tracks the NeetCode 250 problem list and shows each day which solved problems to review again.

## Core features

- Mark a problem solved and rate the attempt: **Easy**, **Struggled**, or **Needed solution**.
- Save a one-line key insight per problem (the idea, not the code).
- A **Due today** screen driven by a simple spaced-repetition schedule.
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

Next.js loads `.env.development.local` over `.env.local` under `next dev`. Scripts run outside Next (seed, Drizzle migrations) load the env file explicitly via `@next/env`'s `loadEnvConfig(dir, dev)`, so `seed:dev` / `db:migrate:dev` pass `dev = true`. `seed.ts` refuses to load `fixture.json` unless the target database name ends in `_dev`, so fixture rows can never reach the real database.

### Steps

1. **One-time setup.** `createdb neetcode_tracker` and `createdb neetcode_tracker_dev`; put `DATABASE_URL=postgres://localhost:5432/neetcode_tracker` in `.env.local` and `DATABASE_URL=postgres://localhost:5432/neetcode_tracker_dev` in `.env.development.local`; run migrations on both; `npm run seed:dev` (fixture). The real database is seeded only once the real list exists.
2. **Development.** `npm run dev` runs `next dev -p 3001 -H 127.0.0.1`, so it never collides with the always-running app on 3000.
3. **Deploy.** `npm run deploy` runs migrations on the real database, `next build`, then `launchctl kickstart -k gui/$UID/<label>` to restart the agent.
4. **Auto-start.** `scripts/install-launchd.sh` writes a LaunchAgent into `~/Library/LaunchAgents` that runs `npm start` at login with `KeepAlive`. It uses absolute paths (`/usr/local/bin/node`, project dir) because launchd does not load the shell profile. Logs go to `~/Library/Logs/neetcode-tracker/`. Postgres is already a Homebrew launchd service, so it is up at login.
5. **Localhost only.** `npm start` runs `next start -p 3000 -H 127.0.0.1` (the agent calls `npm start`, so it inherits this). `next start` otherwise listens on all interfaces, and the app has no login and has delete endpoints, so anyone on the same network could change the data.
6. **App feel.** A web app manifest and icon, so Chrome's *Install app* or Safari's *Add to Dock* opens it in its own window.

---

## Data model

### `problems` (seed fields + one user field)

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
| problem_id | integer FK → problems.id | |
| attempted_on | date | Defaults to today; never in the future |
| rating | text | `easy`, `struggled`, `needed_solution` |
| minutes | integer, nullable | Optional timer value |
| insight | text, nullable | Insight as written at this attempt (history) |

### `review_state` (one row per problem with at least one attempt)

| Field | Type | Notes |
|---|---|---|
| problem_id | integer PK, FK | |
| interval_days | integer | Current gap |
| next_review | date, nullable | `null` only when retired |
| last_reviewed | date | Date of the latest attempt |
| times_reviewed | integer | Count of attempts |
| status | text | `in_review`, `mastered`, `retired` |

`review_state` is a **derived cache**: it is always the output of `replay()` over the problem's attempts (see below). It is never updated incrementally.

### Insight rules

- Logging an attempt with a non-empty insight copies it to `problems.insight`.
- `PATCH /insight` edits `problems.insight` directly.
- Deleting an attempt never changes `problems.insight`.

### Problem status (for filters and progress)

| Status | Meaning |
|---|---|
| unsolved | no `review_state` row |
| in review | `status = in_review` |
| mastered | `status = mastered` (passed the 28-day review; waiting on the 90-day recheck) |
| retired | `status = retired` (passed the 90-day recheck) |

"Solved" = any status other than unsolved.

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
4. It fails if any entry is missing a field. For `neetcode250.json` it also fails unless there are exactly 250 entries. `data/fixture.json` (~5 problems) is exempt from the count, is used for development until the real list exists, and may only be seeded into `neetcode_tracker_dev`.

---

## Scheduling rules

All logic lives in `lib/scheduler.ts`. "Today" is the local calendar date, rolling over at **midnight**. Dates are `YYYY-MM-DD`.

### Applying one attempt to a state

Let `prev` be the current state (none for an unsolved problem) and `d` the attempt's `attempted_on`.

| Rating | Condition | New interval | Status | next_review |
|---|---|---|---|---|
| Needed solution | always | 2 | in_review | d + 2 |
| Struggled | always | 3 | in_review | d + 3 |
| Easy | first attempt (no prev) | 7 | in_review | d + 7 |
| Easy | prev is retired, or `d < prev.next_review` (not due) | unchanged | unchanged | unchanged |
| Easy | due, prev interval = 90 | 90 | **retired** | `null` |
| Easy | due, prev interval = 28 | 90 | **mastered** | d + 90 |
| Easy | due, otherwise | max(7, prev × 2) | in_review | d + interval |

- Failures (Needed solution, Struggled) always apply, whether or not the problem was due, and from any status including mastered and retired.
- An early Easy is still logged (counts toward `times_reviewed`, updates `last_reviewed`) but leaves the schedule alone.
- Intervals therefore only take the values 2, 3, 7, 14, 28, 90.
- Next review counts from `attempted_on`, so a backdated attempt schedules from its own date.

### Replay

`replay(attempts) → reviewState | null` sorts attempts by `attempted_on`, then `id`, and folds the rule above over them. No attempts → `null` (problem is unsolved, the row is deleted).

Every write (log attempt, delete attempt) runs in one transaction: write the attempt change → load the problem's attempts → `replay()` → upsert or delete `review_state`.

### Due logic

- Due when `next_review <= today` (retired is never due; mastered problems reappear for the 90-day recheck).
- Sort: most overdue first, then Hard → Medium → Easy, then list position.
- Missed days are not rescheduled; the problem shows as overdue.
- Show at most `DUE_LIMIT` (10) by default, with a "Show all" toggle.

### Worked example

| Day | Rating | Prev interval | New interval | Next review | Status |
|---|---|---|---|---|---|
| 0 | Needed solution | — | 2 | Day 2 | in_review (first solve) |
| 2 | Struggled | 2 | 3 | Day 5 | in_review (reset) |
| 5 | Easy | 3 | 7 | Day 12 | in_review, max(7, 6) |
| 12 | Easy | 7 | 14 | Day 26 | in_review |
| 26 | Easy | 14 | 28 | Day 54 | in_review (still due-able) |
| 54 | Easy | 28 | 90 | Day 144 | **mastered** |
| 144 | Easy | 90 | 90 | — | **retired** |

Variations:
- An Easy on day 20 (before Day 26) is logged but changes nothing.
- A Struggled on day 100 (while mastered) gives interval 3, next review Day 103, status in_review.

---

## Screens

| Screen | Route | Contents |
|---|---|---|
| Today | `/` | Due problems: title, pattern, days overdue, insight hidden behind "Reveal". Three rating buttons per row (one click logs the attempt for today). Header: due count and solved count (e.g. 42 / 250). |
| Problems | `/problems` | All 250 with filters for pattern, difficulty, status (unsolved, in review, mastered, retired) and title search. Links to neetcode.io. |
| Problem detail | `/problems/[id]` | Problem info, current state, editable insight, attempt history with a delete button per row, and a form to log an attempt (rating, optional minutes, insight, optional date). |
| Progress | `/progress` | Per-pattern bars: solved, mastered, retired, due. Attempts in the last 7 days. |

### Behavior

- After a rating on Today, the row leaves the list without a full reload and an **Undo** toast shows for ~5 seconds. Undo deletes that attempt (replay restores the state) and the row returns.
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

Validation: `rating` must be `easy`, `struggled`, or `needed_solution` (400); a future `attempted_on` is 400; unknown problem ids, or an attempt id that does not belong to the problem, return 404.

---

## Build order

Explain the plan before each stage; check each before starting the next. Commit and push after each stage passes.

1. **Setup.** Next.js, Tailwind, Drizzle, Vitest, both databases and both env files, dev on 127.0.0.1:3001, start on 127.0.0.1:3000. Create the public GitHub repo `neetcode-tracker` and push. *Check:* dev server runs and a test passes.
2. **Schema and seed.** Three tables, `seed.ts`, `fixture.json`. *Check:* seeding the fixture into the dev database twice leaves the same rows; insights survive a re-seed; seeding the fixture against `neetcode_tracker` is refused.
3. **Scheduler.** `applyAttempt` and `replay` with tests. *Check:* all scheduler tests pass.
4. **API.** All endpoints, writes in one transaction with replay. *Check:* curl a sequence of attempts and a delete; `next_review` matches the rules.
5. **Today screen.** Due list, Reveal, rating buttons, Undo toast. *Check:* rating removes the row and updates its date; Undo restores it.
6. **Problems and detail.** Filters, search, history with delete, insight editing, early-Easy warning. *Check:* filters combine correctly.
7. **Progress.** Per-pattern counts. *Check:* totals match the Problems screen.
8. **Real data and polish.** Fetch and verify the 250 list, seed it, empty states, errors, `install-launchd.sh`, `npm run deploy`, logging, manifest, README. *Check:* a fresh clone runs by following the README.

---

## Tests

### Scheduler

- First attempt with each rating: Easy → 7, Struggled → 3, Needed solution → 2.
- The worked example produces exactly its table, including mastered on day 54 and retired on day 144.
- Easy on a 14-day review gives 28 and stays in_review (not mastered).
- Early Easy (before next_review) leaves interval, next_review and status unchanged but increments times_reviewed.
- Overdue Easy counts normally and schedules from `attempted_on`.
- Struggled or Needed solution before the due date still resets.
- Struggled or Needed solution on a mastered or retired problem resets to in_review.
- Replay sorts by date then id, so out-of-order and same-day attempts give the same result.
- Replay of no attempts returns null.
- Deleting the last attempt from the worked example sequence (replay of the first n − 1) restores the previous row.
- Due on its next_review date and not the day before; retired is never due.

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
- Fancier scheduling such as SM-2
- An in-app code editor or test runner
- Editing attempts (delete and re-log instead)
