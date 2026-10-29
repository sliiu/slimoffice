// AI 点选模式：选区旁的 AI 输入框。提交后由宿主改选中的元素，进度写在框里。

import type { MessageKey } from "./i18n";
import { lucideSvg } from "./icons";
import { formatBarPosition, type ScreenRect } from "./selection-format-bar";

export interface AiInlineUi {
  /** 处理中，停止时调用 stop。 */
  running(stop: () => void): void;
  /** 助手正忙，这条没有发送。 */
  busy(): void;
  failed(message: string): void;
  /** 改完了。reply 是模型最后一段回复，可为空。 */
  done(reply: string): void;
  /** 已停下。 */
  clear(): void;
}

export interface AiInlineBoxView {
  visible: boolean;
  /** 选区变了就换一个 key，上一轮的提示随之收起。 */
  targetKey: string;
  anchor: ScreenRect | null;
  view: ScreenRect | null;
  viewport: { w: number; h: number };
  /** 格式条所在位置，框不压在它上面。 */
  avoid: ScreenRect | null;
}

export interface AiInlineBoxActions {
  label: (key: MessageKey) => string;
  submit: (text: string, ui: AiInlineUi) => void;
  /** 本轮结束（改完、失败、停下或正忙）。 */
  settled: () => void;
  exit: () => void;
}

export interface AiInlineBox {
  el: HTMLElement;
  sync: (view: AiInlineBoxView) => void;
  focus: () => void;
  destroy: () => void;
}

const GAP = 8;

export function mountAiInlineBox(doc: Document, actions: AiInlineBoxActions): AiInlineBox {
  const el = doc.createElement("div");
  el.className = "ppt-ai-inline";
  el.dataset.pptAiInline = "1";
  el.setAttribute("role", "dialog");
  el.setAttribute("aria-label", actions.label("aiInline.title"));
  el.addEventListener("mousedown", (ev) => {
    if ((ev.target as HTMLElement | null)?.closest("textarea")) return;
    ev.preventDefault();
  });

  const row = doc.createElement("div");
  row.className = "ppt-ai-inline-row";
  const mark = doc.createElement("span");
  mark.className = "ppt-ai-inline-mark";
  mark.appendChild(lucideSvg(doc, "sparkles", 16));
  const input = doc.createElement("textarea");
  input.className = "ppt-ai-inline-input";
  input.rows = 1;
  input.placeholder = actions.label("aiInline.placeholder");
  input.setAttribute("aria-label", actions.label("aiInline.placeholder"));
  const sendBtn = doc.createElement("button");
  sendBtn.type = "button";
  sendBtn.className = "ppt-ai-inline-send";
  const closeBtn = doc.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "ppt-ai-inline-close";
  closeBtn.title = actions.label("aiInline.exit");
  closeBtn.setAttribute("aria-label", actions.label("aiInline.exit"));
  closeBtn.appendChild(lucideSvg(doc, "x", 14));
  closeBtn.addEventListener("click", () => actions.exit());
  row.append(mark, input, sendBtn, closeBtn);

  const status = doc.createElement("div");
  status.className = "ppt-ai-inline-status";
  status.setAttribute("aria-live", "polite");
  status.hidden = true;
  el.append(row, status);
  doc.body.appendChild(el);

  let stop: (() => void) | null = null;
  let running = false;
  let destroyed = false;
  let lastKey = "";
  let lastView: AiInlineBoxView | null = null;

  const setStatus = (kind: "running" | "error" | "done" | null, text = ""): void => {
    status.hidden = !kind || !text;
    status.dataset.kind = kind ?? "";
    status.textContent = text;
  };

  const renderSend = (): void => {
    sendBtn.replaceChildren(lucideSvg(doc, running ? "square" : "arrow-up", 14));
    const label = actions.label(running ? "aiInline.stop" : "aiInline.send");
    sendBtn.title = label;
    sendBtn.setAttribute("aria-label", label);
    sendBtn.dataset.running = running ? "1" : "";
    sendBtn.disabled = !running && !input.value.trim();
    input.disabled = running;
  };

  const autoGrow = (): void => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
  };

  const settle = (): void => {
    running = false;
    stop = null;
    renderSend();
    if (destroyed) return;
    actions.settled();
  };

  const ui: AiInlineUi = {
    running(s) {
      running = true;
      stop = s;
      renderSend();
      setStatus("running", actions.label("aiInline.running"));
      reposition();
    },
    busy() {
      setStatus("error", actions.label("aiInline.busy"));
      settle();
    },
    failed(message) {
      setStatus("error", message || actions.label("aiInline.failed"));
      settle();
    },
    done(reply) {
      input.value = "";
      autoGrow();
      setStatus("done", reply || actions.label("aiInline.done"));
      settle();
      input.focus();
    },
    clear() {
      setStatus(null);
      settle();
    },
  };

  const submit = (): void => {
    if (running) {
      stop?.();
      return;
    }
    const text = input.value.trim();
    if (!text) return;
    actions.submit(text, ui);
  };

  sendBtn.addEventListener("click", submit);
  input.addEventListener("input", () => {
    autoGrow();
    renderSend();
  });
  input.addEventListener("keydown", (ev) => {
    if (ev.isComposing) return;
    if (ev.key === "Enter" && !ev.shiftKey) {
      ev.preventDefault();
      submit();
    } else if (ev.key === "Escape") {
      ev.preventDefault();
      actions.exit();
    }
  });
  renderSend();

  function reposition(): void {
    const v = lastView;
    if (!v?.anchor || !v.view) return;
    el.style.display = "flex";
    el.style.visibility = "hidden";
    const bar = { w: el.offsetWidth, h: el.offsetHeight };
    const pos = formatBarPosition({ anchor: v.anchor, view: v.view, bar, viewport: v.viewport, prefer: "below" });
    if (!pos) {
      el.style.visibility = "";
      if (!running) el.style.display = "none";
      return;
    }
    let { top } = pos;
    const a = v.avoid;
    if (a && pos.left < a.right && pos.left + bar.w > a.left && top < a.bottom && top + bar.h > a.top) {
      top = top >= a.top ? a.bottom + GAP : a.top - GAP - bar.h;
    }
    el.style.left = `${pos.left}px`;
    el.style.top = `${top}px`;
    el.style.visibility = "visible";
  }

  const sync = (view: AiInlineBoxView): void => {
    const retarget = view.targetKey !== lastKey && !running;
    if (retarget) {
      lastKey = view.targetKey;
      setStatus(null);
    }
    lastView = view;
    if (!view.visible && !running) {
      el.style.display = "none";
      return;
    }
    if (!view.anchor) {
      if (!running) el.style.display = "none";
      return;
    }
    reposition();
    if (retarget && el.style.display !== "none") input.focus({ preventScroll: true });
  };

  return {
    el,
    sync,
    focus: () => {
      if (el.style.display !== "none") input.focus();
    },
    destroy: () => {
      destroyed = true;
      el.remove();
    },
  };
}
