import { describe, expect, it } from "vitest";
import { todayLocal } from "@/lib/today";

// `new Date(y, m, d, h, min)` builds a moment in the computer's LOCAL time zone
// (months count from 0), which is exactly what todayLocal() reads, so these
// tests give the same answer in any time zone.
describe("todayLocal", () => {
  it("formats as YYYY-MM-DD", () => {
    expect(todayLocal(new Date(2026, 10, 12, 9, 30))).toBe("2026-11-12");
  });

  it("zero-pads single-digit months and days", () => {
    expect(todayLocal(new Date(2026, 0, 5, 12, 0))).toBe("2026-01-05");
  });

  it("is still the same day at 23:59", () => {
    expect(todayLocal(new Date(2026, 10, 12, 23, 59, 59))).toBe("2026-11-12");
  });

  it("rolls over at local midnight", () => {
    expect(todayLocal(new Date(2026, 10, 13, 0, 0, 0))).toBe("2026-11-13");
  });

  it("handles year end", () => {
    expect(todayLocal(new Date(2026, 11, 31, 23, 0))).toBe("2026-12-31");
    expect(todayLocal(new Date(2027, 0, 1, 0, 0))).toBe("2027-01-01");
  });
});
