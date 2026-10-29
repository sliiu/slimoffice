import type { PathShape, Shape, ShapeCxnEnd, Slide } from "@sliiu/present-core";
export declare const CXN_SNAP_PX = 14;
/** OOXML ST_ShapeType 连接符。与 serializer `CONNECTOR_PRESETS` 对齐。 */
export declare const CONNECTOR_PRESETS: Set<string>;
export interface CxnSite {
    shape: Shape;
    idx: number;
    x: number;
    y: number;
}
export declare function numericShapeId(shape: Shape): number | undefined;
export declare function cxnEndFor(shape: Shape, idx: number): ShapeCxnEnd;
export declare function isPathConnector(s: Shape): s is PathShape;
/** 几何起点 (l,t) / 终点 (r,b)，不含 flip/rotate（选中框 group 已带 transform）。 */
export declare function pathConnectorGeomEnds(s: PathShape): {
    start: {
        x: number;
        y: number;
    };
    end: {
        x: number;
        y: number;
    };
};
/** 世界坐标下的连接符两端（flip → rotate → tx/ty）。 */
export declare function pathConnectorWorldEnds(s: PathShape): {
    start: {
        x: number;
        y: number;
    };
    end: {
        x: number;
        y: number;
    };
};
/**
 * 用世界坐标两端重写 path 连接符的 bbox + flip。方向走 xfrm flipH/flipV，
 * 不再保留独立 rotation（与 Office 肘形连接符一致）。
 */
export declare function applyPathConnectorEnds(s: PathShape, start: {
    x: number;
    y: number;
}, end: {
    x: number;
    y: number;
}): void;
/** 形状对外连接点：自定义几何用 cxnPoints，否则 bbox 四边中点（Office 矩形默认）。 */
export declare function cxnSitesOf(shape: Shape): Array<{
    idx: number;
    x: number;
    y: number;
}>;
export declare function allCxnSites(slide: Slide, excludeId?: string): CxnSite[];
export declare function snapCxnSite(slide: Slide, x: number, y: number, excludeId: string, threshold?: number): CxnSite | null;
/**
 * 按目标当前连接点位置，把粘在它上面的直线 / 肘形 / 曲线连接符端点吸回去。
 * 平移、缩放、旋转、翻转后都走这一条（比单纯 dx/dy 更能跟上非均匀变形）。
 * 返回被改过的 path 连接符，调用方按 preset 重新生成 `d`。
 */
export declare function followGlueToSites(slide: Slide, target: Shape): PathShape[];
/**
 * 连接符自身被 bbox 缩放 / 旋转后，把仍粘着的端点吸回目标连接点。
 * 平移连接符本体时不要调用（会把用户拖动弹回去）。
 */
export declare function reattachConnectorGlue(slide: Slide, s: Shape): PathShape | null;
/** @deprecated 用 followGlueToSites；保留给旧调用点。 */
export declare function followGlueOnTranslate(slide: Slide, target: Shape, dx: number, dy: number): void;
