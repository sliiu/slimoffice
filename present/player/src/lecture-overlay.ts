import type { LectureFrame } from "@ppt/core";

export interface LectureOverlay {
  setVideo(src: string | null): void;
  play(): void;
  pause(): void;
  seek(sec: number): void;
  setPaused(paused: boolean): void;
  destroy(): void;
}

function cornerCss(corner: LectureFrame["corner"]): string {
  const pad = "16px";
  switch (corner) {
    case "tl":
      return `top:${pad};left:${pad}`;
    case "tr":
      return `top:${pad};right:${pad}`;
    case "bl":
      return `bottom:${pad};left:${pad}`;
    default:
      return `bottom:${pad};right:${pad}`;
  }
}

function sizeCss(size: LectureFrame["size"] | undefined): string {
  if (size === "s") return "18vmin";
  if (size === "l") return "36vmin";
  return "26vmin";
}

/** 放映角落里的出镜。观众看到的画面不镜像。 */
export function mountLectureOverlay(
  host: HTMLElement,
  frame: LectureFrame | undefined,
  labels: { pause: string; resume: string },
  onTogglePause: () => void,
): LectureOverlay {
  const doc = host.ownerDocument;
  const root = doc.createElement("div");
  const side = sizeCss(frame?.size);
  root.style.cssText = [
    "position:absolute",
    "z-index:40",
    cornerCss(frame?.corner ?? "br"),
    `width:${side}`,
    "display:flex",
    "flex-direction:column",
    "align-items:flex-end",
    "gap:6px",
    "pointer-events:auto",
  ].join(";");
  const video = doc.createElement("video");
  video.playsInline = true;
  video.muted = true;
  video.style.cssText = "width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:10px;background:#111;display:none";
  const btn = doc.createElement("button");
  btn.type = "button";
  btn.textContent = labels.pause;
  btn.style.cssText =
    "border:0;border-radius:999px;padding:4px 10px;background:rgba(0,0,0,.62);color:#fff;font:12px system-ui,sans-serif;cursor:pointer";
  btn.addEventListener("click", (e) => {
    e.stopPropagation();
    onTogglePause();
  });
  btn.addEventListener("pointerdown", (e) => e.stopPropagation());
  root.append(video, btn);
  host.appendChild(root);
  let blobUrl: string | null = null;
  return {
    setVideo(src: string | null): void {
      if (blobUrl && blobUrl !== src) URL.revokeObjectURL(blobUrl);
      blobUrl = src?.startsWith("blob:") ? src : null;
      if (!src) {
        video.removeAttribute("src");
        video.style.display = "none";
        return;
      }
      video.src = src;
      video.style.display = "";
      void video.play().catch(() => undefined);
    },
    play(): void {
      void video.play().catch(() => undefined);
    },
    pause(): void {
      video.pause();
    },
    seek(sec: number): void {
      try {
        video.currentTime = sec;
      } catch {
        // ignore
      }
    },
    setPaused(paused: boolean): void {
      btn.textContent = paused ? labels.resume : labels.pause;
    },
    destroy(): void {
      if (blobUrl) URL.revokeObjectURL(blobUrl);
      video.pause();
      root.remove();
    },
  };
}
