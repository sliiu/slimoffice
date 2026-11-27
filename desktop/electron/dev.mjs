import { spawn } from "node:child_process";
import { watch } from "node:fs";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appDir = path.resolve(here, "..");
const require = createRequire(path.join(appDir, "package.json"));

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForSlimppt(port, child) {
  const url = `http://127.0.0.1:${port}/`;
  const deadline = Date.now() + 30_000;
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (child.exitCode != null) {
        reject(new Error(`vite exited ${child.exitCode}`));
        return;
      }
      if (Date.now() > deadline) {
        reject(new Error("SlimPPT dev server did not become ready"));
        return;
      }
      try {
        const html = await fetch(url).then((res) => res.text());
        if (html.includes("Slim Office") && html.includes('id="home"')) {
          resolve(url);
          return;
        }
      } catch {
        // Vite is still starting.
      }
      setTimeout(tick, 200);
    };
    tick();
  });
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: "inherit" });
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

const port = await freePort();
const viteBin = path.join(path.dirname(require.resolve("vite/package.json")), "bin/vite.js");
const vite = spawn(process.execPath, [viteBin, "--host", "127.0.0.1", "--port", String(port), "--strictPort"], {
  cwd: appDir,
  stdio: "inherit",
});

let devUrl;
try {
  devUrl = await waitForSlimppt(port, vite);
} catch (err) {
  vite.kill("SIGTERM");
  throw err;
}
console.log(`SlimPPT desktop ${devUrl}`);

const electronPath = require("electron");
let electron = null;
let stopping = false;
let restarting = false;

function startElectron() {
  const child = spawn(electronPath, ["."], {
    cwd: appDir,
    stdio: "inherit",
    env: { ...process.env, DESKTOP_DEV: devUrl },
  });
  electron = child;
  child.on("exit", () => {
    if (electron === child) electron = null;
    if (stopping || restarting) return;
    vite.kill("SIGTERM");
    process.exit(0);
  });
}

function restartElectron() {
  const child = electron;
  if (!child || child.exitCode != null) {
    startElectron();
    return;
  }
  restarting = true;
  child.once("exit", () => {
    restarting = false;
    if (!stopping) startElectron();
  });
  child.kill("SIGTERM");
}

let restartTimer = null;
watch(here, (_event, filename) => {
  if (!filename || !/\.(mjs|cjs)$/.test(filename)) return;
  clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    console.log(`restarting Slim Office after ${filename}`);
    restartElectron();
  }, 200);
});

startElectron();

function stop() {
  stopping = true;
  vite.kill("SIGTERM");
  electron?.kill("SIGTERM");
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
