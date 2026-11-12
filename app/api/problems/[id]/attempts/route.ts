// POST /api/problems/:id/attempts - log an attempt and update the schedule.
// Body: { rating, minutes?, insight?, attempted_on? }   (attempted_on = YYYY-MM-DD)
// Replies 201 with { attemptId, reviewState }. The attemptId is what "Undo" uses.
import { logAttempt } from "@/lib/attempts";
import { handle, readJsonObject } from "@/lib/route";
import { todayLocal } from "@/lib/today";
import {
  parseAttemptedOn,
  parseInsight,
  parseMinutes,
  parseProblemId,
  parseRating,
} from "@/lib/validate";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const problemId = parseProblemId((await ctx.params).id);
    const body = await readJsonObject(request);

    // Check every field BEFORE touching the database, so a bad request saves nothing.
    const input = {
      rating: parseRating(body.rating),
      minutes: parseMinutes(body.minutes),
      insight: parseInsight(body.insight),
      attemptedOn: parseAttemptedOn(body.attempted_on, todayLocal()),
    };

    return Response.json(await logAttempt(problemId, input), { status: 201 });
  });
}
