import type { Presentation } from "@sliiu/present-core";
/** 手机 → 讲者。 */
export type RemoteCommand = {
    type: "next";
} | {
    type: "prev";
} | {
    type: "goto";
    slide: number;
} | {
    type: "black";
    on: boolean;
} | {
    type: "pause";
};
/** 讲者 → 手机。每次翻页、每 1 秒发一次即可；手机据此更新界面，不自己推断。 */
export interface PresenterSnapshot {
    slide: number;
    total: number;
    /** 当前页标题（给手机顶部显示，避免在手机上渲染整页）。 */
    title?: string;
    /** 当前页备注原文；没有则为空串。 */
    notes: string;
    /** 下一页备注，讲者常提前看一眼。 */
    nextNotes?: string;
    /** 从开始放映到现在的毫秒数；手机按自己的钟继续走，不必每秒等推送。 */
    elapsedMs: number;
    black: boolean;
    paused: boolean;
}
/** 播放器上遥控真正需要的那几个动作；`PlayerHandle` 满足这个形状。 */
export interface RemoteTarget {
    next(): void;
    prev(): void;
    goto(index: number): void;
    current(): number;
    total(): number;
}
export interface PresenterBridgeOptions {
    presentation: Presentation;
    /** 可见页序列（跳过隐藏页）；缺省按全部页。 */
    visibleSlides?: readonly number[];
    /** 当前时间来源，测试可注入。 */
    now?: () => number;
    startedAt?: number;
}
export interface PresenterBridge {
    snapshot(): PresenterSnapshot;
    /** 收到手机命令；返回是否被接受（越界、禁用页会被拒）。 */
    apply(cmd: RemoteCommand): boolean;
    setBlack(on: boolean): void;
    setPaused(on: boolean): void;
    /** 手机重新连上时推一次全量状态。 */
    resync(): PresenterSnapshot;
}
/** 备注里的纯文本：手机屏幕窄，段落压成空行分隔，超长截断。 */
export declare function notesForSlide(presentation: Presentation, slideIndex: number, max?: number): string;
/**
 * 讲者侧状态机。`target` 在播放器挂载后才可用，所以用 getter 而不是构造时捕获。
 * `goto` 接受的是可见序列里的序号 —— 和 `PlayerHandle.goto` 一致，隐藏页不占号。
 */
export declare function createPresenterBridge(target: () => RemoteTarget | null, opts: PresenterBridgeOptions): PresenterBridge;
/**
 * 手机页。单文件、无依赖、不加载字体包；断线时按钮变灰并显示状态，避免"按了没反应"。
 * 传输由宿主注入：设置 `window.PPTRemote = { send, on }`，页面启动时会调用 `send({type:"hello"})`。
 */
export declare function buildPresenterPageHtml(opts: {
    title: string;
    lang?: string;
}): string;
