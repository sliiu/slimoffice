import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { rewriteCssForSnapshot, sanitizeSnapshotClone } from "./snapshot";

const SVG_NS = "http://www.w3.org/2000/svg";
const XLINK_NS = "http://www.w3.org/1999/xlink";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/" });
const { document } = dom.window;
const OriginalImage = dom.window.Image;

const previousFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = previousFetch;
  dom.window.Image = OriginalImage;
});

function blobFetch(url: string): Promise<Response> {
  if (url.startsWith("blob:")) {
    return Promise.resolve(
      new Response(Uint8Array.from([1, 2, 3]), {
        status: 200,
        headers: { "Content-Type": "image/png" },
      }),
    );
  }
  return Promise.reject(new TypeError("Failed to fetch"));
}

class ImageThatErrors {
  crossOrigin: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 0;
  naturalHeight = 0;
  width = 0;
  height = 0;
  set src(_value: string) {
    this.onerror?.();
  }
}

describe("snapshot sanitizing", { concurrency: false }, () => {
  it("keeps local fragment urls and inlines a blob image without touching the live tree", async () => {
    globalThis.fetch = blobFetch as typeof fetch;
    const host = document.createElement("div");
    const svg = document.createElementNS(SVG_NS, "svg");
    const image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("href", "blob:http://localhost/pic");
    image.setAttributeNS(XLINK_NS, "href", "blob:http://localhost/pic");
    const shape = document.createElementNS(SVG_NS, "g");
    shape.setAttribute("clip-path", "url(#clip1)");
    shape.setAttribute("style", 'fill: url("#grad"); background-image: url(blob:http://localhost/pic)');
    svg.append(image, shape);
    host.append(svg);

    const clone = host.cloneNode(true) as HTMLElement;
    const ok = await sanitizeSnapshotClone(host, clone);
    assert.equal(ok, true);
    assert.equal(image.getAttribute("href"), "blob:http://localhost/pic");

    const clonedImage = clone.querySelector("image");
    assert.ok(clonedImage);
    assert.match(clonedImage.getAttribute("href") ?? "", /^data:image\/png;base64,/);
    assert.match(clonedImage.getAttributeNS(XLINK_NS, "href") ?? "", /^data:image\/png;base64,/);
    const clonedShape = clone.querySelector("g");
    assert.equal(clonedShape?.getAttribute("clip-path"), "url(#clip1)");
    const style = clonedShape?.getAttribute("style") ?? "";
    assert.match(style, /fill:\s*url\("#grad"\)/);
    assert.match(style, /background-image:\s*url\("data:image\/png;base64,/);
  });

  it("reuses one fetch when both snapshots ask for the same blob", async () => {
    let fetches = 0;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      fetches += 1;
      return blobFetch(String(input));
    }) as typeof fetch;
    const cache = new Map<string, Promise<string | null>>();
    const make = (): HTMLElement => {
      const host = document.createElement("div");
      const image = document.createElementNS(SVG_NS, "image");
      image.setAttribute("href", "blob:http://localhost/shared");
      host.append(image);
      return host;
    };
    const first = make();
    const second = make();
    assert.equal(await sanitizeSnapshotClone(first, first.cloneNode(true) as HTMLElement, cache), true);
    assert.equal(await sanitizeSnapshotClone(second, second.cloneNode(true) as HTMLElement, cache), true);
    assert.equal(fetches, 1);
  });

  it("refuses the snapshot when a picture cannot be read, and strips the url from the clone", async () => {
    globalThis.fetch = blobFetch as typeof fetch;
    dom.window.Image = ImageThatErrors as unknown as typeof dom.window.Image;
    const host = document.createElement("div");
    const image = document.createElementNS(SVG_NS, "image");
    image.setAttribute("href", "https://cdn.example/a.png");
    image.setAttributeNS(XLINK_NS, "href", "https://cdn.example/a.png");
    host.append(image);
    const clone = host.cloneNode(true) as HTMLElement;
    assert.equal(await sanitizeSnapshotClone(host, clone), false);
    assert.equal(image.getAttribute("href"), "https://cdn.example/a.png");
    const cloned = clone.querySelector("image");
    assert.equal(cloned?.getAttribute("href"), null);
    assert.equal(cloned?.getAttributeNS(XLINK_NS, "href"), null);
  });

  it("copies a readable canvas into an image and skips a tainted one", async () => {
    const host = document.createElement("div");
    const canvas = document.createElement("canvas");
    canvas.width = 4;
    canvas.height = 2;
    canvas.toDataURL = () => "data:image/png;base64,qqqq";
    host.append(canvas);
    const clone = host.cloneNode(true) as HTMLElement;
    assert.equal(await sanitizeSnapshotClone(host, clone), true);
    assert.ok(host.querySelector("canvas"));
    assert.equal(clone.querySelector("canvas"), null);
    assert.equal(clone.querySelector("img")?.getAttribute("src"), "data:image/png;base64,qqqq");

    const tainted = document.createElement("canvas");
    tainted.width = 4;
    tainted.height = 2;
    tainted.toDataURL = () => {
      throw new DOMException("The operation is insecure.", "SecurityError");
    };
    const taintedHost = document.createElement("div");
    taintedHost.append(tainted);
    const taintedClone = taintedHost.cloneNode(true) as HTMLElement;
    assert.equal(await sanitizeSnapshotClone(taintedHost, taintedClone), false);
  });

  it("drops a video or iframe that cannot be frozen into pixels", async () => {
    const host = document.createElement("div");
    const video = document.createElement("video");
    video.setAttribute("src", "blob:http://localhost/clip");
    const frame = document.createElement("iframe");
    frame.src = "https://example.com/embed";
    host.append(video, frame);
    const clone = host.cloneNode(true) as HTMLElement;
    assert.equal(await sanitizeSnapshotClone(host, clone), false);
    assert.equal(clone.querySelector("video"), null);
    assert.equal(clone.querySelector("iframe"), null);
    assert.equal(host.querySelector("video")?.getAttribute("src"), "blob:http://localhost/clip");
  });

  it("rewrites only external css urls", () => {
    const resolved = new Map<string, string | null>([["blob:http://localhost/pic", "data:image/png;base64,aa"]]);
    const kept = rewriteCssForSnapshot(
      'clip-path: url(#clip1); fill: url("#grad"); background-image: url(blob:http://localhost/pic)',
      resolved,
    );
    assert.equal(kept.droppedVisible, false);
    assert.match(kept.css, /url\(#clip1\)/);
    assert.match(kept.css, /url\("#grad"\)/);
    assert.match(kept.css, /url\("data:image\/png;base64,aa"\)/);

    const missing = rewriteCssForSnapshot(
      "@import url('https://fonts.example/a.css'); src: url(https://fonts.example/a.woff2); background: url(https://cdn.example/a.png)",
      new Map(),
    );
    assert.equal(missing.droppedVisible, true);
    assert.equal(missing.css.includes("@import"), false);
    assert.equal(missing.css.includes("https://"), false);
  });
});
