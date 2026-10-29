# Player 插件 示例

这里提供若干开箱即用的插件，导出 HTML 时引入即可：

- `inspector.js` — 实时显示 PPT 信息、当前页/动画 step；带"+1 Step"工具栏按钮。
- `thumbnail-bar.js` — 右侧 dock 显示所有 slide 缩略图，点击跳转。
- `outline.js` — 右侧 dock 显示 slide 名称大纲，点击跳转。
- `versus.js` — 放映彩蛋。登录后在 **放映 → 插件** 里导入。它调用 `definePlaybackPlugin`，不进官方列表。

`versus.js` 不要塞进下面的 `buildHtml` 示例。那条路认的是 `PPTPlayer.definePlugin`。导入和导出 HTML 会自己提供 `definePlaybackPlugin`。

## 在导出 HTML 时挂载

```js
// scripts/export-html.mjs
import { readFileSync } from "node:fs";
import { buildHtml } from "@ppt/player";

const playerScript = readFileSync("./packages/player/dist/player.iife.js", "utf8");
const inspector = readFileSync("./packages/player/examples/plugins/inspector.js", "utf8");

const html = buildHtml(pres, playerScript, {
  title: "Deck",
  plugins: [
    inspector,            // 字符串：作为内联 <script> 注入
    { src: "./extras.js" } // 也可以引用外部脚本
  ],
});
```

> 调用顺序：bootstrap `<script>` 调用 `PPTPlayer.mount()` 之前，所有 `definePlugin()`
> 注册的插件会进入全局队列；mount() 完成后会自动激活所有队列里的插件。

### 手改一个已导出的 .html

导出后的 HTML `<body>` 顺序固定为：`#root` → player IIFE `<script>` → 插件 `<script>` →
bootstrap `<script>`（调用 `PPTPlayer.mount()`）。把你的插件 `<script>` 粘在 **player 之后、
bootstrap 之前**即可：

```html
<div id="root"></div>
<script src="./assets/player.js"></script>

<!-- ↓ 粘在这里：definePlugin 会进全局队列，mount() 时自动激活 -->
<script>/* 你的插件代码 */</script>

<script>(function(){ /* ... PPTPlayer.mount(root, pres, opts) ... */ })();</script>
```

## 自己写插件

```js
PPTPlayer.definePlugin({
  id: "my-plugin",
  activate(ctx) {
    // 拿信息
    console.log(ctx.presentation.slides);

    // 控制播放
    ctx.player.next();        // 推动画 step / 下一页
    ctx.player.goto(3);       // 跳到第 4 页（可见序列 0-based）
    ctx.player.gotoById("slide_5");

    // 监听事件
    const off = ctx.events.on("slidechange", (e) => {
      console.log("now at", e.visibleIndex, e.slide.name);
    });

    // 当前 slide 的 shape 模型（按名字认元素 / 命中测试 / 显隐 / 触发动画）
    const hint = ctx.scene.byName("hint");      // 按 PPT shape 名取（选择窗格可改名）
    if (hint) ctx.scene.setVisible(hint.id, false);
    ctx.scene.shapes().forEach((s) => console.log(s.name, s.kind, s.bbox, s.text));

    // 锁定导航：停用内置单击/键盘翻页与单击触发，由插件接管交互
    ctx.player.setNavigationLocked(true);
    ctx.ui.stageElement().addEventListener("pointerdown", (e) => {
      const pt = ctx.scene.toSlideCoords(e.clientX, e.clientY);
      const s = pt && ctx.scene.hitTest(pt.x, pt.y);     // 几何命中，backend 无关
      if (s && s.name === "answer") {
        ctx.player.triggerShape(s.id);                   // 播放该 shape 的单击动画
        ctx.player.setNavigationLocked(false);
      }
    });

    // 渲染缩略图
    const blob = await ctx.thumbnail.byVisibleIndex(0, { width: 320 });

    // 添加 UI
    ctx.ui.addPanel({
      title: "我的面板",
      render(body) { body.textContent = "Hello plugin!"; },
    });

    return () => off(); // 可选：cleanup
  },
});
```

## 运行时动态注册（ESM 场景）

```ts
import { mount } from "@ppt/player";

const handle = mount(host, pres);

// 任意时刻注册：
await handle.plugins.register({
  id: "later",
  activate(ctx) { /* ... */ },
});

// 卸载：
handle.plugins.unregister("later");
```

