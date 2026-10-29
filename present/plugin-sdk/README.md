# @ppt/plugin-sdk

PPT 播放器插件开发 SDK。**零运行时依赖**，可在浏览器（ESM / IIFE）和 Node（ESM / CJS）使用。

一个"插件"就是一个对象，核心是 `activate(ctx)` 函数。播放器在合适时机调用它，把一个
`PluginContext`（下文简称 `ctx`）交给你——你通过 `ctx` 读 PPT 信息、控制播放、监听事件、
查询/操作当前页的形状、加 UI。

- [安装](#安装)
- [插件生命周期](#插件生命周期)
- [使用场景](#使用场景)
- [PluginContext 总览](#plugincontext-总览)
- [`ctx.presentation` — PPT 元信息](#ctxpresentation--ppt-元信息)
- [`ctx.events` — 事件订阅](#ctxevents--事件订阅)
- [`ctx.player` — 播放控制](#ctxplayer--播放控制)
- [`ctx.scene` — 当前 slide 的形状模型](#ctxscene--当前-slide-的形状模型)
- [`ctx.ui` — UI 扩展](#ctxui--ui-扩展)
- [`ctx.contextMenu` — 右键菜单](#ctxcontextmenu--右键菜单)
- [`ctx.thumbnail` — 缩略图](#ctxthumbnail--缩略图)
- [`ctx.live` — 直播放映](#ctxlive--直播放映)
- [`ctx.shared` / `ctx.locale` / `ctx.log`](#ctxshared--ctxlocale--ctxlog)
- [自动执行 / 自动放映](#自动执行--自动放映)
- [完整示例：单选题](#完整示例单选题)
- [顶层 API](#顶层-api)
- [UI 主题定制](#ui-主题定制)
- [包结构](#包结构)

---

## 安装

```bash
pnpm add @ppt/plugin-sdk
```

或直接通过 CDN 引入（IIFE，浏览器 `<script>`）：

```html
<script src="path/to/plugin-sdk.iife.js"></script>
<!-- 暴露全局 window.PPTPluginSDK -->
```

> 注意：`@ppt/player` 的 IIFE 自身也暴露了 `PPTPlayer.definePlugin`，所以在导出 HTML / 单页
> 分发场景里**不需要**额外引入 plugin-sdk，直接用 `PPTPlayer.definePlugin(...)` 即可。

---

## 插件生命周期

```ts
interface Plugin {
  id: string;                  // 必填，唯一标识；重复 id 会被 PluginManager 拒绝
  name?: string;               // 展示名（可选）
  version?: string;            // 版本（可选）
  activate(ctx: PluginContext): PluginCleanup | void | Promise<PluginCleanup | void>;
  deactivate?(): void;         // 可选；unregister / destroy 时调用
}

type PluginCleanup = () => void; // activate 的返回值；卸载时调用
```

时间线：

1. **注册** —— 三种入口：
   - `PPTPlayer.mount(host, pres, { plugins: [p] })`
   - `definePlugin(p)` 注册到全局队列 `window.__PPTPlayerPluginQueue`，`mount()` 时自动消费
   - 运行时 `handle.plugins.register(p)`
2. **activate(ctx)** —— 注册后**自动**被调用（异步，不阻塞 mount）。返回的函数会被记为该插件的
   cleanup。`activate` 里就是你写"自动执行"逻辑的地方（见 [自动执行](#自动执行--自动放映)）。
3. **运行** —— 通过 `ctx` 与播放器交互；通过 `ctx.events` 响应翻页 / 动画推进。
4. **卸载** —— `handle.plugins.unregister(id)` 或 `handle.destroy()` 时：先调用 `activate`
   返回的 cleanup，再调用 `deactivate?.()`。务必在 cleanup 里移除自己加的事件监听 / DOM /
   计时器，避免泄漏。

> `composePlugins` 合成的插件：activate 按数组顺序，cleanup 逆序（LIFO）。

---

## 使用场景

### 1. 浏览器（ESM / Vite / Rollup）

```ts
import { definePlugin } from "@ppt/plugin-sdk";

definePlugin({
  id: "my-plugin",
  activate(ctx) {
    ctx.ui.addPanel({
      title: "Hello",
      render: (body) => (body.textContent = "Plugin loaded"),
    });
  },
});
```

`definePlugin` 把插件压入 `window.__PPTPlayerPluginQueue`；之后任何 `PPTPlayer.mount()` 都会
消费这个队列并激活插件。

### 2. 浏览器（IIFE / 单页 HTML 静态分发）

```html
<script src="./player.iife.js"></script>
<script>
  PPTPlayer.definePlugin({
    id: "my-plugin",
    activate(ctx) { /* ... */ },
  });
</script>
<script>
  // mount 时自动激活上面注册的插件
  PPTPlayer.mount(document.getElementById("root"), pres);
</script>
```

### 3. 导出 HTML 注入

`@ppt/player` 的 `buildHtml` / `buildHtmlBundle` 接受 `plugins` 选项，把插件脚本写进导出的 HTML：

```ts
import { readFileSync } from "node:fs";
import { buildHtml } from "@ppt/player";

const playerScript = readFileSync("node_modules/@ppt/player/dist/player.iife.js", "utf8");
const myPlugin = readFileSync("./my-plugin.js", "utf8"); // 内部调用 PPTPlayer.definePlugin(...)

const html = buildHtml(pres, playerScript, {
  plugins: [
    myPlugin,              // 字符串 → 作为内联 <script> 注入
    { src: "./extra.js" }, // 也可引用外部脚本
  ],
});
```

注入的 `<script>` 会插在 player IIFE 之后、bootstrap `PPTPlayer.mount()` 之前 —— 脚本里
`definePlugin(...)` 注册的插件进入全局队列，mount() 时自动激活。

也可以**手改一个已导出的 .html**：把插件 `<script>` 粘在 `<script src=".../player.js">` 之后、
最后那段 `(function(){ ... PPTPlayer.mount(...) })()` 之前即可。

### 4. Node（CJS / ESM）— 写测试 / 离线工具

```ts
import { definePlugin, createMockPluginContext } from "@ppt/plugin-sdk";

const plugin = definePlugin({
  id: "my-plugin",
  activate(ctx) { ctx.player.next(); },
});

const ctx = createMockPluginContext({ slideCount: 5 });
await plugin.activate(ctx);
console.assert(ctx.calls.next === 1); // 断言 player.next 被调了一次
```

---

## PluginContext 总览

`activate(ctx)` 拿到的 `ctx` 字段（全部只读，方法可调）：

| 字段 | 类型 | 说明 |
|---|---|---|
| `presentation` | `PresentationInfo` | 整份 PPT 的静态元信息（页列表、可见序列、尺寸、标题等） |
| `events` | `PlayerEventBus` | 订阅 `slidechange` / `stepchange` / `complete` / `destroy` |
| `player` | `PlayerControlAPI` | 翻页 / 推进动画 / 触发形状动画 / 锁定导航 |
| `scene` | `SceneAPI` | **当前页**的形状模型：查询 / 命中测试 / 显隐 / 触发动画 |
| `ui` | `PluginUIHost` | 加面板 / 工具栏按钮 / overlay / 取 root、stage 元素 |
| `contextMenu` | `PlayerContextMenuAPI` | 往播放器右键菜单加项 / 编程式打开关闭 |
| `thumbnail` | `ThumbnailAPI` | 渲染任意页的矢量 SVG 缩略图 |
| `live` | `PluginLiveAPI` | 直播放映房间里发给其他人。未接入时 `send` 为空操作 |
| `shared` | `Record<string, unknown>` | 同一次 mount 内所有插件共享的轻量 KV |
| `locale` | `string` | 宿主 UI 语言（已归一，如 `"en"` / `"zh-CN"`），用于本地化你渲染的文本 |
| `log(...args)` | `(...args) => void` | 带 `[plugin:<id>]` 前缀的 console.log |

---

## `ctx.presentation` — PPT 元信息

整份演示文稿的**静态快照**（mount 时构建，不随翻页变化）。

```ts
interface PresentationInfo {
  id: string;                       // PPT 唯一 id（通常对应 PPTX 内部 id）
  size: { width: number; height: number }; // slide 像素尺寸（EMU 已转成像素，如 1280×720）
  title?: string;                   // 文档标题（docProps/title）
  slides: SlideInfo[];              // 全量 slide，按文件原始顺序
  visibleOrder: number[];           // 按"可见放映顺序"排列的 slides 数组下标
  meta?: Record<string, unknown>;   // PPTX 顶层 meta（作者 / 关键字等）
}
```

`slides` 与 `visibleOrder` 的关系（关键，别搞混两套索引）：

- **绝对索引（absoluteIndex）**：`slides` 数组下标，永不变。隐藏页也占一个位置。
- **可见索引（visibleIndex）**：放映时实际看到的第几页（0 基）。`visibleOrder[visibleIndex]`
  = 对应的绝对索引。`ctx.player.goto(i)` 和 slidechange 事件里的 `visibleIndex` 都是这一套。

```ts
interface SlideInfo {
  id: string;                       // slide id
  name: string;                     // slide 名字
  index: number;                    // 绝对索引（在 slides 中的位置，不变量）
  visibleIndex: number;             // 可见序列中的位置；隐藏页为 -1
  show: boolean;                    // 是否可见（§19.3.1.37 sld@show=false → false）
  hasAnimations: boolean;           // 是否有可推进的动画 step
  totalAnimationSteps: number;      // mainSteps 步数（onClick + onLoad），无动画为 0
  notes?: string;                   // 备注文本
  transition?: { kind: string; duration: number }; // 切页转场（kind 如 "fade"/"cut"，duration 秒）
}
```

```ts
// 例：打印每一页（按可见顺序）的名字与动画步数
ctx.presentation.visibleOrder.forEach((absI, visibleI) => {
  const s = ctx.presentation.slides[absI];
  console.log(`#${visibleI} ${s.name} — ${s.totalAnimationSteps} 步动画`);
});
```

---

## `ctx.events` — 事件订阅

```ts
interface PlayerEventBus {
  on<E>(event: E, cb: (payload) => void): () => void; // 返回取消订阅函数
  off<E>(event: E, cb): void;
  emitCurrentSlide(): void;                            // 立刻重发一次最新的 slidechange
}
```

`on(...)` 返回一个**取消订阅函数**，务必在 cleanup 里调用。四个事件：

### `slidechange` — 切页

每次切到一张（含初始加载、`goto`、`next` 跨页、超链接跳转）后触发。

```ts
interface SlideChangeEvent {
  visibleIndex: number;   // 当前页的可见索引（0 基）
  absoluteIndex: number;  // 当前页的绝对索引（slides 下标）
  total: number;          // 可见页总数
  slide: SlideInfo;       // 当前页的 SlideInfo（totalAnimationSteps 已按运行时步数校正）
}

const off = ctx.events.on("slidechange", (e) => {
  console.log(`到第 ${e.visibleIndex + 1} / ${e.total} 页：${e.slide.name}`);
});
```

> ⚠️ 时序：插件 `activate` 通常发生在**初始页的 slidechange 已经触发之后**。要处理"当前页"，
> 在 activate 里主动跑一次逻辑（或调用 `ctx.events.emitCurrentSlide()` 让它补发一次）。

### `stepchange` — 动画步推进

当前页的动画 step 前进 / 回退（`nextStep` / 单击推进 / `triggerShape` 等）后触发。

```ts
interface StepChangeEvent {
  visibleIndex: number;   // 当前页可见索引
  absoluteIndex: number;  // 当前页绝对索引
  currentStep: number;    // 当前已推进到第几步（0 基）
  totalSteps: number;     // 该页总步数
}

ctx.events.on("stepchange", (e) => {
  console.log(`动画 ${e.currentStep} / ${e.totalSteps}`);
});
```

### `complete` — 放映结束

到达最后一页之后再推进、点了"结束放映"菜单、或命中 `endShow` 超链接时触发。payload 为 `void`。

```ts
ctx.events.on("complete", () => console.log("放映结束"));
```

### `destroy` — 播放器销毁

`handle.destroy()` 时触发（在插件 cleanup 之前）。payload 为 `void`。一般用 cleanup 即可，
不必单独订阅。

---

## `ctx.player` — 播放控制

```ts
interface PlayerControlAPI {
  next(): void;            // 推进一个动画 step；该页步数用尽则翻到下一页；已是末页则触发 complete
  prev(): void;            // 上一页（注意：不是回退一个 step）
  goto(visibleIndex: number): void;  // 跳到指定可见页（0 基）
  gotoById(slideId: string): boolean; // 按 slide id 跳；找不到返回 false
  current(): number;       // 当前可见索引
  total(): number;         // 可见页总数

  nextStep(): boolean;     // 仅推进一个 onClick step；true=推进了，false=本页已无更多 step
  triggerShape(shapeId: string): boolean; // 播放某形状的"单击触发"动画；无则 false
  step(): { totalSteps: number; currentStep: number }; // 当前页动画进度
  freezeActive(): void;    // 把所有进行中的 step 冻结到末态（用于确定性截图）

  setNavigationLocked(locked: boolean): void; // 锁定/解锁内置导航（见下）
  isNavigationLocked(): boolean;
}
```

要点说明：

- **`next()` vs `nextStep()`**：`next()` 是"用户按空格/点一下"的语义——先吃掉一个动画 step，
  没 step 了才翻页，末页再调会触发 `complete`。`nextStep()` 只推进 step，**不翻页**，到头返回
  `false`，适合自己控制"先放完动画再决定要不要翻页"。
- **`triggerShape(shapeId)`**：`shapeId` 是**渲染节点 id**（= DOM `<g>` 的 `data-id`，形如
  `sp_<spid>`），与 `ctx.scene` 返回的 `ShapeInfo.id` 一致。只有当该形状在 PPTX 里设置了
  "单击时"触发的动画时才有效。
- **`setNavigationLocked(true)`**：锁定期间，播放器内置的「单击翻页 / 推进」「键盘翻页」
  「单击形状触发动画 / 超链接」全部停用，把交互让给插件（典型：单选题答题前不让观众点空白处
  翻页）。**不影响** `next()` / `goto()` 等编程式 API——你仍可代码驱动。记得在 cleanup 里解锁。

```ts
// 例：做一个"只能通过插件按钮翻页"的受控放映
ctx.player.setNavigationLocked(true);
ctx.ui.addToolbarButton({ label: "下一页", onClick: () => ctx.player.next() });
return () => ctx.player.setNavigationLocked(false);
```

---

## `ctx.scene` — 当前 slide 的形状模型

与渲染 backend / DOM 解耦，按 PPT 里的 shape 名字（PowerPoint「选择窗格」可改名）认元素、
做命中测试、显隐控制、触发动画。**坐标统一用 slide 内部坐标**（与 OOXML 一致，非屏幕像素）。
方法都作用于**当前页**，换页后自动指向新页。

```ts
interface SceneAPI {
  shapes(): ShapeInfo[];               // 当前页全部顶层 shape，按 z 序从底到顶
  byName(name): ShapeInfo | null;      // 按 shape 名精确匹配，返回第一个
  allByName(name): ShapeInfo[];        // 按 shape 名精确匹配，返回全部
  byId(id): ShapeInfo | null;          // 按渲染节点 id（data-id）取
  hitTest(x, y): ShapeInfo | null;     // slide 坐标命中最顶层"可见"shape
  toSlideCoords(clientX, clientY): { x; y } | null; // 屏幕坐标 → slide 坐标；未布局好返回 null
  setVisible(id, visible): boolean;    // 显隐 shape；找不到 id 返回 false
  setOpacity(id, opacity): boolean;    // 设透明度 [0,1]；找不到 id 返回 false
  triggerShape(id): boolean;           // 等价 ctx.player.triggerShape
}

interface ShapeInfo {
  id: string;                 // 渲染节点 id（= DOM <g> 的 data-id，形如 sp_<spid>），可传给 triggerShape
  name: string;               // shape 名（PPTX <p:cNvPr name>，选择窗格里可编辑）
  kind: string;               // 类型：text / image / rect / ellipse / line / group / chart ...
  bbox: { x; y; w; h };       // slide 坐标系下的包围盒
  visible: boolean;           // 当前是否可见（综合初始 visible、动画 visibleOverride 与 opacity>0）
  text?: string;              // 纯文本（文字 shape / 含文字的 group 才有），便于按文案识别
  hasClickAnimation: boolean; // 是否有可被 triggerShape 播放的"单击触发"动画
}
```

要点：

- **怎么"认"元素**：推荐在 PowerPoint「选择窗格」里给关键形状起可识别的名字（如 `answerBtn`、
  `hint`），再用 `byName` / `allByName` 找。`hitTest` 适合"点哪个形状"的交互——它走几何，
  **hybrid 与 svg backend 都能用**，不依赖 DOM。
- **显隐如何生效**：`setVisible` / `setOpacity` 改的是渲染节点的动画覆盖值，会触发 backend 重绘，
  且不会被动画系统的重绘清掉（比直接改 DOM `style` 稳）。
- **`triggerShape` 配合 `hasClickAnimation`**：先用 `hasClickAnimation` 判断该形状是否有可触发动画，
  再调 `triggerShape(shape.id)` 播放 PPT 原生入场/强调动画。

```ts
// 例：点击 slide 上名为 "answer" 的形状时，播放它的入场动画并解锁翻页
ctx.player.setNavigationLocked(true);
ctx.ui.stageElement().addEventListener("pointerdown", (e) => {
  const pt = ctx.scene.toSlideCoords(e.clientX, e.clientY); // 屏幕 → slide 坐标
  const hit = pt && ctx.scene.hitTest(pt.x, pt.y);          // 命中最顶层可见形状
  if (hit && hit.name === "answer") {
    if (hit.hasClickAnimation) ctx.scene.triggerShape(hit.id);
    ctx.player.setNavigationLocked(false);
  }
});
```

---

## `ctx.ui` — UI 扩展

```ts
interface PluginUIHost {
  addPanel(opts: PanelOptions): UIHandle;          // dock 里加一个可折叠面板
  addToolbarButton(opts: ToolbarButtonOptions): UIHandle; // 底部控件栏加按钮
  addOverlay(opts: OverlayOptions): UIHandle;      // 在 slide 上叠一层 HTML（按 slide 坐标定位）
  mount(node: HTMLElement): UIHandle;              // 直接往 player root 上 append（完全自定义布局）
  setDockOpen(open: boolean): void;
  toggleDock(): void;
  isDockOpen(): boolean;
  rootElement(): HTMLElement;   // 播放器最外层容器（.ppt-host）
  stageElement(): HTMLElement;  // slide 舞台（形状渲染在这里面）
}

interface UIHandle { remove(): void; } // 移除这个 UI；插件 cleanup 时也应调用
```

各方法：

```ts
// 面板：dock 里一块可折叠区域
ctx.ui.addPanel({
  id: "stats",                    // 可选，便于复用 / 去重
  title: "统计",                  // 标题栏文字
  order: 0,                       // 排序权重，越小越靠上（默认 100）
  initialOpen: true,              // 初始是否展开
  render(body) {                  // body 是面板内容容器，自己往里塞 DOM
    body.textContent = "Hello";
  },
});

// 工具栏按钮：底部控件栏
ctx.ui.addToolbarButton({
  label: "+1 Step",               // 按钮文字
  tooltip: "推进一个动画 step",    // 悬浮提示（可选）
  position: "end",                // "start" | "end"，放控件栏左 / 右（可选）
  onClick: (e) => ctx.player.nextStep(),
});

// Overlay：在 slide 上叠 HTML，bbox 用 slide 坐标（不是屏幕像素），会跟随 slide 缩放
const node = document.createElement("div");
node.textContent = "重点!";
const overlay = ctx.ui.addOverlay({
  bbox: { x: 100, y: 80, w: 240, h: 60 }, // slide 坐标；省略则铺满
  zIndex: 50,
  node,
});

// 取容器：root 是最外层，stage 是 slide 舞台（监听点击、放绝对定位元素时常用）
const stage = ctx.ui.stageElement();
```

> Headless 模式（`mount({ ui: { headless: true } })`）下没有内置 dock / 工具栏；`addPanel` /
> `addToolbarButton` 会自动 fallback 成浮动容器，`addOverlay` / `mount` 行为不变。

---

## `ctx.contextMenu` — 右键菜单

往播放器自带的右键菜单里加项。

```ts
interface PlayerContextMenuAPI {
  addItem(item: PlayerContextMenuItem): UIHandle; // 加一项，返回 handle.remove()
  open(x: number, y: number): void;               // 编程式在屏幕坐标打开菜单
  close(): void;                                   // 关闭已打开的菜单
}

interface PlayerContextMenuItem {
  id?: string;            // 可选 id，便于运行时移除
  kind?: "item" | "checkbox" | "separator"; // 默认 "item"
  label?: string;         // 显示文字（separator 可省）
  shortcut?: string;      // 右侧灰色快捷键提示（仅显示，不绑定）
  order?: number;         // 排序权重，越小越靠上（默认 100）
  group?: string;         // 分组键；不同 group 间自动加分隔线
  checked?: boolean | (() => boolean);  // checkbox 勾选态，可传函数（每次打开菜单时求值）
  disabled?: boolean | (() => boolean); // 是否禁用，可传函数
  onClick?: (e?: MouseEvent) => void;   // 点击回调；e 是触发右键的事件（含 clientX/Y）
}
```

```ts
// 例：加一个可勾选项
let on = false;
ctx.contextMenu.addItem({
  id: "myplugin:toggle",
  kind: "checkbox",
  label: "显示标注",
  group: "plugin",
  checked: () => on,                 // 函数形式 → 每次打开都重新求值
  onClick: () => { on = !on; },
});
```

---

## `ctx.thumbnail` — 缩略图

把任意页渲染成**矢量 SVG** 缩略图（保真、可缩放、同步可得）。

```ts
type ThumbnailTarget =
  | number                      // 可见序列索引（最常用）
  | { visibleIndex: number }    // 等价于直接传 number
  | { absoluteIndex: number }   // slides 数组绝对索引
  | { id: string };             // slide id

interface ThumbnailAPI {
  mount(host, target, opts?): ThumbnailHandle; // 推荐：直接挂到 host，返回 { element, destroy() }
  toSvgString(target, opts?): string;          // 同步取 SVG 字符串
  toSvgBlob(target, opts?): Blob;              // SVG Blob（image/svg+xml）
  toDataUrl(target, opts?): string;            // SVG data URL
  clearCache(): void;
  // 兼容旧位图 API（已废弃，改用上面）：byVisibleIndex / byAbsoluteIndex / byId / dataUrlByVisibleIndex
}
```

```ts
// 例：在面板里渲染第 1 页缩略图
ctx.ui.addPanel({
  title: "预览",
  render(body) {
    const box = document.createElement("div");
    box.style.aspectRatio = `${ctx.presentation.size.width} / ${ctx.presentation.size.height}`;
    body.appendChild(box);
    ctx.thumbnail.mount(box, 0); // 0 = 第一张可见页
  },
});
```

---

## `ctx.live` — 直播放映

未接入直播放映时 `attached()` 为 `false`，`send` 什么也不做。接入之后，主持人和已准入的观众都能发、都能收。消息按插件 `id` 分开。

翻页、动画步和已嵌入的音视频由主持页同步。这里只传插件自己的状态。`data` 的 JSON 文本超过 65536 个字符会被丢掉。`snap: true` 只保留这个插件最近的一份，后加入的人接通时先拿到它。`onAttach(true)` 时把当前状态再发一次。

`setVisible` / `setOpacity` 只作用在调用它们的那一台浏览器上。房间里要一起变，就在 `on` 里再调一次。

官方白板把每一页笔迹收成一份快照（`snap: true`）。官方激光笔发送幻灯片坐标，按 `meta.from` 每人画一个点，松开时再 snap 一条关掉。

| 做法 | 消息 | `snap` |
|---|---|---|
| 答题计票 | `{ t: "vote", q, choice }`，按 `from` 每人一票 | 换题时发出当前题号 |
| 揭晓 | `{ t: "show", id, visible }`，收到后 `setVisible` 或 `triggerShape` | 要 |
| 提问 | 面板里的一行文本，主持人按 `from` 排队 | 队列还在时要 |
| 反应 | `{ t: "emoji", emoji }`，遮罩上短暂显示 | 不要 |
| 倒计时 | 结束时刻，各端用本地时钟相减 | 要 |
| 聚光 | 幻灯片坐标，画一个圈 | 松开时发一条关掉的快照 |

主持页和观众页跑的是这场快照里打包的同一份插件。改了源码之后要重新推送快照。

编辑插件没有这条通道。协作同步的是 `execute` 写进文稿的形状、文本、幻灯片、动画和批注；面板留在本机。要把直播里的结果留在稿里，回到编辑器再执行一条命令。

```js
PPTPlayer.definePlugin({
  id: "acme.vote",
  activate(ctx) {
    const tally = new Map();
    const off = ctx.live.on((data, meta) => {
      if (!data || data.t !== "vote") return;
      tally.set(meta.from, data.choice);
    });
    const offAttach = ctx.live.onAttach((on) => {
      if (on) ctx.live.send({ t: "q", n: 1 }, { snap: true });
    });
    const button = ctx.ui.addToolbarButton({
      label: "A",
      onClick() {
        ctx.live.send({ t: "vote", q: 1, choice: "A" });
      },
    });
    return () => {
      off();
      offAttach();
      button.remove();
    };
  },
});
```

下面的单选题可以继续只在本机判对错。要让主持人看见每人的选择，在点中选项时再 `ctx.live.send({ t: "vote", choice })`。

---

## `ctx.shared` / `ctx.locale` / `ctx.log`

```ts
// shared：同一次 mount 内所有插件共享的对象，用来跨插件传状态
ctx.shared.quizScore = (ctx.shared.quizScore ?? 0) + 1;

// locale：宿主 UI 语言（已归一，如 "en" / "zh-CN"）。据此本地化你渲染的文本
const label = ctx.locale === "zh-CN" ? "下一页" : "Next";

// log：带 [plugin:<id>] 前缀的 console.log
ctx.log("activated", ctx.presentation.slides.length, "slides");
```

---

## 自动执行 / 自动放映

**问：SDK 支持插件"设置自动执行"吗？**

分两层理解：

1. **插件本身就是自动执行的。** 你不需要用户手动点什么——只要插件被注册（`mount({plugins})` /
   `definePlugin()` 进队列 / `handle.plugins.register()`），它的 `activate(ctx)` 就会在 mount 时
   **自动被调用**。`activate` 里写的逻辑即"插件加载即执行"。

2. **没有声明式的"自动放映/定时推进"字段**——Plugin 对象上没有 `autoRun` 之类配置。但要实现
   "自动推进动画 / 自动翻页 / 循环放映 / kiosk"，在 `activate` 里用标准计时器 + `ctx.player`
   即可，几行就够。

另外两个相关的、**非插件层**的开关（在 `mount` / `buildHtml` 选项里，不在 SDK 里）：

- `mount({ autoplay })`（默认 `true`）：进入每页后自动播放该页的 onLoad 入场动画。
- `mount({ clickAdvance, keyboard })`：是否允许单击 / 键盘推进。

播放器**不会**自动翻到下一页（没有内置 inter-slide 定时器）；"自动放映"需要插件自己驱动：

```ts
// 自动放映 / kiosk 插件：每 3 秒推进一步（step 用尽自动翻页），到末页循环回首页
PPTPlayer.definePlugin({
  id: "autoplay-kiosk",
  activate(ctx) {
    const INTERVAL = 3000;
    let timer = 0;

    const tick = () => {
      // nextStep() 只推进动画，不翻页；返回 false 表示本页动画放完了
      if (!ctx.player.nextStep()) {
        // 动画放完：翻下一页；若已是末页则回到第 0 页（循环）
        const cur = ctx.player.current();
        if (cur + 1 < ctx.player.total()) ctx.player.goto(cur + 1);
        else ctx.player.goto(0);
      }
    };

    const start = () => { stop(); timer = window.setInterval(tick, INTERVAL); };
    const stop = () => { if (timer) { clearInterval(timer); timer = 0; } };

    start();

    // 放映结束事件（例如手动点了"结束放映"）→ 停掉计时器
    const off = ctx.events.on("complete", stop);

    return () => { stop(); off(); }; // cleanup：务必清掉计时器和订阅
  },
});
```

> 想"延后再开始"或"只在某些页自动推进"，把 `setTimeout` / 条件判断加进 `tick` 即可；想用每页的
> 转场时长，读 `ctx.presentation.slides[absI].transition?.duration`。

---

## 完整示例：单选题

把一页变成可交互单选题，全靠 PPT 里的 shape 命名驱动。`ctx.scene.hitTest` 基于几何，
hybrid / svg backend 都能用。

```js
PPTPlayer.definePlugin({
  id: "single-choice-quiz",
  activate(ctx) {
    const stage = ctx.ui.stageElement();

    // 从 shape 名解析角色：quiz:option / quiz:correct / quiz:win / quiz:fail
    const role = (s) => (/^quiz:(option|correct|win|fail)\b/.exec(s.name) || [])[1];

    let isQuiz = false;   // 当前页是否为题目页
    let answered = false; // 是否已答对（答对后解锁翻页）

    // 进入每页时调用：判断是否题目页，是则隐藏提示并锁住翻页
    const setup = () => {
      ctx.player.setNavigationLocked(false); // 先复位上一页可能的锁定
      answered = false;
      const shapes = ctx.scene.shapes();
      isQuiz =
        shapes.some((s) => ["option", "correct"].includes(role(s))) && // 有选项
        shapes.some((s) => ["win", "fail"].includes(role(s)));          // 有提示
      if (!isQuiz) return;
      // 隐藏胜利 / 失败提示
      shapes.forEach((s) => {
        if (["win", "fail"].includes(role(s))) ctx.scene.setVisible(s.id, false);
      });
      ctx.player.setNavigationLocked(true);  // 答题前锁住翻页 / 推进
    };

    // 点击：命中选项才处理，否则（锁定下）什么都不做即"吃掉"翻页
    const onDown = (e) => {
      if (!isQuiz || answered) return;
      const pt = ctx.scene.toSlideCoords(e.clientX, e.clientY);
      const hit = pt && ctx.scene.hitTest(pt.x, pt.y);
      const r = hit && role(hit);
      if (r !== "option" && r !== "correct") return; // 点到非选项 → 忽略
      e.stopPropagation();
      const target = r === "correct" ? "win" : "fail";
      // 显示对应提示
      ctx.scene.shapes().forEach((s) => {
        if (role(s) === target) ctx.scene.setVisible(s.id, true);
      });
      if (r === "correct") {
        answered = true;
        ctx.player.setNavigationLocked(false); // 答对 → 解锁，可继续翻页
      }
      // 答错保持锁定，可重试
    };
    stage.addEventListener("pointerdown", onDown);

    const off = ctx.events.on("slidechange", setup); // 每次切页重新判断
    setup();                                         // 处理初始页

    return () => { // cleanup：解锁、移除监听
      off();
      stage.removeEventListener("pointerdown", onDown);
      ctx.player.setNavigationLocked(false);
    };
  },
});
```

> 把这段代码存成 `quiz.js`，用 `buildHtml(pres, player, { plugins: [readFileSync("quiz.js","utf8")] })`
> 注入导出 HTML 即可。要给胜利/失败提示加揭示动画，可在 `setVisible(id, true)` 后用
> `ctx.scene.triggerShape(id)` 播放 PPT 原生动画，或自行加 CSS class。

---

## 顶层 API

### `definePlugin(plugin)`

类型推导 + 运行时校验（`id` / `activate` 必填）+ 浏览器自动注册到全局队列。返回原插件对象。

### `composePlugins(id, plugins[])`

把多个插件合成一个；activate 按数组顺序执行，cleanup 逆序（LIFO）。适合把一组功能打包发布。

```ts
const grouped = composePlugins("toolkit", [inspectorPlugin, thumbnailPlugin, outlinePlugin]);
```

### `withErrorBoundary(plugin)`

包装插件，`activate` 抛错时被吞掉（`console.error` 上报），不影响其它插件加载。

### `createMockPluginContext(opts?)`

Node 中模拟 `PluginContext`（含 `scene` 桩），用于单测插件逻辑，无需真实 DOM / 渲染。

```ts
const ctx = createMockPluginContext({
  slideCount: 5,                 // 生成 5 张 mock slide
  // slides: [...],              // 或直接给 SlideInfo[]
  title: "Test Deck",
  size: { width: 1280, height: 720 },
  shapes: [                      // 注入当前页 shape 快照，供 ctx.scene.* 返回
    { id: "sp_1", name: "quiz:correct", kind: "rect",
      bbox: { x: 0, y: 0, w: 100, h: 40 }, visible: true, hasClickAnimation: false },
  ],
  locale: "zh-CN",
  // document: jsdomDocument,    // 可注入 jsdom，让 ui.* 返回真实元素
});
```

返回值除 `PluginContext` 全部字段外，还提供：

- `fireSlideChange(visibleIndex)` — 手动触发 `slidechange`
- `fireStepChange(currentStep, totalSteps)` — 手动触发 `stepchange`
- `calls` — 控制 API 调用历史（断言用）：`next` / `prev` / `goto` / `gotoById` / `nextStep` /
  `triggerShape` / `freezeActive` / `setNavigationLocked` / `setVisible` / `setOpacity`

```ts
const plugin = definePlugin({ id: "p", activate: (c) => c.player.setNavigationLocked(true) });
const ctx = createMockPluginContext();
await plugin.activate(ctx);
console.assert(ctx.calls.setNavigationLocked.at(-1) === true);
```

---

## UI 主题定制

通过 `PPTPlayer.mount(host, pres, { ui })` 或 `buildHtml(..., { ui })` 配置（这是 `mount` 选项，
不是插件 API）：

```ts
{
  ui: {
    headless: false,                // true: 不创建内置 dock，addPanel 走浮动面板
    dockPosition: "right",          // "left" | "right" | "top" | "bottom"
    dockSize: 320,                  // dock 宽（左右）/ 高（上下）px
    dockInitialOpen: true,
    themeMode: "dark",              // "dark" | "light" | "auto"
    cssVars: {                      // 任意 CSS 变量覆盖（自动加 --ppt- 前缀）
      accent: "#9333ea",
      "dock-bg": "rgba(250,248,255,.96)",
      "font-size": "14px",
    },
    customCss: ".ppt-host { ... }", // 自定义 CSS 文本
    hostClassName: "my-theme",      // 给 .ppt-host 加 className
  },
}
```

### CSS 变量列表

| 变量                     | 默认（dark）                | 默认（light）               | 用途      |
| ---------------------- | ----------------------- | ----------------------- | ------- |
| `--ppt-dock-bg`        | `rgba(20,20,24,.92)`    | `rgba(255,255,255,.96)` | dock 背景 |
| `--ppt-dock-fg`        | `#e5e7eb`               | `#1f2937`               | dock 文字 |
| `--ppt-dock-border`    | `rgba(255,255,255,.08)` | `rgba(0,0,0,.08)`       | dock 边框 |
| `--ppt-dock-radius`    | `0`                     | `0`                     | dock 圆角 |
| `--ppt-panel-head-fg`  | `#cbd5e1`               | `#374151`               | 面板标题    |
| `--ppt-panel-head-bg`  | `rgba(255,255,255,.02)` | `rgba(0,0,0,.02)`       | 面板标题底   |
| `--ppt-toolbar-btn-bg` | `rgba(255,255,255,.12)` | `rgba(0,0,0,.06)`       | 工具栏按钮底  |
| `--ppt-toolbar-btn-fg` | `#fff`                  | `#1f2937`               | 工具栏按钮文字 |
| `--ppt-accent`         | `#3b82f6`               | `#2563eb`               | 强调色     |
| `--ppt-font`           | system                  | system                  | 字体族     |
| `--ppt-font-size`      | `13px`                  | `13px`                  | 基础字号    |

完整列表见 `src/plugin-ui.ts` 中的 `DEFAULT_DARK_VARS`。

### Headless 模式（完全自定义 UI）

```ts
PPTPlayer.mount(host, pres, {
  ui: { headless: true },
  plugins: [{
    id: "my-ui",
    activate(ctx) {
      const panel = document.createElement("div");
      panel.style.cssText = "position:fixed;left:0;top:0;...";
      ctx.ui.mount(panel); // mount 到 host root，destroy 时自动清理
    },
  }],
});
```

Headless 下 `addPanel` 自动 fallback 为浮动面板，`addToolbarButton` fallback 到 host 右上角浮动条。

---

## 包结构

- `dist/index.js` — ESM bundle（浏览器 + Node ESM）
- `dist/index.cjs` — CJS bundle（Node require）
- `dist/plugin-sdk.iife.js` — IIFE，浏览器 `<script>`，挂到 `window.PPTPluginSDK`
- `src/*.ts` — 源码，TS 类型即定义文件

`SDK_VERSION` 常量可在运行时读到当前版本（当前 `0.2.0`，新增 `ctx.scene` 与
`ctx.player.setNavigationLocked`）。
