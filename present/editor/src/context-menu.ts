// 编辑器右键上下文菜单。
// 设计原则：
//   - 完全由调用方（editor.ts）注入「当前选中」的语义，菜单本身不维护状态；
//   - PowerPoint 桌面端的常用顺序：Cut/Copy/Paste · Duplicate · Group · Order · Lock · Delete · Format Shape；
//   - 不可用的项标灰但仍渲染，保持菜单稳定（用户的「肌肉记忆位置」不变）。
//
// 关于事件处理的几个易错点（之前踩过的坑）：
//   1) `contextmenu` 事件由「右键 mousedown」触发，但用户左键点击菜单项时
//      会先触发 mousedown 再触发 click —— 若我们用 capture 阶段的全局 mousedown
//      去关闭菜单，必须确认 e.target 在菜单里，否则会在用户尚未点中菜单项时就 destroy。
//   2) 用 `click` 选项触发 onClick 更稳：click 在 mousedown→mouseup 完成后才到，
//      此时 onDocDown(capture mousedown) 已经判过「target 在菜单内」放行，row 的 click
//      listener 就能拿到事件。
//   3) 注册全局关闭监听必须用 setTimeout 延后，避免「触发 contextmenu 的同一次
//      右键按下」立刻把刚弹出的菜单关掉（某些浏览器/触控板下 contextmenu 与
//      mousedown 几乎同时触发）。
//   4) 舞台 pointerdown 会 preventDefault。按 Pointer Events，这次按下不再产生
//      mousedown。只听 mousedown 时，点舞台空白或另一个形状菜单不会关。关闭要
//      听 document capture 的 pointerdown；点在菜单内部则放过，让行上的 mousedown
//      先执行命令再关掉。

export interface ContextMenuItem {
  kind?: "sep";
  label?: string;
  shortcut?: string;
  disabled?: boolean;
  onClick?: () => void;
}

export interface ContextMenuHandle {
  el: HTMLDivElement;
  destroy: () => void;
}

export function showContextMenu(
  doc: Document,
  items: ContextMenuItem[],
  clientX: number,
  clientY: number,
): ContextMenuHandle {
  doc.querySelectorAll<HTMLElement>("[data-ppt-ctx-menu]").forEach((el) => el.remove());

  const el = doc.createElement("div");
  el.dataset.pptCtxMenu = "1";
  el.style.cssText = [
    "position:fixed",
    "z-index:var(--z-dropdown, 1000)",
    "min-width:200px",
    "background:var(--popover)",
    "color:var(--foreground)",
    "border:1px solid var(--border)",
    "border-radius:var(--radius-md, 6px)",
    "box-shadow:var(--shadow-lg, 0 8px 30px rgba(0,0,0,0.45))",
    "padding:4px",
    "font:12px var(--font-sans, \"Geist\", ui-sans-serif, system-ui, sans-serif)",
    "user-select:none",
  ].join(";");
  // 菜单自身吞掉 contextmenu / mousedown 默认事件，避免 macOS 上右键弹原生菜单
  // 或 mousedown 立刻被外部捕获关闭。
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("mousedown", (e) => {
    // 左键点空白（行间隔 / sep）不应关闭菜单，子元素自己 stopPropagation。
    // 这里阻止 mousedown 冒泡，避免外层 onDocDown 在 capture 阶段把菜单关掉
    // —— 用 stopPropagation 不够（capture 已经看到），但我们用 setTimeout 延迟
    // 注册 onDocDown，这里再加一层防御。
    e.stopPropagation();
  });

  for (const it of items) {
    if (it.kind === "sep") {
      const sep = doc.createElement("div");
      sep.style.cssText = "height:1px;background:var(--border);margin:4px 2px";
      el.appendChild(sep);
      continue;
    }
    const row = doc.createElement("div");
    const disabled = !!it.disabled || !it.onClick;
    row.style.cssText = [
      "display:flex",
      "align-items:center",
      "gap:14px",
      "padding:6px 10px",
      "border-radius:var(--radius-sm, 4px)",
      "cursor:" + (disabled ? "default" : "pointer"),
      "color:" + (disabled ? "var(--muted-foreground)" : "var(--foreground)"),
    ].join(";");
    const label = doc.createElement("span");
    label.textContent = it.label ?? "";
    label.style.flex = "1";
    label.style.pointerEvents = "none";
    const sc = doc.createElement("span");
    sc.textContent = it.shortcut ?? "";
    sc.style.cssText = "color:var(--muted-foreground);font-size:11px;pointer-events:none";
    row.append(label, sc);
    if (!disabled) {
      row.addEventListener("mouseenter", () => (row.style.background = "var(--accent)"));
      row.addEventListener("mouseleave", () => (row.style.background = "transparent"));
      // 关键事件设计：
      //   - 直接在 mousedown 触发命令 + destroy。
      //   - 之前用 click/mouseup 在 Cursor 内置浏览器下不可靠 —— 用户按下后某些情况
      //     mouseup 不在 row 上触发，click 链条断裂。mousedown 是用户按下的第一个
      //     可观察事件，最稳定。
      //   - 在 mousedown 上 stopPropagation 阻止冒泡到 doc 触发 onDocDown 关菜单。
      //     由于我们立刻 destroy 自己，外层 onDocDown 即使触发也只是再删一遍 DOM，
      //     无副作用。
      row.addEventListener("mousedown", (ev) => {
        if (ev.button !== 0) return;
        ev.preventDefault();
        ev.stopPropagation();
        try {
          it.onClick?.();
        } catch (err) {
          console.error("[ctx-menu] onClick threw", err);
        }
        destroy();
      });
    }
    el.appendChild(row);
  }

  doc.body.appendChild(el);
  const r = el.getBoundingClientRect();
  const vw = doc.defaultView?.innerWidth ?? clientX + r.width;
  const vh = doc.defaultView?.innerHeight ?? clientY + r.height;
  const x = Math.min(clientX, vw - r.width - 4);
  const y = Math.min(clientY, vh - r.height - 4);
  el.style.left = `${Math.max(0, x)}px`;
  el.style.top = `${Math.max(0, y)}px`;

  const onDocDown = (e: MouseEvent): void => {
    // 冒泡阶段：菜单自身 stopPropagation 了自己的 mousedown，走到这里就是外部点击。
    // 舞台点击往往到不了这里（见 onDocPointerDown）。
    if (!el.contains(e.target as Node)) destroy();
  };
  const onDocPointerDown = (e: Event): void => {
    // capture：舞台在冒泡阶段 preventDefault，兼容鼠标事件被浏览器丢掉，
    // 但 pointerdown 本身已经在 capture 阶段经过 document。
    // 菜单项的命令绑在 mousedown 上，点在菜单里不能在这里先拆掉菜单。
    if (el.contains(e.target as Node)) return;
    destroy();
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      e.preventDefault();
      destroy();
    }
  };

  // 延后一帧注册：避免触发 contextmenu 的那次右键按下立即关菜单。
  // 同时也跳过菜单 mount 的当前微任务队列。
  let registered = false;
  const armTimer = doc.defaultView?.setTimeout(() => {
    if (!doc.body.contains(el)) return;
    doc.addEventListener("pointerdown", onDocPointerDown, true);
    doc.addEventListener("mousedown", onDocDown, false);
    doc.addEventListener("keydown", onKey, true);
    doc.defaultView?.addEventListener("blur", destroy, true);
    registered = true;
  }, 0);

  function destroy(): void {
    if (registered) {
      doc.removeEventListener("pointerdown", onDocPointerDown, true);
      doc.removeEventListener("mousedown", onDocDown, false);
      doc.removeEventListener("keydown", onKey, true);
      doc.defaultView?.removeEventListener("blur", destroy, true);
    } else if (armTimer !== undefined) {
      doc.defaultView?.clearTimeout(armTimer);
    }
    el.remove();
  }

  return { el, destroy };
}
