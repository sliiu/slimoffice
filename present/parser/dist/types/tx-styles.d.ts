import type { BulletDef, TextParagraph, TextRun } from "@sliiu/present-core";
import { type XmlNode } from "./xml.js";
import { type TextCtx } from "./text.js";
export interface LevelStyle {
    pPr: Partial<TextParagraph>;
    rPr: Partial<TextRun>;
    bullet?: BulletDef;
}
export interface TxStyles {
    title: LevelStyle[];
    body: LevelStyle[];
    other: LevelStyle[];
}
export declare function emptyTxStyles(): TxStyles;
export declare function parseTxStyles(masterRoot: XmlNode | undefined, ctx: TextCtx): TxStyles;
/** `<p:notesStyle>` / lstStyle 同构：lvl1pPr..lvl9pPr。 */
export declare function parseLstStyle(node: XmlNode | undefined, ctx: TextCtx): LevelStyle[];
export declare function pickStyle(styles: TxStyles, phType: string | undefined): LevelStyle[];
