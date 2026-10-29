import type { Presentation, PresentationSource, Theme } from "@sliiu/present-core";
/**
 * JSON-safe round-trip archive: `__source.files` 是 Map + Uint8Array，不能走 JSON.stringify。
 * 网关 writePptx 需要这份字节才能 surgical patch；前端把 Map 编成 path → base64。
 */
export interface SerializedPresentationSource {
    presentationPath: string;
    files: Record<string, string>;
    slidePartPaths?: Array<string | null>;
    themeSnapshot?: Theme;
    commentAuthorsPartPath?: string;
    modernAuthorsPartPath?: string;
    commentsModern?: boolean;
    commentsSnapshot?: string;
    commentMetaSnapshot?: string;
    protectionMetaSnapshot?: string;
    editorPluginsMetaSnapshot?: string;
    playbackPluginsMetaSnapshot?: string;
    sectionsMetaSnapshot?: string;
    proofingLangMetaSnapshot?: string;
    tagsPartPath?: string;
    macroEnabled?: boolean;
    vbaProjectPartPath?: string;
    fontsSnapshot?: string;
    photoAlbumSnapshot?: string;
    kinsokuSnapshot?: string;
    viewGuidesSnapshot?: string;
    viewPropsPartPath?: string;
    showPrSnapshot?: string;
    presPropsPartPath?: string;
}
/** 从内存 Presentation 抽出可 JSON 传输的 `__source`（无 archive 则 undefined）。 */
export declare function serializePresentationSource(pres: Presentation): SerializedPresentationSource | undefined;
export declare function deserializePresentationSource(raw: SerializedPresentationSource): {
    source: PresentationSource;
    slidePartPaths?: Array<string | null>;
};
