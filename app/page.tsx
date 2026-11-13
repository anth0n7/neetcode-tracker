import { connection } from "next/server";
import { parseFilterParams } from "@/lib/problem-filters";
import { listProblems } from "@/lib/queries";
import { todayLocal } from "@/lib/today";
import { ProblemsTable } from "./problems-table";

export default async function ProblemsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const rows = await listProblems({}, todayLocal());
  const patterns = [...new Set(rows.map((r) => r.pattern))];
  const initialFilters = parseFilterParams(await searchParams, patterns);

  return <ProblemsTable rows={rows} patterns={patterns} initialFilters={initialFilters} />;
}
