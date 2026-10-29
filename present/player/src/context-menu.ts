// 播放器右键菜单实现
//
// 设计要点：
//   1. 「插件 / 内置」一视同仁：内置项（上一页 / 下一页 / 跳转 / 结束放映 / Esc 退出）
//      和插件贡献的项通过同一个 PlayerContextMenuAPI 注入；菜单打开时按 (group, order,
//      insertOrder) 三元 key 排序。
//   2. 同组项相邻；跨组项之间自动插一条分隔线。这样既能保持「翻页操作」「白板」
//      「插件功能」这种逻辑分块，又不需要使用者自己显式添加 separator。
//   3. checked / disabled 支持函数形式：每次打开菜单都重新求值，让 toggleable 项
//      （如「显示白板」勾选状态）始终与当前状态同步。
//   4. 菜单 DOM 直接 append 到 player host 上（不挂到 document.body），这样 fullscreen
//      模式下、player 容器在 fullscreen 元素内时菜单依然可见 —— 否则全屏会把 body 子
//      节点遮住。
//   5. 一组事件处理细节（参考编辑器 context-menu.ts 的踩坑经验）：
//        - 点击外部 / Esc / 滚轮 / blur 都关闭。
//        - 注册 docDown 用 setTimeout 延后一帧，避免触发 contextmenu 的同一次鼠标
//          事件立刻把刚弹出的菜单关掉。
//        - 项的执行走 click（不是 mousedown），mousedown stopPropagation 仅用于不让
//          外层 docDown 在用户还没 mouseup 时就关闭菜单。

import { shortcutMatches } from "./playback-keys";
import type {
  PlayerContextMenuAPI,
  PlayerContextMenuItem,
  UIHandle,
} from "@ppt/plugin-sdk";

const STYLES_ID = "ppt-context-menu";

const STYLES = `
.ppt-ctx-menu{
  position:fixed;
  z-index:var(--z-dropdown, 1000);
  min-width:200px;
  background:rgba(28,31,38,.98);
  color:#e5e7eb;
  border:1px solid rgba(255,255,255,.08);
  border-radius:6px;
  box-shadow:0 10px 30px rgba(0,0,0,.55);
  padding:4px;
  font:13px ui-sans-serif,system-ui,sans-serif;
  user-select:none;
  backdrop-filter:blur(8px);
}
.ppt-ctx-menu.theme-light{
  background:rgba(255,255,255,.98);
  color:#1f2937;
  border-color:rgba(0,0,0,.08);
}
.ppt-ctx-menu-row{
  display:flex;align-items:center;gap:14px;
  padding:6px 10px;
  border-radius:4px;
  cursor:pointer;
  white-space:nowrap;
}
.ppt-ctx-menu-row:hover:not(.disabled){
  background:rgba(255,255,255,.08);
}
.ppt-ctx-menu.theme-light .ppt-ctx-menu-row:hover:not(.disabled){
  background:rgba(0,0,0,.06);
}
.ppt-ctx-menu-row.disabled{
  color:#6b7280;
  cursor:default;
}
.ppt-ctx-menu-row .lbl{flex:1;pointer-events:none;}
.ppt-ctx-menu-row .sc{color:#9ca3af;font-size:11px;pointer-events:none;}
.ppt-ctx-menu-row .check{
  width:14px;display:inline-flex;align-items:center;justify-content:center;
  color:#3b82f6;pointer-events:none;
}
.ppt-ctx-menu .ppt-ctx-menu-sep{
  height:1px;background:rgba(255,255,255,.08);margin:4px 2px;
}
.ppt-ctx-menu.theme-light .ppt-ctx-menu-sep{
  background:rgba(0,0,0,.08);
}
`;

interface ItemRecord {
  id: string;
  item: PlayerContextMenuItem;
  insertOrder: number;
  /** 内置项：不应被外部 list/remove 误删（保留是为了未来调试用）。 */
  builtin?: boolean;
}

export interface ContextMenuManagerDeps {
  doc: Document;
  /** 监听右键的元素（一般是 stage）。 */
  trigger: HTMLElement;
  /** 菜单挂载的容器（一般是 host，使全屏下也可见）。 */
  host: HTMLElement;
  /** 是否启用（false 时所有 API 仍可调用但右键不会弹出菜单）。 */
  enabled?: boolean;
}

export interface ContextMenuManager {
  api: PlayerContextMenuAPI;
  /** 注册内置项（不计入插件 UIHandle 跟踪）。 */
  addBuiltinItem(item: PlayerContextMenuItem): void;
  /** 按菜单项 shortcut 触发 onClick。命中则返回 true。 */
  invokeShortcut(e: KeyboardEvent): boolean;
  destroy(): void;
}

export function createContextMenuManager(deps: ContextMenuManagerDeps): ContextMenuManager {
  const { doc, trigger, host } = deps;
  injectStyles(doc);

  let insertCounter = 0;
  const records = new Map<string, ItemRecord>();
  let openMenu: { el: HTMLDivElement; close: () => void } | null = null;

  const close = (): void => {
    if (!openMenu) return;
    openMenu.close();
    openMenu = null;
  };

  const open = (clientX: number, clientY: number): void => {
    close();
    const items = collectVisibleItems(records);
    if (items.length === 0) return;

    const el = doc.createElement("div");
    el.className = "ppt-ctx-menu";
    if (host.classList.contains("theme-light")) {
      el.classList.add("theme-light");
    }
    // 菜单自身吞掉 contextmenu，避免在菜单上再次右键弹两层。
    el.addEventListener("contextmenu", (e) => e.preventDefault());
    // 菜单自身的 mousedown 不要冒到 docDown 关闭菜单。
    el.addEventListener("mousedown", (e) => e.stopPropagation());

    let prevGroup: string | null = null;
    for (const rec of items) {
      const it = rec.item;
      const group = it.group ?? "default";
      if (prevGroup !== null && prevGroup !== group) {
        const sep = doc.createElement("div");
        sep.className = "ppt-ctx-menu-sep";
        el.appendChild(sep);
      }
      prevGroup = group;
      if (it.kind === "separator") {
        const sep = doc.createElement("div");
        sep.className = "ppt-ctx-menu-sep";
        el.appendChild(sep);
        continue;
      }
      const disabled = resolveBool(it.disabled);
      const checked = it.kind === "checkbox" ? resolveBool(it.checked) : false;
      const row = doc.createElement("div");
      row.className = "ppt-ctx-menu-row" + (disabled ? " disabled" : "");
      const check = doc.createElement("span");
      check.className = "check";
      check.textContent = it.kind === "checkbox" ? (checked ? "✓" : "") : "";
      const lbl = doc.createElement("span");
      lbl.className = "lbl";
      lbl.textContent = it.label ?? "";
      const sc = doc.createElement("span");
      sc.className = "sc";
      sc.textContent = it.shortcut ?? "";
      row.append(check, lbl, sc);
      if (!disabled && itemOnClick(it)) {
        // 用 mousedown 而不是 click：与编辑器 context-menu 一致，避免 Cursor 内置
        // 浏览器下 mouseup 不在 row 上时 click 链断裂；外层 docDown 会被 mousedown
        // stopPropagation 阻拦。
        row.addEventListener("mousedown", (ev) => {
          if (ev.button !== 0) return;
          ev.preventDefault();
          ev.stopPropagation();
          const origEvent = (el as unknown as { _triggerEvent?: MouseEvent })._triggerEvent;
          try {
            itemOnClick(it)?.(origEvent);
          } catch (e) {
            console.error("[ppt-player] context-menu onClick threw", e);
          }
          close();
        });
      }
      el.appendChild(row);
    }

    host.appendChild(el);

    // 触发该次菜单的鼠标事件挂在 el 上，供 onClick 取 clientX / clientY。
    (el as unknown as { _triggerEvent?: { clientX: number; clientY: number } })._triggerEvent =
      { clientX, clientY };

    // 位置：尽量与 trigger 鼠标点对齐，超出视口时回弹。
    const r = el.getBoundingClientRect();
    const vw = doc.defaultView?.innerWidth ?? clientX + r.width;
    const vh = doc.defaultView?.innerHeight ?? clientY + r.height;
    const x = Math.min(clientX, vw - r.width - 4);
    const y = Math.min(clientY, vh - r.height - 4);
    el.style.left = Math.max(4, x) + "px";
    el.style.top = Math.max(4, y) + "px";

    const onDocDown = (e: MouseEvent): void => {
      if (!el.contains(e.target as Node)) doClose();
    };
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        doClose();
      }
    };
    const onScroll = (): void => doClose();
    const onBlur = (): void => doClose();

    let registered = false;
    const armTimer = doc.defaultView?.setTimeout(() => {
      doc.addEventListener("mousedown", onDocDown, false);
      doc.addEventListener("keydown", onKey, true);
      doc.defaultView?.addEventListener("blur", onBlur, true);
      doc.defaultView?.addEventListener("wheel", onScroll, { passive: true, capture: true });
      registered = true;
    }, 0);

    const doClose = (): void => {
      if (registered) {
        doc.removeEventListener("mousedown", onDocDown, false);
        doc.removeEventListener("keydown", onKey, true);
        doc.defaultView?.removeEventListener("blur", onBlur, true);
        doc.defaultView?.removeEventListener("wheel", onScroll, true);
      } else if (armTimer !== undefined) {
        doc.defaultView?.clearTimeout(armTimer);
      }
      el.remove();
    };

    openMenu = { el, close: doClose };
  };

  const onContextMenu = (e: MouseEvent): void => {
    if (deps.enabled === false) return;
    e.preventDefault();
    open(e.clientX, e.clientY);
  };
  trigger.addEventListener("contextmenu", onContextMenu);

  const addInternal = (item: PlayerContextMenuItem, builtin = false): UIHandle => {
    const id = item.id ?? `ctx-${++insertCounter}-${Math.random().toString(36).slice(2, 8)}`;
    const rec: ItemRecord = {
      id,
      item: { ...item, id },
      insertOrder: insertCounter++,
      builtin,
    };
    records.set(id, rec);
    return {
      remove: () => {
        records.delete(id);
      },
    };
  };

  const api: PlayerContextMenuAPI = {
    addItem: (item) => addInternal(item, false),
    open,
    close,
  };

  return {
    api,
    addBuiltinItem: (item) => {
      addInternal(item, true);
    },
    invokeShortcut: (e: KeyboardEvent): boolean => {
      if (e.ctrlKey || e.metaKey || e.altKey) return false;
      for (const rec of collectVisibleItems(records)) {
        const it = rec.item;
        if (it.kind === "separator") continue;
        if (!shortcutMatches(it.shortcut, e)) continue;
        if (resolveBool(it.disabled)) return true;
        try {
          itemOnClick(it)?.();
        } catch (err) {
          console.error("[ppt-player] context-menu shortcut threw", err);
        }
        close();
        return true;
      }
      return false;
    },
    destroy: () => {
      close();
      trigger.removeEventListener("contextmenu", onContextMenu);
      records.clear();
    },
  };
}

// items 按 group → order → insertOrder 排序。同组保持相邻。
function collectVisibleItems(records: Map<string, ItemRecord>): ItemRecord[] {
  const arr = [...records.values()];
  // 第一遍：把同组的相邻关系建立起来 —— 用 (groupOrder, order, insertOrder) 做 key。
  // groupOrder 是按 group 首次出现的 min(order) 决定的；这样跨 group 排序稳定。
  const groupMinOrder = new Map<string, number>();
  for (const r of arr) {
    const g = r.item.group ?? "default";
    const o = r.item.order ?? 100;
    const prev = groupMinOrder.get(g);
    if (prev === undefined || o < prev) groupMinOrder.set(g, o);
  }
  return arr
    .filter((r) => r.item.kind !== "separator") // separator 由 group 切换自动生成，忽略
    .sort((a, b) => {
      const ga = a.item.group ?? "default";
      const gb = b.item.group ?? "default";
      const goa = groupMinOrder.get(ga) ?? 100;
      const gob = groupMinOrder.get(gb) ?? 100;
      if (goa !== gob) return goa - gob;
      if (ga !== gb) return ga < gb ? -1 : 1;
      const oa = a.item.order ?? 100;
      const ob = b.item.order ?? 100;
      if (oa !== ob) return oa - ob;
      return a.insertOrder - b.insertOrder;
    });
}

function resolveBool(v: boolean | (() => boolean) | undefined): boolean {
  if (typeof v === "function") {
    try {
      return !!v();
    } catch {
      return false;
    }
  }
  return !!v;
}

function itemOnClick(
  item: PlayerContextMenuItem,
): ((e?: MouseEvent) => void) | undefined {
  const extra = item as PlayerContextMenuItem & { onClick?: (e?: MouseEvent) => void };
  return extra.onClick ?? extra.onClick;
}

let stylesInjected = false;
function injectStyles(doc: Document): void {
  if (stylesInjected) return;
  if (doc.head.querySelector(`style[data-style="${STYLES_ID}"]`)) {
    stylesInjected = true;
    return;
  }
  const el = doc.createElement("style");
  el.setAttribute("data-style", STYLES_ID);
  el.textContent = STYLES;
  doc.head.appendChild(el);
  stylesInjected = true;
}
