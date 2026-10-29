export interface Snapshot {
    canvas: HTMLCanvasElement;
    width: number;
    height: number;
}
export type SnapshotCache = Map<string, Promise<string | null>>;
export declare function isExternalSnapshotUrl(url: string): boolean;
/** 把样式里的外部 url() 换成 data URL；换不掉的可见背景改成 none，避免再去拉取。 */
export declare function rewriteCssForSnapshot(css: string, resolved: Map<string, string | null>): {
    css: string;
    droppedVisible: boolean;
};
/**
 * 在克隆树上把外部图片换成 data URL，并拆掉会弄脏画布的 video / iframe。
 * 返回 false 表示有一张可见图读不出来，快照不能代表这一页。
 * 不改 live。
 */
export declare function sanitizeSnapshotClone(live: HTMLElement, clone: HTMLElement, cache?: SnapshotCache): Promise<boolean>;
export declare function snapshotElement(el: HTMLElement, w: number, h: number, cache?: SnapshotCache): Promise<Snapshot | null>;
