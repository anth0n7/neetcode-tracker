# NeetCode Tracker

A personal Mac app for working through the [NeetCode 250](https://neetcode.io) with spaced repetition. Log each attempt as Easy, Struggled or Needed solution, and the app schedules the next review with SM-2. It shows what is due today, every problem grouped by pattern, and your progress.

It runs as a desktop app (Electron) on one Mac. Your data is a single SQLite file on that Mac. There is no account, sync or phone version.

How the app behaves (scheduling rules, screens, API) is in [docs/SPEC.md](docs/SPEC.md).

## Requirements

- macOS (built and tested on Apple Silicon)
- [Node.js](https://nodejs.org) 22 and npm
- An internet connection for `npm install` and for builds (the fonts are downloaded at build time)
- Google Chrome, only to rebuild the app icon (`scripts/make-icon.sh`)

## Set up a fresh clone

```bash
git clone https://github.com/anth0n7/neetcode-tracker.git
cd neetcode-tracker
npm install
npm run check
```

`npm run check` runs lint, typecheck, a production build and the tests. It needs no database setup: tests make their own throwaway SQLite files.

Then install the app:

```bash
npm run app:install
```

This builds the app and copies it to `/Applications/NeetCode Tracker.app`. Open it from the Dock, Launchpad or Finder like any other app. The first time you open it, it creates your database and loads the 250 problems.

## Daily commands

| Command | What it does |
|---|---|
| `npm run dev` | Development server at http://127.0.0.1:3001, using `data/dev.db` (5 sample problems) |
| `npm run check` | Lint, typecheck, build and tests. Run before every commit |
| `npm run sandbox:fill` | Rebuild `data/sandbox.db`: the 250 problems plus sample attempts, for trying things out |
| `npm run start:sandbox` | Serve the sandbox at http://127.0.0.1:3002 (run `npm run build` first) |
| `npm run app:install` | Build the app and replace the copy in `/Applications`. Quit the app first |
| `npm run app:sandbox` | Open the installed app on a copy of the sandbox instead of your real data. Add `-- --fresh` to start from a new copy |

Everything listens on `127.0.0.1` only, so nothing is reachable from other devices.

## Where your data lives

| What | Where |
|---|---|
| Your database | `~/Library/Application Support/NeetCode Tracker/data/neetcode-tracker.db` |
| Backups | `~/Library/Application Support/NeetCode Tracker/data/backups/` |
| Trial copy (`app:sandbox`) | `~/Library/Application Support/NeetCode Tracker/trial/` |
| Server log | `~/Library/Application Support/NeetCode Tracker/logs/server.log` |

To open the folder: in Finder, choose Go > Go to Folder and paste `~/Library/Application Support/NeetCode Tracker`.

Each time the app starts it backs up the database (at most once a day, keeping the 7 newest), and always before it changes the database's structure after an update. Reinstalling the app never touches your data.

## Restoring a backup

If the app says the database file is damaged, or you want to undo a mistake:

1. Quit the app (⌘Q).
2. Open `~/Library/Application Support/NeetCode Tracker/data/` in Finder.
3. Rename `neetcode-tracker.db` to `neetcode-tracker-broken.db`, so nothing is lost.
4. Copy the backup you want from `backups/` (they are named by date, for example `neetcode-tracker-2026-11-14.db`) into `data/`, and rename the copy to `neetcode-tracker.db`.
5. Open the app.

Attempts logged after that backup was taken are not in it.

## If something goes wrong

- **"NeetCode Tracker could not start"**: the dialog says why. Damaged database: restore a backup. Full disk: free some space. Full details are in the server log.
- **"Something went wrong loading this page"**: click Try again. The error ID on the page matches the full error in the server log.
- **"NeetCode Tracker stopped working"**: choose Restart. If it keeps happening, check the server log.
- **`npm run app:install` says the app is running**: quit it with ⌘Q and run the command again.

## Project layout

```
app/          pages and API routes (Next.js)
lib/          scheduler, queries, startup, backups
db/           database schema; drizzle/ holds the migrations
electron/     desktop app: starts the server, opens the window, app icon
scripts/      seeding, the sandbox, packaging and installing
tests/        Vitest tests, run against throwaway SQLite files
data/         the NeetCode 250 list and a 5-problem fixture
```
