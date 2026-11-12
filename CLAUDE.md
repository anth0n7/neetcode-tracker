# Rules

## Commands
- `npm run check` — lint, typecheck, tests
- `npm run test:db:up` — start test Postgres (port 5433)
- `npm run dev` — dev server

## Plan
Current work is tracked in plan.md. Read it at the start of each session, do only the step I name, and update its status when done.

## Working with me
- I'm learning. When you use a pattern, library, or approach I may not know, explain it briefly and say why you chose it over alternatives.
- For design decisions (data model, API shape, structure), propose options and let me choose. Don't decide silently.
- Flag anything you're unsure about instead of guessing.

## Process
- Read the relevant files before editing. Don't assume files, APIs, or schemas exist.
- State assumptions before coding. If there are multiple valid approaches, give a brief tradeoff summary. Ask before deciding anything about schema, public APIs, auth, or new dependencies.
- Prefer the simplest solution. No speculative abstractions or unrequested configurability.

## Changes
- Keep changes scoped to the task. Mention unrelated issues, don't fix them.
- Match existing conventions once they exist. Remove only code your change made unused.

## Verification
- Run `npm run check` before saying you're done. Fix failures.
- If `check` fails on something I didn't touch, tell me instead of fixing it.
- Bug fixes: write a test that reproduces it first. New features: write tests first.
- Never edit, skip, or delete a test to make it pass. Tell me if a test looks wrong.
- Tests use the real test Postgres, never mocks and never the dev DB.
- Don't claim success without evidence. Say what you could not verify.

## Git
- Work on a branch, not main. Keep changes small enough to review in one sitting.
- Never commit, push, or force-push unless I ask.

## Safety
- Never drop tables, delete data, or run destructive commands without asking.
- Never edit already-applied migrations. Create a new one.
- Never read, print, or commit `.env` or secrets. Document variables in `.env.example`.

## When you finish, tell me
- Files changed and why
- The riskiest part of the change
- What you did not test
- If you're blocked: what's missing and what you already checked