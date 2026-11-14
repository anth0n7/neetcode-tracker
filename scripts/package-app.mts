import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { packager } from "@electron/packager";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next/standalone");
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "stage");
const APP_NAME = "NeetCode Tracker";

function filesUnder(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.join(entry.parentPath, entry.name));
}

function checkContents(appDir: string): void {
  const server = path.join(appDir, "server");
  const required = [
    "server.js",
    "drizzle/meta/_journal.json",
    "data/neetcode250.json",
    `node_modules/@libsql/darwin-${process.arch}/index.node`,
  ];
  const missing = required.filter((file) => !existsSync(path.join(server, file)));
  const databases = filesUnder(appDir).filter((file) => /\.db(-journal|-wal|-shm)?$/.test(file));

  const problems = [
    ...missing.map((file) => `missing server/${file}`),
    ...databases.map((file) => `database file inside the app: ${path.relative(appDir, file)}`),
  ];
  if (problems.length > 0) throw new Error(`The packaged app is not right:\n- ${problems.join("\n- ")}`);
}

if (!existsSync(path.join(STANDALONE, "server.js"))) throw new Error("Run `next build` first (no .next/standalone/server.js).");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

const server = path.join(STAGE, "server");
cpSync(STANDALONE, server, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(ROOT, ".next/static"), path.join(server, ".next/static"), { recursive: true });
cpSync(path.join(ROOT, "public"), path.join(server, "public"), { recursive: true });
mkdirSync(path.join(server, "data"), { recursive: true });
cpSync(path.join(ROOT, "data/neetcode250.json"), path.join(server, "data/neetcode250.json"));
for (const file of ["main.mjs", "rules.mjs"]) cpSync(path.join(ROOT, "electron", file), path.join(STAGE, file));
writeFileSync(
  path.join(STAGE, "package.json"),
  JSON.stringify({ name: "neetcode-tracker", productName: APP_NAME, version: "1.0.0", main: "main.mjs" }, null, 2),
);

const electronVersion = JSON.parse(readFileSync(path.join(ROOT, "node_modules/electron/package.json"), "utf8")).version;
const [outDir] = await packager({
  dir: STAGE,
  out: DIST,
  name: APP_NAME,
  icon: path.join(ROOT, "electron/icon.icns"),
  appBundleId: "local.neetcode-tracker",
  platform: "darwin",
  arch: process.arch === "arm64" ? "arm64" : "x64",
  electronVersion,
  asar: false,
  prune: false,
  overwrite: true,
});

const appBundle = path.join(outDir, `${APP_NAME}.app`);
checkContents(path.join(appBundle, "Contents/Resources/app"));
console.log(`packaged: ${appBundle}`);
