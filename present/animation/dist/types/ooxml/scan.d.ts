import * as types from "./types.js";
export interface EntranceTarget {
    spid: string;
    paraRange?: {
        st: number;
        end: number;
    };
    charRange?: {
        st: number;
        end: number;
    };
}
export interface TextSliceInfo {
    pRg?: {
        st: number;
        end: number;
    };
    charRg?: {
        st: number;
        end: number;
    };
}
export interface CollectOpts {
    /**
     * 为指定 spid 返回 iterate type 对应的 text slice 列表。返回 null/undefined
     * 视为该 shape 没有可拆分的文本（仍按整体 spid 处理）。
     */
    getTextSlices?: (spid: string, type: "el" | "wd" | "lt") => TextSliceInfo[] | null | undefined;
}
export declare function collectEntranceTargets(timing: types.OoxmlTiming | undefined, opts?: CollectOpts): EntranceTarget[];
