// Tests for the API routes, called the way Next.js calls them: with a Request in,
// a Response out. They use the TEST database (see tests/test-db.ts). Routes can't
// be rolled back, so instead every test starts from an empty database (wiped by
// tests/setup-db.ts) and creates the three problems it needs in beforeEach.
import { beforeEach, describe, expect, it } from "vitest";
import { GET as listProblems } from "@/app/api/problems/route";
import { GET as getProblem } from "@/app/api/problems/[id]/route";
import { POST as postAttempt } from "@/app/api/problems/[id]/attempts/route";
import { DELETE as deleteAttempt } from "@/app/api/problems/[id]/attempts/[attemptId]/route";
import { PATCH as patchInsight } from "@/app/api/problems/[id]/insight/route";
import { GET as getDue } from "@/app/api/review/due/route";
import { GET as getProgress } from "@/app/api/progress/route";
import { problems } from "@/db/schema";
import { db } from "@/lib/db";
import { addDays } from "@/lib/scheduler";
import { todayLocal } from "@/lib/today";

const TODAY = todayLocal();
const PATTERN = `T-API-${Date.now()}`;
// Three throwaway problems: one for the main flow, one for list/filter tests, one for error cases.
const FLOW = 995_001;
const OTHER = 995_002;
const SPARE = 995_003;
const IDS = [FLOW, OTHER, SPARE];

// Runs after the reset in tests/setup-db.ts, so these are the only rows in the database.
beforeEach(async () => {
  await db.insert(problems).values([
    { id: FLOW, position: 995_001, title: "API Flow Problem", slug: "t-api-flow", url: "https://example.com/flow", pattern: PATTERN, difficulty: "Hard" },
    { id: OTHER, position: 995_002, title: "API Other Problem", slug: "t-api-other", url: "https://example.com/other", pattern: PATTERN, difficulty: "Easy" },
    { id: SPARE, position: 995_003, title: "API Spare Problem", slug: "t-api-spare", url: "https://example.com/spare", pattern: PATTERN, difficulty: "Medium" },
  ]);
});

// --- helpers to call a route handler like Next would ---

type Handler = (request: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type CallOptions = { body?: unknown; rawBody?: string; headers?: Record<string, string>; params?: Record<string, string> };

async function call(handler: Handler, method: string, path: string, o: CallOptions = {}) {
  const hasBody = o.body !== undefined || o.rawBody !== undefined;
  const request = new Request(`http://localhost:3000${path}`, {
    method,
    headers: { host: "localhost:3000", ...(hasBody ? { "content-type": "application/json" } : {}), ...o.headers },
    body: o.rawBody ?? (o.body === undefined ? undefined : JSON.stringify(o.body)),
  });
  const response = await handler(request, { params: Promise.resolve(o.params ?? {}) });
  return { status: response.status, body: await response.json() };
}

const log = (id: number, body: unknown, o: CallOptions = {}) =>
  call(postAttempt as Handler, "POST", `/api/problems/${id}/attempts`, { body, params: { id: String(id) }, ...o });
const remove = (id: number | string, attemptId: number | string, o: CallOptions = {}) =>
  call(deleteAttempt as Handler, "DELETE", `/api/problems/${id}/attempts/${attemptId}`, {
    params: { id: String(id), attemptId: String(attemptId) },
    ...o,
  });
const detail = (id: number | string) =>
  call(getProblem as Handler, "GET", `/api/problems/${id}`, { params: { id: String(id) } });
const ago = (days: number) => addDays(TODAY, -days);

describe("POST /api/problems/:id/attempts", () => {
  it("logs a first attempt: 201, with the attempt id and the new schedule", async () => {
    const r = await log(SPARE, { rating: "needed_solution", minutes: 12, insight: "think about order" });
    expect(r.status).toBe(201);
    expect(r.body.attemptId).toBeGreaterThan(0);
    expect(r.body.reviewState).toMatchObject({
      intervalDays: 2,
      nextReview: addDays(TODAY, 2),
      status: "in_review",
      timesReviewed: 1,
    });
    const d = await detail(SPARE);
    expect(d.body.insight).toBe("think about order");
    expect(d.body.attempts).toHaveLength(1);
  });

  it("rejects a missing or unknown rating with 400", async () => {
    for (const body of [{}, { rating: "Easy" }, { rating: "hard" }, { rating: 5 }]) {
      const r = await log(OTHER, body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect(r.body.error).toContain("rating");
    }
  });

  it("rejects a future attempted_on with 400", async () => {
    const r = await log(OTHER, { rating: "easy", attempted_on: addDays(TODAY, 1) });
    expect(r.status).toBe(400);
    expect(r.body.error).toContain("future");
  });

  it("rejects a malformed date, bad minutes, bad insight with 400", async () => {
    expect((await log(OTHER, { rating: "easy", attempted_on: "yesterday" })).status).toBe(400);
    expect((await log(OTHER, { rating: "easy", minutes: -5 })).status).toBe(400);
    expect((await log(OTHER, { rating: "easy", insight: 42 })).status).toBe(400);
  });

  it("rejects a body that is not valid JSON, or not an object, with 400", async () => {
    expect((await log(OTHER, undefined, { rawBody: "{not json" })).status).toBe(400);
    expect((await log(OTHER, undefined, { rawBody: "[1,2]" })).status).toBe(400);
    expect((await log(OTHER, undefined, { rawBody: "" })).status).toBe(400);
  });

  it("returns 404 for an unknown or non-numeric problem id", async () => {
    expect((await log(123_456_789, { rating: "easy" })).status).toBe(404);
    expect((await log("abc" as unknown as number, { rating: "easy" })).status).toBe(404);
  });

  it("validates before touching the database: a bad request logs nothing", async () => {
    await log(OTHER, { rating: "nope" });
    const d = await detail(OTHER);
    expect(d.body.attempts).toEqual([]);
    expect(d.body.status).toBe("unsolved");
  });
});

describe("the full flow: log, review, undo", () => {
  it("applies the scheduling rules and undo restores the previous state", async () => {
    // 10 days ago: Easy -> interval 7, next review 3 days ago, so it is due now.
    const first = await log(FLOW, { rating: "easy", attempted_on: ago(10) });
    expect(first.body.reviewState).toMatchObject({ intervalDays: 7, nextReview: ago(3) });

    // It shows up as due with 3 days overdue.
    const due1 = await call(getDue as Handler, "GET", "/api/review/due?all=true");
    expect(due1.body.items.find((i: { id: number }) => i.id === FLOW)).toMatchObject({ daysOverdue: 3, difficulty: "Hard" });

    // Rate it Easy today: due, so it counts -> 14 days.
    const second = await log(FLOW, { rating: "easy" });
    expect(second.body.reviewState).toMatchObject({ intervalDays: 14, nextReview: addDays(TODAY, 14), timesReviewed: 2 });

    // It has left the due list.
    const due2 = await call(getDue as Handler, "GET", "/api/review/due?all=true");
    expect(due2.body.items.find((i: { id: number }) => i.id === FLOW)).toBeUndefined();

    // Undo: back to the first attempt's schedule, and it is due again.
    const undone = await remove(FLOW, second.body.attemptId);
    expect(undone.status).toBe(200);
    expect(undone.body.reviewState).toMatchObject({ intervalDays: 7, nextReview: ago(3), timesReviewed: 1 });
    const due3 = await call(getDue as Handler, "GET", "/api/review/due?all=true");
    expect(due3.body.items.find((i: { id: number }) => i.id === FLOW)).toBeDefined();

    // Deleting the only attempt makes the problem unsolved again.
    const last = await remove(FLOW, first.body.attemptId);
    expect(last.body.reviewState).toBeNull();
    expect((await detail(FLOW)).body).toMatchObject({ status: "unsolved", attempts: [], reviewState: null });
  });

  it("an early Easy is logged but does not move the schedule", async () => {
    const first = await log(FLOW, { rating: "easy" }); // next review in 7 days
    const early = await log(FLOW, { rating: "easy" }); // same day, so not due yet
    expect(early.body.reviewState).toMatchObject({ intervalDays: 7, nextReview: addDays(TODAY, 7), timesReviewed: 2 });
    await remove(FLOW, early.body.attemptId);
    await remove(FLOW, first.body.attemptId);
  });
});

describe("DELETE /api/problems/:id/attempts/:attemptId", () => {
  it("returns 404 for an unknown attempt, an attempt of another problem, or bad ids", async () => {
    const mine = await log(OTHER, { rating: "easy" });
    expect((await remove(OTHER, 123_456_789)).status).toBe(404);
    expect((await remove(SPARE, mine.body.attemptId)).status).toBe(404); // belongs to OTHER
    expect((await remove(OTHER, "abc")).status).toBe(404);
    expect((await remove("abc", 1)).status).toBe(404);
    // the attempt is still there
    expect((await detail(OTHER)).body.attempts).toHaveLength(1);
    await remove(OTHER, mine.body.attemptId);
  });
});

describe("PATCH /api/problems/:id/insight", () => {
  const patch = (id: number | string, body: unknown, o: CallOptions = {}) =>
    call(patchInsight as Handler, "PATCH", `/api/problems/${id}/insight`, { body, params: { id: String(id) }, ...o });

  it("sets, trims and clears the insight without logging an attempt", async () => {
    expect((await patch(OTHER, { insight: "  slide the window  " })).body).toEqual({ insight: "slide the window" });
    expect((await detail(OTHER)).body.insight).toBe("slide the window");
    expect((await patch(OTHER, { insight: "" })).body).toEqual({ insight: null });
    expect((await patch(OTHER, { insight: null })).status).toBe(200);
    expect((await detail(OTHER)).body).toMatchObject({ insight: null, attempts: [] });
  });

  it("returns 400 when insight is missing, not text, or too long", async () => {
    expect((await patch(OTHER, {})).status).toBe(400);
    expect((await patch(OTHER, { insight: 7 })).status).toBe(400);
    expect((await patch(OTHER, { insight: "x".repeat(501) })).status).toBe(400);
  });

  it("returns 404 for an unknown problem", async () => {
    expect((await patch(123_456_789, { insight: "x" })).status).toBe(404);
  });
});

describe("GET /api/problems/:id", () => {
  it("returns 404 for unknown and non-numeric ids", async () => {
    expect((await detail(123_456_789)).status).toBe(404);
    expect((await detail("abc")).status).toBe(404);
  });

  it("returns the problem for a known id", async () => {
    const r = await detail(OTHER);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ id: OTHER, title: "API Other Problem", pattern: PATTERN, url: "https://example.com/other" });
  });
});

describe("GET /api/problems", () => {
  const list = (qs: string) => call(listProblems as Handler, "GET", `/api/problems?${qs}`);
  const ids = (r: { body: { id: number }[] }) => r.body.map((p) => p.id);

  // Every test here expects SPARE to be "in review" (due in 2 days) and the
  // other two problems to be unsolved. The database is empty at the start of
  // each test, so set that up explicitly.
  beforeEach(async () => {
    await log(SPARE, { rating: "needed_solution" });
  });

  it("filters by pattern, difficulty, status and search, and combines them", async () => {
    const p = encodeURIComponent(PATTERN);
    expect(ids(await list(`pattern=${p}`))).toEqual(IDS);
    expect(ids(await list(`pattern=${p}&difficulty=Hard`))).toEqual([FLOW]);
    expect(ids(await list(`pattern=${p}&q=spare`))).toEqual([SPARE]);
    expect(ids(await list(`pattern=${p}&status=unsolved`))).toEqual([FLOW, OTHER]); // SPARE was attempted in beforeEach
    expect(ids(await list(`pattern=${p}&status=in review`))).toEqual([SPARE]);
    expect(ids(await list(`pattern=${p}&difficulty=Medium&status=in review&q=API`))).toEqual([SPARE]);
    expect(ids(await list(`pattern=${p}&difficulty=Easy&status=in review`))).toEqual([]);
  });

  it("includes status and next review", async () => {
    const r = await list(`pattern=${encodeURIComponent(PATTERN)}&q=spare`);
    expect(r.body[0]).toMatchObject({ status: "in review", nextReview: addDays(TODAY, 2), due: false });
  });

  it("rejects an unknown difficulty or status with 400", async () => {
    expect((await list("difficulty=Brutal")).status).toBe(400);
    expect((await list("status=done")).status).toBe(400);
  });
});

describe("GET /api/review/due", () => {
  const due = (qs = "") => call(getDue as Handler, "GET", `/api/review/due${qs}`);

  it("returns total and items, honouring limit and all", async () => {
    const limited = await due("?limit=1");
    expect(limited.status).toBe(200);
    expect(limited.body.items.length).toBeLessThanOrEqual(1);
    const all = await due("?all=true");
    expect(all.body.items).toHaveLength(all.body.total);
    expect(all.body.total).toBe(limited.body.total);
  });

  it("uses the default limit of 10 when none is given", async () => {
    const r = await due();
    expect(r.body.items.length).toBeLessThanOrEqual(10);
  });

  it("rejects a bad limit or all with 400", async () => {
    expect((await due("?limit=0")).status).toBe(400);
    expect((await due("?limit=abc")).status).toBe(400);
    expect((await due("?all=maybe")).status).toBe(400);
  });
});

describe("GET /api/progress", () => {
  it("returns totals and per-pattern counts", async () => {
    await log(SPARE, { rating: "needed_solution" }); // makes exactly one of the three problems solved
    const r = await call(getProgress as Handler, "GET", "/api/progress");
    expect(r.status).toBe(200);
    expect(r.body.totals).toMatchObject({ problems: expect.any(Number), attemptsLast7Days: expect.any(Number) });
    expect(r.body.patterns.find((p: { pattern: string }) => p.pattern === PATTERN)).toEqual({
      pattern: PATTERN,
      total: 3,
      solved: 1, // SPARE
      mastered: 0,
      retired: 0,
      due: 0,
    });
  });
});

describe("request safety checks", () => {
  it("rejects a non-localhost Host on every route with 403", async () => {
    const evil = { host: "evil.example.com" };
    expect((await call(getDue as Handler, "GET", "/api/review/due", { headers: evil })).status).toBe(403);
    expect((await call(getProgress as Handler, "GET", "/api/progress", { headers: evil })).status).toBe(403);
    expect((await log(OTHER, { rating: "easy" }, { headers: evil })).status).toBe(403);
  });

  it("rejects POST, PATCH and DELETE from another origin with 403, and changes nothing", async () => {
    const cross = { origin: "https://evil.example.com" };
    const r = await log(OTHER, { rating: "easy" }, { headers: cross });
    expect(r.status).toBe(403);
    expect((await detail(OTHER)).body.attempts).toEqual([]);

    const mine = await log(OTHER, { rating: "easy" });
    expect((await remove(OTHER, mine.body.attemptId, { headers: cross })).status).toBe(403);
    expect((await detail(OTHER)).body.attempts).toHaveLength(1);
    const patched = await call(patchInsight as Handler, "PATCH", `/api/problems/${OTHER}/insight`, {
      body: { insight: "hijacked" },
      params: { id: String(OTHER) },
      headers: cross,
    });
    expect(patched.status).toBe(403);
    expect((await detail(OTHER)).body.insight).toBeNull();
    await remove(OTHER, mine.body.attemptId);
  });

  it("allows a same-origin request from the app itself", async () => {
    const r = await log(OTHER, { rating: "easy" }, { headers: { origin: "http://localhost:3000" } });
    expect(r.status).toBe(201);
    await remove(OTHER, r.body.attemptId);
  });
});
