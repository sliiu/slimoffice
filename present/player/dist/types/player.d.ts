import type { LiveMediaTrack, Presentation } from "@sliiu/present-core";
import { type Plugin, type PluginUIOptions, type PresentationInfo, type SlideChangeEvent, type StepChangeEvent } from "./plugins.js";
import { type PluginLiveInbound, type PluginLiveTransport } from "./plugin-live.js";
export type Backend = "svg" | "canvas" | "hybrid";
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
    debugSteps(): {
        totalSteps: number;
        currentStep: number;
        frozen: boolean;
    };
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
        on<E extends "slidechange" | "stepchange" | "complete" | "destroy">(event: E, cb: (payload: E extends "slidechange" ? SlideChangeEvent : E extends "stepchange" ? StepChangeEvent : void) => void): () => void;
    };
}
declare global {
    interface Window {
        __PPTPlayerPluginQueue?: Plugin[];
    }
}
export declare function mount(host: HTMLElement, pres: Presentation, opts?: MountOptions): PlayerHandle;
