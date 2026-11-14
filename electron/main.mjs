import { app, BrowserWindow, dialog, shell, utilityProcess } from "electron";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { databasePath, linkTarget, startupFailure } from "./rules.mjs";

const SERVER_DIR = path.join(import.meta.dirname, "server");
const START_TIMEOUT_MS = 20_000;
const KEEP_OUTPUT_CHARS = 64_000;

let server = null;
let serverOutput = "";
let appOrigin = null;
let window = null;
let quitting = false;
let log = null;

const logFile = () => path.join(app.getPath("userData"), "logs", "server.log");

function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}

function answers(url) {
  return new Promise((resolve) => {
    const req = http.get(url, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.setTimeout(2000, () => req.destroy());
  });
}

function stoppedReason() {
  return startupFailure(serverOutput) ?? `The app's server stopped unexpectedly. Details are in ${logFile()}.`;
}

async function waitUntilAnswering(url) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server === null) throw new Error(stoppedReason());
    if (await answers(url)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`The app's server did not start within ${START_TIMEOUT_MS / 1000} seconds. Details are in ${logFile()}.`);
}

async function startServer() {
  const port = await freePort();
  appOrigin = `http://127.0.0.1:${port}`;
  serverOutput = "";

  const child = utilityProcess.fork(path.join(SERVER_DIR, "server.js"), [], {
    cwd: SERVER_DIR,
    stdio: "pipe",
    env: {
      ...process.env,
      NODE_ENV: "production",
      HOSTNAME: "127.0.0.1",
      PORT: String(port),
      DATABASE_PATH: databasePath(process.env, app.getPath("userData")),
    },
  });
  for (const stream of [child.stdout, child.stderr]) {
    stream.pipe(log, { end: false });
    stream.on("data", (chunk) => {
      serverOutput = (serverOutput + chunk.toString()).slice(-KEEP_OUTPUT_CHARS);
    });
  }
  child.on("exit", (code) => {
    log.write(`[${new Date().toISOString()}] server exited with code ${code}\n`);
    if (server !== child) return;
    server = null;
    if (!quitting && window) void offerRestart();
  });
  server = child;

  await waitUntilAnswering(appOrigin);
}

async function offerRestart() {
  const { response } = await dialog.showMessageBox(window, {
    type: "error",
    message: "NeetCode Tracker stopped working",
    detail: stoppedReason(),
    buttons: ["Restart", "Quit"],
    defaultId: 0,
    cancelId: 1,
  });
  if (response !== 0) return app.quit();
  try {
    await startServer();
    await window.loadURL(appOrigin);
  } catch (error) {
    fail(error);
  }
}

function keepLinksInPlace(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (linkTarget(url, appOrigin) === "browser") void shell.openExternal(url);
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const target = linkTarget(url, appOrigin);
    if (target === "app") return;
    event.preventDefault();
    if (target === "browser") void shell.openExternal(url);
  });
}

async function start() {
  fs.mkdirSync(path.dirname(logFile()), { recursive: true });
  log = fs.createWriteStream(logFile(), { flags: "a" });

  await startServer();

  window = new BrowserWindow({ width: 1200, height: 820, title: "NeetCode Tracker" });
  keepLinksInPlace(window);
  window.on("closed", () => {
    window = null;
  });
  await window.loadURL(appOrigin);
}

function stopServer() {
  if (server) server.kill();
}

function fail(error) {
  quitting = true;
  stopServer();
  dialog.showErrorBox("NeetCode Tracker could not start", String(error?.message ?? error));
  app.quit();
}

// A second copy would start a second server on the same database file.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.focus();
  });
  app.on("window-all-closed", () => {
    quitting = true;
    stopServer();
    app.quit();
  });
  app.on("before-quit", () => {
    quitting = true;
    stopServer();
  });

  app.whenReady().then(start).catch(fail);
}
