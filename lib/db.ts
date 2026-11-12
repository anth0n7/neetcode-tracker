import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "@/db/schema";

// The app's database connection, shared by every API route.
// A "pool" keeps a few connections open and hands them out as needed.
// DATABASE_URL comes from .env.local (real app) or .env.development.local
// (npm run dev); Next.js loads those files automatically.

// In dev, Next.js reloads this file whenever you save, which would open a new
// pool each time. Stashing the pool on `globalThis` lets every reload reuse
// the same one.
const globalForDb = globalThis as unknown as { pgPool?: Pool };

// Open a pool using DATABASE_URL, or fail loudly if it isn't set.
function createPool(): Pool {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  return new Pool({ connectionString: url });
}

// `pool` for raw SQL; `db` for typed Drizzle queries built on the same pool.
export const pool = (globalForDb.pgPool ??= createPool());
export const db = drizzle(pool, { schema });
