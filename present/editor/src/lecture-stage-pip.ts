// 编辑舞台上的出镜。字节仍在本机引用里，不写成幻灯片上的视频形状。

import { lecturePipRect, lectureTakeFor, type Presentation, type Slide } from "@ppt/core";

export interface LectureStagePip {
  sync(): void;
  destroy(): void;
}

export function mountLectureStagePip(
  stage: HTMLElement,
  overlay: Element,
  deps: {
    getPres: () => Presentation;
    getSlide: () => Slide | undefined;
    hidden: () => boolean;
    cameraSrc?: (ref: string) => Promise<string | null>;
  },
): LectureStagePip {
  const doc = stage.ownerDocument;
  const video = doc.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.style.cssText = [
    "position:absolute",
    "object-fit:cover",
    "pointer-events:none",
    "border-radius:10px",
    "background:#111",
    "display:none",
  ].join(";");
  let gen = 0;
  let shownRef: string | null = null;
  let blobUrl: string | null = null;

  const revoke = (): void => {
    if (!blobUrl) return;
    URL.revokeObjectURL(blobUrl);
    blobUrl = null;
  };

  return {
    sync(): void {
      const token = ++gen;
      const pres = deps.getPres();
      const slide = deps.getSlide();
      const take = slide ? lectureTakeFor(pres.lecture, slide.id) : undefined;
      const ref = !deps.hidden() && deps.cameraSrc && take?.cameraRef ? take.cameraRef : null;
      if (!ref || !slide) {
        shownRef = null;
        video.style.display = "none";
        video.removeAttribute("src");
        revoke();
        return;
      }
      const rect = lecturePipRect(pres.size, pres.lecture?.frame);
      video.style.left = `${(rect.x / pres.size.width) * 100}%`;
      video.style.top = `${(rect.y / pres.size.height) * 100}%`;
      video.style.width = `${(rect.w / pres.size.width) * 100}%`;
      video.style.height = `${(rect.h / pres.size.height) * 100}%`;
      video.style.display = "";
      stage.insertBefore(video, overlay);
      if (ref === shownRef && video.src) return;
      shownRef = ref;
      revoke();
      video.removeAttribute("src");
      void deps.cameraSrc!(ref).then((src) => {
        if (token !== gen || shownRef !== ref) {
          if (src?.startsWith("blob:")) URL.revokeObjectURL(src);
          return;
        }
        if (!src) {
          video.style.display = "none";
          return;
        }
        if (src.startsWith("blob:")) blobUrl = src;
        video.src = src;
        void video.play().catch(() => undefined);
      });
    },
    destroy(): void {
      gen += 1;
      shownRef = null;
      video.pause();
      video.removeAttribute("src");
      video.remove();
      revoke();
    },
  };
}
