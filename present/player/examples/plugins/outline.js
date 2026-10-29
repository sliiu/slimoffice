// 大纲（章节导航）插件 —— 用 slide.name 作为标题。
PPTPlayer.definePlugin({
  id: "outline",
  name: "Outline",
  version: "1.0.0",
  activate(ctx) {
    const panel = ctx.ui.addPanel({
      id: "outline",
      title: "大纲",
      order: 20,
      render: (body) => {
        const ul = document.createElement("ul");
        ul.style.cssText = "list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px;";
        const items = [];
        ctx.presentation.visibleOrder.forEach((absI, v) => {
          const slide = ctx.presentation.slides[absI];
          const li = document.createElement("li");
          li.textContent = `${v + 1}. ${slide.name || "Untitled"}`;
          li.style.cssText = "padding:6px 8px;border-radius:4px;cursor:pointer;color:#cbd5e1;";
          li.addEventListener("mouseenter", () => (li.style.background = "rgba(255,255,255,.08)"));
          li.addEventListener("mouseleave", () => (li.style.background = ""));
          li.addEventListener("click", () => ctx.player.goto(v));
          ul.appendChild(li);
          items.push({ v, li });
        });
        body.appendChild(ul);
        const update = (cur) => {
          for (const it of items) {
            it.li.style.background = it.v === cur ? "rgba(59,130,246,.25)" : "";
            it.li.style.color = it.v === cur ? "#fff" : "#cbd5e1";
          }
        };
        update(ctx.player.current());
        ctx.events.on("slidechange", (e) => update(e.visibleIndex));
      },
    });
  },
});
