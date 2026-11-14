import { app, BrowserWindow, dialog, shell, utilityProcess } from "electron";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { databasePath, linkTarget } from "./rules.mjs";

const SERVER_DIR = path.join(import.meta.dirname, "server");
const START_TIMEOUT_MS = 20_000;

let server = null;
let window = null;

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

async function waitUntilAnswering(url) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (server === null) throw new Error("The app's server stopped while starting. See logs/server.log in the app's data folder.");
    if (await answers(url)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`The app's server did not start within ${START_TIMEOUT_MS / 1000} seconds.`);
}

function keepLinksInPlace(win, appOrigin) {
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
  const logDir = path.join(app.getPath("userData"), "logs");
  fs.mkdirSync(logDir, { recursive: true });
  const log = fs.createWriteStream(path.join(logDir, "server.log"), { flags: "a" });

  const port = await freePort();
  const appOrigin = `http://127.0.0.1:${port}`;

  server = utilityProcess.fork(path.join(SERVER_DIR, "server.js"), [], {
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
  server.stdout.pipe(log);
  server.stderr.pipe(log);
  server.on("exit", (code) => {
    log.write(`[${new Date().toISOString()}] server exited with code ${code}\n`);
    server = null;
  });

  await waitUntilAnswering(appOrigin);

  window = new BrowserWindow({ width: 1200, height: 820, title: "NeetCode Tracker" });
  keepLinksInPlace(window, appOrigin);
  window.on("closed", () => {
    window = null;
  });
  await window.loadURL(appOrigin);
}

function stopServer() {
  if (server) server.kill();
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
    stopServer();
    app.quit();
  });
  app.on("before-quit", stopServer);

  app.whenReady().then(start).catch((error) => {
    stopServer();
    dialog.showErrorBox("NeetCode Tracker could not start", String(error?.message ?? error));
    app.quit();
  });
}
