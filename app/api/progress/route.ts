import { getProgress } from "@/lib/queries";
import { handle } from "@/lib/route";
import { todayLocal } from "@/lib/today";

export async function GET(request: Request) {
  return handle(request, async () => Response.json(await getProgress(todayLocal())));
}
