// GET /api/progress - counts per pattern (solved, mastered, retired, due), the
// overall totals, and how many attempts were logged in the last 7 days.
import { getProgress } from "@/lib/queries";
import { handle } from "@/lib/route";
import { todayLocal } from "@/lib/today";

export async function GET(request: Request) {
  return handle(request, async () => Response.json(await getProgress(todayLocal())));
}
