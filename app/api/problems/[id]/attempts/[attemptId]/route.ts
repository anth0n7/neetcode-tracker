// DELETE /api/problems/:id/attempts/:attemptId - delete one attempt and rebuild
// the schedule from the rest. Used by the Undo toast and the attempt history.
// Replies with { reviewState } (null if that was the problem's only attempt).
import { reviewStateToApi } from "@/lib/api-shape";
import { deleteAttempt } from "@/lib/attempts";
import { handle } from "@/lib/route";
import { parseProblemId } from "@/lib/validate";

export async function DELETE(request: Request, ctx: { params: Promise<{ id: string; attemptId: string }> }) {
  return handle(request, async () => {
    const params = await ctx.params;
    // A malformed id can't match anything, so both are "not found" (404).
    const problemId = parseProblemId(params.id);
    const attemptId = parseProblemId(params.attemptId);
    const { reviewState } = await deleteAttempt(problemId, attemptId);
    return Response.json({ reviewState: reviewStateToApi(reviewState) });
  });
}
