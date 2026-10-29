import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { bindModalDismiss, dismissAllModals } from "./modal-session.js";

function mount(): {
  doc: Document;
  overlay: HTMLDivElement;
  panel: HTMLDivElement;
  key: (name: string, target?: EventTarget) => KeyboardEvent;
  backdrop: () => void;
} {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  const overlay = doc.createElement("div");
  const panel = doc.createElement("div");
  overlay.appendChild(panel);
  doc.body.appendChild(overlay);
  const key = (name: string, target?: EventTarget): KeyboardEvent => {
    const event = new dom.window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true });
    (target ?? doc).dispatchEvent(event);
    return event;
  };
  const backdrop = (): void => {
    overlay.dispatchEvent(new dom.window.MouseEvent("mousedown", { bubbles: true }));
  };
  return { doc, overlay, panel, key, backdrop };
}

describe("modal session", () => {
  const docs: Document[] = [];
  afterEach(() => {
    for (const doc of docs) dismissAllModals(doc);
    docs.length = 0;
  });

  it("replaces an open task dialog and leaves a confirm above the new task", () => {
    const { doc, overlay, panel, key } = mount();
    docs.push(doc);
    let taskCancels = 0;
    const first = bindModalDismiss({
      doc,
      overlay,
      panel,
      onCancel: () => {
        taskCancels += 1;
      },
    });

    const nextOverlay = doc.createElement("div");
    const nextPanel = doc.createElement("div");
    doc.body.appendChild(nextOverlay);
    let nextCancels = 0;
    bindModalDismiss({
      doc,
      overlay: nextOverlay,
      panel: nextPanel,
      onCancel: () => {
        nextCancels += 1;
      },
    });
    assert.equal(taskCancels, 1);

    const confirmOverlay = doc.createElement("div");
    const confirmPanel = doc.createElement("div");
    doc.body.appendChild(confirmOverlay);
    let confirmCancels = 0;
    bindModalDismiss({
      doc,
      overlay: confirmOverlay,
      panel: confirmPanel,
      layer: "confirm",
      onCancel: () => {
        confirmCancels += 1;
      },
    });

    key("Escape");
    assert.equal(confirmCancels, 1);
    assert.equal(nextCancels, 0);
    first.release();
  });

  it("ignores backdrop while a predicate says so, and still closes on Escape", () => {
    const { doc, overlay, panel, key, backdrop } = mount();
    docs.push(doc);
    let cancels = 0;
    let allowBackdrop = false;
    bindModalDismiss({
      doc,
      overlay,
      panel,
      backdropDismiss: () => allowBackdrop,
      onCancel: () => {
        cancels += 1;
      },
    });
    backdrop();
    assert.equal(cancels, 0);
    allowBackdrop = true;
    backdrop();
    assert.equal(cancels, 1);
    key("Escape");
    assert.equal(cancels, 1);
  });

  it("submits on Enter except in a textarea, and lets a false submit fall through", () => {
    const { doc, overlay, panel, key } = mount();
    docs.push(doc);
    let submits = 0;
    bindModalDismiss({
      doc,
      overlay,
      panel,
      onSubmit: () => {
        submits += 1;
        return false;
      },
      onCancel: () => {},
    });
    const enter = key("Enter");
    assert.equal(submits, 1);
    assert.equal(enter.defaultPrevented, false);

    const area = doc.createElement("textarea");
    panel.appendChild(area);
    key("Enter", area);
    assert.equal(submits, 1);
  });

  it("closes from the title button", () => {
    const { doc, overlay, panel } = mount();
    docs.push(doc);
    let cancels = 0;
    bindModalDismiss({
      doc,
      overlay,
      panel,
      closeLabel: "Close",
      onCancel: () => {
        cancels += 1;
      },
    });
    const button = panel.querySelector<HTMLButtonElement>(".ui-modal-close");
    assert.equal(button?.getAttribute("aria-label"), "Close");
    button?.click();
    assert.equal(cancels, 1);
  });
});
