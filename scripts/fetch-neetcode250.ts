import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseNeetcodeBundle } from "../lib/neetcode-parse";

const SITE = "https://neetcode.io";
const PRACTICE_PAGE = `${SITE}/practice/practice/neetcode250`;
const OUT = path.join("data", "neetcode250.json");
const EXPECTED = 250;

function fail(msg: string): never {
  console.error(`fetch-neetcode250: ${msg}`);
  process.exit(1);
}

async function get(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) fail(`${url} returned HTTP ${response.status}`);
  return response.text();
}

async function main() {
  const page = await get(PRACTICE_PAGE);
  const bundlePath = page.match(/<script[^>]+src="(main\.[\w]+\.js)"/)?.[1];
  if (!bundlePath) fail("could not find the main script on the practice page");

  const entries = parseNeetcodeBundle(await get(`${SITE}/${bundlePath}`));
  if (entries.length !== EXPECTED) {
    fail(`expected ${EXPECTED} entries, found ${entries.length}. Nothing written; paste the list instead.`);
  }

  mkdirSync(path.dirname(OUT), { recursive: true });
  writeFileSync(OUT, `${JSON.stringify(entries, null, 2)}\n`);

  const perPattern = new Map<string, number>();
  for (const e of entries) perPattern.set(e.pattern, (perPattern.get(e.pattern) ?? 0) + 1);

  console.log(`Wrote ${entries.length} entries to ${OUT}\n`);
  console.log("Per pattern, in first-seen order:");
  for (const [pattern, n] of perPattern) console.log(`  ${String(n).padStart(3)}  ${pattern}`);
  console.log("\nFive random entries:");
  for (const e of [...entries].sort(() => Math.random() - 0.5).slice(0, 5)) {
    console.log(`  #${e.position} ${e.title} [${e.pattern}, ${e.difficulty}] ${e.url}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
