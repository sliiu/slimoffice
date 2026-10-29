import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { IMPORTED_PLUGIN_SOURCE_MAX_CHARS, loadPluginSource } from "@ppt/core";

const source = readFileSync(new URL("../examples/plugins/versus.js", import.meta.url), "utf8");

interface FakeListener {
  (event: {
    key: string;
    target: FakeElement;
    preventDefault(): void;
    stopPropagation(): void;
  }): void;
}

class FakeElement {
  tagName: string;
  style: Record<string, string> = {};
  children: FakeElement[] = [];
  listeners: Record<string, FakeListener[]> = {};
  attrs: Record<string, string> = {};
  textContent = "";
  value = "";
  placeholder = "";
  className = "";
  title = "";
  type = "";
  width = 0;
  height = 0;
  parent: FakeElement | null = null;
  ownerDocument?: {
    createElement: (tag: string) => FakeElement;
    defaultView: FakeView;
    activeElement: FakeElement | null;
  };

  constructor(tag: string) {
    this.tagName = tag.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attrs[name] = value;
  }

  appendChild(child: FakeElement) {
    child.parent = this;
    this.children.push(child);
    return child;
  }

  remove() {
    const list = this.parent?.children;
    if (!list) return;
    const i = list.indexOf(this);
    if (i >= 0) list.splice(i, 1);
    this.parent = null;
  }

  addEventListener(type: string, fn: FakeListener) {
    (this.listeners[type] ||= []).push(fn);
  }

  focus() {}

  getContext() {
    return new Proxy(
      {},
      { get: (_t, key) => (typeof key === "string" ? () => {} : undefined) },
    );
  }
}

interface FakeView {
  setTimeout: typeof setTimeout;
  clearTimeout: typeof clearTimeout;
  requestAnimationFrame(cb?: (time: number) => void): number;
  cancelAnimationFrame(): void;
  addEventListener(): void;
  removeEventListener(): void;
  performance: { now(): number };
}

function element(tag: string) {
  return new FakeElement(tag);
}

function dispatch(el: FakeElement, type: string, key: string) {
  const event = { key, target: el, preventDefault() {}, stopPropagation() {} };
  for (const fn of el.listeners[type] || []) fn(event);
}

function walk(el: FakeElement, out: FakeElement[] = []) {
  out.push(el);
  for (const child of el.children) walk(child, out);
  return out;
}

interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface FakeShape {
  id: string;
  name: string;
  kind: string;
  bbox: BBox;
  visible: boolean;
  hasClickAnimation: boolean;
  text?: string;
}

interface ToolbarOpts {
  onClick(): void;
}

function mount(
  shapes: FakeShape[] | ((index: number) => FakeShape[]),
  slides: { id: string }[] = [{ id: "s0" }, { id: "s1" }],
) {
  const stage = element("div");
  const root = element("div");
  const view: FakeView = {
    setTimeout,
    clearTimeout,
    requestAnimationFrame() {
      return 1;
    },
    cancelAnimationFrame() {},
    addEventListener() {},
    removeEventListener() {},
    performance: { now: () => 0 },
  };
  root.ownerDocument = {
    createElement: element,
    defaultView: view,
    activeElement: null,
  };
  let index = 0;
  const list = () => (typeof shapes === "function" ? shapes(index) : shapes);
  const hidden: [string, boolean][] = [];
  let locked = false;
  const button: { opts?: ToolbarOpts } = {};
  const ctx = {
    locale: "zh-CN",
    presentation: {
      size: { width: 1280, height: 720 },
      slides,
      visibleOrder: slides.map((_, i) => i),
    },
    player: {
      current: () => index,
      total: () => slides.length,
      goto(i: number) {
        index = i;
        ctx.events.emit("slidechange");
      },
      setNavigationLocked(on: boolean) {
        locked = on;
      },
      isNavigationLocked: () => locked,
    },
    scene: {
      shapes: () => list(),
      byId: (id: string) => list().find((s) => s.id === id) || null,
      setVisible(id: string, visible: boolean) {
        hidden.push([id, visible]);
        const shape = list().find((s) => s.id === id);
        if (!shape) return false;
        shape.visible = visible;
        return true;
      },
    },
    events: {
      handlers: {} as Record<string, Array<() => void>>,
      on(name: string, fn: () => void) {
        (this.handlers[name] ||= []).push(fn);
        return () => {};
      },
      emit(name: string) {
        for (const fn of this.handlers[name] || []) fn();
      },
    },
    ui: {
      rootElement: () => root,
      stageElement: () => stage,
      addToolbarButton(opts: ToolbarOpts) {
        button.opts = opts;
        return { remove() {} };
      },
      addOverlay() {
        return { remove() {} };
      },
    },
    log() {},
  };
  const loaded = loadPluginSource(source);
  const activated = loaded.plugin.activate(ctx);
  const cleanup = typeof activated === "function" ? (activated as () => void) : () => {};
  return { ctx, stage, button, hidden, cleanup, get locked() { return locked; } };
}

function shape(id: string, bbox: BBox, extra: Partial<FakeShape> = {}): FakeShape {
  return { id, name: id, kind: "rect", bbox, visible: true, hasClickAnimation: false, ...extra };
}

function clickFight(host: ReturnType<typeof mount>) {
  const opts = host.button.opts;
  assert.ok(opts);
  opts.onClick();
}

function nameInputs(stage: FakeElement): [FakeElement, FakeElement] {
  const inputs = walk(stage).filter((el) => el.tagName === "INPUT");
  const left = inputs[0];
  const right = inputs[1];
  assert.ok(left && right);
  return [left, right];
}

describe("versus playback plugin", () => {
  it("loads as one imported playback plugin", () => {
    assert.ok(source.length < IMPORTED_PLUGIN_SOURCE_MAX_CHARS);
    const loaded = loadPluginSource(source);
    assert.equal(loaded.kind, "playback");
    assert.equal(loaded.id, "deck.versus");
    assert.equal(loaded.name, "对打");
  });

  it("stays on the slide when the two name boxes are missing", () => {
    const host = mount([
      shape("only", { x: 80, y: 80, w: 400, h: 80 }, { kind: "text", text: "只有左边" }),
    ]);
    clickFight(host);
    assert.equal(host.locked, false);
    const note = walk(host.stage).find((el) => el.textContent.includes("左右各一个文本框"));
    assert.ok(note);
    host.cleanup();
  });

  it("hides text and large images, and leaves the name boxes on the slide", () => {
    const host = mount([
      shape("name-l", { x: 40, y: 40, w: 420, h: 90 }, { kind: "text", text: "左标题" }),
      shape("note-l", { x: 40, y: 160, w: 300, h: 60 }, { kind: "text", text: "左要点" }),
      shape("name-r", { x: 760, y: 40, w: 420, h: 90 }, { kind: "text", text: "右标题" }),
      shape("photo", { x: 760, y: 180, w: 400, h: 300 }, { kind: "image" }),
      shape("icon", { x: 760, y: 520, w: 48, h: 48 }, { kind: "image" }),
      shape("rule", { x: 100, y: 600, w: 400, h: 4 }, { kind: "line" }),
    ]);
    clickFight(host);
    assert.equal(host.locked, true);
    const inputs = nameInputs(host.stage);
    assert.equal(inputs.length, 2);
    inputs[0].value = "甲";
    inputs[1].value = "乙";
    dispatch(inputs[0], "keydown", "Enter");
    dispatch(inputs[1], "keydown", "Enter");
    const hiddenIds = host.hidden.filter(([, on]) => on === false).map(([id]) => id);
    assert.deepEqual(hiddenIds.sort(), ["note-l", "photo"]);
    assert.equal(host.ctx.scene.byId("name-l")?.visible, true);
    assert.equal(host.ctx.scene.byId("name-r")?.visible, true);
    host.cleanup();
    assert.equal(host.locked, false);
    assert.equal(host.ctx.scene.byId("note-l")?.visible, true);
    assert.equal(host.ctx.scene.byId("photo")?.visible, true);
  });

  it("skips a page that has nothing left to throw and fights on the next one", () => {
    const deck = [
      [
        shape("name-l", { x: 40, y: 40, w: 400, h: 80 }, { kind: "text", text: "左" }),
        shape("name-r", { x: 760, y: 40, w: 400, h: 80 }, { kind: "text", text: "右" }),
      ],
      [
        shape("line-l", { x: 80, y: 200, w: 360, h: 50 }, { kind: "text", text: "下一页" }),
        shape("line-r", { x: 800, y: 200, w: 360, h: 50 }, { kind: "text", text: "对手" }),
      ],
    ];
    const host = mount((index) => deck[index] ?? []);
    clickFight(host);
    const inputs = nameInputs(host.stage);
    inputs[0].value = "甲";
    inputs[1].value = "乙";
    dispatch(inputs[0], "keydown", "Enter");
    dispatch(inputs[1], "keydown", "Enter");
    assert.equal(host.ctx.player.current(), 1);
    const hiddenIds = host.hidden.filter(([, on]) => on === false).map(([id]) => id);
    assert.deepEqual(hiddenIds.sort(), ["line-l", "line-r"]);
    host.cleanup();
  });
});
