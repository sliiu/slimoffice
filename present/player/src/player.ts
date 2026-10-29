import { ooxml } from "@ppt/animation";
import type { HyperlinkRef, LectureTake, LiveMediaTrack, Presentation, Shape, Slide, AudioShape } from "@ppt/core";
import { lecturePlaybackEnabled, lectureTakeFor, nextLectureClickMs } from "@ppt/core";
import { attachMediaTrimPlayback, sanitizeExternalUrl } from "@ppt/core";
import {
  CanvasBackend,
  HybridBackend,
  SvgBackend,
  createScene,
  applyEntranceHideToScene,
  mountMorphTransitionLayers,
  getImage,
  resolveAnimatable,
  stageChromeBackground,
  hitTestNodeBBox,
  type Scene,
  type SceneNode,
} from "@ppt/renderer";
import { registerEmbeddedFonts } from "./fonts";
import { mkLucideIconButton } from "./icons";
import { autoAdvanceAfterSec, autoAdvanceWaitSec, autoplayTimelineSec, clickAdvancesSlide } from "./slide-advance";
import { clampTransitionForPlan, runTransition, snapshotStage } from "./transition";
import { buildOoxmlPlayback } from "./ooxml-runtime";
import { createBake3DRuntime } from "./bake-3d";
import {
  EventBus,
  PluginManager,
  buildPresentationInfo,
  type Plugin,
  type PlayerControlAPI,
  type PluginContext,
  type PluginUIOptions,
  type PresentationInfo,
  type SceneAPI,
  type ShapeInfo,
  type SlideChangeEvent,
  type SlideInfo,
  type StepChangeEvent,
} from "./plugins";
import { createPluginUI } from "./plugin-ui";
import { createThumbnailAPI } from "./plugin-thumbnail";
import { createContextMenuManager } from "./context-menu";
import { createPluginLiveHub, type PluginLiveInbound, type PluginLiveTransport } from "./plugin-live";
import { createTranslator, resolvePlayerLocale } from "./i18n";
import { applyDigitJumpKey, isTypingTarget } from "./playback-keys";
import { findHyperlinkAt, nodeShownForPointer, type LinkSlot } from "./link-hit";
import { allowedProductHome, resolveEndScreenKind } from "./end-screen";
import { createShowChrome, type ShowChrome } from "./show-chrome";
import { mountLectureOverlay, type LectureOverlay } from "./lecture-overlay";

export type Backend = "svg" | "canvas" | "hybrid";

// 放映时：资源（位图 / 字体）全部就绪后，再额外停留这么久才启动 onLoad 入场动画，
// 让观众先看清"页面基础内容"。
const PLAYBACK_START_DELAY_MS = 1000;

export interface MountOptions {
  backend?: Backend;
  autoplay?: boolean;
  clickAdvance?: boolean;
  keyboard?: boolean;
  showControls?: boolean;
  /**
   * 是否按幻灯片 transition.advAfter 自动换页（「使用排练时间」）。
   * 默认 true；设为 false 时仅手动 / 单击推进。
   */
  useSlideTimings?: boolean;
  /**
   * 换页时自动播放当前页上的 audio shape（旁白 / 嵌入音频）。默认 true。
   */
  playSlideNarrations?: boolean;
  /**
   * 跳过「本演示包含旁白」确认层。录制旁白、视觉对比、观众跟随等无交互场景使用。
   */
  skipNarrationPrompt?: boolean;
  /**
   * 放映时是否显示嵌入视频的 HTML5 播放控件。默认 true；false 时强制隐藏。
   */
  showMediaControls?: boolean;
  fileName?: string;
  initialSlide?: number;
  onSlideChange?: (index: number, total: number) => void;
  onComplete?: () => void;
  /**
   * 在 mount 后立即激活的插件列表。其它插件可以通过 `handle.plugins.register()`
   * 在运行时挂载。IIFE 场景下，{@link definePlugin} 会向全局队列追加，mount 会
   * 自动合并队列里的插件。
   */
  plugins?: Plugin[];
  /**
   * Plugin UI 外观与行为配置 — 位置 / 主题 / headless / CSS 变量等。
   * 详见 {@link PluginUIOptions}。
   */
  ui?: PluginUIOptions;
  /**
   * 是否启用右键菜单（默认 true）。关闭后即使插件 / 内置项已注册也不会弹出。
   */
  contextMenu?: boolean;
  /**
   * 直播观众：在 kiosk（禁止单击翻页）下仍开放插件右键菜单与快捷键。
   */
  livePlugins?: boolean;
  /**
   * UI 文案语言。影响内置右键菜单、白板 / 激光笔等插件的可见文本。
   * 受支持：`"en"`（默认）、`"zh-CN"`（含 `"zh"` / `"zh-cn"` 等别名）；其余回退 en。
   * 通过 {@link PluginContext.locale} 透传给插件，让插件本地化自己的标签。
   */
  locale?: string;
  /**
   * 用户希望隐藏的内置右键菜单项 id 列表。内置 id：
   *   - `builtin:next`        下一页 / 步
   *   - `builtin:prev`        上一页
   *   - `builtin:first`       回到首页
   *   - `builtin:last`        最后一页
   *   - `builtin:end`         结束放映
   *   - `builtin:fullscreen`  切换全屏
   */
  hideBuiltinContextMenuItems?: string[];
  /**
   * When true, non-basic slide transitions (3D / morph / WebGL) fall back to simple fades
   * during playback. SaaS hosts set this when `advancedEffects` is not entitled.
   */
  basicTransitionsOnly?: boolean;
  /** 自定义放映顺序（slide 绝对下标）；缺省按 `slide.show` 过滤。 */
  slideOrder?: number[];
  /** 排练计时：离开上一张 slide 时回调（秒）。 */
  onRehearseSlideLeave?: (slideIdx: number, elapsedSec: number) => void;
  /** 录制放映：这一页上的讲解点击（动画往前走了一步，还没翻页）。 */
  onLectureStep?: () => void;
  /** 录制放映：进入某一页的绝对下标。 */
  onRecordSlideEnter?: (absIndex: number) => void;
  /** 正在录这场讲解时不重放已有出镜。 */
  suppressLecture?: boolean;
  /** 把 `idb:` 出镜引用换成可播放的地址。分享页上的引用已经是 URL，不必提供。 */
  lectureCameraSrc?: (ref: string) => Promise<string | null>;
  /**
   * 展台模式（`showPr` kiosk）：单击不翻页（超链接仍有效），键盘翻页关闭。
   * 宿主 Esc 仍可结束放映。
   */
  kiosk?: boolean;
  /**
   * 播完最后一张后先进入黑屏结束页，再 `onComplete`。循环放映时应设为 false。
   * 默认 false（保持旧行为）。
   */
  endWithBlackSlide?: boolean;
  /**
   * 分享和下载的 HTML：结束屏给「从头播放」和「首页」。只接受产品站地址。
   * 编辑器不传，结束屏仍是单击或 Esc 回到编辑界面。
   */
  endHomeHref?: string;
  /** 直播观众：结束屏只留标题，不给从头播放和首页。 */
  endQuiet?: boolean;
}

export interface PlayerHandle {
  destroy(): void;
  next(): void;
  prev(): void;
  goto(index: number): void;
  current(): number;
  total(): number;
  /**
   * 返回当前 slide 的动画 step 调试信息，便于自动化驱动（visual-compare、e2e）
   * 精确控制推进。无 timing 时返回 `{ totalSteps: 0, currentStep: 0 }`。
   */
  debugSteps(): { totalSteps: number; currentStep: number; frozen: boolean };
  /**
   * 调试钩子：把所有 active step 冻结到"末态"，给视觉对比一个确定性截图点。
   * indefinite/loop 动画会被截在首次循环末尾。
   */
  debugFreezeActive(): void;
  /**
   * 调试钩子：dump 当前 runtime 内部状态（cursor / elapsed / active 列表）。
   * 仅供 visual-compare / e2e 排错。
   */
  debugDumpRuntime(): unknown;
  /**
   * 观众跟随：跳到指定可见页，并同步动画步进。
   * 迟到时会快进已过的 step；默认让当前步正常播放。
   * `playLast: false` 表示主持人已把当前动画跳到末态，观众也应 freeze。
   */
  followCursor(slideIndex: number, step: number, playLast?: boolean): void;
  /** 观众跟随：按主持人采样对齐当前页 video/audio 的播放头。 */
  followMedia(tracks: LiveMediaTrack[]): void;
  /** 主持人采样：当前页每个 video/audio 的播放头。 */
  snapshotMedia(): LiveMediaTrack[];
  /** 直播跟随时关闭本机自动旁白 / autoplay，避免和主持人时钟抢播。 */
  setFollowMode(on: boolean): void;
  /** 接入直播放映插件通道（主持 / 观众）。传 null 断开。 */
  attachLive(transport: PluginLiveTransport | null): void;
  /** 把房间里其他人发来的插件消息交给对应插件。 */
  receiveLivePlugin(msg: PluginLiveInbound): void;
  /**
   * 等待 3D bake 全部完成。bake-3d.ts 在 mount/load 时为携带 sp3d 的 image
   * 异步触发 WebGL bake；visual-compare / 截图前调它确保拿到带"侧面 / 倒角 /
   * 高光"的 3D 终态。
   */
  waitForBake3D(): Promise<void>;

  /** 插件管理：运行时动态 register/unregister。 */
  readonly plugins: {
    register(plugin: Plugin): Promise<void>;
    unregister(id: string): boolean;
    list(): string[];
    has(id: string): boolean;
  };
  /** 直接对外暴露的 PPT 元信息快照（与插件 ctx.presentation 等价）。 */
  readonly presentation: PresentationInfo;
  /** 事件订阅（与插件 ctx.events 等价）。 */
  readonly events: {
    on<E extends "slidechange" | "stepchange" | "complete" | "destroy">(
      event: E,
      cb: (payload: E extends "slidechange"
        ? SlideChangeEvent
        : E extends "stepchange"
          ? StepChangeEvent
          : void) => void,
    ): () => void;
  };
}

interface SlideRuntime {
  scene: Scene;
  detach: () => void;
  /** hybrid 后端的 live 3D 首帧就绪（仅 hybrid backend 有）。 */
  ready3D?: () => Promise<void>;
  ooxml?: {
    runtime: ooxml.TimingRuntime;
    totalSteps: number;
    /** advTm=0 时，等这段自动动画播完再换页。 */
    autoplaySec: number;
  };
}

const STYLES = `
.ppt-host{position:absolute;inset:0;display:flex;flex-direction:column;background:#000;color:#fff;font-family:ui-sans-serif,system-ui,sans-serif;}
.ppt-stage-wrap{flex:1;display:flex;align-items:center;justify-content:center;overflow:hidden;}
.ppt-stage{position:relative;background:transparent;box-shadow:0 0 40px rgba(0,0,0,.4);}
.ppt-controls{position:absolute;left:0;right:0;bottom:0;height:40px;display:flex;align-items:center;gap:12px;padding:0 16px;background:linear-gradient(0deg,rgba(0,0,0,.55),rgba(0,0,0,0));opacity:0;transition:opacity .2s;font-size:12px;pointer-events:none;}
.ppt-host:hover .ppt-controls{opacity:1;pointer-events:auto;}
.ppt-controls button{background:rgba(255,255,255,.12);color:#fff;border:1px solid rgba(255,255,255,.18);padding:4px 10px;border-radius:4px;font-size:12px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;}
.ppt-controls button:hover{background:rgba(255,255,255,.22);}
.ppt-controls .ppt-spacer{flex:1;}
.ppt-progress{flex:1;height:4px;background:rgba(255,255,255,.18);border-radius:2px;overflow:hidden;}
.ppt-progress-fill{height:100%;background:#3b82f6;width:0;transition:width .15s;}
.ppt-narration-prompt{position:absolute;inset:0;z-index:100;background:rgba(8,10,14,.78);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;}
.ppt-narration-card{background:rgba(28,31,38,.96);border:1px solid rgba(255,255,255,.12);border-radius:12px;padding:22px 26px;max-width:420px;width:100%;color:#e5e7eb;box-shadow:0 16px 40px rgba(0,0,0,.45);}
.ppt-narration-card h2{margin:0 0 10px;font-size:16px;font-weight:600;}
.ppt-narration-card p{margin:0;font-size:13px;line-height:1.55;color:#d1d5db;}
.ppt-narration-actions{display:flex;gap:10px;justify-content:flex-end;margin-top:18px;flex-wrap:wrap;}
.ppt-narration-btn{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.18);padding:8px 14px;border-radius:8px;font:13px ui-sans-serif,system-ui,sans-serif;cursor:pointer;}
.ppt-narration-btn:hover{background:rgba(255,255,255,.18);}
.ppt-narration-btn.is-primary{background:#2563eb;border-color:#2563eb;}
.ppt-narration-btn.is-primary:hover{background:#1d4ed8;}
`;

// ECMA-376 §19.3.1.37 sld@show — false 表示该幻灯片在放映时被隐藏。
// 播放器构建一个可见序列索引；prev/next/goto/keyboard/控件均按可见序列推进。
function visibleIndices(pres: Presentation): number[] {
  return pres.slides
    .map((s, i) => (s.show === false ? -1 : i))
    .filter((i) => i >= 0);
}

function playbackIndices(pres: Presentation, order?: number[]): number[] {
  if (order?.length) {
    return order.filter((i) => i >= 0 && i < pres.slides.length && pres.slides[i]?.show !== false);
  }
  return visibleIndices(pres);
}

function presentationHasNarrationAudio(pres: Presentation): boolean {
  const visit = (shapes: Shape[]): boolean => {
    for (const s of shapes) {
      if (s.kind === "group" && visit(s.children ?? [])) return true;
      if (s.kind === "audio" && s.visible !== false && Boolean((s as AudioShape).src)) return true;
    }
    return false;
  };
  for (const slide of pres.slides) {
    if (slide.show === false) continue;
    for (const layer of slide.layers) {
      if (visit(layer.shapes)) return true;
    }
  }
  return false;
}

// 全局插件队列 — IIFE 场景下 `PPTPlayer.definePlugin()` 会向这里追加，mount() 会
// 把队列里的 plugin 合并到当前 opts.plugins，激活后清空。
declare global {
  interface Window {
    __PPTPlayerPluginQueue?: Plugin[];
  }
}

export function mount(host: HTMLElement, pres: Presentation, opts: MountOptions = {}): PlayerHandle {
  const backend = opts.backend ?? "hybrid";
  const autoplay = opts.autoplay ?? true;
  const clickAdvance = (opts.clickAdvance ?? true) && opts.kiosk !== true;
  const keyboard = opts.keyboard ?? true;
  const kiosk = opts.kiosk === true;
  const endWithBlackSlide = opts.endWithBlackSlide === true;
  const endHomeHref = allowedProductHome(opts.endHomeHref);
  const endQuiet = opts.endQuiet === true;
  let endReplayLabel = "Play from start";
  let endHomeLabel = "Home";
  const showControls = opts.showControls ?? true;
  const basicTransitionsOnly = opts.basicTransitionsOnly ?? false;
  const visible = playbackIndices(pres, opts.slideOrder);
  const visibleTotal = visible.length || pres.slides.length;
  const presentationInfo = buildPresentationInfo(pres);
  const eventBus = new EventBus();
  const toVisibleSlot = (absIdx: number): number => {
    if (visible.length === 0) return absIdx;
    const found = visible.indexOf(absIdx);
    if (found >= 0) return found;
    let nearest = 0;
    let bestDelta = Infinity;
    for (let i = 0; i < visible.length; i++) {
      const d = Math.abs(visible[i]! - absIdx);
      if (d < bestDelta) {
        bestDelta = d;
        nearest = i;
      }
    }
    return nearest;
  };
  const toAbsIndex = (slot: number): number => {
    if (visible.length === 0) return slot;
    const clamped = Math.max(0, Math.min(slot, visible.length - 1));
    return visible[clamped]!;
  };

  injectStyles(host.ownerDocument);
  registerEmbeddedFonts(host.ownerDocument, pres);
  const root = host.ownerDocument.createElement("div");
  root.className = "ppt-host";
  if (showControls) root.classList.add("ppt-has-controls");
  root.tabIndex = 0;
  host.appendChild(root);

  const stageWrap = root.ownerDocument.createElement("div");
  stageWrap.className = "ppt-stage-wrap";
  root.appendChild(stageWrap);

  const stage = root.ownerDocument.createElement("div");
  stage.className = "ppt-stage";
  stageWrap.appendChild(stage);

  let controls: HTMLDivElement | null = null;
  let pageLabel: HTMLSpanElement | null = null;
  let progressFill: HTMLDivElement | null = null;
  if (showControls) {
    controls = root.ownerDocument.createElement("div");
    controls.className = "ppt-controls";
    const prevBtn = mkLucideIconButton(controls.ownerDocument, "chevron-left", undefined, 16);
    const nextBtn = mkLucideIconButton(controls.ownerDocument, "chevron-right", undefined, 16);
    pageLabel = controls.ownerDocument.createElement("span");
    pageLabel.textContent = "1 / 1";
    const progress = controls.ownerDocument.createElement("div");
    progress.className = "ppt-progress";
    progressFill = controls.ownerDocument.createElement("div");
    progressFill.className = "ppt-progress-fill";
    progress.appendChild(progressFill);
    controls.appendChild(prevBtn);
    controls.appendChild(nextBtn);
    controls.appendChild(pageLabel);
    controls.appendChild(progress);
    root.appendChild(controls);
    prevBtn.addEventListener("click", () => api.prev());
    nextBtn.addEventListener("click", () => api.next());
  }

  let followMode = false;
  let playNarrationsEnabled = opts.playSlideNarrations !== false;
  let awaitingSoundConfirm =
    opts.skipNarrationPrompt !== true &&
    playNarrationsEnabled &&
    presentationHasNarrationAudio(pres);
  let pendingPlayOnLoad = false;
  // 直播跟随：本页入场（切换 + 资源 + 起播延迟）还没开始时，先记下主持人的游标，起播时再对齐。
  let onLoadStartedFor: SlideRuntime | null = null;
  let followPending: { step: number; playLast: boolean } | null = null;
  let narrationPromptEl: HTMLElement | null = null;
  let runtime: SlideRuntime | null = null;
  let index = toAbsIndex(toVisibleSlot(clampIndex(opts.initialSlide ?? 0, pres.slides.length)));
  // 插件可通过 ctx.player.setNavigationLocked(true) 锁定，期间停用内置的单击 / 键盘
  // 推进与单击形状触发（典型：单选题答题前接管交互）。
  let navigationLocked = false;
  let lastHoverKey: string | null = null;
  let lastHoverShapeId: string | null = null;
  let lastMouseOutShapeId: string | null = null;
  let prevNavArmed = true;
  let nextNavArmed = true;
  let rehearseEnterTs = Date.now();
  let autoAdvanceTimer: ReturnType<typeof setTimeout> | undefined;
  let chrome: ShowChrome | null = null;
  let timingsPaused = false;
  let lectureOverlay: LectureOverlay | null = null;
  let lectureAudio: HTMLMediaElement | null = null;
  let lectureOrigin = 0;
  let lecturePausedAt = 0;
  let lectureTimers: number[] = [];
  let lectureGen = 0;
  let lectureTakeNow: LectureTake | null = null;

  const lectureEnabled = (): boolean =>
    !opts.suppressLecture &&
    !awaitingSoundConfirm &&
    playNarrationsEnabled &&
    lecturePlaybackEnabled(opts.useSlideTimings !== false, playNarrationsEnabled) &&
    (pres.lecture?.takes.length ?? 0) > 0;

  const activeLectureTake = (slide: Slide | undefined): LectureTake | null => {
    if (!slide || !lectureEnabled()) return null;
    return lectureTakeFor(pres.lecture, slide.id) ?? null;
  };

  const clearLectureTimers = (): void => {
    for (const id of lectureTimers) clearTimeout(id);
    lectureTimers = [];
    lectureGen += 1;
  };

  const destroyLectureOverlay = (): void => {
    clearLectureTimers();
    lectureOverlay?.destroy();
    lectureOverlay = null;
    lectureTakeNow = null;
    lectureAudio = null;
  };

  const lectureElapsed = (): number => (timingsPaused ? lecturePausedAt : performance.now() - lectureOrigin);

  const leaveLectureToNext = (): void => {
    const slot = toVisibleSlot(index);
    if (slot + 1 < visibleTotal) gotoSlot(slot + 1);
    else if (endWithBlackSlide) {
      chrome?.showEnd({
        kind: resolveEndScreenKind({ endQuiet, follow: followMode, homeHref: endHomeHref }),
        onExit: finishShow,
        onReplay: () => gotoSlot(0),
        homeHref: endHomeHref,
        replayLabel: endReplayLabel,
        homeLabel: endHomeLabel,
        onContextMenu: (e) => onEndContextMenu?.(e),
      });
    } else finishShow();
  };

  const armLecture = (take: LectureTake, fromMs: number): void => {
    clearLectureTimers();
    const gen = lectureGen;
    lectureOrigin = performance.now() - fromMs;
    lecturePausedAt = fromMs;
    if (timingsPaused) return;
    for (const at of take.clicksMs) {
      if (at <= fromMs + 40) continue;
      lectureTimers.push(
        window.setTimeout(() => {
          if (gen !== lectureGen || timingsPaused) return;
          advance();
        }, at - fromMs),
      );
    }
    const remain = Math.max(0, take.durationMs - fromMs);
    lectureTimers.push(
      window.setTimeout(() => {
        if (gen !== lectureGen || timingsPaused) return;
        leaveLectureToNext();
      }, remain),
    );
  };

  const skipLectureForward = (take: LectureTake): void => {
    const next = nextLectureClickMs(take.clicksMs, lectureElapsed());
    if (next == null) {
      leaveLectureToNext();
      return;
    }
    lectureOverlay?.seek(next / 1000);
    if (lectureAudio) {
      try {
        lectureAudio.currentTime = next / 1000;
      } catch {
        // ignore
      }
    }
    advance();
    armLecture(take, next);
  };

  const toggleLecturePause = (): void => {
    timingsPaused = !timingsPaused;
    chrome?.setPaused(timingsPaused);
    lectureOverlay?.setPaused(timingsPaused);
    const take = lectureTakeNow;
    if (!take) {
      if (!timingsPaused) {
        const slide = pres.slides[index];
        if (slide) scheduleAutoAdvance(slide);
      } else clearAutoAdvance();
      return;
    }
    if (timingsPaused) {
      lecturePausedAt = lectureElapsed();
      clearLectureTimers();
      lectureOverlay?.pause();
      lectureAudio?.pause();
      return;
    }
    lectureOrigin = performance.now() - lecturePausedAt;
    lectureOverlay?.play();
    void lectureAudio?.play().catch(() => undefined);
    armLecture(take, lecturePausedAt);
  };

  const startLecture = (slide: Slide): void => {
    clearLectureTimers();
    lectureOverlay?.destroy();
    lectureOverlay = null;
    lectureTakeNow = null;
    const take = activeLectureTake(slide);
    if (!take) return;
    lectureTakeNow = take;
    lectureOverlay = mountLectureOverlay(
      root,
      pres.lecture?.frame,
      { pause: tr("lecture.pause"), resume: tr("lecture.resume") },
      () => toggleLecturePause(),
    );
    lectureOverlay.setPaused(timingsPaused);
    const ref = take.cameraRef;
    if (ref) {
      const ready = ref.startsWith("idb:")
        ? opts.lectureCameraSrc?.(ref) ?? Promise.resolve(null)
        : Promise.resolve(ref);
      void ready.then((src) => {
        if (lectureTakeNow !== take) return;
        if (src) lectureOverlay?.setVideo(src);
        if (timingsPaused) lectureOverlay?.pause();
        else {
          const elapsed = lectureElapsed() / 1000;
          if (elapsed > 0.05) lectureOverlay?.seek(elapsed);
        }
      });
    }
    armLecture(take, 0);
  };
  let digitBuffer = "";
  let digitTimer: ReturnType<typeof setTimeout> | undefined;
  let transitionSoundEl: HTMLAudioElement | null = null;
  const extraSoundEls: HTMLAudioElement[] = [];
  let lastAnimSoundAt = 0;
  let lastAnimSoundSrc = "";
  const narrationDetach: Array<() => void> = [];
  const clearAutoAdvance = (): void => {
    if (autoAdvanceTimer !== undefined) clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = undefined;
  };
  const stopTransitionSound = (): void => {
    if (!transitionSoundEl) return;
    transitionSoundEl.pause();
    transitionSoundEl = null;
  };
  const stopExtraSounds = (): void => {
    while (extraSoundEls.length) {
      const el = extraSoundEls.pop()!;
      el.pause();
      el.removeAttribute("src");
    }
    lastAnimSoundSrc = "";
  };
  const playSrcSound = (src: string | undefined): void => {
    if (awaitingSoundConfirm) return;
    if (!src || /^rId\d+/i.test(src)) return;
    const el = host.ownerDocument.createElement("audio");
    el.src = src;
    extraSoundEls.push(el);
    void el.play().catch(() => undefined);
  };
  const playAnimSound = (src: string | undefined): void => {
    if (!src || /^rId\d+/i.test(src)) return;
    const now = Date.now();
    if (src === lastAnimSoundSrc && now - lastAnimSoundAt < 80) return;
    lastAnimSoundSrc = src;
    lastAnimSoundAt = now;
    playSrcSound(src);
  };
  const stopNarrationMedia = (): void => {
    while (narrationDetach.length) narrationDetach.pop()?.();
  };
  type CarryAudio = {
    key: string;
    el: HTMLAudioElement;
    startAbs: number;
    numSld: number;
    detachTrim: () => void;
  };
  const carryAudios: CarryAudio[] = [];
  const stopOneCarry = (c: CarryAudio): void => {
    c.detachTrim();
    c.el.pause();
    c.el.removeAttribute("src");
    c.el.remove();
  };
  const stopCarryAudios = (): void => {
    while (carryAudios.length) stopOneCarry(carryAudios.pop()!);
  };
  const releaseExpiredCarry = (absIndex: number): void => {
    for (let i = carryAudios.length - 1; i >= 0; i--) {
      const c = carryAudios[i]!;
      const from = toVisibleSlot(c.startAbs);
      const to = toVisibleSlot(absIndex);
      if (to >= from && to - from < c.numSld) continue;
      stopOneCarry(c);
      carryAudios.splice(i, 1);
    }
  };
  const playTransitionSound = (slide: Slide): void => {
    if (awaitingSoundConfirm) return;
    stopTransitionSound();
    const snd = slide.transition?.params?.sound as { src?: string; loop?: boolean } | undefined;
    if (!snd?.src || /^rId\d+/i.test(snd.src)) return;
    const el = host.ownerDocument.createElement("audio");
    el.src = snd.src;
    el.loop = !!snd.loop;
    transitionSoundEl = el;
    void el.play().catch(() => undefined);
  };

  const playHyperlinkSound = (link: HyperlinkRef): void => {
    if (link.endSnd) stopExtraSounds();
    playSrcSound(link.sound?.src);
  };

  const syncVideoMediaControls = (): void => {
    if (opts.showMediaControls !== false) return;
    for (const v of stage.querySelectorAll("video")) {
      (v as HTMLVideoElement).controls = false;
    }
  };

  const sceneNodeForShape = (shapeId: string): SceneNode | undefined => {
    let found: SceneNode | undefined;
    runtime?.scene?.root.walk((n) => {
      if (found || n.shape.id !== shapeId) return;
      found = n;
    });
    return found;
  };

  const mediaElForShape = (shapeId: string): HTMLMediaElement | undefined => {
    return sceneNodeForShape(shapeId)?.mediaEl ?? undefined;
  };

  const playSlideNarrationsFor = (slide: Slide): void => {
    if (followMode) return;
    releaseExpiredCarry(index);
    stopNarrationMedia();
    if (awaitingSoundConfirm || !playNarrationsEnabled) {
      stopCarryAudios();
      return;
    }
    const visit = (shapes: Shape[]): void => {
      for (const sh of shapes) {
        if (sh.kind === "group") visit(sh.children ?? []);
        if (sh.kind !== "audio" || sh.visible === false) continue;
        const a = sh as AudioShape;
        if (!a.src) continue;
        if (a.isNarration && (pres.lecture?.takes.length ?? 0) > 0 && !lectureEnabled()) continue;
        if ((a.numSld ?? 1) > 1) {
          const key = `${slide.id}:${a.id}`;
          let carry = carryAudios.find((c) => c.key === key);
          const node = sceneNodeForShape(a.id);
          if (!carry) {
            let el = node?.mediaEl;
            if (!el) {
              el = host.ownerDocument.createElement("audio");
              el.src = a.src;
            }
            el.style.display = "none";
            root.appendChild(el);
            if (a.volume !== undefined) el.volume = Math.max(0, Math.min(1, a.volume));
            el.loop = !!a.loop;
            el.muted = !!a.muted;
            const detachTrim = attachMediaTrimPlayback(el, a.trim, a.duration, !!a.loop);
            carry = { key, el, startAbs: index, numSld: a.numSld ?? 1, detachTrim };
            carryAudios.push(carry);
            void el.play().catch(() => undefined);
          }
          if (node?.mediaEl && node.mediaEl !== carry.el) {
            node.mediaEl.pause();
            node.mediaEl.removeAttribute("src");
          }
          if (node) node.mediaEl = carry.el;
          continue;
        }
        let el = mediaElForShape(a.id);
        let owned = false;
        if (!el) {
          // canvas 后端没有 HTML 媒体节点；svg/hybrid 已 flush，不应再走到这里。
          el = host.ownerDocument.createElement("audio");
          el.src = a.src;
          owned = true;
        }
        if (a.isNarration) lectureAudio = el;
        if (a.volume !== undefined) el.volume = Math.max(0, Math.min(1, a.volume));
        el.loop = !!a.loop;
        el.muted = !!a.muted;
        const detach = attachMediaTrimPlayback(el, a.trim, a.duration, !!a.loop);
        const media = el;
        narrationDetach.push(() => {
          detach();
          media.pause();
          if (owned) media.removeAttribute("src");
        });
        void el.play().catch(() => undefined);
      }
    };
    for (const layer of slide.layers) visit(layer.shapes);
  };

  const playAutoplayMedia = (): void => {
    if (followMode || awaitingSoundConfirm) return;
    if (!runtime?.scene) return;
    runtime.scene.root.walk((n) => {
      const s = n.shape;
      // 音频走 playSlideNarrationsFor（含 0×0 旁白 fallback），避免和 scene <audio> 叠播。
      if (s.kind !== "video" || !("autoplay" in s) || !s.autoplay) return;
      const el = n.mediaEl;
      if (!el) return;
      const trim = "trim" in s ? s.trim : undefined;
      const start = trim?.start;
      if (typeof start === "number" && start > 0 && el.currentTime < start - 0.02) {
        try {
          el.currentTime = start;
        } catch {
          /* ignore */
        }
      }
      void el.play().catch(() => undefined);
    });
  };

  // 在 advanceOrNext 定义之后赋值。计时器回调发生在那之后。
  let advanceSlideFromTimer: () => void = () => {};

  const scheduleAutoAdvance = (slide: Slide): void => {
    clearAutoAdvance();
    if (awaitingSoundConfirm) return;
    if (opts.useSlideTimings === false) return;
    if ((pres.lecture?.takes.length ?? 0) > 0 && !opts.suppressLecture) return;
    if (timingsPaused) return;
    if (chrome?.isBlank() || chrome?.isGrid() || chrome?.isHelp() || chrome?.isEnd()) return;
    const advAfter = autoAdvanceAfterSec(slide.transition);
    if (advAfter === null) return;
    // 计时到点直接换页。不能走 advance()：那会把还没点的「单击时」动画当成这次点击播掉或快进。
    // advTm=0 不在开播瞬间切走，先把已经自动开始的动画放完。
    const wait = autoAdvanceWaitSec(advAfter, runtime?.ooxml?.autoplaySec ?? 0);
    autoAdvanceTimer = setTimeout(() => advanceSlideFromTimer(), wait * 1000);
  };

  // ECMA-376 §20.1.5.5 scene3d / §20.1.5.12 sp3d — 通过 packages/three-bake 把
  // image shape 的 3D 效果（camera + lightRig + bevel/extrusion + 材料）烘成 PNG。
  // bake 完成后会在 image shape 上原地替换 src/bbox 并清掉 meta3D，触发 renderer
  // redraw 显示带"侧面 / 倒角 / 高光"的真 3D 视觉。
  const bakeRuntime = createBake3DRuntime();

  const fitStage = (): void => {
    const wrap = stageWrap;
    const sw = pres.size.width;
    const sh = pres.size.height;
    if (sw === 0 || sh === 0) return;
    const aw = wrap.clientWidth;
    const ah = wrap.clientHeight;
    if (aw <= 0 || ah <= 0) return;
    const scale = Math.min(aw / sw, ah / sh);
    if (!Number.isFinite(scale) || scale <= 0) return;
    // 与 editor fitStage 一致：用缩放后的 layout 尺寸，而不是 transform:scale。
    // transform 不改变布局盒，窗口放映时 stage 仍占满原始 slide 像素，无法在
    // stage-wrap 内按比例居中撑满。
    stage.style.width = `${sw * scale}px`;
    stage.style.height = `${sh * scale}px`;
    stage.style.transform = "";
    stage.style.transformOrigin = "";
    stage.style.flex = "0 0 auto";
  };

  const ro = new ResizeObserver(fitStage);
  ro.observe(stageWrap);
  ro.observe(host);

  const load = (absI: number): void => {
    chrome?.dismissEnd();
    prevNavArmed = true;
    nextNavArmed = true;
    lastHoverShapeId = null;
    lastMouseOutShapeId = null;
    const prevIndex = index;
    // 跳过 show=false 的幻灯片：把请求的绝对索引投射到可见序列再回译。
    const requestedSlot = toVisibleSlot(clampIndex(absI, pres.slides.length));
    const nextIndex = toAbsIndex(requestedSlot);
    if (opts.onRehearseSlideLeave && runtime !== null && nextIndex !== prevIndex) {
      opts.onRehearseSlideLeave(prevIndex, (Date.now() - rehearseEnterTs) / 1000);
    }
    clearAutoAdvance();
    const incoming = pres.slides[nextIndex];
    const slideChanged = runtime !== null && nextIndex !== prevIndex;
    const prevRuntime = runtime;
    const tr = slideChanged
      ? clampTransitionForPlan(incoming?.transition, !basicTransitionsOnly)
      : undefined;
    const useMorphLayers = tr?.kind === "morph" && prevRuntime?.scene;
    const ghost =
      tr && tr.kind !== "cut" && tr.duration > 0 && !useMorphLayers ? snapshotStage(stage) : null;

    teardown();
    lastHoverKey = null;
    index = nextIndex;
    if (!incoming) {
      stopCarryAudios();
      ghost?.remove();
      return;
    }
    if (slideChanged) playTransitionSound(incoming);
    followPending = null;
    runtime = createSlideRuntime(stage, incoming, pres, backend, () => {
      // step 推进或时间轴自动触发时发事件
      fireStepChange();
    }, playAnimSound);
    // 触发当前 slide 的 3D bake；setProperty 在 bake 完成时通知 renderer redraw。
    if (runtime?.scene) bakeRuntime.kick(incoming, runtime.scene);
    fitStage();
    refreshUi();
    requestAnimationFrame(syncVideoMediaControls);
    const loadedRuntime = runtime;
    let transitionDone: Promise<void>;
    if (useMorphLayers && tr && runtime?.scene) {
      const prevSlide = pres.slides[prevIndex];
      const layers = mountMorphTransitionLayers(stageWrap, stage, prevRuntime!.scene!, runtime.scene, {
        chromeBg: stageChromeBackground(prevSlide),
      });
      transitionDone = runTransition(layers.ghost, layers.target, tr).finally(() => layers.cleanup());
    } else {
      transitionDone = ghost && tr ? runTransition(ghost, stage, tr) : Promise.resolve();
    }
    if (autoplay && loadedRuntime) {
      Promise.all([
        transitionDone,
        waitForSlideAssets(loadedRuntime.scene, host.ownerDocument),
      ]).then(() => {
        // 资源全部就绪后再停留 1s，让观众看清"基础内容"再开始入场动画。
        return delay(PLAYBACK_START_DELAY_MS);
      }).then(() => {
        // 等待期间用户可能已翻页/退出放映，runtime 已被 teardown 替换，放弃启动。
        if (runtime !== loadedRuntime) return;
        if (awaitingSoundConfirm) {
          pendingPlayOnLoad = true;
          return;
        }
        playOnLoad();
        scheduleAutoAdvance(incoming);
      });
    } else {
      scheduleAutoAdvance(incoming);
    }
    // 旁白与视频 autoplay 立刻开始（与 PowerPoint delay=0 媒体节点一致）。
    // 不要在 1s 动画延迟后再 stop/play 一遍，否则会和 scene <audio> 叠音或掐断旁白。
    playSlideNarrationsFor(incoming);
    playAutoplayMedia();
    rehearseEnterTs = Date.now();
    opts.onRecordSlideEnter?.(index);
    startLecture(incoming);
    opts.onSlideChange?.(requestedSlot, visibleTotal);
    fireSlideChange();
    const nextSlot = requestedSlot + 1;
    if (nextSlot < visibleTotal) schedulePrewarm(toAbsIndex(nextSlot));
  };

  const fireSlideChange = (): void => {
    const slot = toVisibleSlot(index);
    const slideInfo: SlideInfo = presentationInfo.slides[index] ?? {
      id: String(index),
      name: "",
      index,
      visibleIndex: slot,
      show: true,
      hasAnimations: false,
      totalAnimationSteps: 0,
    };
    // 用实际 runtime 步数补正 totalAnimationSteps（buildPresentationInfo 只能估算）。
    const totalSteps = runtime?.ooxml?.totalSteps ?? 0;
    const fixed: SlideInfo = {
      ...slideInfo,
      totalAnimationSteps: totalSteps,
      hasAnimations: totalSteps > 0,
    };
    eventBus.fire("slidechange", {
      visibleIndex: slot,
      absoluteIndex: index,
      total: visibleTotal,
      slide: fixed,
    });
  };

  const fireStepChange = (): void => {
    if (!runtime?.ooxml) return;
    const slot = toVisibleSlot(index);
    eventBus.fire("stepchange", {
      visibleIndex: slot,
      absoluteIndex: index,
      currentStep: runtime.ooxml.runtime.currentStep(),
      totalSteps: runtime.ooxml.totalSteps,
      frozen: !runtime.ooxml.runtime.isPlaying(),
    });
  };

  const schedulePrewarm = (idx: number): void => {
    if (idx < 0 || idx >= pres.slides.length) return;
    const slide = pres.slides[idx];
    if (!slide) return;
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback
      ?? ((cb: () => void): number => setTimeout(cb, 200) as unknown as number);
    ric(() => {
      try {
        // Warm scene + font registration; scene is discarded but parser-side
        // memoization (paint cache, image preloads) primes the renderer.
        const sc = createScene(slide, pres.size, { masters: pres.masters });
        void sc;
      } catch {
        // Best-effort prewarm.
      }
    });
  };

  const teardown = (): void => {
    clearAutoAdvance();
    destroyLectureOverlay();
    stopTransitionSound();
    stopExtraSounds();
    stopNarrationMedia();
    if (runtime?.scene) {
      const carried = new Set(carryAudios.map((c) => c.el));
      runtime.scene.root.walk((n) => {
        const el = n.mediaEl;
        if (!el || !carried.has(el as HTMLAudioElement)) return;
        root.appendChild(el);
        n.mediaEl = null;
      });
    }
    if (!runtime) return;
    runtime.detach();
    runtime = null;
  };

  const playOnLoad = (): void => {
    if (!runtime || !runtime.ooxml) return;
    onLoadStartedFor = runtime;
    const rt = runtime.ooxml.runtime;
    rt.startAutoSteps();
    const follow = followPending;
    followPending = null;
    if (follow) {
      if (follow.step > rt.currentStep()) rt.seekMainCursor(follow.step, follow.playLast);
      else if (!follow.playLast) rt.freezeActiveToEnd();
    }
    refreshUi();
    fireStepChange();
  };

  const advance = (): boolean => {
    if (!runtime || !runtime.ooxml) return false;
    const rt = runtime.ooxml.runtime;
    const before = rt.currentStep();
    const ok = rt.click();
    if (ok && rt.currentStep() !== before) rt.playNav("onNext");
    if (ok) {
      refreshUi();
      opts.onLectureStep?.();
      return true;
    }
    if (nextNavArmed && rt.playNav("onNext")) {
      nextNavArmed = false;
      refreshUi();
      return true;
    }
    refreshUi();
    return false;
  };

  // 将屏幕坐标换算成 slide 单位坐标。返回 null 表示舞台未布局完成。
  const toSlideCoords = (e: { clientX: number; clientY: number }): { x: number; y: number } | null => {
    const rect = stage.getBoundingClientRect();
    const sw = pres.size.width;
    const sh = pres.size.height;
    if (rect.width === 0 || rect.height === 0) return null;
    const x = ((e.clientX - rect.left) / rect.width) * sw;
    const y = ((e.clientY - rect.top) / rect.height) * sh;
    return { x, y };
  };

  const hitShapeGesture = (
    e: { clientX: number; clientY: number },
  ): { id: string; click: boolean; dbl: boolean; hover: boolean; out: boolean } | null => {
    if (!runtime || !runtime.ooxml) return null;
    const pt = toSlideCoords(e);
    if (!pt) return null;
    const flags = new Map<string, { click: boolean; dbl: boolean; hover: boolean; out: boolean }>();
    for (const s of runtime.ooxml.runtime.listShapeSteps()) {
      if (!s.triggerTargetId) continue;
      const rec = flags.get(s.triggerTargetId) ?? { click: false, dbl: false, hover: false, out: false };
      if (s.trigger === "onShapeClick") rec.click = true;
      else if (s.trigger === "onShapeDblClick") rec.dbl = true;
      else if (s.trigger === "onShapeHover") rec.hover = true;
      else if (s.trigger === "onShapeMouseOut") rec.out = true;
      else continue;
      flags.set(s.triggerTargetId, rec);
    }
    let best: { id: string; z: number; click: boolean; dbl: boolean; hover: boolean; out: boolean } | null = null;
    for (const [id, rec] of flags) {
      const node = runtime.scene.root.findById(id);
      if (!node || !nodeShownForPointer(node) || !hitTestNodeBBox(node, pt.x, pt.y)) continue;
      const z = getShapeZ(runtime.scene, id);
      if (!best || z >= best.z) best = { id, z, ...rec };
    }
    return best;
  };

  const tryTriggerShapeClick = (e: PointerEvent): boolean => {
    const hit = hitShapeGesture(e);
    if (!hit || !runtime?.ooxml) return false;
    const rt = runtime.ooxml.runtime;
    if (hit.click && rt.shapeClick(hit.id)) return true;
    // 双击序列还没播完时，按下不能把放映推进到下一状态。
    return hit.dbl && rt.hasQueuedShape(hit.id, "onShapeDblClick");
  };

  const tryTriggerShapeDblClick = (e: MouseEvent): boolean => {
    const hit = hitShapeGesture(e);
    if (!hit?.dbl || !runtime?.ooxml) return false;
    return runtime.ooxml.runtime.shapeDblClick(hit.id);
  };

  const tryTriggerShapeHover = (e: PointerEvent): void => {
    const hit = hitShapeGesture(e);
    const hoverId = hit?.hover ? hit.id : null;
    const outId = hit?.out ? hit.id : null;
    if (lastMouseOutShapeId && lastMouseOutShapeId !== outId && runtime?.ooxml) {
      runtime.ooxml.runtime.shapeMouseOut(lastMouseOutShapeId);
    }
    lastMouseOutShapeId = outId;
    if (hoverId === lastHoverShapeId) return;
    lastHoverShapeId = hoverId;
    if (hoverId && runtime?.ooxml) runtime.ooxml.runtime.shapeHover(hoverId);
  };

  // 命中已经显示出来的 shape 上的 hyperlink（ECMA-376 §20.1.2.2.32 hlinkClick）
  // 或 hlinkHover。入场前 opacity=0 的形状不参与，点击落到动画推进。
  const findLinkAt = (pt: { x: number; y: number }, slot: LinkSlot): { link: HyperlinkRef; key: string } | null => {
    if (!runtime) return null;
    const hit = findHyperlinkAt(runtime.scene.root, pt.x, pt.y, slot);
    if (!hit) return null;
    return { link: hit.link, key: `${hit.id}:${hit.link.kind}:${hit.link.target ?? ""}` };
  };

  const tryTriggerHyperlink = (e: PointerEvent): boolean => {
    if (!runtime) return false;
    const pt = toSlideCoords(e);
    if (!pt) return false;
    const hit = findLinkAt(pt, "hyperlink");
    if (!hit) return false;
    return executeHyperlink(hit.link);
  };

  const tryTriggerHoverLink = (e: PointerEvent): void => {
    if (!runtime || navigationLocked) {
      stage.style.cursor = "";
      lastHoverKey = null;
      return;
    }
    const pt = toSlideCoords(e);
    if (!pt) return;
    const hover = findLinkAt(pt, "hoverLink");
    const click = findLinkAt(pt, "hyperlink");
    stage.style.cursor = hover || click ? "pointer" : "";
    if (!hover) {
      lastHoverKey = null;
      return;
    }
    if (hover.key === lastHoverKey) return;
    lastHoverKey = hover.key;
    executeHyperlink(hover.link);
  };

  // 执行一个 HyperlinkRef。返回 true 当且仅当命中已知动作 —— 用于让调用方决定
  // 是否吞掉默认推进逻辑。endShow 直接调用 onComplete + complete 事件并跳到结尾。
  const executeHyperlink = (link: HyperlinkRef): boolean => {
    playHyperlinkSound(link);
    switch (link.kind) {
      case "sound":
        return true;
      case "url": {
        const url = sanitizeExternalUrl(link.target);
        if (url) {
          window.open(url, "_blank", "noopener,noreferrer");
        }
        return true;
      }
      case "slide": {
        // OOXML target 在 hyperlink dialog 中以 1-based 字符串写入。
        const n = Number(link.target);
        if (Number.isFinite(n) && n >= 1 && n <= pres.slides.length) {
          // 把绝对索引投到可见序列：若目标 slide 被 show=false 隐藏，会被
          // gotoSlot 内部的 clampIndex 限制到最近的可见 slide。
          const slot = toVisibleSlot(n - 1);
          gotoSlot(slot);
        }
        return true;
      }
      case "next": {
        const slot = toVisibleSlot(index);
        if (slot + 1 < visibleTotal) gotoSlot(slot + 1);
        return true;
      }
      case "prev": {
        const slot = toVisibleSlot(index);
        if (slot > 0) gotoSlot(slot - 1);
        return true;
      }
      case "first":
        gotoSlot(0);
        return true;
      case "last":
        gotoSlot(visibleTotal - 1);
        return true;
      case "back": {
        // PowerPoint 的「back/lastSlideViewed」需要历史栈。当前没有维护，退化为 prev。
        const slot = toVisibleSlot(index);
        if (slot > 0) gotoSlot(slot - 1);
        return true;
      }
      case "endShow": {
        opts.onComplete?.();
        eventBus.fire("complete", undefined);
        return true;
      }
    }
    return false;
  };

  const refreshUi = (): void => {
    const slot = toVisibleSlot(index);
    if (pageLabel) pageLabel.textContent = `${slot + 1} / ${visibleTotal}`;
    if (progressFill && runtime?.ooxml) {
      const total = runtime.ooxml.totalSteps;
      const cur = runtime.ooxml.runtime.currentStep();
      const ratio = total === 0 ? 1 : cur / total;
      progressFill.style.width = (ratio * 100).toFixed(1) + "%";
    } else if (progressFill) {
      progressFill.style.width = "0%";
    }
  };

  const finishShow = (): void => {
    opts.onComplete?.();
    eventBus.fire("complete", undefined);
  };

  const gotoSlot = (slot: number): void => {
    if (awaitingSoundConfirm) return;
    chrome?.dismissTransient();
    if (slot < 0 || slot >= visibleTotal) return;
    load(toAbsIndex(slot));
  };

  const goPrev = (): void => {
    if (awaitingSoundConfirm) return;
    if (chrome?.isEnd()) {
      chrome.dismissEnd();
      return;
    }
    if (prevNavArmed && runtime?.ooxml?.runtime.playNav("onPrev")) {
      prevNavArmed = false;
      refreshUi();
      return;
    }
    const slot = toVisibleSlot(index);
    if (slot > 0) gotoSlot(slot - 1);
  };

  let onEndContextMenu: ((e: MouseEvent) => void) | undefined;

  const advanceOrNext = (): void => {
    if (awaitingSoundConfirm) return;
    if (chrome?.dismissTransient()) return;
    if (chrome?.isEnd()) {
      finishShow();
      return;
    }
    const lectureSlide = pres.slides[index];
    const lectureTake = lectureSlide ? activeLectureTake(lectureSlide) : null;
    if (lectureTake && lectureTakeNow) {
      skipLectureForward(lectureTake);
      return;
    }
    if (!advance()) {
      if (!clickAdvancesSlide(pres.slides[index]?.transition)) return;
      showNextSlide();
    }
  };

  const showNextSlide = (): void => {
    const slot = toVisibleSlot(index);
    if (slot + 1 < visibleTotal) gotoSlot(slot + 1);
    else if (endWithBlackSlide) {
      chrome?.showEnd({
        kind: resolveEndScreenKind({ endQuiet, follow: followMode, homeHref: endHomeHref }),
        onExit: finishShow,
        onReplay: () => gotoSlot(0),
        homeHref: endHomeHref,
        replayLabel: endReplayLabel,
        homeLabel: endHomeLabel,
        onContextMenu: (e) => onEndContextMenu?.(e),
      });
    }
    else finishShow();
  };
  advanceSlideFromTimer = () => {
    if (awaitingSoundConfirm) return;
    if (chrome?.dismissTransient()) return;
    if (chrome?.isEnd()) {
      finishShow();
      return;
    }
    showNextSlide();
  };

  const gotoById = (slideId: string): boolean => {
    const idx = pres.slides.findIndex((s) => s.id === slideId);
    if (idx < 0) return false;
    load(idx);
    return true;
  };

  // 给插件用的控制 API（其实就是 api 的一个子集，再加 nextStep/triggerShape）
  const controlAPI: PlayerControlAPI = {
    next: () => advanceOrNext(),
    prev: () => goPrev(),
    goto: (i) => gotoSlot(i),
    gotoById,
    current: () => toVisibleSlot(index),
    total: () => visibleTotal,
    nextStep: () => advance(),
    triggerShape: (shapeId) => runtime?.ooxml?.runtime.shapeClick(shapeId) ?? false,
    step: () => {
      if (!runtime?.ooxml) return { totalSteps: 0, currentStep: 0 };
      return {
        totalSteps: runtime.ooxml.totalSteps,
        currentStep: runtime.ooxml.runtime.currentStep(),
      };
    },
    freezeActive: () => runtime?.ooxml?.runtime.freezeActiveToEnd(),
    setNavigationLocked: (locked) => {
      navigationLocked = locked;
    },
    isNavigationLocked: () => navigationLocked,
  };

  // ctx.scene —— 当前 slide 的 shape 模型（查询 / 命中测试 / 显隐 / 触发动画）。
  // 所有方法都在调用时实时读取 `runtime`，因此换页后自动指向新 slide。
  const clickTriggerIds = (): Set<string> => {
    const ids = new Set<string>();
    const steps =
      (runtime?.ooxml?.runtime as unknown as { shapeSteps?: { triggerTargetId?: string }[] })
        ?.shapeSteps ?? [];
    for (const s of steps) if (s.triggerTargetId) ids.add(s.triggerTargetId);
    return ids;
  };
  const isNodeVisible = (node: SceneNode): boolean => nodeShownForPointer(node);
  const toShapeInfo = (node: SceneNode, clickIds: Set<string>): ShapeInfo => ({
    id: node.id,
    name: node.shape.name ?? "",
    kind: node.shape.kind,
    bbox: { ...node.shape.bbox },
    visible: isNodeVisible(node),
    text: extractShapeText(node.shape),
    hasClickAnimation: clickIds.has(node.id),
  });
  // 顶层 shape = scene.root 的直接子节点，排除合成背景（__bg_*）。数组顺序即 z 序。
  const topLevelNodes = (): SceneNode[] => {
    const root = runtime?.scene.root;
    if (!root) return [];
    return root.children.filter((c) => !c.id.startsWith("__bg_"));
  };
  const sceneAPI: SceneAPI = {
    shapes: () => {
      const clickIds = clickTriggerIds();
      return topLevelNodes().map((n) => toShapeInfo(n, clickIds));
    },
    byName: (name) => sceneAPI.allByName(name)[0] ?? null,
    allByName: (name) => {
      const clickIds = clickTriggerIds();
      return topLevelNodes()
        .filter((n) => (n.shape.name ?? "") === name)
        .map((n) => toShapeInfo(n, clickIds));
    },
    byId: (id) => {
      const node = runtime?.scene.root.findById(id) ?? null;
      return node ? toShapeInfo(node, clickTriggerIds()) : null;
    },
    hitTest: (x, y) => {
      const clickIds = clickTriggerIds();
      let best: SceneNode | null = null;
      // 数组靠后 = z 更高；取命中且可见的最顶层。
      for (const n of topLevelNodes()) {
        if (!isNodeVisible(n)) continue;
        if (hitTestNodeBBox(n, x, y)) best = n;
      }
      return best ? toShapeInfo(best, clickIds) : null;
    },
    toSlideCoords: (clientX, clientY) => {
      const rect = stage.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return null;
      return {
        x: ((clientX - rect.left) / rect.width) * pres.size.width,
        y: ((clientY - rect.top) / rect.height) * pres.size.height,
      };
    },
    setVisible: (id, vis) => {
      const node = runtime?.scene.root.findById(id);
      if (!node) return false;
      node.setProperty("visible", vis);
      return true;
    },
    setOpacity: (id, opacity) => {
      const node = runtime?.scene.root.findById(id);
      if (!node) return false;
      node.setProperty("opacity", opacity);
      return true;
    },
    triggerShape: (id) => runtime?.ooxml?.runtime.shapeClick(id) ?? false,
  };

  const { ui: pluginUI, destroy: destroyPluginUI } = createPluginUI({
    doc: root.ownerDocument,
    host: root,
    controls,
    stage,
    options: opts.ui ?? {},
  });

  const thumbnailAPI = createThumbnailAPI(pres);

  // 右键菜单管理器 —— stage 是触发点（右键单击 slide 区域），host 是挂载点（让全屏
  // 模式下菜单仍然在 fullscreen 元素内可见）。
  const contextMenuMgr = createContextMenuManager({
    doc: root.ownerDocument,
    trigger: stage,
    host: root,
    enabled: opts.contextMenu !== false && (!kiosk || opts.livePlugins === true),
  });
  onEndContextMenu = (e) => contextMenuMgr.api.open(e.clientX, e.clientY);

  const locale = resolvePlayerLocale(opts.locale);
  const tr = createTranslator(locale);
  endReplayLabel = tr("chrome.endReplay");
  endHomeLabel = tr("chrome.endHome");

  const dismissNarrationPrompt = (): void => {
    narrationPromptEl?.remove();
    narrationPromptEl = null;
  };

  const resolveSoundConfirm = (withSound: boolean): void => {
    if (!awaitingSoundConfirm) return;
    awaitingSoundConfirm = false;
    playNarrationsEnabled = withSound && opts.playSlideNarrations !== false;
    dismissNarrationPrompt();
    const slide = pres.slides[index];
    if (slide && playNarrationsEnabled && !followMode) playSlideNarrationsFor(slide);
    if (slide) startLecture(slide);
    if (!followMode) playAutoplayMedia();
    if (pendingPlayOnLoad) {
      pendingPlayOnLoad = false;
      // 讲解点击从这一刻起算，入场动画仍要等和录制时一样的 1 秒。
      // 提示挡住的那段已经把原来的等待用掉了，这里补上，避免点击落到还在播的入场上。
      const runtimeNow = runtime;
      const slideNow = slide;
      void delay(PLAYBACK_START_DELAY_MS).then(() => {
        if (runtime !== runtimeNow) return;
        playOnLoad();
        if (slideNow) scheduleAutoAdvance(slideNow);
      });
    } else if (!autoplay && slide) {
      scheduleAutoAdvance(slide);
    }
    root.focus();
  };

  const showNarrationPrompt = (): void => {
    if (!awaitingSoundConfirm || narrationPromptEl) return;
    const doc = root.ownerDocument;
    const overlay = doc.createElement("div");
    overlay.className = "ppt-narration-prompt";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-labelledby", "ppt-narration-title");
    const card = doc.createElement("div");
    card.className = "ppt-narration-card";
    const title = doc.createElement("h2");
    title.id = "ppt-narration-title";
    title.textContent = tr("narration.title");
    const body = doc.createElement("p");
    body.textContent = tr("narration.body");
    const actions = doc.createElement("div");
    actions.className = "ppt-narration-actions";
    const muteBtn = doc.createElement("button");
    muteBtn.type = "button";
    muteBtn.className = "ppt-narration-btn";
    muteBtn.textContent = tr("narration.mute");
    const playBtn = doc.createElement("button");
    playBtn.type = "button";
    playBtn.className = "ppt-narration-btn is-primary";
    playBtn.textContent = tr("narration.play");
    muteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resolveSoundConfirm(false);
    });
    playBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      resolveSoundConfirm(true);
    });
    overlay.addEventListener("pointerdown", (e) => e.stopPropagation());
    overlay.addEventListener("click", (e) => e.stopPropagation());
    actions.appendChild(muteBtn);
    actions.appendChild(playBtn);
    card.appendChild(title);
    card.appendChild(body);
    card.appendChild(actions);
    overlay.appendChild(card);
    root.appendChild(overlay);
    narrationPromptEl = overlay;
    playBtn.focus();
  };

  chrome = createShowChrome({
    host: root,
    tr,
    visibleTotal: () => visibleTotal,
    currentSlot: () => toVisibleSlot(index),
    gotoSlot,
    thumbnail: thumbnailAPI,
    toAbsIndex: (slot) => toAbsIndex(slot),
  });
  const shared: Record<string, unknown> = {
    "ppt:liveScene": () => runtime?.scene ?? null,
    "ppt:fileName": opts.fileName,
  };
  const liveHub = createPluginLiveHub();
  const buildPluginCtx = (pluginId: string): PluginContext => ({
    presentation: presentationInfo,
    player: controlAPI,
    events: eventBus,
    ui: pluginUI,
    scene: sceneAPI,
    thumbnail: thumbnailAPI,
    contextMenu: contextMenuMgr.api,
    shared,
    locale,
    live: liveHub.apiFor(pluginId),
    log: (...args: unknown[]) => {
      console.log(`[plugin:${pluginId}]`, ...args);
    },
  });

  // 内置菜单项：翻页 / 跳转首末 / 结束放映 / 全屏切换。
  // 按需通过 opts.hideBuiltinContextMenuItems 隐藏。
  const hiddenBuiltins = new Set(opts.hideBuiltinContextMenuItems ?? []);
  const addBuiltin = (item: Parameters<typeof contextMenuMgr.addBuiltinItem>[0]): void => {
    if (item.id && hiddenBuiltins.has(item.id)) return;
    contextMenuMgr.addBuiltinItem(item);
  };
  addBuiltin({
    id: "builtin:prev",
    label: tr("menu.prev"),
    shortcut: "←",
    group: "nav",
    order: 10,
    disabled: () => !chrome?.isEnd() && toVisibleSlot(index) <= 0,
    onClick: () => controlAPI.prev(),
  });
  addBuiltin({
    id: "builtin:next",
    label: tr("menu.next"),
    shortcut: "→",
    group: "nav",
    order: 20,
    onClick: () => controlAPI.next(),
  });
  addBuiltin({
    id: "builtin:first",
    label: tr("menu.first"),
    shortcut: "Home",
    group: "jump",
    order: 30,
    disabled: () => toVisibleSlot(index) === 0,
    onClick: () => gotoSlot(0),
  });
  addBuiltin({
    id: "builtin:last",
    label: tr("menu.last"),
    shortcut: "End",
    group: "jump",
    order: 40,
    disabled: () => toVisibleSlot(index) === visibleTotal - 1,
    onClick: () => gotoSlot(visibleTotal - 1),
  });
  addBuiltin({
    id: "builtin:black",
    label: tr("menu.black"),
    shortcut: "B",
    group: "view",
    order: 50,
    onClick: () => chrome?.toggleBlank("black"),
  });
  addBuiltin({
    id: "builtin:white",
    label: tr("menu.white"),
    shortcut: ",",
    group: "view",
    order: 51,
    onClick: () => chrome?.toggleBlank("white"),
  });
  addBuiltin({
    id: "builtin:grid",
    label: tr("menu.grid"),
    shortcut: "G",
    group: "view",
    order: 52,
    onClick: () => chrome?.toggleGrid(),
  });
  addBuiltin({
    id: "builtin:help",
    label: tr("menu.help"),
    shortcut: "F1",
    group: "view",
    order: 53,
    onClick: () => chrome?.toggleHelp(),
  });
  addBuiltin({
    id: "builtin:fullscreen",
    label: tr("menu.fullscreen"),
    shortcut: "F",
    group: "view",
    order: 80,
    onClick: () => {
      const d = root.ownerDocument;
      if (d.fullscreenElement) {
        d.exitFullscreen().catch(() => undefined);
      } else {
        root.requestFullscreen?.().catch(() => undefined);
      }
    },
  });
  addBuiltin({
    id: "builtin:end",
    label: tr("menu.end"),
    shortcut: "Esc",
    group: "end",
    order: 90,
    onClick: () => finishShow(),
  });

  // PluginManager 工厂以 pluginId 为参数构造 ctx（log 前缀按插件 id 区分）。
  const pluginManager = new PluginManager((pluginId) => buildPluginCtx(pluginId));

  const videoUnderPointer = (e: PointerEvent): HTMLVideoElement | null => {
    const t = e.target;
    if (t instanceof Element) {
      const host = t.closest("video");
      if (host instanceof HTMLVideoElement && stage.contains(host)) return host;
    }
    const x = e.clientX;
    const y = e.clientY;
    const targetGroup = t instanceof Element ? t.closest("g[data-id]") : null;
    const videos = [...stage.querySelectorAll("video")].reverse();
    for (const el of videos) {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0) continue;
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const group = el.closest("g[data-id]");
      if (targetGroup && group && targetGroup !== group) continue;
      return el;
    }
    return null;
  };

  const replayOrToggle = (video: HTMLVideoElement): void => {
    const dur = video.duration;
    const atEnd = video.ended || (Number.isFinite(dur) && dur > 0 && video.currentTime >= dur - 0.08);
    if (!atEnd && !video.paused) {
      video.pause();
      return;
    }
    if (atEnd) {
      try {
        video.currentTime = 0;
      } catch {
        /* ignore */
      }
    }
    void video.play().catch(() => undefined);
  };

  stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0) return;
    if (navigationLocked) return;
    // foreignObject 里的播放按钮经常点不中，点击会穿透到舞台被当成翻页。
    // 落在画面范围内就留给这段视频；没点到 <video> 本身时在这里重播或暂停。
    const video = videoUnderPointer(e);
    if (video) {
      e.stopPropagation();
      const target = e.target;
      const onVideo = target instanceof Node && (target === video || video.contains(target));
      if (!onVideo) {
        e.preventDefault();
        replayOrToggle(video);
      }
      return;
    }
    if (tryTriggerHyperlink(e)) {
      e.stopPropagation();
      return;
    }
    if (tryTriggerShapeClick(e)) {
      e.stopPropagation();
      return;
    }
    if (!clickAdvance) return;
    advanceOrNext();
  });

  stage.addEventListener("dblclick", (e) => {
    if (navigationLocked) return;
    if (tryTriggerShapeDblClick(e)) e.stopPropagation();
  });

  stage.addEventListener("pointermove", (e) => {
    tryTriggerHoverLink(e);
    tryTriggerShapeHover(e);
  });
  stage.addEventListener("pointerleave", () => {
    if (lastMouseOutShapeId && runtime?.ooxml) {
      runtime.ooxml.runtime.shapeMouseOut(lastMouseOutShapeId);
    }
    lastHoverKey = null;
    lastHoverShapeId = null;
    lastMouseOutShapeId = null;
    stage.style.cursor = "";
  });

  if (keyboard) {
    const onKey = (e: KeyboardEvent): void => {
      if (awaitingSoundConfirm) {
        const onPromptBtn = e.target instanceof HTMLElement && e.target.closest(".ppt-narration-btn");
        if (onPromptBtn && (e.key === "Enter" || e.key === " ")) return;
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (isTypingTarget(e.target)) return;
      if (navigationLocked) return;
      if (kiosk) return;

      const digit = applyDigitJumpKey(digitBuffer, e.key, visibleTotal);
      if (digit.kind !== "ignore") {
        e.preventDefault();
        if (digitTimer !== undefined) clearTimeout(digitTimer);
        if (digit.kind === "buffer") {
          digitBuffer = digit.buffer;
          chrome?.setJumpHint(digitBuffer);
          digitTimer = setTimeout(() => {
            digitBuffer = "";
            chrome?.setJumpHint(null);
          }, 1600);
        } else if (digit.kind === "jump") {
          digitBuffer = "";
          chrome?.setJumpHint(null);
          gotoSlot(digit.index0);
        } else {
          digitBuffer = "";
          chrome?.setJumpHint(null);
        }
        return;
      }

      if (e.key === "Escape") {
        if (chrome?.dismissTransient()) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        if (chrome?.isEnd()) {
          if (chrome.endKind() === "exit") {
            e.preventDefault();
            finishShow();
          }
          return;
        }
        return;
      }

      if (chrome?.isEnd()) {
        const leave = chrome.endKind() === "exit";
        if (e.key === " " || e.key === "Enter" || e.key === "ArrowRight" || e.key === "ArrowDown" || e.key === "PageDown") {
          e.preventDefault();
          if (leave) finishShow();
          return;
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp" || e.key === "PageUp" || e.key === "Backspace") {
          e.preventDefault();
          goPrev();
          return;
        }
        return;
      }

      switch (e.key) {
        case " ":
        case "ArrowRight":
        case "ArrowDown":
        case "PageDown":
        case "Enter":
          e.preventDefault();
          advanceOrNext();
          return;
        case "ArrowLeft":
        case "ArrowUp":
        case "PageUp":
        case "Backspace":
          e.preventDefault();
          goPrev();
          return;
        case "Home":
          e.preventDefault();
          gotoSlot(0);
          return;
        case "End":
          e.preventDefault();
          gotoSlot(visibleTotal - 1);
          return;
        case "b":
        case "B":
        case ".":
          e.preventDefault();
          chrome?.toggleBlank("black");
          return;
        case ",":
          e.preventDefault();
          chrome?.toggleBlank("white");
          return;
        case "g":
        case "G":
          e.preventDefault();
          chrome?.toggleGrid();
          return;
        case "p":
        case "P":
          e.preventDefault();
          toggleLecturePause();
          return;
        case "F1":
        case "?":
          e.preventDefault();
          chrome?.toggleHelp();
          return;
      }

      if (contextMenuMgr.invokeShortcut(e)) {
        e.preventDefault();
      }
    };
    root.addEventListener("keydown", onKey);
  }

  const onPromptKeyCapture = (e: KeyboardEvent): void => {
    if (!awaitingSoundConfirm) return;
    if (e.key === "Tab") return;
    const onPromptBtn = e.target instanceof HTMLElement && e.target.closest(".ppt-narration-btn");
    if ((e.key === "Enter" || e.key === " ") && onPromptBtn) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      e.stopPropagation();
      resolveSoundConfirm(true);
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      resolveSoundConfirm(false);
      return;
    }
    e.preventDefault();
    e.stopPropagation();
  };
  root.addEventListener("keydown", onPromptKeyCapture, true);

  load(index);
  requestAnimationFrame(fitStage);
  showNarrationPrompt();
  if (!awaitingSoundConfirm) root.focus();

  const api: PlayerHandle = {
    destroy(): void {
      try {
        eventBus.fire("destroy", undefined);
      } catch {
        // swallow listener errors during destroy
      }
      pluginManager.destroyAll();
      liveHub.attach(null);
      contextMenuMgr.destroy();
      dismissNarrationPrompt();
      chrome?.destroy();
      if (digitTimer !== undefined) clearTimeout(digitTimer);
      destroyPluginUI();
      eventBus.clear();
      stopCarryAudios();
      teardown();
      ro.disconnect();
      root.remove();
    },
    next(): void {
      if (awaitingSoundConfirm) {
        resolveSoundConfirm(true);
        return;
      }
      advanceOrNext();
    },
    prev(): void {
      goPrev();
    },
    // goto 接收的是可见序列的 slot 索引，与 onSlideChange 报告的索引一致。
    goto(i: number): void {
      gotoSlot(i);
    },
    current(): number {
      return toVisibleSlot(index);
    },
    total(): number {
      return visibleTotal;
    },
    plugins: {
      register: (p) => pluginManager.register(p),
      unregister: (id) => pluginManager.unregister(id),
      list: () => pluginManager.list(),
      has: (id) => pluginManager.has(id),
    },
    presentation: presentationInfo,
    events: {
      on: (event, cb) => eventBus.on(event, cb as never),
    },
    debugSteps(): { totalSteps: number; currentStep: number; frozen: boolean } {
      if (!runtime?.ooxml) return { totalSteps: 0, currentStep: 0, frozen: true };
      return {
        totalSteps: runtime.ooxml.totalSteps,
        currentStep: runtime.ooxml.runtime.currentStep(),
        frozen: !runtime.ooxml.runtime.isPlaying(),
      };
    },
    debugFreezeActive(): void {
      // 自动驱动（visual-compare / e2e）不等资源 gate，直接确保 onLoad step 已启动，
      // 再冻结到末态，保证截图确定性，不受 waitForSlideAssets 的异步延迟影响。
      runtime?.ooxml?.runtime.startAutoSteps();
      runtime?.ooxml?.runtime.freezeActiveToEnd();
    },
    setFollowMode(on: boolean): void {
      followMode = Boolean(on);
      if (on && awaitingSoundConfirm) {
        awaitingSoundConfirm = false;
        const resume = pendingPlayOnLoad;
        pendingPlayOnLoad = false;
        playNarrationsEnabled = false;
        dismissNarrationPrompt();
        stopNarrationMedia();
        if (resume) playOnLoad();
      }
    },
    attachLive(transport: PluginLiveTransport | null): void {
      liveHub.attach(transport);
    },
    receiveLivePlugin(msg: PluginLiveInbound): void {
      liveHub.receive(msg);
    },
    snapshotMedia(): LiveMediaTrack[] {
      const tracks: LiveMediaTrack[] = [];
      if (!runtime?.scene) return tracks;
      const now = Date.now();
      runtime.scene.root.walk((n) => {
        const el = n.mediaEl;
        if (!el || (n.shape.kind !== "video" && n.shape.kind !== "audio")) return;
        tracks.push({
          shapeId: n.shape.id,
          time: Number.isFinite(el.currentTime) ? el.currentTime : 0,
          paused: el.paused,
          rate: Number.isFinite(el.playbackRate) && el.playbackRate > 0 ? el.playbackRate : 1,
          ts: now,
        });
      });
      return tracks;
    },
    followMedia(tracks: LiveMediaTrack[]): void {
      if (!runtime?.scene || !Array.isArray(tracks)) return;
      const now = Date.now();
      const byId = new Map(tracks.map((t) => [t.shapeId, t]));
      runtime.scene.root.walk((n) => {
        const spec = byId.get(n.shape.id);
        const el = n.mediaEl;
        if (!spec || !el) return;
        const rate = Number.isFinite(spec.rate) && spec.rate > 0 ? spec.rate : 1;
        const elapsed = spec.paused ? 0 : Math.max(0, (now - spec.ts) / 1000) * rate;
        const target = Math.max(0, spec.time + elapsed);
        if (Math.abs(el.currentTime - target) > 0.35) {
          try {
            el.currentTime = target;
          } catch {
            /* ignore */
          }
        }
        if (Math.abs(el.playbackRate - rate) > 0.01) el.playbackRate = rate;
        if (spec.paused) {
          if (!el.paused) el.pause();
        } else if (el.paused) {
          void el.play().catch(() => undefined);
        }
      });
    },
    followCursor(slideIndex: number, step: number, playLast = true): void {
      const targetSlot = Math.max(0, Math.min(Math.max(0, visibleTotal - 1), Math.floor(Number(slideIndex)) || 0));
      const wantStep = Math.max(0, Math.floor(Number(step)) || 0);
      const slideChanged = toVisibleSlot(index) !== targetSlot;
      if (slideChanged) gotoSlot(targetSlot);
      const rt = runtime?.ooxml?.runtime;
      if (!rt) {
        refreshUi();
        return;
      }
      if (autoplay && runtime !== onLoadStartedFor) {
        followPending = { step: wantStep, playLast };
        refreshUi();
        return;
      }
      // 主持人仍在起播延迟里（step 0），本机入场已开播：不要倒回去。
      if (!slideChanged && wantStep === 0 && rt.currentStep() > 0) {
        refreshUi();
        return;
      }
      // 主持人还在 step 0：播 onLoad 入场。迟到或同页追上则快进已过的 step；
      // playLast=false 表示主持人已跳过当前动画，观众 freeze 到末态。
      if (wantStep <= 0 && rt.currentStep() === 0) {
        rt.startAutoSteps();
        if (!playLast) rt.freezeActiveToEnd();
      } else {
        rt.seekMainCursor(wantStep, playLast);
      }
      refreshUi();
    },
    async waitForBake3D(): Promise<void> {
      // 等离屏光栅副通道（缩略图/截图用）与 live 3D 首帧（hybrid 实时视图）都就绪。
      await bakeRuntime.waitForAll();
      await runtime?.ready3D?.();
      // 顺带等位图 / 字体解码，让截图捕捉到完整的"页面基础内容"。
      if (runtime) await waitForSlideAssets(runtime.scene, host.ownerDocument);
    },
    debugDumpRuntime(): unknown {
      if (!runtime?.ooxml) return null;
      const r = runtime.ooxml.runtime as unknown as {
        active: Array<{ step: { duration: number; delay: number }; startMs: number; durationMs: number }>;
        elapsed: number;
        cursor: number;
        steps: Array<{ trigger: string; duration: number; atoms: Array<{ offset: number; atom: { targetId: string; presetClass?: string; duration?: number; tracks: Array<{ kind: string; property?: string }> } }> }>;
      };
      const scene = runtime.scene;
      const nodes: Record<string, Record<string, unknown>> = {};
      if (scene) {
        scene.root.walk((n) => {
          nodes[n.id] = {
            tx: n.tx, ty: n.ty, opacity: n.opacity, rotation: n.rotation,
            scale: n.scale, scaleX: n.scaleX, scaleY: n.scaleY,
            widthScale: n.widthScale, heightScale: n.heightScale,
            clip: n.clip ? { kind: n.clip.kind, ...n.clip } : null,
          };
        });
      }
      return {
        cursor: r.cursor,
        elapsed: r.elapsed,
        active: r.active.map((a) => ({ startMs: a.startMs, durationMs: a.durationMs, dur: a.step.duration, delay: a.step.delay })),
        mainSteps: r.steps.map((s) => ({
          trigger: s.trigger,
          duration: s.duration,
          atoms: s.atoms.map((i) => ({
            offset: i.offset,
            tgt: i.atom.targetId,
            presetClass: i.atom.presetClass,
            tracks: i.atom.tracks.map((t) => `${t.kind}:${t.property ?? ""}`),
          })),
        })),
        nextStepAtoms: r.steps[r.cursor]?.atoms.map((i) => ({ offset: i.offset, tgt: i.atom.targetId, presetClass: i.atom.presetClass, tracks: i.atom.tracks.map((t) => `${t.kind}:${t.property ?? ""}`) })),
        nodes,
      };
    },
  };

  // 激活初始插件：MountOptions.plugins + window.__PPTPlayerPluginQueue（IIFE 场景）。
  const queuePlugins =
    typeof window !== "undefined" && window.__PPTPlayerPluginQueue
      ? window.__PPTPlayerPluginQueue.splice(0)
      : [];
  const initialPlugins: Plugin[] = [...(opts.plugins ?? []), ...queuePlugins];
  if (initialPlugins.length > 0) {
    // 异步激活；不阻塞 mount 返回。激活失败会在 PluginManager 内部 console.error。
    void pluginManager.registerAll(initialPlugins);
  }

  return api;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 收集一张 slide 渲染所需的位图资源 URL：背景图（被注入成 __bg_ image shape）、
// image shape、以及 image 填充。用于放映时等"基础内容"解码完成后再播 onLoad 动画。
function collectImageSrcs(scene: Scene): string[] {
  const srcs = new Set<string>();
  scene.root.walk((n) => {
    const sh = n.shape as unknown as {
      kind?: string;
      src?: string;
      fill?: { kind?: string; src?: string };
    };
    if (sh.kind === "image" && typeof sh.src === "string" && sh.src) srcs.add(sh.src);
    if (sh.fill?.kind === "image" && typeof sh.fill.src === "string" && sh.fill.src) {
      srcs.add(sh.fill.src);
    }
  });
  return [...srcs];
}

// 等待 slide 的基础资源（位图 + 字体）就绪。带超时兜底：坏图 / 慢网时最多等
// timeoutMs，避免永久卡住放映。getImage 复用 renderer 的全局图片缓存（backend
// 渲染时已发起加载），这里只挂 load/error 监听等待完成。
function waitForSlideAssets(scene: Scene, doc: Document, timeoutMs = 4000): Promise<void> {
  const waits: Promise<unknown>[] = [];
  for (const src of collectImageSrcs(scene)) {
    const img = getImage(src);
    if (img.complete && img.naturalWidth > 0) continue;
    waits.push(
      new Promise<void>((resolve) => {
        img.addEventListener("load", () => resolve(), { once: true });
        // 加载失败也放行：坏图不应阻塞动画启动。
        img.addEventListener("error", () => resolve(), { once: true });
      }),
    );
  }
  // font-display:swap 下字体异步加载；等 fonts.ready 让首帧用正确字形播动画。
  if (doc.fonts?.ready) waits.push(doc.fonts.ready.catch(() => undefined));
  if (waits.length === 0) return Promise.resolve();
  const all = Promise.all(waits).then(() => undefined);
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, timeoutMs));
  return Promise.race([all, timeout]);
}

function createSlideRuntime(
  stage: HTMLElement,
  slide: Slide,
  pres: Presentation,
  backend: Backend,
  onChange?: () => void,
  onAnimSound?: (src: string | undefined) => void,
): SlideRuntime {
  // 清空上一页的渲染产物，但保留插件注入的 overlay 层（白板 SVG、plugin overlay
  // 根等，标记 data-ppt-overlay）。这些层独立于 slide 内容存在，若被一并清掉，翻页
  // 后插件持有的就是游离节点 —— 典型症状：白板第二次开启后画不上、点击穿透到 stage
  // 触发翻页。保留下来后在 backend 构建完再 restack 到顶部，保证仍盖在内容之上。
  const keptOverlays: ChildNode[] = [];
  for (const n of Array.from(stage.childNodes)) {
    if (n instanceof Element && n.hasAttribute("data-ppt-overlay")) keptOverlays.push(n);
    else stage.removeChild(n);
  }
  const scene = createScene(slide, pres.size, { masters: pres.masters });
  applyEntranceHideToScene(scene, slide);
  const detachers: Array<() => void> = [];
  let ready3D: (() => Promise<void>) | undefined;
  const chromeBg = stageChromeBackground(slide);
  stage.style.background = chromeBg;
  const flushable =
    backend === "canvas"
      ? new CanvasBackend(scene, stage, { transparent: chromeBg === "transparent" })
      : backend === "svg"
        ? new SvgBackend(scene, stage, { transparent: chromeBg === "transparent" })
        : new HybridBackend(scene, stage, { background: chromeBg, interactive: true });
  detachers.push(() => flushable.destroy());
  if (flushable instanceof HybridBackend) ready3D = () => flushable.waitForReady();
  // 同步画出 video/audio，让 playSlideNarrationsFor 能复用 scene.mediaEl，
  // 而不是在 rAF 之前另建一个脱离 DOM 的 <audio>。
  flushable.flush?.();
  let ooxmlPlayback: SlideRuntime["ooxml"] | undefined;
  if (slide.ooxmlTiming) {
    const play = buildOoxmlPlayback(
      slide,
      scene,
      { slideWidth: pres.size.width, slideHeight: pres.size.height },
      {
        onChange,
        onMediaCmd: (info) => {
          // 自动旁白只由 playSlideNarrationsFor 启动。这里再 play 会叠第二路：
          // SvgBackend 把 mediaEl 绑在 rAF redraw 上，narration fallback 已经
          // 另建了一个 <audio>，约 1s 后 onLoad 又驱动 scene 里那一个。
          if (info.mediaKind === "audio" && info.action === "play") return;
          onAnimSound?.(info.soundSrc);
          const node = resolveAnimatable(scene, info.targetId);
          const el = node && "mediaEl" in node ? (node as SceneNode).mediaEl : undefined;
          if (el) {
            if (typeof info.vol === "number" && Number.isFinite(info.vol)) {
              el.volume = Math.max(0, Math.min(1, info.vol / 100000));
            }
            if (info.mute !== undefined) el.muted = !!info.mute;
          }
          node?.setProperty("mediaAction", info.action);
        },
        // §19.5.16 a:cmd type="call"：PowerPoint 用它驱动 audio/video 的 playFrom /
        // togglePause / stop 等。我们把它桥接到 renderer 端 mediaAction 属性，让
        // VideoNode / AudioNode 走与 audio/video 行为节点完全一致的命令通道。
        // tgtEl.sndTgt 的点击/动画音走 soundSrc，不要求 scene 上有对应形状。
        onCmd: (info) => {
          onAnimSound?.(info.soundSrc);
          if (info.type !== "call") return;
          const action = mapCmdCallToMediaAction(info.cmd);
          if (!action) return;
          const node = resolveAnimatable(scene, info.targetId);
          node?.setProperty("mediaAction", action);
        },
        // §20.1.2 把 Presentation 顶级 theme 配色表注入 compile，让 animClr/set
        // 内的 scheme color（accent1/folHlink/...）解析到真实主题色，而不是落到 #000。
        themeColors: pres.theme?.colors,
      },
    );
    if (play) {
      ooxmlPlayback = {
        runtime: play.runtime,
        totalSteps: play.mainSteps.length,
        autoplaySec: autoplayTimelineSec(play.mainSteps),
      };
      detachers.push(() => play.runtime.destroy());
    }
  }
  // 把保留下来的 overlay 重新移到末尾，确保它们盖在新 backend 渲染的内容之上
  // （DOM 顺序在同一 stacking context 内决定先后；overlay 也各自带 z-index 兜底）。
  for (const n of keptOverlays) stage.appendChild(n);
  return {
    scene,
    detach: () => detachers.forEach((d) => d()),
    ready3D,
    ooxml: ooxmlPlayback,
  };
}

function clampIndex(i: number, total: number): number {
  if (total === 0) return 0;
  return Math.min(Math.max(0, i | 0), total - 1);
}

// §19.5.16 a:cmd type="call" 的 cmd 字符串子集映射到 mediaAction。
// 实际样本中常见的 4 种调用：playFrom(0.0) / togglePause / stop / stopByMaster。
// 其他罕见命令（如 cmd type="evt"/"verb"）按需扩展。
function mapCmdCallToMediaAction(cmd: string): "play" | "pause" | "stop" | "resume" | undefined {
  const c = cmd.trim().toLowerCase();
  if (c.startsWith("playfrom") || c === "play") return "play";
  if (c === "togglepause" || c === "pause") return "pause";
  if (c.startsWith("stop")) return "stop";
  if (c === "resume") return "resume";
  return undefined;
}

function getShapeZ(scene: Scene, shapeId: string): number {
  let z = -1;
  let i = 0;
  scene.root.walk((n) => {
    if (n.id === shapeId) z = i;
    i++;
  });
  return z;
}

// 抽出 shape 的纯文本（文字 shape 直接拼 runs；group 递归取首个文字后代），
// 供 ctx.scene 的 ShapeInfo.text 用，方便插件按文案识别题干 / 选项。
function extractShapeText(shape: Shape): string | undefined {
  if (shape.kind === "text") {
    const txt = shape.paragraphs
      .map((p) => (p.runs ?? []).map((r) => r.text ?? "").join(""))
      .join("\n")
      .trim();
    return txt.length > 0 ? txt : undefined;
  }
  if (shape.kind === "group") {
    const parts: string[] = [];
    for (const c of shape.children) {
      const t = extractShapeText(c);
      if (t) parts.push(t);
    }
    return parts.length > 0 ? parts.join("\n") : undefined;
  }
  return undefined;
}

function button(doc: Document, label: string): HTMLButtonElement {
  const b = doc.createElement("button");
  b.textContent = label;
  return b;
}

let stylesInjected = false;
function injectStyles(doc: Document): void {
  if (stylesInjected) return;
  const el = doc.createElement("style");
  el.setAttribute("data-ppt-player", "");
  el.textContent = STYLES;
  doc.head.appendChild(el);
  stylesInjected = true;
}

