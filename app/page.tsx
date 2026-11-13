import { connection } from "next/server";
import { getDue, getProgress } from "@/lib/queries";
import { todayLocal } from "@/lib/today";
import { DUE_LIMIT } from "@/lib/config";
import { TodayList } from "./today-list";

export default async function Home() {
  await connection();
  const today = todayLocal();
  const [due, progress] = await Promise.all([
    getDue({ today, limit: DUE_LIMIT, all: true }),
    getProgress(today),
  ]);

  return <TodayList items={due.items} solved={progress.totals.solved} problems={progress.totals.problems} />;
}
