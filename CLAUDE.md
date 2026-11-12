# Rules

## Process
- Read the relevant files before editing. Don't assume files, APIs, or schemas exist.
- State assumptions before coding. If there are multiple valid approaches, give a brief tradeoff summary. Ask before deciding anything about schema, public APIs, auth, or new dependencies.
- Prefer the simplest solution. No speculative abstractions or unrequested configurability.

## Changes
- Keep changes scoped to the task. Mention unrelated issues, don't fix them.
- Match existing conventions once they exist. Remove only code your change made unused.

## Verification
- Run `npm run check` before saying you're done. Fix failures.
- Bug fixes: write a test that reproduces it first. New features: write tests first.
- Never edit, skip, or delete a test to make it pass. Tell me if a test looks wrong.
- Tests use the real test Postgres, never mocks and never the dev DB.
- Don't claim success without evidence. Say what you could not verify.

## When you finish, tell me
- Files changed and why
- The riskiest part of the change
- What you did not test
- If you're blocked: what's missing and what you already checked
