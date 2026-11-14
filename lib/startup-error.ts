export const STARTUP_FAILED = "STARTUP FAILED:";

const DAMAGED = "The database file is damaged or is not a database. Restore a backup (see the README).";
const EXPLANATIONS: Record<string, string> = {
  SQLITE_NOTADB: DAMAGED,
  SQLITE_CORRUPT: DAMAGED,
  ENOSPC: "The disk is full.",
  SQLITE_FULL: "The disk is full.",
  EPERM: "The app is not allowed to read or write the database file.",
  EACCES: "The app is not allowed to read or write the database file.",
  SQLITE_READONLY: "The app is not allowed to read or write the database file.",
  SQLITE_PERM: "The app is not allowed to read or write the database file.",
  SQLITE_CANTOPEN: "The app could not open the database file.",
};

function causeChain(error: unknown): unknown[] {
  const chain: unknown[] = [];
  for (let e = error; e !== undefined && e !== null && !chain.includes(e); e = (e as { cause?: unknown }).cause) {
    chain.push(e);
  }
  return chain;
}

const codeOf = (e: unknown) => (typeof e === "object" && e !== null && "code" in e ? String(e.code) : undefined);
const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function describeStartupError(error: unknown): string {
  const chain = causeChain(error);
  const code = chain.map(codeOf).find((c) => c !== undefined && c in EXPLANATIONS);
  if (!code) return messageOf(error);
  return `${EXPLANATIONS[code]} (${code}: ${messageOf(chain[chain.length - 1])})`;
}
