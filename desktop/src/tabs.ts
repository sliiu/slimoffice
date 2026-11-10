export interface TabItem {
  id: string;
  name: string;
  dirty: boolean;
}

export function mountTabBar(
  host: HTMLElement,
  locale: "zh-CN" | "en",
  actions: {
    onHome: () => void;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
  },
): { render(active: "home" | string, files: TabItem[]): void } {
  const homeLabel = locale === "zh-CN" ? "首页" : "Home";
  return {
    render(active, files) {
      host.replaceChildren();
      const home = document.createElement("button");
      home.type = "button";
      home.className = "tab tab-home" + (active === "home" ? " is-active" : "");
      home.textContent = homeLabel;
      home.addEventListener("click", actions.onHome);
      host.append(home);
      for (const file of files) {
        const tab = document.createElement("div");
        tab.className = "tab" + (file.id === active ? " is-active" : "");
        const button = document.createElement("button");
        button.type = "button";
        button.className = "tab-label";
        button.textContent = (file.dirty ? "• " : "") + file.name;
        button.addEventListener("click", () => actions.onSelect(file.id));
        const close = document.createElement("button");
        close.type = "button";
        close.className = "tab-close";
        close.setAttribute("aria-label", locale === "zh-CN" ? "关闭" : "Close");
        close.textContent = "×";
        close.addEventListener("click", (event) => {
          event.stopPropagation();
          actions.onClose(file.id);
        });
        tab.append(button, close);
        host.append(tab);
      }
    },
  };
}
