import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

const globalForDb = globalThis as unknown as { pgPool?: Pool };

function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url });
}

export const pool = (globalForDb.pgPool ??= createPool());
export const db = drizzle(pool, { schema });
