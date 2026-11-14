import path from "node:path";

export function databaseFile(): string {
  const value = process.env.DATABASE_PATH;
  if (!value) throw new Error("DATABASE_PATH is not set");
  return path.resolve(/*turbopackIgnore: true*/ value);
}
