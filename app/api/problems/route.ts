// GET /api/problems - the Problems screen's list.
// Optional filters: ?pattern= &difficulty= &status= &q= (title search).
import { listProblems } from "@/lib/queries";
import { handle } from "@/lib/route";
import { todayLocal } from "@/lib/today";
import { parseProblemFilters } from "@/lib/validate";

export async function GET(request: Request) {
  return handle(request, async () => {
    const filters = parseProblemFilters(new URL(request.url).searchParams);
    return Response.json(await listProblems(filters, todayLocal()));
  });
}
