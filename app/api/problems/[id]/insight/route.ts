import { HttpError } from "@/lib/http";
import { setInsight } from "@/lib/attempts";
import { handle, readJsonObject } from "@/lib/route";
import { parseInsight, parseProblemId } from "@/lib/validate";

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const problemId = parseProblemId((await ctx.params).id);
    const body = await readJsonObject(request);

    if (!("insight" in body)) throw new HttpError(400, "insight is required");
    const insight = parseInsight(body.insight);

    await setInsight(problemId, insight);
    return Response.json({ insight });
  });
}
