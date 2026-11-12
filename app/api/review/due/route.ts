// GET /api/review/due - the Today screen's list: problems due today or earlier,
// most overdue first, then Hard before Medium before Easy.
// Optional: ?limit=N (default 10) and ?all=true. `total` is always the full count.
import { getDue } from "@/lib/queries";
import { handle } from "@/lib/route";
import { todayLocal } from "@/lib/today";
import { parseDueOptions } from "@/lib/validate";

export async function GET(request: Request) {
  return handle(request, async () => {
    const { limit, all } = parseDueOptions(new URL(request.url).searchParams);
    return Response.json(await getDue({ today: todayLocal(), limit, all }));
  });
}
