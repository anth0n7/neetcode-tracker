import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import path from "node:path";
import type { Client } from "@libsql/client";

const KEEP = 7;

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function prune(dir: string, stem: string): void {
  const pattern = new RegExp(`^${escapeRegExp(stem)}-(\\d{4}-\\d{2}-\\d{2})(?:-(\\d+))?\\.db$`);
  const found = readdirSync(dir)
    .map((name) => ({ name, match: pattern.exec(name) }))
    .filter((f): f is { name: string; match: RegExpExecArray } => f.match !== null)
    .map(({ name, match }) => ({ name, date: match[1], n: Number(match[2] ?? 1) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
  for (const old of found.slice(0, Math.max(0, found.length - KEEP))) rmSync(path.join(dir, old.name));
}

export async function backupDatabase(
  client: Client,
  file: string,
  today: string,
  { force = false }: { force?: boolean } = {},
): Promise<string | null> {
  const tables = await client.execute("select count(*) as n from sqlite_master where type = 'table'");
  if (Number(tables.rows[0].n) === 0) return null;

  const dir = path.join(path.dirname(file), "backups");
  const stem = path.basename(file, path.extname(file));
  let target = path.join(dir, `${stem}-${today}.db`);
  if (existsSync(target)) {
    if (!force) return null;
    for (let n = 2; existsSync(target); n++) target = path.join(dir, `${stem}-${today}-${n}.db`);
  }

  mkdirSync(dir, { recursive: true });
  // VACUUM INTO writes a consistent copy even while this connection is open.
  await client.execute({ sql: "VACUUM INTO ?", args: [target] });
  prune(dir, stem);
  return target;
}
