import path from "node:path";

/**
 * @param {Record<string, string | undefined>} env
 * @param {string} userDataDir
 * @returns {string}
 */
export function databasePath(env, userDataDir) {
  if (env.DATABASE_PATH) return path.resolve(env.DATABASE_PATH);
  return path.join(userDataDir, "data", "neetcode-tracker.db");
}

/**
 * @param {string} url
 * @param {string} appOrigin
 * @returns {"app" | "browser" | "block"}
 */
export function linkTarget(url, appOrigin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return "block";
  }
  if (parsed.origin === appOrigin) return "app";
  if (parsed.protocol === "https:" || parsed.protocol === "http:") return "browser";
  return "block";
}

const STARTUP_FAILED = "STARTUP FAILED:";

/**
 * @param {string} logText
 * @returns {string | null}
 */
export function startupFailure(logText) {
  const lines = logText.split("\n").filter((line) => line.startsWith(STARTUP_FAILED));
  if (lines.length === 0) return null;
  return lines[lines.length - 1].slice(STARTUP_FAILED.length).trim();
}
