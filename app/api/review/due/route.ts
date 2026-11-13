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
