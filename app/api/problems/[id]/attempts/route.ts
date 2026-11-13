import { reviewStateToApi } from "@/lib/api-shape";
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

    const input = {
      rating: parseRating(body.rating),
      minutes: parseMinutes(body.minutes),
      insight: parseInsight(body.insight),
      attemptedOn: parseAttemptedOn(body.attempted_on, todayLocal()),
    };

    const { attemptId, reviewState } = await logAttempt(problemId, input);
    return Response.json({ attemptId, reviewState: reviewStateToApi(reviewState) }, { status: 201 });
  });
}
