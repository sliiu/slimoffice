import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import { createServer } from "node:http";
import { readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const rendererRoot = path.join(here, "../dist");
const zh = app.getLocale().toLowerCase().startsWith("zh");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".map": "application/json",
};

const RECENT_LIMIT = 12;
const OFFICE_EXT = /\.(pptx|pptm|docx|doc|xlsx|xls|csv)$/i;

let win = null;
let dirty = false;
let forceClose = false;
let launchPath = argvOfficeFile();
let origin = "";

function argvOfficeFile() {
  return process.argv.find((arg) => OFFICE_EXT.test(arg)) ?? null;
}

function recentPath() {
  return path.join(app.getPath("userData"), "recent.json");
}

async function readRecent() {
  try {
    const parsed = JSON.parse(await readFile(recentPath(), "utf8"));
    return Array.isArray(parsed) ? parsed.filter((item) => item && typeof item.path === "string") : [];
  } catch {
    return [];
  }
}

async function writeRecent(items) {
  await writeFile(recentPath(), JSON.stringify(items.slice(0, RECENT_LIMIT)));
}

function text(en, cn) {
  return zh ? cn : en;
}

async function readOfficeFile(filePath) {
  const bytes = await readFile(filePath);
  return { path: filePath, name: path.basename(filePath), bytes };
}

function send(action) {
  win?.webContents.send("menu", action);
}

function buildMenu() {
  const file = {
    label: text("File", "文件"),
    submenu: [
      { label: text("New presentation", "新建演示文稿"), accelerator: "CmdOrCtrl+N", click: () => send("new") },
      { label: text("Open…", "打开…"), accelerator: "CmdOrCtrl+O", click: () => send("open") },
      { label: text("File home", "文件首页"), accelerator: "CmdOrCtrl+Shift+H", click: () => send("home") },
      { type: "separator" },
      { label: text("Save", "保存"), accelerator: "CmdOrCtrl+S", click: () => send("save") },
      { label: text("Save As…", "另存为…"), accelerator: "CmdOrCtrl+Shift+S", click: () => send("save-as") },
      { type: "separator" },
      process.platform === "darwin" ? { role: "close" } : { role: "quit" },
    ],
  };
  const view = {
    label: text("View", "视图"),
    submenu: [
      { role: "reload", accelerator: "CmdOrCtrl+R" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };
  const template = [
    ...(process.platform === "darwin"
      ? [{ role: "appMenu", submenu: [{ role: "about" }, { type: "separator" }, { role: "quit" }] }]
      : []),
    file,
    view,
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function serveRenderer() {
  const root = path.resolve(rendererRoot);
  return new Promise((resolve, reject) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        let rel = decodeURIComponent(url.pathname);
        if (rel.endsWith("/")) rel += "index.html";
        const file = path.resolve(root, `.${rel}`);
        if (file !== root && !file.startsWith(root + path.sep)) {
          res.writeHead(403);
          res.end();
          return;
        }
        const info = await stat(file);
        const target = info.isDirectory() ? path.join(file, "index.html") : file;
        const data = await readFile(target);
        res.writeHead(200, {
          "Content-Type": MIME[path.extname(target)] ?? "application/octet-stream",
          "Cache-Control": "no-cache",
        });
        res.end(data);
      } catch {
        res.writeHead(404);
        res.end();
      }
    });
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

async function askClose() {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: text("Save changes to this presentation?", "保存对这份文稿的更改？"),
    buttons: [text("Save", "保存"), text("Don't Save", "不保存"), text("Cancel", "取消")],
    defaultId: 0,
    cancelId: 2,
  });
  if (response === 2) return false;
  if (response === 0) {
    const ok = await win.webContents.executeJavaScript("window.__slimpptSave()", true);
    if (!ok) return false;
  }
  return true;
}

async function createWindow() {
  const devUrl = process.env.DESKTOP_DEV;
  if (!devUrl) {
    const served = await serveRenderer();
    origin = `http://127.0.0.1:${served.port}`;
  } else {
    origin = new URL(devUrl).origin;
  }

  win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    title: "Slim Office",
    backgroundColor: "#18181a",
    webPreferences: {
      preload: path.join(here, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.webContents.on("preload-error", (_event, preloadPath, error) => {
    console.error("preload failed", preloadPath, error);
  });

  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(origin)) event.preventDefault();
  });

  win.on("close", (event) => {
    if (!dirty || forceClose) return;
    event.preventDefault();
    void askClose().then((ok) => {
      if (!ok) return;
      forceClose = true;
      dirty = false;
      win.close();
    });
  });

  await win.loadURL(devUrl || `${origin}/`);
}

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (!win) {
    launchPath = filePath;
    return;
  }
  void readOfficeFile(filePath).then((file) => win.webContents.send("open-file", file)).catch((err) => {
    dialog.showErrorBox("Slim Office", err instanceof Error ? err.message : String(err));
  });
});

ipcMain.handle("open-file-dialog", async () => {
  const picked = await dialog.showOpenDialog(win, {
    title: text("Open", "打开"),
    properties: ["openFile"],
    filters: [
      { name: "Office", extensions: ["pptx", "pptm", "docx", "doc", "xlsx", "xls", "csv"] },
      { name: "PowerPoint", extensions: ["pptx", "pptm"] },
    ],
  });
  if (picked.canceled || !picked.filePaths[0]) return null;
  return readOfficeFile(picked.filePaths[0]);
});

ipcMain.handle("take-launch", async () => {
  if (!launchPath) return null;
  const filePath = launchPath;
  launchPath = null;
  return readOfficeFile(filePath);
});

ipcMain.handle("recent-files", async () => {
  const items = await readRecent();
  const kept = [];
  for (const item of items) {
    try {
      await stat(item.path);
      kept.push(item);
    } catch {
      // The file is gone. Drop it from the list.
    }
  }
  if (kept.length !== items.length) await writeRecent(kept);
  return kept;
});

ipcMain.handle("touch-recent", async (_event, filePath) => {
  if (typeof filePath !== "string" || !OFFICE_EXT.test(filePath)) return;
  try {
    await stat(filePath);
  } catch {
    return;
  }
  const items = (await readRecent()).filter((item) => item.path !== filePath);
  items.unshift({ path: filePath, name: path.basename(filePath), openedAt: Date.now() });
  await writeRecent(items);
});

ipcMain.handle("open-recent", async (_event, filePath) => {
  if (typeof filePath !== "string") return null;
  const known = (await readRecent()).some((item) => item.path === filePath);
  if (!known) return null;
  try {
    return await readOfficeFile(filePath);
  } catch {
    const items = (await readRecent()).filter((item) => item.path !== filePath);
    await writeRecent(items);
    return { missing: true, path: filePath, name: path.basename(filePath) };
  }
});

ipcMain.handle("save-bytes", async (_event, payload) => {
  const bytes = Buffer.from(payload.bytes);
  let filePath = payload.saveAs ? null : payload.currentPath;
  if (!filePath) {
    const picked = await dialog.showSaveDialog(win, {
      title: text("Save", "保存"),
      defaultPath: payload.defaultPath,
      filters: payload.filters,
    });
    if (picked.canceled || !picked.filePath) return null;
    filePath = picked.filePath;
  }
  await writeFile(filePath, bytes);
  return { path: filePath };
});

ipcMain.handle("confirm-discard", async () => {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    message: text("Discard unsaved changes?", "放弃未保存的更改？"),
    buttons: [text("Discard", "放弃"), text("Cancel", "取消")],
    defaultId: 1,
    cancelId: 1,
  });
  return response === 0;
});

ipcMain.on("set-dirty", (_event, value) => {
  dirty = !!value;
});

ipcMain.on("set-title", (_event, title) => {
  if (typeof title === "string" && title) win?.setTitle(title);
});

app.whenReady().then(async () => {
  buildMenu();
  await createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
