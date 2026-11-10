import { officeKind, type OfficeKind } from "./kinds";

export interface RecentFile {
  path: string;
  name: string;
  openedAt: number;
}

export interface FileHome {
  refresh(): Promise<void>;
  setNotice(notice: string | null): void;
}

const kindLabel: Record<OfficeKind, { "zh-CN": string; en: string }> = {
  present: { "zh-CN": "演示文稿", en: "Presentation" },
  document: { "zh-CN": "文档", en: "Document" },
  sheet: { "zh-CN": "表格", en: "Spreadsheet" },
  unknown: { "zh-CN": "文件", en: "File" },
};

const previewKindClass: Record<OfficeKind, string> = {
  present: "home-preview-kind-present",
  document: "home-preview-kind-document",
  sheet: "home-preview-kind-sheet",
  unknown: "home-preview-kind-unknown",
};

function formatOpenedAt(ts: number, locale: "zh-CN" | "en"): string {
  try {
    return new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function mountFileHome(
  host: HTMLElement,
  locale: "zh-CN" | "en",
  actions: {
    onNew: () => void;
    onOpen: () => void;
    onRecent: (path: string) => void;
    recent: () => Promise<RecentFile[]>;
  },
): FileHome {
  const zh = locale === "zh-CN";
  host.replaceChildren();

  const shell = document.createElement("div");
  shell.className = "home-shell";

  const hero = document.createElement("header");
  hero.className = "home-hero";

  const title = document.createElement("h1");
  title.className = "home-title";
  title.textContent = "Slim Office";

  const lead = document.createElement("p");
  lead.className = "home-lead";
  lead.textContent = zh
    ? "从本机文件开始。演示文稿可以编辑和放映。文档和表格还没有组件。"
    : "Start from a file on this computer. Presentations can be edited and shown. Documents and spreadsheets do not have a component yet.";

  const actionsRow = document.createElement("div");
  actionsRow.className = "home-actions";
  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.className = "home-btn home-btn-primary";
  newBtn.textContent = zh ? "新建演示文稿" : "New presentation";
  newBtn.addEventListener("click", actions.onNew);
  const openBtn = document.createElement("button");
  openBtn.type = "button";
  openBtn.className = "home-btn";
  openBtn.textContent = zh ? "打开…" : "Open…";
  openBtn.addEventListener("click", actions.onOpen);
  actionsRow.append(newBtn, openBtn);

  hero.append(title, lead, actionsRow);

  const notice = document.createElement("p");
  notice.className = "home-notice";
  notice.hidden = true;

  const recentSection = document.createElement("section");
  recentSection.className = "home-recent-section";

  const recentTitle = document.createElement("h2");
  recentTitle.className = "home-recent-title";
  recentTitle.textContent = zh ? "最近" : "Recent";

  const recentHost = document.createElement("div");
  recentHost.className = "home-recent-host";

  recentSection.append(recentTitle, recentHost);
  shell.append(hero, notice, recentSection);
  host.append(shell);

  function renderEmpty(container: HTMLElement): void {
    container.replaceChildren();
    const empty = document.createElement("div");
    empty.className = "home-empty-state";
    empty.setAttribute("data-test", "home-empty");

    const placeholders = document.createElement("div");
    placeholders.className = "home-empty-placeholders";
    placeholders.setAttribute("aria-hidden", "true");
    for (let i = 0; i < 3; i++) {
      const block = document.createElement("div");
      block.className = "home-empty-placeholder-card";
      placeholders.append(block);
    }

    const hint = document.createElement("p");
    hint.className = "home-empty-hint";
    hint.textContent = zh
      ? "新建或打开文件后，最近使用的项目会以卡片形式显示在这里。"
      : "After you create or open a file, your recent items will appear here as cards.";

    empty.append(placeholders, hint);
    container.append(empty);
  }

  function renderGrid(container: HTMLElement, files: RecentFile[]): void {
    container.replaceChildren();
    const list = document.createElement("div");
    list.className = "home-recent-grid";
    list.setAttribute("role", "list");

    for (const file of files) {
      const kind = officeKind(file.name);
      const item = document.createElement("div");
      item.className = "home-recent-card";
      item.setAttribute("role", "listitem");

      const button = document.createElement("button");
      button.type = "button";
      button.className = "home-recent-card-btn";

      const preview = document.createElement("div");
      preview.className = `home-card-preview ${previewKindClass[kind]}`;
      const kindBadge = document.createElement("span");
      kindBadge.className = "home-card-kind-label";
      kindBadge.textContent = kindLabel[kind][locale];
      preview.append(kindBadge);

      const body = document.createElement("div");
      body.className = "home-card-body";

      const name = document.createElement("span");
      name.className = "home-card-name";
      name.textContent = file.name;

      const meta = document.createElement("div");
      meta.className = "home-card-meta";
      const typeLine = document.createElement("span");
      typeLine.className = "home-card-type";
      typeLine.textContent = kindLabel[kind][locale];
      const timeLine = document.createElement("span");
      timeLine.className = "home-card-time";
      timeLine.textContent = formatOpenedAt(file.openedAt, locale);
      meta.append(typeLine, timeLine);

      body.append(name, meta);
      button.append(preview, body);
      button.addEventListener("click", () => actions.onRecent(file.path));
      item.append(button);
      list.append(item);
    }

    container.append(list);
  }

  async function refresh(): Promise<void> {
    const files = await actions.recent();
    if (files.length === 0) renderEmpty(recentHost);
    else renderGrid(recentHost, files);
  }

  return {
    refresh,
    setNotice(text) {
      notice.hidden = !text;
      notice.textContent = text ?? "";
    },
  };
}
