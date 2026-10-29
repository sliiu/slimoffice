// 阶段 3.x：master / layout 部件的 XML 渲染 helper。
//
// 从 pptx-write.ts 抽出，让两个写入路径都能复用：
//   - from-scratch：pptx-write.ts 在 pres.__source 不存在时，遍历 pres.masters[] 输出全套部件
//   - round-trip：pptx-roundtrip.ts 在遇到 `__source.partPath` 不存在的 master / layout 时，
//     调本文件 helper 把全新部件追加到 archive
//
// 设计要点：
//   - 不依赖 archive / MutableArchive，只接 MediaTable + 普通 SlideMaster/SlideLayout，
//     便于 from-scratch 路径直接使用，也便于单元测试。
//   - 复用 pptx-shapes 的 shapeToXml / backgroundToXml —— master/layout 的 p:bg + p:spTree
//     与 slide 的结构完全相同，只是根元素和 clrMap/sldLayoutIdLst 不同。

import type { ClrMap, Shape, SlideLayout, SlideMaster } from "@ppt/core";
import type { MediaRegistrar } from "./media-table";
import { mediaRelationshipXml } from "./media-table";
import { backgroundToXml, hfToXml, notesStyleToXml, shapeToXml, txStylesToXml } from "./pptx-shapes";
import { esc, xmlHeader } from "./xml-util";

/** master/layout media 项（来自 MediaTable.list() / SlideMediaTable.list()）。 */
export interface PartMediaItem {
  name: string;
  relId: string;
  relType?: string;
  src?: string;
  external?: boolean;
}

/** 把一组 media 项渲染成 image relationship 行（master/layout/slide rels 共用）。 */
function imageRelsXml(
  items: Array<{ name: string; relId: string; relType?: string; src?: string; external?: boolean }> = [],
): string {
  return items.map((it) => mediaRelationshipXml(it)).join("\n");
}

export function renderShapesXml(shapes: Shape[], media: MediaRegistrar): string {
  const spIdCounter = { next: 2 };
  return (shapes ?? []).map((s) => shapeToXml(s, { media, spIdCounter })).join("\n");
}

function clrMapXml(map: ClrMap | undefined): string {
  if (map && Object.keys(map).length) {
    return `<p:clrMap${Object.entries(map)
      .map(([k, v]) => ` ${k}="${esc(v)}"`)
      .join("")}/>`;
  }
  return `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`;
}

function auxMasterCSldXml(
  master: SlideMaster,
  media: MediaRegistrar,
  pageSize?: { width: number; height: number },
): string {
  const bg = backgroundToXml(master.background, { media }, pageSize, master.bgRef);
  const shapesXml = renderShapesXml(master.shapes, media);
  const name = master.name?.trim();
  const nameAttr = name && !/^(Notes|Handout) Master$/i.test(name) ? ` name="${esc(name)}"` : "";
  return `<p:cSld${nameAttr}>
    ${bg}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>`;
}

/** ECMA-376 §19.3.1.27 notesMaster：cSld + clrMap + notesStyle。 */
export function renderNotesMasterFromIr(
  master: SlideMaster,
  media: MediaRegistrar,
  pageSize?: { width: number; height: number },
): string {
  return `${xmlHeader()}
<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${auxMasterCSldXml(master, media, pageSize)}
  ${clrMapXml(master.clrMap)}
  ${hfToXml(master.hf)}
  ${notesStyleToXml(master.txStyles?.body, media)}
</p:notesMaster>`;
}

/** ECMA-376 §19.3.1.20 handoutMaster：cSld + clrMap + hf。 */
export function renderHandoutMasterFromIr(
  master: SlideMaster,
  media: MediaRegistrar,
  pageSize?: { width: number; height: number },
): string {
  return `${xmlHeader()}
<p:handoutMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${auxMasterCSldXml(master, media, pageSize)}
  ${clrMapXml(master.clrMap)}
  ${hfToXml(master.hf)}
</p:handoutMaster>`;
}

/** notesMaster / handoutMaster rels：theme + 部件内图片。 */
export function renderAuxMasterRelsXml(themeIdx: number, mediaItems: PartMediaItem[] = []): string {
  const items = [
    `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme${themeIdx}.xml"/>`,
  ];
  const imgs = imageRelsXml(mediaItems);
  if (imgs) items.push(imgs);
  return `${xmlHeader()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${items.join("\n")}
</Relationships>`;
}

export function renderSlideMasterXml(
  master: SlideMaster,
  layoutRefs: Array<{ relId: string; layoutIdx: number }>,
  media: MediaRegistrar,
  slideSize?: { width: number; height: number },
): string {
  const bg = backgroundToXml(master.background, { media }, slideSize, master.bgRef);
  const shapesXml = renderShapesXml(master.shapes, media);
  const layoutIds = layoutRefs
    .map((l, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${l.relId}"/>`)
    .join("");
  const clrMap = clrMapXml(master.clrMap);
  return `${xmlHeader()}
<p:sldMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">
  <p:cSld>
    ${bg}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>
  ${clrMap}
  <p:sldLayoutIdLst>${layoutIds}</p:sldLayoutIdLst>
  ${hfToXml(master.hf)}
  ${txStylesToXml(master.txStyles, media)}
</p:sldMaster>`;
}

export function renderMasterRelsXml(
  layoutRefs: Array<{ relId: string; layoutIdx: number }>,
  themeIdx: number,
  mediaItems: PartMediaItem[] = [],
): string {
  const items: string[] = layoutRefs.map(
    (l) =>
      `<Relationship Id="${l.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${l.layoutIdx}.xml"/>`,
  );
  items.push(
    `<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme${themeIdx}.xml"/>`,
  );
  // 母版背景 / 装饰 shape 的图片填充注册的 media → 必须补 image rel，否则 r:embed 悬空，
  // PowerPoint 打开时图片丢失甚至报修复。
  const imgs = imageRelsXml(mediaItems);
  if (imgs) items.push(imgs);
  return `${xmlHeader()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${items.join("\n")}
</Relationships>`;
}

const SLIDE_LAYOUT_TYPES = new Set<string>([
  "title", "tx", "twoColTx", "tbl", "txAndChart", "chartAndTx", "dgm", "chart", "txAndClipArt", "clipArtAndTx",
  "titleOnly", "blank", "txAndObj", "objAndTx", "objOnly", "obj", "txAndMedia", "mediaAndTx", "objOverTx",
  "txOverObj", "txAndTwoObj", "twoObjAndTx", "twoObjOverTx", "fourObj", "vertTx", "clipArtAndVertTx",
  "vertTitleAndTx", "vertTitleAndTxOverChart", "twoObj", "objAndTwoObj", "twoObjAndObj", "cust", "secHead",
  "twoTxTwoObj", "objTx", "picTx",
]);

/** 历史上 deckgen 写过的非枚举别名 → §19.7.15 ST_SlideLayoutType 合法值。 */
const LEGACY_LAYOUT_TYPE_ALIASES: Record<string, string> = { sectionHead: "secHead", pic: "picTx" };

/**
 * 把任意 layout type 收敛到 ST_SlideLayoutType 封闭枚举：已知别名映射，其他未知值写 cust，
 * 缺省 blank。round-trip 与 from-scratch 共用，否则 PowerPoint 按 schema 拒收整个 layout part。
 */
export function ooxmlSlideLayoutType(type: string | undefined): string {
  if (!type) return "blank";
  if (SLIDE_LAYOUT_TYPES.has(type)) return type;
  return LEGACY_LAYOUT_TYPE_ALIASES[type] ?? "cust";
}

export function renderSlideLayoutXml(layout: SlideLayout, media: MediaRegistrar, slideSize?: { width: number; height: number }): string {
  const bg = backgroundToXml(layout.background, { media }, slideSize, layout.bgRef);
  const shapesXml = renderShapesXml(layout.shapes, media);
  const typeAttr = ` type="${esc(ooxmlSlideLayoutType(layout.type))}"`;
  return `${xmlHeader()}
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
             ${typeAttr}>
  <p:cSld${layout.name ? ` name="${esc(layout.name)}"` : ""}>
    ${bg}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  ${hfToXml(layout.hf)}
</p:sldLayout>`;
}

export function renderLayoutRelsXml(masterIdx: number, mediaItems: PartMediaItem[] = []): string {
  const imgs = imageRelsXml(mediaItems);
  return `${xmlHeader()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster${masterIdx}.xml"/>
  ${imgs}
</Relationships>`;
}
