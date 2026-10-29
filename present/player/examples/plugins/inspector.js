// 状态检查插件 —— 实时显示 PPT 信息和动画 step。
// 同时演示了：
//   - addToolbarButton 在播放器底部控件栏插入按钮
//   - 监听 stepchange 事件
//   - 通过 player.nextStep() / triggerShape() 编程控制动画
PPTPlayer.definePlugin({
  id: "inspector",
  name: "Inspector",
  version: "1.0.0",
  activate(ctx) {
    let stateEl = null;

    ctx.ui.addPanel({
      id: "inspector",
      title: "运行状态",
      order: 0,
      render: (body) => {
        const info = document.createElement("div");
        info.style.cssText = "font-size:12px;color:#cbd5e1;display:flex;flex-direction:column;gap:6px;";
        info.innerHTML = `
          <div><b>PPT 标题：</b>${escape(ctx.presentation.title ?? "(none)")}</div>
          <div><b>尺寸：</b>${ctx.presentation.size.width} × ${ctx.presentation.size.height}</div>
          <div><b>总页数：</b>${ctx.presentation.slides.length} (可见 ${ctx.presentation.visibleOrder.length})</div>
        `;
        body.appendChild(info);
        stateEl = document.createElement("pre");
        stateEl.style.cssText = "margin:0;font-size:11px;color:#94a3b8;white-space:pre-wrap;";
        body.appendChild(stateEl);
        update();

        const btns = document.createElement("div");
        btns.style.cssText = "display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;";
        btns.appendChild(button("⏮ 上一页", () => ctx.player.prev()));
        btns.appendChild(button("Step ▶", () => ctx.player.nextStep()));
        btns.appendChild(button("⏭ 下一页", () => ctx.player.next()));
        btns.appendChild(button("冻结末态", () => ctx.player.freezeActive()));
        body.appendChild(btns);
      },
    });

    ctx.ui.addToolbarButton({
      label: "+1 Step",
      tooltip: "推进一个动画 step",
      onClick: () => ctx.player.nextStep(),
    });

    function update() {
      if (!stateEl) return;
      const cur = ctx.player.current();
      const total = ctx.player.total();
      const step = ctx.player.step();
      const absI = ctx.presentation.visibleOrder[cur];
      const slide = ctx.presentation.slides[absI];
      stateEl.textContent = JSON.stringify(
        {
          page: `${cur + 1} / ${total}`,
          slideId: slide?.id,
          slideName: slide?.name,
          step: `${step.currentStep} / ${step.totalSteps}`,
        },
        null,
        2,
      );
    }

    ctx.events.on("slidechange", update);
    ctx.events.on("stepchange", update);

    function button(label, onClick) {
      const b = document.createElement("button");
      b.textContent = label;
      b.style.cssText = "background:rgba(59,130,246,.2);color:#fff;border:1px solid rgba(59,130,246,.4);padding:4px 10px;border-radius:4px;font-size:11px;cursor:pointer;";
      b.addEventListener("click", onClick);
      return b;
    }

    function escape(s) {
      return String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);
    }
  },
});
