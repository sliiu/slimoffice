import { createRequire } from "node:module";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "playwright";

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, "package.json"));
const sample = path.resolve(here, "../../samples/table-dense.pptx");
const executablePath = require("electron");

async function launchHome(extraArgs, userDataDir) {
  const args = ["."];
  if (userDataDir) args.push(`--user-data-dir=${userDataDir}`);
  args.push(...extraArgs);
  return electron.launch({ executablePath, args, cwd: here });
}

async function assertHomeEmpty() {
  const userData = path.join("/tmp", `slimppt-home-empty-${process.pid}`);
  await mkdir(userData, { recursive: true });
  await writeFile(path.join(userData, "recent.json"), "[]");
  const app = await launchHome([], userData);
  try {
    const win = await app.firstWindow();
    const logs = [];
    win.on("console", (msg) => {
      if (msg.type() === "error") logs.push(msg.text());
    });
    await win.waitForSelector("#home[data-ready='1']", { timeout: 60_000 });
    const empty = await win.locator("[data-test='home-empty']").count();
    if (empty !== 1) throw new Error("expected empty-state placeholder on file home");
    const hint = await win.locator(".home-empty-hint").innerText();
    if (!hint.trim()) throw new Error("expected empty-state hint copy");
    const grid = await win.locator(".home-recent-grid").count();
    if (grid !== 0) throw new Error("expected no recent card grid when empty");
    if (logs.length) throw new Error(logs.join("\n"));
    console.log("desktop smoke home empty ok");
  } finally {
    await app.close();
  }
}

async function assertHomeCards() {
  const userData = path.join("/tmp", `slimppt-home-cards-${process.pid}`);
  await mkdir(userData, { recursive: true });
  const recent = [
    {
      path: sample,
      name: path.basename(sample),
      openedAt: Date.now(),
    },
  ];
  await writeFile(path.join(userData, "recent.json"), JSON.stringify(recent));
  const app = await launchHome([], userData);
  try {
    const win = await app.firstWindow();
    const logs = [];
    win.on("console", (msg) => {
      if (msg.type() === "error") logs.push(msg.text());
    });
    await win.waitForSelector("#home[data-ready='1']", { timeout: 60_000 });
    await win.waitForSelector(".home-recent-grid", { timeout: 15_000 });
    const cards = await win.locator(".home-recent-card").count();
    if (cards < 1) throw new Error("expected recent files rendered as cards");
    const preview = await win.locator(".home-card-preview.home-preview-kind-present").count();
    if (preview < 1) throw new Error("expected presentation kind preview on recent card");
    if (logs.length) throw new Error(logs.join("\n"));
    console.log("desktop smoke home cards ok");
  } finally {
    await app.close();
  }
}

async function assertSampleEditor() {
  const app = await electron.launch({
    executablePath,
    args: [".", sample],
    cwd: here,
  });
  try {
    const win = await app.firstWindow();
    const logs = [];
    win.on("console", (msg) => {
      if (msg.type() === "error") logs.push(msg.text());
    });
    await win.waitForSelector("#host[data-ready='1'] .ppt-editor-root", { timeout: 60_000 });
    await win.waitForSelector(".ppt-editor-root svg", { timeout: 30_000 });
    const title = await win.title();
    if (!title.includes("table-dense.pptx")) {
      throw new Error(`expected the sample name in the title, got ${title}`);
    }
    await win.screenshot({ path: "/tmp/slimppt-desktop.png" });
    if (logs.length) throw new Error(logs.join("\n"));
    console.log("desktop smoke editor ok", title);
  } finally {
    await app.close();
  }
}

await assertHomeEmpty();
await assertHomeCards();
await assertSampleEditor();
console.log("desktop smoke ok");
