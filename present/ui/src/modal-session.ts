// One dismiss session for editor and host modals.
//
// Task dialogs replace each other (the previous one cancels). Confirm / alert /
// prompt dialogs stack above the current task. Escape, backdrop, Enter, and the
// title close button apply only to the top session.

export type ModalLayer = "task" | "confirm";

export interface ModalDismissHandle {
  release: () => void;
}

export interface BindModalDismissOptions {
  doc?: Document;
  overlay: HTMLElement;
  /** Receives the corner close button. */
  panel?: HTMLElement | null;
  onCancel: () => void;
  /**
   * Enter activates this when focus is not in a textarea, button, or editor.
   * Return false to let the event reach the focused control (search boxes).
   */
  onSubmit?: () => boolean | void;
  /** Default true. Return false to ignore this backdrop press. */
  backdropDismiss?: () => boolean;
  /** Default true. Return false to ignore Escape. */
  escapeDismiss?: () => boolean;
  layer?: ModalLayer;
  closeButton?: boolean;
  closeLabel?: string;
}

interface Session {
  layer: ModalLayer;
  requestCancel: () => void;
  release: () => void;
}

const stacks = new WeakMap<Document, Session[]>();

function stackOf(doc: Document): Session[] {
  let stack = stacks.get(doc);
  if (!stack) {
    stack = [];
    stacks.set(doc, stack);
  }
  return stack;
}

function skipsEnter(target: EventTarget | null): boolean {
  if (!target || (target as Node).nodeType !== 1) return false;
  const el = target as HTMLElement;
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "BUTTON" || tag === "A") return true;
  return el.isContentEditable;
}

export function bindModalDismiss(opts: BindModalDismissOptions): ModalDismissHandle {
  const doc = opts.doc ?? opts.overlay.ownerDocument;
  const layer = opts.layer ?? "task";
  const stack = stackOf(doc);

  let released = false;
  let canceling = false;

  const session: Session = {
    layer,
    requestCancel: () => {
      if (released || canceling) return;
      canceling = true;
      session.release();
      opts.onCancel();
    },
    release: () => {
      if (released) return;
      released = true;
      doc.removeEventListener("keydown", onKey, true);
      const index = stack.indexOf(session);
      if (index >= 0) stack.splice(index, 1);
    },
  };

  const isTop = (): boolean => stack[stack.length - 1] === session;

  const onKey = (e: KeyboardEvent): void => {
    if (released || !isTop()) return;
    if (e.isComposing) return;
    if (e.key === "Escape") {
      if (opts.escapeDismiss && !opts.escapeDismiss()) return;
      e.preventDefault();
      e.stopPropagation();
      session.requestCancel();
      return;
    }
    if (e.key !== "Enter" || !opts.onSubmit) return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (skipsEnter(e.target)) return;
    const handled = opts.onSubmit();
    if (handled === false) return;
    e.preventDefault();
    e.stopPropagation();
  };

  const onBackdrop = (e: MouseEvent): void => {
    if (released || !isTop()) return;
    if (e.target !== opts.overlay) return;
    if (opts.backdropDismiss && !opts.backdropDismiss()) return;
    session.requestCancel();
  };

  stack.push(session);
  if (layer === "task") {
    const previous = stack.filter((item) => item !== session && item.layer === "task");
    for (const item of previous) item.requestCancel();
    const index = stack.indexOf(session);
    const firstConfirm = stack.findIndex((item) => item.layer === "confirm");
    if (index >= 0 && firstConfirm >= 0 && index > firstConfirm) {
      stack.splice(index, 1);
      stack.splice(firstConfirm, 0, session);
    }
  }

  doc.addEventListener("keydown", onKey, true);
  opts.overlay.addEventListener("mousedown", onBackdrop);

  if (opts.closeButton !== false && opts.panel) {
    installCloseButton(opts.panel, opts.closeLabel ?? "Close", () => {
      if (released || !isTop()) return;
      session.requestCancel();
    });
  }

  return { release: session.release };
}

/** Cancel every open session, top first. Used when leaving the editor for playback. */
export function dismissAllModals(doc: Document): void {
  const stack = stacks.get(doc);
  if (!stack) return;
  for (const session of [...stack].reverse()) session.requestCancel();
}

function installCloseButton(panel: HTMLElement, label: string, onCancel: () => void): void {
  if (panel.querySelector(":scope > .ui-modal-close")) return;
  if (!panel.style.position || panel.style.position === "static") panel.style.position = "relative";
  const btn = panel.ownerDocument.createElement("button");
  btn.type = "button";
  btn.className = "ui-modal-close";
  btn.setAttribute("aria-label", label);
  btn.textContent = "×";
  btn.style.cssText = [
    "position:absolute",
    "top:8px",
    "right:8px",
    "width:28px",
    "height:28px",
    "padding:0",
    "border:none",
    "border-radius:6px",
    "background:transparent",
    "color:var(--muted-foreground)",
    "cursor:pointer",
    "font:inherit",
    "font-size:18px",
    "line-height:1",
    "z-index:1",
  ].join(";");
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onCancel();
  });
  panel.appendChild(btn);
  const first = panel.firstElementChild;
  if (first && first.nodeType === 1) (first as HTMLElement).style.paddingRight = "40px";
}
