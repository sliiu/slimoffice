import assert from "node:assert/strict";
import { PNG } from "pngjs";
import { chmod, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import type { Presentation } from "@ppt/core";
import { buildHtml } from "./export.js";
import {
  chromeScreenshotArgs,
  composeContactSheet,
  findChromeBrowser,
  nextWindowSize,
  readViewportLog,
  SCREENSHOT_MAX_EDGE,
  screenshotPageUrl,
  slideViewport,
} from "./browser-screenshot.js";

describe("browser screenshot", () => {
  it("keeps the slide aspect and caps the long edge", () => {
    assert.deepEqual(slideViewport({ width: 1280, height: 720 }, 640), { width: 640, height: 360 });
    const capped = slideViewport({ width: 3840, height: 2160 });
    assert.equal(Math.max(capped.width, capped.height), SCREENSHOT_MAX_EDGE);
    assert.equal(capped.width / capped.height, 3840 / 2160);
  });

  it("points Chrome at the player page with the design-slide query", () => {
    const url = new URL(screenshotPageUrl("/tmp/deck.html", 2));
    assert.equal(url.searchParams.get("driver"), "auto");
    assert.equal(url.searchParams.get("designed"), "1");
    assert.equal(url.searchParams.get("slide"), "2");
    const args = chromeScreenshotArgs(url.href, "/tmp/out.png", 640, 360);
    assert.ok(args.includes("--headless=new"));
    assert.ok(args.includes("--window-size=640,360"));
    assert.ok(args.includes("--screenshot=/tmp/out.png"));
    assert.equal(args.at(-1), url.href);
  });

  it("writes the query reader into the exported player page", () => {
    const pres = { size: { width: 100, height: 50 }, slides: [] } as unknown as Presentation;
    const html = buildHtml(pres, "/* player */");
    assert.match(html, /designedAppearance/);
    assert.match(html, /initialSlide/);
    assert.match(html, /driver=auto/);
  });

  it("packs slides into one contact sheet", () => {
    const paint = (r: number, g: number, b: number) => {
      const png = new PNG({ width: 4, height: 2 });
      for (let i = 0; i < png.data.length; i += 4) {
        png.data[i] = r;
        png.data[i + 1] = g;
        png.data[i + 2] = b;
        png.data[i + 3] = 255;
      }
      return new Uint8Array(PNG.sync.write(png));
    };
    const sheet = PNG.sync.read(Buffer.from(composeContactSheet([paint(255, 0, 0), paint(0, 0, 255)], { columns: 2, cellWidth: 8 })));
    assert.ok(sheet.width > 16);
    assert.ok(sheet.height > 4);
  });

  it("grows the window by the gap Edge reports", () => {
    assert.deepEqual(nextWindowSize({ width: 960, height: 540 }, { width: 952, height: 462 }, { width: 960, height: 540 }), {
      width: 968,
      height: 618,
    });
    assert.deepEqual(readViewportLog('INFO "PPTVIEW:952,462", source: file'), { width: 952, height: 462 });
    assert.equal(readViewportLog("no viewport"), null);
  });

  it("uses CHROME_PATH when that file is executable", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ppt-chrome-"));
    const bin = join(dir, "chrome");
    await writeFile(bin, "");
    await chmod(bin, 0o755);
    assert.equal(await findChromeBrowser({ CHROME_PATH: bin, PATH: "" }), bin);
    assert.equal(await findChromeBrowser({ CHROME_PATH: join(dir, "missing"), PATH: "" }), null);
  });
});
