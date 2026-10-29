import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import type { Presentation, Slide } from "@ppt/core";
import { mountLecturePanel } from "./lecture-panel.js";

function installDom(): Document {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    HTMLElement: typeof HTMLElement;
    HTMLButtonElement: typeof HTMLButtonElement;
    HTMLMediaElement: typeof HTMLMediaElement;
    PointerEvent: typeof PointerEvent;
    requestAnimationFrame: typeof requestAnimationFrame;
    cancelAnimationFrame: typeof cancelAnimationFrame;
  };
  g.HTMLElement = dom.window.HTMLElement;
  g.HTMLButtonElement = dom.window.HTMLButtonElement;
  g.HTMLMediaElement = dom.window.HTMLMediaElement;
  g.PointerEvent = dom.window.PointerEvent;
  const proto = dom.window.HTMLElement.prototype as HTMLElement & {
    setPointerCapture?: (id: number) => void;
    releasePointerCapture?: (id: number) => void;
    hasPointerCapture?: (id: number) => boolean;
  };
  proto.setPointerCapture ??= () => undefined;
  proto.releasePointerCapture ??= () => undefined;
  proto.hasPointerCapture ??= () => false;
  dom.window.HTMLMediaElement.prototype.play = () => Promise.resolve();
  const queued: FrameRequestCallback[] = [];
  g.requestAnimationFrame = (cb) => {
    queued.push(cb);
    return queued.length;
  };
  g.cancelAnimationFrame = () => undefined;
  (installDom as unknown as { flush: () => void }).flush = () => {
    const batch = queued.splice(0);
    for (const cb of batch) cb(0);
  };
  return dom.window.document;
}

function flushFrames(): void {
  (installDom as unknown as { flush: () => void }).flush();
}

const slide = { id: "s1", name: "", background: { kind: "none" }, layers: [] } as unknown as Slide;

function pres(): Presentation {
  return {
    slides: [slide],
    lecture: { takes: [{ slideId: "s1", durationMs: 10_000, clicksMs: [1000] }] },
  } as Presentation;
}

describe("lecture progress bar", () => {
  const originalNow = performance.now.bind(performance);
  let now = 1_000;
  afterEach(() => {
    performance.now = originalNow;
  });

  it("scrubs while the pointer is down and advances when play is pressed", () => {
    performance.now = () => now;
    const doc = installDom();
    const host = doc.createElement("div");
    doc.body.append(host);
    const panel = mountLecturePanel(host, {
      getPres: pres,
      getSlideIndex: () => 0,
      goto: () => undefined,
      execute: () => undefined,
    });
    const bar = [...host.querySelectorAll("div")].find((el) => el.style.height === "28px");
    assert.ok(bar);
    bar.getBoundingClientRect = () =>
      ({ left: 0, top: 0, width: 1000, height: 28, right: 1000, bottom: 28, x: 0, y: 0, toJSON() {} }) as DOMRect;
    const label = () => host.querySelector("span")?.textContent ?? "";
    assert.match(label(), /0:00\.0 \/ 0:10\.0/);

    const pointer = (type: string, clientX: number): void => {
      bar.dispatchEvent(new PointerEvent(type, { clientX, button: 0, bubbles: true, pointerId: 1 }));
    };
    pointer("pointerdown", 500);
    pointer("pointermove", 200);
    assert.match(label(), /0:02\.0 \/ 0:10\.0/);
    pointer("pointerup", 200);

    const play = [...host.querySelectorAll("button")].find((b) => b.textContent === "Play");
    assert.ok(play);
    assert.equal(play.disabled, false);
    play.click();
    assert.equal(play.textContent, "Pause");
    now = 3_500;
    flushFrames();
    assert.match(label(), /0:04\.5 \/ 0:10\.0/);
    panel.destroy();
  });
});
