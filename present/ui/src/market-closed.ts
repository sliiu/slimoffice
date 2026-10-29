/** 未上架时三个站点读的公开地址。失败或未配置时视为已上架。 */
export function marketStatusUrl(explicitBase?: string): string | null {
  const configured = explicitBase?.trim();
  if (configured) return `${configured.replace(/\/$/, "")}/market`;
  if (typeof window === "undefined") return null;
  const host = window.location.hostname;
  if (host === "slimppt.cn" || host.endsWith(".slimppt.cn")) return "https://api.slimppt.cn/api/market";
  if (host === "slimppt.com" || host.endsWith(".slimppt.com")) return "https://api.slimppt.com/api/market";
  return null;
}

export async function marketIsOpen(explicitBase?: string): Promise<boolean> {
  const url = marketStatusUrl(explicitBase);
  if (!url) return true;
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return true;
    const body = (await response.json()) as { open?: unknown };
    return body.open !== false;
  } catch {
    return true;
  }
}

export function renderMarketClosed(target: HTMLElement = document.body): void {
  const zh = navigator.language.toLowerCase().startsWith("zh");
  target.replaceChildren();
  const wrap = document.createElement("div");
  wrap.setAttribute("role", "status");
  wrap.style.cssText =
    "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a;";
  const box = document.createElement("div");
  box.style.textAlign = "center";
  const heading = document.createElement("h1");
  heading.textContent = zh ? "这个市场还没有上架" : "This market is not open yet";
  heading.style.cssText = "font-size:1.5rem;font-weight:600;margin:0;";
  const note = document.createElement("p");
  note.textContent = zh
    ? "官网仍然可以访问。分享链接也可以继续观看。"
    : "The website stays available, and share links keep working.";
  note.style.cssText = "margin:12px 0 0;color:#475569;";
  box.append(heading, note);
  wrap.append(box);
  target.append(wrap);
}
