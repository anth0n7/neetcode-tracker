export type Neetcode250Entry = {
  id: number;
  position: number;
  title: string;
  slug: string;
  url: string;
  pattern: string;
  difficulty: string;
};

const DIFFICULTIES = ["Easy", "Medium", "Hard"];
const REQUIRED = ["pattern", "link", "difficulty", "ncLink"] as const;

const OBJECT = /\{problem:("(?:[^"\\]|\\.)*")([^{}]*)\}/g;
const FIELD = /(\w+):("(?:[^"\\]|\\.)*"|!0|!1)/g;

function readFields(body: string): Map<string, string | boolean> {
  const fields = new Map<string, string | boolean>();
  for (const [, key, value] of body.matchAll(FIELD)) {
    if (value === "!0") fields.set(key, true);
    else if (value === "!1") fields.set(key, false);
    else fields.set(key, JSON.parse(value) as string);
  }
  return fields;
}

const withoutTrailingSlash = (s: string) => s.replace(/\/$/, "");

export function parseNeetcodeBundle(source: string): Neetcode250Entry[] {
  const entries: Neetcode250Entry[] = [];
  const seenSlugs = new Set<string>();

  for (const [, rawTitle, body] of source.matchAll(OBJECT)) {
    const title = JSON.parse(rawTitle) as string;
    const fields = readFields(body);
    if (fields.get("neetcode250") !== true) continue;

    for (const name of REQUIRED) {
      if (typeof fields.get(name) !== "string" || fields.get(name) === "") {
        throw new Error(`entry "${title}" is missing "${name}"`);
      }
    }
    const difficulty = fields.get("difficulty") as string;
    if (!DIFFICULTIES.includes(difficulty)) {
      throw new Error(`entry "${title}" has bad difficulty "${difficulty}"`);
    }

    const slug = withoutTrailingSlash(fields.get("link") as string);
    if (seenSlugs.has(slug)) throw new Error(`duplicate slug "${slug}"`);
    seenSlugs.add(slug);

    const position = entries.length + 1;
    entries.push({
      id: position,
      position,
      title,
      slug,
      url: `https://neetcode.io/problems/${withoutTrailingSlash(fields.get("ncLink") as string)}`,
      pattern: fields.get("pattern") as string,
      difficulty,
    });
  }
  return entries;
}
