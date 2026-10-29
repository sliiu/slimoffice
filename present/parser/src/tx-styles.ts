import type { BulletDef, TextParagraph, TextRun } from "@ppt/core";
import { findByLocalName, type XmlNode } from "./xml";
import { parsePPrDefaults, readRunProps, type TextCtx } from "./text";

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

export function emptyTxStyles(): TxStyles {
  return { title: [], body: [], other: [] };
}

export function parseTxStyles(masterRoot: XmlNode | undefined, ctx: TextCtx): TxStyles {
  const out = emptyTxStyles();
  const node = findByLocalName(masterRoot, "txStyles");
  if (!node) return out;
  out.title = readStyle(findByLocalName(node, "titleStyle"), ctx);
  out.body = readStyle(findByLocalName(node, "bodyStyle"), ctx);
  out.other = readStyle(findByLocalName(node, "otherStyle"), ctx);
  return out;
}

/** `<p:notesStyle>` / lstStyle 同构：lvl1pPr..lvl9pPr。 */
export function parseLstStyle(node: XmlNode | undefined, ctx: TextCtx): LevelStyle[] {
  return readStyle(node, ctx);
}

function readStyle(node: XmlNode | undefined, ctx: TextCtx): LevelStyle[] {
  if (!node) return [];
  const out: LevelStyle[] = [];
  for (let i = 1; i <= 9; i++) {
    const lvl = findByLocalName(node, `lvl${i}pPr`);
    out.push(lvl ? extractLevelStyle(lvl, ctx) : { pPr: {}, rPr: {} });
  }
  return out;
}

function extractLevelStyle(lvlPPr: XmlNode, ctx: TextCtx): LevelStyle {
  const pPrDefaults = parsePPrDefaults(lvlPPr, ctx);
  const defRPr = findByLocalName(lvlPPr, "defRPr");
  const rPr = readRunProps(defRPr, ctx);
  const out: LevelStyle = {
    pPr: { ...pPrDefaults },
    rPr,
  };
  if (pPrDefaults.bullet) {
    out.bullet = pPrDefaults.bullet;
    delete out.pPr.bullet;
  }
  return out;
}

export function pickStyle(styles: TxStyles, phType: string | undefined): LevelStyle[] {
  if (phType === "title" || phType === "ctrTitle") return styles.title;
  if (phType === "body" || phType === "subTitle" || phType === "obj" || phType === undefined)
    return styles.body;
  return styles.other;
}
