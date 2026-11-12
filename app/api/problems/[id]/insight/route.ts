// PATCH /api/problems/:id/insight - edit the saved insight without logging an
// attempt. Body: { insight: "text" }. Empty text or null clears it.
import { HttpError } from "@/lib/http";
import { setInsight } from "@/lib/attempts";
import { handle, readJsonObject } from "@/lib/route";
import { parseInsight, parseProblemId } from "@/lib/validate";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const problemId = parseProblemId((await ctx.params).id);
    const body = await readJsonObject(request);

    // The field must be present: a request with no "insight" at all is a
    // mistake, not a request to clear it.
    if (!("insight" in body)) throw new HttpError(400, "insight is required");
    const insight = parseInsight(body.insight);

    await setInsight(problemId, insight);
    return Response.json({ insight });
  });
}
