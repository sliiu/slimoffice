import "@sliiu/present-ui/tokens.css";
import "./renderer.css";
import {
  createPresentationFromTemplate,
  getBlankTemplate,
  presentationExportExtension,
  showPropertiesSlideOrder,
  type Presentation,
} from "@sliiu/present-core";
import { mountEditor, type EditorHandle, type Locale, type SaveFormat } from "@sliiu/present-editor";
import { parsePptx } from "@sliiu/present-parser";
import {
  buildHtml,
  buildHtmlBundle,
  bundleToZip,
  exportPresentationPdf,
  mount as mountPlayer,
  snapshotAll,
  snapshotsToZip,
  type PlayerHandle,
} from "@sliiu/present-player";
import { writePptx } from "@sliiu/present-serializer";
import playerSource from "@sliiu/present-player/iife?raw";
import { createSlideRail, type SlideRail } from "./slide-rail";
import { mountFileHome, type FileHome } from "./home";
import { officeKind } from "./kinds";
import { mountTabBar } from "./tabs";

const locale: Locale = navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
const copy = locale === "zh-CN"
  ? {
      saved: "已保存",
      opened: "已打开",
      exported: "已导出",
      failed: "失败",
      untitled: "未命名.pptx",
    }
  : {
      saved: "Saved",
      opened: "Opened",
      exported: "Exported",
      failed: "Failed",
      untitled: "Untitled.pptx",
    };

const tabbar = document.querySelector("#tabbar");
const homeEl = document.querySelector("#home");
const shell = document.querySelector("#shell");
const host = document.querySelector("#host");
const railHost = document.querySelector("#slide-rail");
if (!(tabbar instanceof HTMLElement) || !(homeEl instanceof HTMLElement) || !(shell instanceof HTMLElement) || !(host instanceof HTMLElement) || !(railHost instanceof HTMLElement)) {
  throw new Error("missing shell");
}

interface OpenFile {
  id: string;
  name: string;
  path: string | null;
  pres: Presentation;
  dirty: boolean;
}

let files: OpenFile[] = [];
let active: "home" | string = "home";
let pres = blank();
let editor: EditorHandle | null = null;
const rail: SlideRail = createSlideRail(railHost, () => pres, (index) => editor?.goto(index));
let filePath: string | null = null;
let fileName = copy.untitled;
let dirty = false;
const tabs = mountTabBar(tabbar, locale, {
  onHome: () => activateHome(),
  onSelect: (id) => activateFile(id),
  onClose: (id) => void closeFile(id),
});
let saving = false;
let windowed = false;
let loop = false;
let player: PlayerHandle | null = null;
let playerLayer: HTMLElement | null = null;
let home: FileHome | null = null;

function blank(): Presentation {
  return createPresentationFromTemplate(getBlankTemplate());
}

function currentFile(): OpenFile | undefined {
  return files.find((file) => file.id === active);
}

function rememberActive(): void {
  const file = currentFile();
  if (!file) return;
  file.dirty = dirty;
  file.name = fileName;
  file.path = filePath;
  file.pres = pres;
}

function syncAppDirty(): void {
  window.desktop.setDirty(files.some((file) => file.dirty));
}

function paintTabs(): void {
  tabs.render(active, files.map((file) => ({ id: file.id, name: file.name, dirty: file.dirty })));
}

function setDirty(next: boolean): void {
  dirty = next;
  const file = currentFile();
  if (file) file.dirty = next;
  syncAppDirty();
  paintTabs();
}

function setTitle(): void {
  const mark = dirty ? " •" : "";
  const title = `${fileName}${mark} — Slim Office`;
  document.title = title;
  window.desktop.setTitle(title);
}

function setHomeTitle(): void {
  document.title = "Slim Office";
  window.desktop.setTitle("Slim Office");
}

function showPresent(): void {
  homeEl.hidden = true;
  shell.hidden = false;
}

function activateHome(notice: string | null = null): void {
  if (active !== "home") rememberActive();
  exitPresentation();
  active = "home";
  setHomeTitle();
  shell.hidden = true;
  homeEl.hidden = false;
  home?.setNotice(notice);
  void home?.refresh();
  paintTabs();
  homeEl.dataset.ready = "1";
}

function activateFile(id: string): void {
  const file = files.find((item) => item.id === id);
  if (!file) return;
  if (active !== id) rememberActive();
  exitPresentation();
  active = id;
  pres = file.pres;
  filePath = file.path;
  fileName = file.name;
  dirty = file.dirty;
  syncAppDirty();
  setTitle();
  showPresent();
  if (editor) {
    editor.syncPresentation(pres, 0);
    rail.rebuild();
    rail.setActive(0);
  } else {
    mount(pres, filePath, fileName);
  }
  paintTabs();
  host.dataset.ready = "1";
}

async function closeFile(id: string): Promise<void> {
  const file = files.find((item) => item.id === id);
  if (!file) return;
  const isDirty = file.id === active ? dirty : file.dirty;
  if (isDirty && !(await window.desktop.confirmDiscard())) return;
  const index = files.findIndex((item) => item.id === id);
  files.splice(index, 1);
  if (active === id) {
    const next = files[index] ?? files[index - 1];
    active = "home";
    if (next) activateFile(next.id);
    else activateHome();
    return;
  }
  paintTabs();
  syncAppDirty();
}

function unsupportedNotice(name: string): string {
  const kind = officeKind(name);
  if (locale === "zh-CN") {
    if (kind === "document") return `${name} 是文档。文档组件还没有，所以打不开。`;
    if (kind === "sheet") return `${name} 是表格。表格组件还没有，所以打不开。`;
    return `${name} 还不能打开。`;
  }
  if (kind === "document") return `${name} is a document. There is no document component yet.`;
  if (kind === "sheet") return `${name} is a spreadsheet. There is no spreadsheet component yet.`;
  return `${name} cannot be opened.`;
}

function status(msg: string, kind: "info" | "ok" | "err" = "info"): void {
  editor?.setHostStatus(msg, kind);
}

function mount(next: Presentation, path: string | null, name: string): void {
  pres = next;
  filePath = path;
  fileName = name;
  setDirty(false);
  setTitle();
  if (editor) {
    editor.syncPresentation(pres, 0);
    rail.rebuild();
    rail.setActive(0);
    return;
  }
  editor = mountEditor(host, pres, {
    locale,
    backend: "hybrid",
    isShareAvailable: () => false,
    openFile: () => void openFile(),
    newPresentation: () => void newFile(),
    save: () => void save(false),
    saveAs: (fmt) => void saveAs(fmt),
    canExport: () => true,
    startSlideshowFromBeginning: () => present(0),
    startSlideshowFromCurrent: () => present(editor?.current() ?? 0),
    windowedMode: windowed,
    onWindowedModeChange: (next) => {
      windowed = next;
    },
    slideshowLoop: loop,
    onSlideshowLoopChange: (next) => {
      loop = next;
    },
    isDarkAppearance: () => document.documentElement.classList.contains("dark"),
    toggleAppearance: () => {
      document.documentElement.classList.toggle("dark");
    },
    onCommandExecuted: () => {
      setDirty(true);
      setTitle();
      rail.refresh();
    },
    onCommandStackChange: () => rail.refresh(),
    onSlideChange: (index, total) => {
      if (total !== pres.slides.length) return;
      if (railHost.querySelectorAll(".slide-rail-item").length !== total) rail.rebuild();
      rail.setActive(index);
    },
    onSlideBaked: (_slide, index) => rail.refresh(index),
  });
  rail.rebuild();
}

function addFile(name: string, path: string | null, presentation: Presentation): void {
  const file: OpenFile = {
    id: `file_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name,
    path,
    pres: presentation,
    dirty: false,
  };
  files.push(file);
  activateFile(file.id);
}

async function openDesktopFile(file: { path: string; name: string; bytes: Uint8Array }): Promise<void> {
  if (officeKind(file.name) !== "present") {
    activateHome(unsupportedNotice(file.name));
    return;
  }
  const existing = files.find((item) => item.path === file.path);
  if (existing) {
    activateFile(existing.id);
    return;
  }
  try {
    const next = await parsePptx(file.bytes);
    addFile(file.name, file.path, next);
    status(`${copy.opened} ${file.name}`, "ok");
    await window.desktop.touchRecent(file.path);
  } catch (err) {
    const message = `${copy.failed}: ${err instanceof Error ? err.message : String(err)}`;
    if (active === "home") activateHome(message);
    else status(message, "err");
  }
}

async function openFile(): Promise<void> {
  const file = await window.desktop.openFile();
  if (!file) return;
  await openDesktopFile(file);
}

async function openRecent(filePath: string): Promise<void> {
  const file = await window.desktop.openRecent(filePath);
  if (!file) return;
  if ("missing" in file) {
    home?.setNotice(locale === "zh-CN" ? `${file.name} 已经不在原来的位置。` : `${file.name} is no longer there.`);
    await home?.refresh();
    return;
  }
  await openDesktopFile(file);
}

function newFile(): void {
  addFile(copy.untitled, null, blank());
}

async function writeCurrent(saveAsNew: boolean): Promise<boolean> {
  if (!editor || saving) return false;
  saving = true;
  try {
    const ext = presentationExportExtension(pres);
    const bytes = writePptx(pres);
    const saved = await window.desktop.saveBytes({
      bytes,
      defaultPath: filePath ?? fileName.replace(/\.ppt[xm]$/i, "") + "." + ext,
      filters: [{ name: "PowerPoint", extensions: [ext] }],
      saveAs: saveAsNew || !filePath,
      currentPath: filePath,
    });
    if (!saved) return false;
    filePath = saved.path;
    fileName = saved.path.split(/[\\/]/).pop() ?? fileName;
    setDirty(false);
    setTitle();
    status(`${copy.saved} ${fileName}`, "ok");
    if (filePath) await window.desktop.touchRecent(filePath);
    return true;
  } catch (err) {
    status(`${copy.failed}: ${err instanceof Error ? err.message : String(err)}`, "err");
    return false;
  } finally {
    saving = false;
  }
}

async function saveBlob(bytes: Uint8Array, name: string, filters: { name: string; extensions: string[] }[]): Promise<void> {
  const saved = await window.desktop.saveBytes({
    bytes,
    defaultPath: name,
    filters,
    saveAs: true,
    currentPath: null,
  });
  if (saved) status(`${copy.exported} ${saved.path.split(/[\\/]/).pop()}`, "ok");
}

async function saveAs(fmt: SaveFormat): Promise<void> {
  const stem = fileName.replace(/\.ppt[xm]$/i, "");
  try {
    if (fmt === "pptx") {
      await writeCurrent(true);
      return;
    }
    if (fmt === "pdf") {
      const blob = await exportPresentationPdf(pres);
      await saveBlob(new Uint8Array(await blob.arrayBuffer()), `${stem}.pdf`, [{ name: "PDF", extensions: ["pdf"] }]);
      return;
    }
    if (fmt === "png") {
      const zip = await snapshotsToZip(await snapshotAll(pres), stem);
      await saveBlob(new Uint8Array(await zip.arrayBuffer()), `${stem}-png.zip`, [{ name: "ZIP", extensions: ["zip"] }]);
      return;
    }
    if (fmt === "html") {
      const html = buildHtml(pres, playerSource);
      await saveBlob(new TextEncoder().encode(html), `${stem}.html`, [{ name: "HTML", extensions: ["html"] }]);
      return;
    }
    if (fmt === "html-zip") {
      const zip = bundleToZip(buildHtmlBundle(pres, playerSource));
      await saveBlob(zip, `${stem}.zip`, [{ name: "ZIP", extensions: ["zip"] }]);
    }
  } catch (err) {
    status(`${copy.failed}: ${err instanceof Error ? err.message : String(err)}`, "err");
  }
}

function exitPresentation(): void {
  player?.destroy();
  player = null;
  playerLayer?.remove();
  playerLayer = null;
  document.body.classList.remove("presenting");
  if (document.fullscreenElement) void document.exitFullscreen();
}

function present(startIndex: number): void {
  if (!editor || player) return;
  const layer = document.createElement("div");
  layer.className = "present-layer";
  document.body.appendChild(layer);
  document.body.classList.add("presenting");
  playerLayer = layer;
  player = mountPlayer(layer, pres, {
    backend: "hybrid",
    autoplay: true,
    keyboard: true,
    showControls: true,
    locale,
    initialSlide: startIndex,
    slideOrder: showPropertiesSlideOrder(pres.showPr, pres.slides.length, pres.customShows),
    endWithBlackSlide: !loop,
    onComplete: () => {
      if (loop && player) {
        player.goto(0);
        return;
      }
      exitPresentation();
    },
  });
  if (!windowed) void layer.requestFullscreen().catch(() => undefined);
}

document.addEventListener("keydown", (event) => {
  if (document.body.classList.contains("presenting")) {
    if (event.key !== "Escape") return;
    event.preventDefault();
    exitPresentation();
    return;
  }
  const target = event.target;
  if (target instanceof HTMLElement && target.closest("input, textarea, [contenteditable='true']")) return;
  if (event.key === "F5" && event.shiftKey) {
    event.preventDefault();
    present(editor?.current() ?? 0);
  } else if (event.key === "F5") {
    event.preventDefault();
    present(0);
  }
});

window.__slimpptSave = async () => {
  const pending = files.filter((file) => (file.id === active ? dirty : file.dirty));
  for (const file of pending) {
    if (active !== file.id) activateFile(file.id);
    if (!(await writeCurrent(false))) return false;
  }
  return true;
};

async function boot(): Promise<void> {
  if (!window.desktop) {
    host.textContent = locale === "zh-CN"
      ? "这是 SlimPPT 应用的开发页，请关掉这个浏览器标签，使用应用窗口。"
      : "This is the SlimPPT app dev page. Close this browser tab and use the app window.";
    return;
  }
  home = mountFileHome(homeEl, locale, {
    onNew: () => void newFile(),
    onOpen: () => void openFile(),
    onRecent: (filePath) => void openRecent(filePath),
    recent: () => window.desktop.recentFiles(),
  });
  window.desktop.onMenu((action) => {
    if (action === "new") void newFile();
    if (action === "open") void openFile();
    if (action === "home") activateHome();
    if (action === "save") void writeCurrent(false);
    if (action === "save-as") void writeCurrent(true);
  });
  window.desktop.onOpenFile((file) => {
    void openDesktopFile(file);
  });
  try {
    const launch = await window.desktop.takeLaunchFile();
    if (launch) await openDesktopFile(launch);
    else activateHome();
  } catch (err) {
    activateHome(`${copy.failed}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

void boot();
