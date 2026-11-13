import { reviewStateToApi } from "@/lib/api-shape";
import { deleteAttempt } from "@/lib/attempts";
import { handle } from "@/lib/route";
import { parseProblemId } from "@/lib/validate";

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; attemptId: string }> }) {
  return handle(request, async () => {
    const params = await ctx.params;
    const problemId = parseProblemId(params.id);
    const attemptId = parseProblemId(params.attemptId);
    const { reviewState } = await deleteAttempt(problemId, attemptId);
    return Response.json({ reviewState: reviewStateToApi(reviewState) });
  });
}
