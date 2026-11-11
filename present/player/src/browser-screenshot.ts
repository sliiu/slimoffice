// 没有 DOM 的进程给 agent 看排版：写出和 `view html` 同一条播放器页，
// 交给本机 Chrome 系浏览器截成 PNG。有 DOM 时仍用 snapshotSlide，不走这里。
//
// 地址带 ?driver=auto&designed=1&slide=N。driver=auto 关掉控件和自动翻页；
// designed=1 画出设计稿（进入动画的目标不按点击前隐藏）。

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { PNG } from "pngjs";
import type { Presentation } from "@ppt/core";
import { buildHtml } from "./export";

/** 长边上限。多图模型对单张图的边长通常卡在这附近。 */
export const SCREENSHOT_MAX_EDGE = 1920;
/** 一次交给 agent 的页数上限。再多就改成指定页码。 */
export const SCREENSHOT_SHEET_LIMIT = 8;

export class BrowserScreenshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BrowserScreenshotError";
  }
}

export interface BrowserScreenshotOptions {
  /** 0-based。每一页单独起一次浏览器。 */
  slideIndices: number[];
  /** CSS 视口宽度。高度按幻灯片比例。长边不超过 {@link SCREENSHOT_MAX_EDGE}。 */
  width?: number;
  browserPath?: string;
  /** 单次浏览器进程的墙钟上限。默认 45 秒。 */
  timeoutMs?: number;
}

export interface SlideScreenshot {
  slideIdx: number;
  png: Uint8Array;
}

export function slideViewport(
  size: { width: number; height: number },
  width?: number,
): { width: number; height: number } {
  const sw = Math.max(1, size.width);
  const sh = Math.max(1, size.height);
  let w = Math.max(1, Math.round(width ?? sw));
  let h = Math.max(1, Math.round(sh * (w / sw)));
  const edge = Math.max(w, h);
  if (edge > SCREENSHOT_MAX_EDGE) {
    const s = SCREENSHOT_MAX_EDGE / edge;
    w = Math.max(1, Math.round(w * s));
    h = Math.max(1, Math.round(h * s));
  }
  return { width: w, height: h };
}

export function screenshotPageUrl(htmlPath: string, slideIdx: number): string {
  const url = pathToFileURL(htmlPath);
  url.searchParams.set("driver", "auto");
  url.searchParams.set("designed", "1");
  url.searchParams.set("slide", String(slideIdx));
  return url.href;
}

export function chromeScreenshotArgs(url: string, outPath: string, width: number, height: number): string[] {
  return [
    "--headless=new",
    "--disable-gpu",
    "--no-sandbox",
    "--hide-scrollbars",
    "--enable-logging=stderr",
    "--v=0",
    `--window-size=${width},${height}`,
    "--virtual-time-budget=15000",
    "--timeout=30000",
    `--screenshot=${outPath}`,
    url,
  ];
}

/** 无头窗口比页面视口大一圈。按浏览器报出的 inner 尺寸把窗口补正到目标视口。 */
export function nextWindowSize(
  windowSize: { width: number; height: number },
  inner: { width: number; height: number },
  target: { width: number; height: number },
): { width: number; height: number } {
  return {
    width: Math.max(1, windowSize.width + (target.width - inner.width)),
    height: Math.max(1, windowSize.height + (target.height - inner.height)),
  };
}

export function readViewportLog(stderr: string): { width: number; height: number } | null {
  const match = stderr.match(/PPTVIEW:(\d+),(\d+)/);
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

const BROWSER_NAMES = [
  "microsoft-edge-stable",
  "microsoft-edge",
  "msedge",
  "google-chrome",
  "google-chrome-stable",
  "chromium",
  "chromium-browser",
  "chrome",
];

async function isExecutable(path: string): Promise<boolean> {
  try {
    await access(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export async function findChromeBrowsers(env: NodeJS.ProcessEnv = process.env): Promise<string[]> {
  const found: string[] = [];
  const push = async (candidate: string | undefined): Promise<void> => {
    const path = candidate?.trim();
    if (!path || found.includes(path)) return;
    if (await isExecutable(path)) found.push(path);
  };
  await push(env.CHROME_PATH);
  const pathSep = process.platform === "win32" ? ";" : ":";
  const exts = process.platform === "win32" ? [".exe", ".cmd", ".bat", ""] : [""];
  for (const name of BROWSER_NAMES) {
    for (const dir of (env.PATH ?? "").split(pathSep)) {
      if (!dir) continue;
      for (const ext of exts) await push(join(dir, name + ext));
    }
  }
  return found;
}

export async function findChromeBrowser(env: NodeJS.ProcessEnv = process.env): Promise<string | null> {
  return (await findChromeBrowsers(env))[0] ?? null;
}

function blitScaled(
  src: InstanceType<typeof PNG>,
  dst: InstanceType<typeof PNG>,
  ox: number,
  oy: number,
  dw: number,
  dh: number,
): void {
  for (let y = 0; y < dh; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / dh));
    for (let x = 0; x < dw; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / dw));
      const si = (src.width * sy + sx) << 2;
      const dx = ox + x;
      const dy = oy + y;
      if (dx < 0 || dy < 0 || dx >= dst.width || dy >= dst.height) continue;
      const di = (dst.width * dy + dx) << 2;
      dst.data[di] = src.data[si]!;
      dst.data[di + 1] = src.data[si + 1]!;
      dst.data[di + 2] = src.data[si + 2]!;
      dst.data[di + 3] = src.data[si + 3]!;
    }
  }
}

/** 多页缩成一张总览。给 agent 看整本，不必一页一次看图。 */
export function composeContactSheet(
  pngs: Uint8Array[],
  opts: { columns?: number; cellWidth?: number } = {},
): Uint8Array {
  if (pngs.length === 0) throw new BrowserScreenshotError("no slides to compose");
  const columns = Math.max(1, Math.min(pngs.length, opts.columns ?? Math.ceil(Math.sqrt(pngs.length))));
  const cellW = opts.cellWidth ?? 480;
  const images = pngs.map((png) => PNG.sync.read(Buffer.from(png)));
  const cellH = Math.max(...images.map((im) => Math.max(1, Math.round((cellW * im.height) / im.width))));
  const rows = Math.ceil(images.length / columns);
  const gap = 8;
  const width = columns * cellW + (columns + 1) * gap;
  const height = rows * cellH + (rows + 1) * gap;
  const sheet = new PNG({ width, height });
  for (let i = 0; i < sheet.data.length; i += 4) {
    sheet.data[i] = 17;
    sheet.data[i + 1] = 17;
    sheet.data[i + 2] = 17;
    sheet.data[i + 3] = 255;
  }
  images.forEach((im, idx) => {
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    const scale = Math.min(cellW / im.width, cellH / im.height);
    const dw = Math.max(1, Math.round(im.width * scale));
    const dh = Math.max(1, Math.round(im.height * scale));
    const ox = gap + col * (cellW + gap) + Math.floor((cellW - dw) / 2);
    const oy = gap + row * (cellH + gap) + Math.floor((cellH - dh) / 2);
    blitScaled(im, sheet, ox, oy, dw, dh);
  });
  return new Uint8Array(PNG.sync.write(sheet));
}

function cropTopLeft(png: Uint8Array, width: number, height: number): Uint8Array {
  const src = PNG.sync.read(Buffer.from(png));
  if (src.width === width && src.height === height) return png;
  if (src.width < width || src.height < height) return png;
  const dst = new PNG({ width, height });
  PNG.bitblt(src, dst, 0, 0, width, height, 0, 0);
  return new Uint8Array(PNG.sync.write(dst));
}

function runBrowser(bin: string, args: string[], timeoutMs: number): Promise<{ code: number; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { stdio: ["ignore", "ignore", "pipe"] });
    let stderr = "";
    let settled = false;
    const finish = (fn: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(() => reject(new BrowserScreenshotError(`browser timed out after ${timeoutMs}ms`)));
    }, timeoutMs);
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-4000);
    });
    child.on("error", (err) => finish(() => reject(err)));
    child.on("close", (code) => finish(() => resolve({ code: code ?? 1, stderr })));
  });
}

export async function screenshotSlidesViaBrowser(
  pres: Presentation,
  playerScript: string,
  opts: BrowserScreenshotOptions,
): Promise<SlideScreenshot[]> {
  if (opts.slideIndices.length === 0) return [];
  for (const slideIdx of opts.slideIndices) {
    if (!Number.isInteger(slideIdx) || slideIdx < 0 || slideIdx >= pres.slides.length) {
      throw new BrowserScreenshotError(`slideIdx ${slideIdx} out of range (have ${pres.slides.length})`);
    }
  }
  const bins = opts.browserPath ? [opts.browserPath] : await findChromeBrowsers();
  if (bins.length === 0) {
    throw new BrowserScreenshotError(
      "No Chrome-family browser found. Install Chrome, Edge, or Chromium, or set CHROME_PATH.",
    );
  }
  const dir = await mkdtemp(join(tmpdir(), "ppt-shot-"));
  let lastError: Error | null = null;
  try {
    const htmlPath = join(dir, "deck.html");
    await writeFile(
      htmlPath,
      buildHtml(pres, playerScript, { backend: "canvas", autoplay: false, noFooter: true }),
      "utf8",
    );
    const view = slideViewport(pres.size, opts.width);
    const timeoutMs = opts.timeoutMs ?? 20_000;
    const shots: SlideScreenshot[] = [];
    let bin = bins[0]!;
    for (const slideIdx of opts.slideIndices) {
      const pngPath = join(dir, `slide-${slideIdx}.png`);
      const url = screenshotPageUrl(htmlPath, slideIdx);
      let result: { code: number; stderr: string } | null = null;
      let produced = false;
      for (const candidate of bins.slice(bins.indexOf(bin))) {
        bin = candidate;
        let windowSize = { width: view.width, height: view.height };
        try {
          result = await runBrowser(bin, chromeScreenshotArgs(url, pngPath, windowSize.width, windowSize.height), timeoutMs);
          const inner = readViewportLog(result.stderr);
          if (inner && (inner.width !== view.width || inner.height !== view.height)) {
            windowSize = nextWindowSize(windowSize, inner, view);
            result = await runBrowser(bin, chromeScreenshotArgs(url, pngPath, windowSize.width, windowSize.height), timeoutMs);
          }
          produced = true;
          break;
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err));
          result = null;
        }
      }
      if (!produced || !result) {
        throw lastError ?? new BrowserScreenshotError(`screenshot of slide ${slideIdx} failed`);
      }
      let png = new Uint8Array();
      try {
        png = new Uint8Array(await readFile(pngPath));
      } catch {
        png = new Uint8Array();
      }
      if (result.code !== 0 || png.length === 0) {
        const tail = result.stderr.trim().split("\n").at(-1) ?? `exit ${result.code}`;
        throw new BrowserScreenshotError(`screenshot of slide ${slideIdx} failed: ${tail}`);
      }
      shots.push({ slideIdx, png: cropTopLeft(png, view.width, view.height) });
    }
    return shots;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
