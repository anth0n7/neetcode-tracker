import { describe, expect, it } from "vitest";
import { attempts } from "@/db/schema";
import { db } from "@/lib/db";

const orphan = { problemId: 424242, attemptedOn: "2026-01-01", rating: "easy" };
const reason = (e: unknown) => String((e as { cause?: { message?: string } } | null)?.cause?.message ?? "");

describe("foreign keys", () => {
  it("rejects an attempt for a problem that does not exist", async () => {
    const error = await db.insert(attempts).values(orphan).then(() => null, (e) => e);
    expect(reason(error)).toMatch(/FOREIGN KEY constraint failed/);
  });

  it("rejects it inside a transaction too", async () => {
    const error = await db
      .transaction(async (tx) => {
        await tx.insert(attempts).values(orphan);
      })
      .then(() => null, (e) => e);
    expect(reason(error)).toMatch(/FOREIGN KEY constraint failed/);
    expect(await db.select().from(attempts)).toEqual([]);
  });
});
