// 缩略图侧边栏插件
//
// 功能：
//   - 在右侧 dock 添加一个面板，展示所有可见 slide 的矢量 SVG 缩略图（和编辑器同源）
//   - 点击缩略图直接跳转
//   - 当前页高亮
//   - 监听 slidechange 事件同步高亮
//
// 用法（IIFE / HTML）：
//   <script src="./assets/player.js"></script>
//   <script src="./plugins/thumbnail-bar.js"></script>

PPTPlayer.definePlugin({
  id: "thumbnail-bar",
  name: "Slide thumbnails",
  version: "1.1.0",
  activate(ctx) {
    let container = null;
    const itemEls = new Map(); // visibleIndex -> HTMLDivElement
    const thumbHandles = []; // 缩略图 destroy handle，用于 cleanup

    ctx.ui.addPanel({
      id: "thumbnail-bar",
      title: "缩略图",
      order: 10,
      render: (body) => {
        body.classList.add("ppt-thumb-list");
        container = body;
        renderAll();
      },
    });

    function renderAll() {
      if (!container) return;
      // 清理旧的 backend 实例
      while (thumbHandles.length) thumbHandles.pop().destroy();
      container.textContent = "";
      itemEls.clear();

      const total = ctx.player.total();
      const visibleOrder = ctx.presentation.visibleOrder;
      const ar = ctx.presentation.size.width + " / " + ctx.presentation.size.height;

      for (let v = 0; v < total; v++) {
        const absI = visibleOrder[v];
        const slide = ctx.presentation.slides[absI];

        const item = document.createElement("div");
        item.style.cssText = [
          "cursor:pointer",
          "border:2px solid transparent",
          "border-radius:4px",
          "overflow:hidden",
          "flex:0 0 auto",
          "transition:border-color .15s",
        ].join(";");

        const idxLabel = document.createElement("div");
        idxLabel.textContent = (v + 1) + ". " + (slide?.name ?? "");
        idxLabel.style.cssText = "font-size:11px;padding:4px 6px;color:var(--ppt-panel-head-fg,#94a3b8);";
        item.appendChild(idxLabel);

        const thumbHost = document.createElement("div");
        thumbHost.style.cssText = "aspect-ratio:" + ar + ";width:100%;background:#fff;display:block;overflow:hidden;";
        item.appendChild(thumbHost);

        item.addEventListener("click", () => ctx.player.goto(v));
        container.appendChild(item);
        itemEls.set(v, item);

        // 用矢量 SVG 渲染（与编辑器 slide list 完全一致的视觉）
        try {
          const handle = ctx.thumbnail.mount(thumbHost, v);
          thumbHandles.push(handle);
        } catch (e) {
          ctx.log("mount thumbnail failed for visible " + v, e);
          thumbHost.textContent = "—";
        }
      }

      highlight(ctx.player.current());
    }

    function highlight(v) {
      for (const [k, el] of itemEls) {
        el.style.borderColor = k === v ? "var(--ppt-accent,#3b82f6)" : "transparent";
      }
    }

    const off = ctx.events.on("slidechange", (e) => highlight(e.visibleIndex));

    // cleanup
    return () => {
      off();
      while (thumbHandles.length) thumbHandles.pop().destroy();
    };
  },
});
