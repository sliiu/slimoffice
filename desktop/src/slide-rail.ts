import type { Presentation, Slide } from "@sliiu/present-core";
import { createScene, revealDesignedAppearance, stageChromeBackground, SvgBackend } from "@sliiu/present-renderer";

export interface SlideRail {
  rebuild(): void;
  setActive(index: number): void;
  refresh(index?: number): void;
}

export function createSlideRail(
  host: HTMLElement,
  presentation: () => Presentation,
  goto: (index: number) => void,
): SlideRail {
  const list = document.createElement("ol");
  list.className = "slide-rail-list";
  host.replaceChildren(list);
  const destroyers = new Map<HTMLElement, () => void>();
  let active = 0;

  function clear(): void {
    for (const destroy of destroyers.values()) destroy();
    destroyers.clear();
    list.replaceChildren();
  }

  function paint(thumb: HTMLElement, slide: Slide, pres: Presentation): void {
    destroyers.get(thumb)?.();
    destroyers.delete(thumb);
    thumb.replaceChildren();
    const chrome = stageChromeBackground(slide);
    const transparent = chrome === "transparent";
    try {
      const scene = createScene(slide, pres.size, { masters: pres.masters });
      revealDesignedAppearance(scene, slide);
      const backend = new SvgBackend(scene, thumb, { transparent, preview: true });
      if (!transparent) backend.root.style.background = chrome;
      backend.root.setAttribute("preserveAspectRatio", "xMidYMid meet");
      backend.flush();
      destroyers.set(thumb, () => backend.destroy());
    } catch {
      thumb.textContent = "—";
    }
  }

  function rebuild(): void {
    const pres = presentation();
    clear();
    pres.slides.forEach((slide, index) => {
      const item = document.createElement("li");
      item.className = "slide-rail-item";
      item.dataset.index = String(index);
      if (slide.show === false) item.classList.add("is-hidden");
      const num = document.createElement("span");
      num.className = "slide-rail-num";
      num.textContent = String(index + 1);
      const thumb = document.createElement("div");
      thumb.className = "slide-thumb";
      thumb.style.setProperty("--ar", `${pres.size.width} / ${pres.size.height}`);
      item.append(num, thumb);
      item.addEventListener("click", () => goto(index));
      list.append(item);
    });
    const observer = new IntersectionObserver(
      (entries) => {
        const current = presentation();
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const thumb = entry.target as HTMLElement;
          const index = Number(thumb.parentElement?.dataset.index);
          const slide = current.slides[index];
          if (slide && !thumb.dataset.rendered) {
            thumb.dataset.rendered = "1";
            paint(thumb, slide, current);
          }
          observer.unobserve(thumb);
        }
      },
      { root: list, rootMargin: "240px" },
    );
    for (const thumb of list.querySelectorAll<HTMLElement>(".slide-thumb")) observer.observe(thumb);
    setActive(Math.min(active, Math.max(0, pres.slides.length - 1)));
  }

  function setActive(index: number): void {
    active = index;
    for (const item of list.querySelectorAll<HTMLElement>(".slide-rail-item")) {
      const on = Number(item.dataset.index) === index;
      item.classList.toggle("is-active", on);
      if (on) item.scrollIntoView({ block: "nearest" });
    }
  }

  function refresh(index = active): void {
    const pres = presentation();
    if (list.childElementCount !== pres.slides.length) {
      rebuild();
      return;
    }
    const slide = pres.slides[index];
    const thumb = list.querySelector<HTMLElement>(`.slide-rail-item[data-index="${index}"] .slide-thumb`);
    const item = thumb?.parentElement;
    if (!slide || !thumb || !item) return;
    item.classList.toggle("is-hidden", slide.show === false);
    thumb.dataset.rendered = "1";
    paint(thumb, slide, pres);
  }

  return { rebuild, setActive, refresh };
}
