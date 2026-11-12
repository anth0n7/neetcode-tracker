// GET /api/problems/:id - one problem with its attempt history and schedule.
import { HttpError } from "@/lib/http";
import { getProblem } from "@/lib/queries";
import { handle } from "@/lib/route";
import { todayLocal } from "@/lib/today";
import { parseProblemId } from "@/lib/validate";

// In Next 16 the URL parts (:id) arrive as a Promise, so they must be awaited.
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  return handle(request, async () => {
    const id = parseProblemId((await ctx.params).id);
    const problem = await getProblem(id, todayLocal());
    if (!problem) throw new HttpError(404, "Problem not found");
    return Response.json(problem);
  });
}
