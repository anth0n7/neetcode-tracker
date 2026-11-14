import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { packager } from "@electron/packager";

const ROOT = process.cwd();
const STANDALONE = path.join(ROOT, ".next/standalone");
const DIST = path.join(ROOT, "dist");
const STAGE = path.join(DIST, "stage");
const NAME = "NeetCode Tracker Spike";

if (!existsSync(path.join(STANDALONE, "server.js"))) throw new Error("Run `next build` first (no .next/standalone/server.js).");

rmSync(DIST, { recursive: true, force: true });
mkdirSync(STAGE, { recursive: true });

const server = path.join(STAGE, "server");
cpSync(STANDALONE, server, { recursive: true, verbatimSymlinks: true });
cpSync(path.join(ROOT, ".next/static"), path.join(server, ".next/static"), { recursive: true });
cpSync(path.join(ROOT, "public"), path.join(server, "public"), { recursive: true });
mkdirSync(path.join(server, "data"), { recursive: true });
cpSync(path.join(ROOT, "data/neetcode250.json"), path.join(server, "data/neetcode250.json"));
cpSync(path.join(ROOT, "electron/main.mjs"), path.join(STAGE, "main.mjs"));
writeFileSync(
  path.join(STAGE, "package.json"),
  JSON.stringify({ name: "neetcode-tracker-spike", productName: NAME, version: "0.0.1", main: "main.mjs" }, null, 2),
);

const electronVersion = JSON.parse(readFileSync(path.join(ROOT, "node_modules/electron/package.json"), "utf8")).version;
const [appPath] = await packager({
  dir: STAGE,
  out: DIST,
  name: NAME,
  platform: "darwin",
  arch: process.arch === "arm64" ? "arm64" : "x64",
  electronVersion,
  asar: false,
  prune: false,
  overwrite: true,
});
console.log(`packaged: ${appPath}`);
