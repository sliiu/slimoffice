// round-trip 保存核心：把原始 PPTX archive 字节克隆一份，仅对内存模型中
// 「确实改动过」的部分在原始 XML 上做 surgical patch，未改动的所有 part（母版/版式/
// 主题/动画时序/Chart/SmartArt/Notes/嵌入字体/customXml/扩展节点等）原样保留。
//
// 设计要点（对比之前的 "从 Presentation 重建" 方案）：
//   - 母版/版式/主题/Notes/Chart/嵌入字体/扩展节点全部保留 → WPS / PowerPoint /
//     Keynote 互打开不丢内容
//   - 动画 `p:timing` 原样保留 → 入场 / 退出 / 强调动画不丢失
//   - 占位符继承链不破坏 → 文字样式 / 字号 / 颜色不丢失
//   - rels / ContentTypes 保留，仅在「新增媒体资源」时增量补充
//
// 适用范围：编辑器中常见的「文字修改、移动 / 缩放、旋转、显隐、删除、新增形状」。
// 复杂改动（替换为不同形状类型、改变 nvSpPr 结构）会回落到「整 sp 重写」的策略。
import type {
  ChartDef,
  ChartShape,
  CustomShow,
  DirtyField,
  GroupFrameOrigin,
  GroupShape,
  Paint,
  Presentation,
  PresentationSource,
  RunOrigin,
  Shape,
  ShapeOrigin,
  Slide,
  SlideLayout,
  SlideMaster,
  TextParagraph,
  TextRun,
  Theme,
  Transform,
  HyperlinkRef,
} from "@ppt/core";
import { extractSmartArtItems, getOrigin, isDirty } from "@ppt/core";
import { strFromU8, strToU8 } from "fflate";
import { MediaTable, mediaNamePrefix, mediaRelationshipXml, REL_TYPE_IMAGE, isExternalMediaSrc } from "./media-table";
import { OLE_OBJECT_REL_TYPE, type OleEmbeddingRegistrar } from "./embedding-table";
import { dataUrlToBytes, ensureContentTypesDefault } from "./zip-write";
import {
  ooxmlSlideLayoutType,
  renderLayoutRelsXml,
  renderMasterRelsXml,
  renderSlideLayoutXml,
  renderSlideMasterXml,
} from "./pptx-master-layout";
import { renderNotesSlideXml } from "./pptx-notes";
import { backgroundToXml, fillToXml, hfToXml, hlinkTagXml, lineXfrmFromEndpoints, paragraphPPrInnerXml, autoFitXml, prstTxWarpXml, schemeSlotForHex, setActiveSchemeColors, shapeToXml, stackedBodyPrExport, strokeToXml, assignSpIds, sldRootAttrXml, cSldNameAttr, clrMapOvrXml } from "./pptx-shapes";
import type { ShapeCtx } from "./pptx-shapes";
import { collectShapeEffectsForWrite, effectsToXml } from "./pptx-effects";
import { patchSpPr3DIn, meta3DToXml } from "./pptx-3d";
import { tableTblXml } from "./pptx-table";
import { chartExportSupported, renderChartSpaceXml } from "./pptx-chart";
import {
  CHART_EX_CONTENT_TYPE,
  CHART_EX_REL_TYPE,
  chartExExportSupported,
  renderChartExSpaceXml,
} from "./pptx-chart-ex";
import {
  buildCommentAuthors,
  commentsSnapshotForSlide,
  exportableComments,
  CT_COMMENT_AUTHORS,
  CT_COMMENTS,
  REL_TYPE_COMMENT_AUTHORS,
  REL_TYPE_COMMENTS,
  renderCommentAuthorsXml,
  renderCommentsXml,
  slideCommentsForExport,
} from "./pptx-comments";
import {
  buildModernAuthors,
  CT_MODERN_AUTHORS,
  CT_MODERN_COMMENTS,
  isModernCommentsPartPath,
  parseModernAuthorsFromXml,
  REL_MODERN_AUTHORS,
  REL_MODERN_COMMENTS,
  renderModernAuthorsXml,
  renderModernCommentsXml,
  shouldUseModernComments,
} from "./pptx-modern-comments";
import { patchSlimPptSidecarTags, patchSlideCustomDataTags } from "./pptx-comment-meta";
import { patchPhotoAlbum } from "./pptx-photo-album";
import { patchEmbeddedFonts } from "./pptx-embedded-fonts-patch";
import { patchModifyVerifier } from "./pptx-modify-verifier";
import { patchKinsoku } from "./pptx-kinsoku";
import { patchViewProps } from "./pptx-view-props";
import { patchPresProps } from "./pptx-pres-props";
import { patchDefaultTextStyleLang } from "./pptx-default-text-style";
import { patchSectionLst } from "./pptx-sections";
import {
  buildSmartArtPartFiles,
  offsetShapeTree,
  REL_DIAGRAM_COLORS,
  REL_DIAGRAM_DATA,
  REL_DIAGRAM_LAYOUT,
  REL_DIAGRAM_STYLE,
  diagramContentTypeRows,
  type DiagramRelIds,
} from "./pptx-smartart";
import {
  buildInkMlXml,
  INK_REL_TYPE,
  inkContentTypeRows,
  inkPartPath,
  inkSlideRelsXml,
  isInkPath,
  type InkRel,
} from "./pptx-ink";
import { mergeMediaTiming, remapTimingSpids, serializeTiming, serializeTransition, type MediaTimingHint } from "./pptx-timing";
import { needsOoxmlNormalization } from "./pptx-timing-normalize";
import {
  backgroundForThemeExport,
  primaryTypeface,
  pickEaTypeface,
  themeColorsFontsEqual,
} from "./theme-export";
import {
  buildXml,
  findAllChildrenByLocal,
  findChildByLocal,
  getAttrs,
  getChildren,
  getTagName,
  localName,
  parseFragmentAsChildren,
  parseXmlPreserveOrder,
  setAttr,
  setChildren,
  setText,
  type RawNode,
  type RawTree,
} from "./raw-xml";
import { esc, firstCssTypeface, hex, parseColor, pxToEmu, pxToHundredthPt, underlineToOoxml } from "./xml-util";

export interface RoundTripOptions {
  // 调试日志开关。打开后会把"哪些 shape 在 patch 阶段被修改 / 跳过"打印到 console。
  debug?: boolean;
}

// 内部：表示一个 patch 阶段的 archive 视图。
interface MutableArchive {
  files: Map<string, Uint8Array>;
  // round-trip 阶段新增的图片资源缓存。key = src，value = { path, relId(per slide 单独分配) }。
  // 因为不同 slide 的 rels 是独立的，relId 分配在 patchSlide 内部完成。
  newMediaPaths: Map<string, string>;
}

// 跨多次保存复用同一份 part 的 preserveOrder 解析结果（XML parse 比 JS 深拷贝更贵）。
// 缓存里永远存"未被 patch 污染的 pristine 树"，取用时深拷贝一份给调用方就地修改 → 不会双重 patch。
// key = source.files（重新解析 / 缓存恢复后是新 Map → 缓存自然失效重建），对正确性无影响。
const astCacheRegistry = new WeakMap<Map<string, Uint8Array>, Map<string, RawTree>>();

function cloneTree(t: RawTree): RawTree {
  return typeof structuredClone === "function" ? structuredClone(t) : (JSON.parse(JSON.stringify(t)) as RawTree);
}

function parsePartCached(
  files: Map<string, Uint8Array> | undefined,
  partPath: string,
  xmlText: string,
): RawTree {
  if (!files) return parseXmlPreserveOrder(xmlText);
  let cache = astCacheRegistry.get(files);
  if (!cache) {
    cache = new Map();
    astCacheRegistry.set(files, cache);
  }
  const pristine = cache.get(partPath);
  if (pristine) return cloneTree(pristine);
  const tree = parseXmlPreserveOrder(xmlText);
  // 先把 pristine 克隆进缓存（调用方随后会就地 mutate 返回的 tree）。
  cache.set(partPath, cloneTree(tree));
  return tree;
}

export function writePptxRoundTrip(pres: Presentation, opts: RoundTripOptions = {}): Map<string, Uint8Array> {
  const source = pres.__source as PresentationSource | undefined;
  if (!source) throw new Error("writePptxRoundTrip requires pres.__source");
  // schemeClr 保留：写出的字面色若命中主题色板则写 <a:schemeClr>（改色不与主题断链）。
  setActiveSchemeColors(pres.theme?.colors);
  try {
    return writePptxRoundTripInner(pres, source, opts);
  } finally {
    setActiveSchemeColors(undefined);
  }
}

function writePptxRoundTripInner(
  pres: Presentation,
  source: PresentationSource,
  opts: RoundTripOptions,
): Map<string, Uint8Array> {
  const archive: MutableArchive = {
    files: cloneFiles(source.files),
    newMediaPaths: new Map(),
  };
  // 按 slide 一一 patch（新增 slide 无 partPath，跳过；由后面的 reconcileSlideParts
  // 统一建 part）。优化：只有 raw tree 在 patch 前后发生变化时才重写 part 字节。这样
  // 未改动的 slide 字节级保留，与 WPS / PowerPoint / Keynote 多次 round-trip 时不会
  // 无谓地污染 archive。
  // seenPartPaths：防御两张 slide 挂同一 partPath（legacy 缓存按下标 reattach + 删页
  // 后可能发生）——先到者 patch，后到者交给 reconcileSlideParts 另建 part。
  const seenPartPaths = new Set<string>();
  // 内部跳页链接（kind:"slide"）的 target 是 1-based 页码，写回时要换算成目标 slide
  // 的 part 路径才能建 `.../relationships/slide` 关系。新增页此刻还没 partPath，
  // 返回 undefined → 该链接跳过不写，不会留下悬空 r:id。
  const slidePathByNumber = (n: number): string | undefined => pres.slides[n - 1]?.__source?.partPath;
  for (let i = 0; i < pres.slides.length; i++) {
    const slide = pres.slides[i]!;
    const partPath = slide.__source?.partPath;
    if (!partPath) {
      if (opts.debug) console.warn(`[roundtrip] slide ${i} has no __source.partPath, will be added by reconcile`);
      continue;
    }
    if (seenPartPaths.has(partPath)) {
      if (opts.debug) console.warn(`[roundtrip] slide ${i} duplicates partPath ${partPath}, deferred to reconcile`);
      continue;
    }
    seenPartPaths.add(partPath);
    const bytes = archive.files.get(partPath);
    if (!bytes) {
      if (opts.debug) console.warn(`[roundtrip] slide ${i} partPath ${partPath} not in archive, skipped`);
      continue;
    }
    const xmlText = strFromU8(bytes);
    const tree = parsePartCached(source.files, partPath, xmlText);
    const before = JSON.stringify(tree);
    patchSlideXml(tree, slide, archive, partPath, opts, pres.size, slidePathByNumber);
    const after = JSON.stringify(tree);
    if (before === after) {
      if (opts.debug) console.log(`[roundtrip] slide ${i + 1} unchanged, keep original bytes`);
      continue;
    }
    const patched = buildXml(tree);
    archive.files.set(partPath, strToU8(patched));
    if (opts.debug) console.log(`[roundtrip] slide ${i + 1} patched (${xmlText.length} → ${patched.length} bytes)`);
  }

  // 阶段 slide-list：slide 增删 / 重排对齐。为无 partPath 的新 slide 建 part（含 rels /
  // Content_Types / 媒体 / 超链接），删除不再被引用的 slide part（连带 notesSlide），
  // 并把 presentation.xml 的 sldIdLst 顺序 + presentation.xml.rels 对齐到 pres.slides。
  // 必须在 patchNotesParts 之前跑：新 slide 拿到 partPath + notesSnapshot 后备注才能落盘。
  reconcileSlideParts(pres, archive, opts);

  // 阶段 2.3 + 3.x：patch / add master/layout 部件。
  // 已有 __source.partPath 的（解析时存在的部件）走 surgical patch：在原 spTree 上
  // 按 cNvPr@id 对齐 shape 后逐字段写回，未变的部件字节级保留。
  // 没有 partPath 的（DuplicateMasterCmd / AddLayoutCmd 新建的）走 addNewMasterPart /
  // addNewLayoutPart：分配新 partPath、渲染完整 OOXML、补 [Content_Types] 与
  // presentation.xml/sldMasterIdLst、master rels/sldLayoutIdLst。
  for (const master of pres.masters ?? []) {
    if (!master.__source?.partPath) {
      addNewMasterPart(master, pres, archive, opts);
    } else {
      patchMasterPart(master, pres, archive, opts);
    }
    for (const layout of master.layouts ?? []) {
      if (!layout.__source?.partPath) {
        addNewLayoutPart(layout, master, pres, archive, opts);
      } else {
        patchLayoutPart(layout, pres, archive, opts);
      }
    }
  }

  // 阶段 3.x+：SetSlideLayoutRefCmd 只改内存 layoutRef，slide rels 仍指向旧 layout。
  // 必须在 master/layout 部件（含 addNewLayoutPart）落盘后再对齐，否则新 layout 尚无 partPath。
  reconcileSlideLayoutRels(pres, archive, opts);

  // 阶段 N：备注回写。编辑器 SetSlideNotesCmd 改 slide.notes 后，notesSlide part
  // 之前从不更新（audit：serializer 无任何 notesSlide 写出）。快照等值判定 + 就地
  // patch body 占位符文本；slide 原本没有 notesSlide part 时新建（含 notesMaster 兜底）。
  patchNotesParts(pres, archive, opts);

  // 阶段 N：主题色板 / 字体回写。AI 通过 ApplyCustomThemeCmd 改 pres.theme.colors / fonts
  // 后，原 ppt/theme/themeN.xml 的 <a:clrScheme> 不会被前面的 spTree patch 触及，
  // 导致以 schemeClr 引用（accent1 / tx1 ...）的所有 master / layout / 占位符颜色全
  // 渲染成旧主题。这里统一在 archive 上把每个 theme part 的 clrScheme / fontScheme
  // 对齐到内存 pres.theme，让保存出来的 .pptx 真正"换上"新主题色板。
  patchThemeParts(pres, archive, opts);

  // 阶段 N：自定义放映 custShowLst 回写（编辑器 dialog 改 pres.customShows 后对齐）。
  patchCustomShows(pres, archive, opts);
  patchPhotoAlbum(pres, archive, opts);
  patchEmbeddedFonts(pres, archive, opts);
  patchModifyVerifier(pres, archive, opts);
  patchKinsoku(pres, archive, opts);
  patchViewProps(pres, archive, opts);
  patchPresProps(pres, archive, opts);
  patchDefaultTextStyleLang(pres, archive, opts);
  patchSectionLst(pres, archive, opts);

  // 阶段 N：审阅批注 cmLst / commentAuthors 回写（Review 面板 AddCommentCmd 等）。
  patchCommentParts(pres, archive, opts);
  patchSlimPptSidecarTags(pres, archive, opts);
  patchSlideCustomDataTags(pres, archive, opts);

  return archive.files;
}

// ============================================================================
// 阶段 slide-list：slide 增删 / 重排对齐
//
// 语义：pres.slides 是唯一事实。对齐三处：
//   1. 无 partPath 的 slide（AI InsertSlideCmd / 编辑器加页 / 复制页——JSON 克隆
//      丢了非可枚举 __source）→ addNewSlidePart 从内存模型渲染新 part。
//   2. archive 中原有、但 pres.slides 不再引用的 slide part → 删除（连带该 slide
//      的 rels / notesSlide / [Content_Types] Override；媒体不删，孤儿媒体 OPC 合法）。
//   3. presentation.xml <p:sldIdLst> 子节点顺序 + presentation.xml.rels 重写对齐。
//      custShowLst 中引用已删 slide 的 <p:sld r:id> 一并清除，避免悬空引用。
//
// 幂等：无增删、顺序未变时不触碰 presentation.xml / rels（字节级保留）。
// ============================================================================

const CT_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.slide+xml";

function reconcileSlideParts(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void {
  const source = pres.__source as PresentationSource | undefined;
  const presPath = source?.presentationPath ?? "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  const relsPath = partRelsPath(presPath);
  const relsBytes = archive.files.get(relsPath);
  if (!presBytes || !relsBytes) return;

  const presTree = parseXmlPreserveOrder(strFromU8(presBytes));
  const presRoot = findRootElement(presTree, "presentation");
  if (!presRoot) return;
  const sldIdLst = findChildByLocal(getChildren(presRoot), "sldIdLst");
  if (!sldIdLst) return;

  const relsTree = parseXmlPreserveOrder(strFromU8(relsBytes));
  const relsRoot = findRootElement(relsTree, "Relationships");
  if (!relsRoot) return;

  const presBaseDir = presPath.slice(0, presPath.lastIndexOf("/"));
  // relId → 归一化 slide part 路径（Target 是相对 presentation.xml 的，如 "slides/slide1.xml"）。
  const relTargetById = new Map<string, string>();
  for (const rel of getChildren(relsRoot)) {
    const attrs = getAttrs(rel);
    if (attrs["@_Type"] !== REL_TYPE_SLIDE) continue;
    const id = attrs["@_Id"];
    const target = attrs["@_Target"];
    if (id && target) relTargetById.set(id, resolveRelTarget(presBaseDir, target));
  }

  // 原 sldIdLst 顺序（保留原始 raw node，重排时原样复用 —— sldId 里可能带 extLst）。
  interface SldEntry {
    idNum: number;
    relId: string;
    partPath: string;
    node: RawNode;
  }
  const original: SldEntry[] = [];
  for (const node of getChildren(sldIdLst)) {
    const tag = getTagName(node);
    if (!tag || localName(tag) !== "sldId") continue;
    const attrs = getAttrs(node);
    const relId = attrs["@_r:id"];
    const idNum = Number(attrs["@_id"]);
    const partPath = relId ? relTargetById.get(relId) : undefined;
    if (!relId || !Number.isFinite(idNum) || !partPath) continue;
    original.push({ idNum, relId, partPath, node });
  }

  // 期望顺序。partPath 缺失 / 与前面 slide 撞车（legacy 缓存按下标 reattach 的错位）/
  // archive 里没有对应 part → 都按"新 slide"处理，从内存模型渲染新 part。
  const usedParts = new Set<string>();
  const desired: Array<{ partPath: string }> = [];
  for (const slide of pres.slides) {
    let partPath = slide.__source?.partPath;
    if (!partPath || usedParts.has(partPath) || !archive.files.has(partPath)) {
      const created = addNewSlidePart(slide, pres, archive, opts);
      if (!created) {
        if (opts.debug) console.warn(`[roundtrip] failed to create part for slide "${slide.id}", dropped from sldIdLst`);
        continue;
      }
      partPath = created;
    }
    usedParts.add(partPath);
    desired.push({ partPath });
  }

  // 无增删且顺序一致 → 不触碰 presentation.xml / rels（字节级保留）。
  if (
    desired.length === original.length &&
    desired.every((d, i) => d.partPath === original[i]!.partPath)
  ) {
    return;
  }

  // ---- 删除不再被引用的 slide part ----
  const desiredSet = new Set(desired.map((d) => d.partPath));
  const removedRelIds = new Set<string>();
  for (const e of original) {
    if (desiredSet.has(e.partPath)) continue;
    removedRelIds.add(e.relId);
    removeSlidePart(e.partPath, archive, opts);
  }

  // ---- rels 对齐：删掉 removed，为新 part 追加 Relationship ----
  const keptRels = getChildren(relsRoot).filter((rel) => {
    const attrs = getAttrs(rel);
    return !(attrs["@_Id"] && removedRelIds.has(attrs["@_Id"]) && attrs["@_Type"] === REL_TYPE_SLIDE);
  });
  const usedRelIds = new Set<string>();
  for (const rel of keptRels) {
    const id = getAttrs(rel)["@_Id"];
    if (id) usedRelIds.add(id);
  }
  const relIdByPart = new Map<string, string>();
  for (const [id, target] of relTargetById) {
    if (!removedRelIds.has(id)) relIdByPart.set(target, id);
  }
  for (const d of desired) {
    if (relIdByPart.has(d.partPath)) continue;
    let n = 1;
    while (usedRelIds.has(`rIdSlideNew${n}`)) n++;
    const relId = `rIdSlideNew${n}`;
    usedRelIds.add(relId);
    relIdByPart.set(d.partPath, relId);
    // Target 相对 presentation.xml 所在目录（ppt/）。
    const target = d.partPath.startsWith(`${presBaseDir}/`) ? d.partPath.slice(presBaseDir.length + 1) : `/${d.partPath}`;
    keptRels.push({
      Relationship: [],
      ":@": { "@_Id": relId, "@_Type": REL_TYPE_SLIDE, "@_Target": target },
    } as RawNode);
  }
  setChildren(relsRoot, keptRels);

  // ---- sldIdLst 重排：既有条目复用原 node，新条目分配未占用的 sldId@id（≥256） ----
  const originalByPart = new Map(original.map((e) => [e.partPath, e]));
  const usedIdNums = new Set(original.map((e) => e.idNum));
  const prefix = (() => {
    const tag = getTagName(sldIdLst) ?? "p:sldIdLst";
    const i = tag.indexOf(":");
    return i < 0 ? "" : tag.slice(0, i + 1);
  })();
  let nextIdNum = 256;
  const newChildren: RawTree = [];
  for (const d of desired) {
    const existing = originalByPart.get(d.partPath);
    if (existing) {
      newChildren.push(existing.node);
      continue;
    }
    while (usedIdNums.has(nextIdNum)) nextIdNum++;
    usedIdNums.add(nextIdNum);
    newChildren.push({
      [`${prefix}sldId`]: [],
      ":@": { "@_id": String(nextIdNum), "@_r:id": relIdByPart.get(d.partPath)! },
    } as RawNode);
  }
  setChildren(sldIdLst, newChildren);

  // ---- custShowLst：清掉引用已删 slide 的 <p:sld r:id> ----
  if (removedRelIds.size) {
    const custShowLst = findChildByLocal(getChildren(presRoot), "custShowLst");
    if (custShowLst) {
      for (const show of findAllChildrenByLocal(getChildren(custShowLst), "custShow")) {
        const sldLst = findChildByLocal(getChildren(show), "sldLst");
        if (!sldLst) continue;
        const kept = getChildren(sldLst).filter((n) => {
          const tag = getTagName(n);
          if (!tag || localName(tag) !== "sld") return true;
          const rid = getAttrs(n)["@_r:id"];
          return !(rid && removedRelIds.has(rid));
        });
        if (kept.length !== getChildren(sldLst).length) setChildren(sldLst, kept);
      }
    }
  }

  archive.files.set(presPath, strToU8(buildXml(presTree)));
  archive.files.set(relsPath, strToU8(buildXml(relsTree)));

  // docProps/app.xml 的 <Slides> 计数轻量对齐（纯信息字段，正则改数即可；
  // TitlesOfParts 等向量不动 —— PowerPoint 对 app.xml 不一致是宽容的）。
  const appBytes = archive.files.get("docProps/app.xml");
  if (appBytes) {
    const appXml = strFromU8(appBytes);
    const patched = appXml.replace(/<Slides>\d+<\/Slides>/, `<Slides>${desired.length}</Slides>`);
    if (patched !== appXml) archive.files.set("docProps/app.xml", strToU8(patched));
  }

  if (opts.debug) {
    console.log(`[roundtrip] slide list reconciled: ${original.length} → ${desired.length} (removed ${removedRelIds.size})`);
  }
}

// ============================================================================
// 阶段 N：custShowLst 自定义放映回写
// ============================================================================

function readSlideRelIdsInOrder(presPath: string, archive: MutableArchive): string[] {
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return [];
  const presTree = parseXmlPreserveOrder(strFromU8(presBytes));
  const presRoot = findRootElement(presTree, "presentation");
  const sldIdLst = presRoot ? findChildByLocal(getChildren(presRoot), "sldIdLst") : undefined;
  if (!sldIdLst) return [];
  const out: string[] = [];
  for (const node of getChildren(sldIdLst)) {
    const tag = getTagName(node);
    if (!tag || localName(tag) !== "sldId") continue;
    const relId = getAttrs(node)["@_r:id"];
    if (relId) out.push(relId);
  }
  return out;
}

function resolveCustomShowIndices(show: CustomShow, pres: Presentation, slideRelIds: string[]): number[] {
  if (show.slideIndices?.length) return show.slideIndices;
  if (!show.slideRIds.length) return [];
  const out: number[] = [];
  for (const rid of show.slideRIds) {
    const idx = slideRelIds.indexOf(rid);
    if (idx >= 0) out.push(idx);
  }
  return out;
}

function patchCustomShows(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void {
  if (pres.customShows === undefined) return;
  const source = pres.__source as PresentationSource | undefined;
  const presPath = source?.presentationPath ?? "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  if (!presBytes) return;

  const slideRelIds = readSlideRelIdsInOrder(presPath, archive);
  const presTree = parseXmlPreserveOrder(strFromU8(presBytes));
  const presRoot = findRootElement(presTree, "presentation");
  if (!presRoot) return;

  const rootKids = getChildren(presRoot);
  const withoutCust = rootKids.filter((n) => localName(getTagName(n) ?? "") !== "custShowLst");

  const shows = pres.customShows ?? [];
  if (!shows.length) {
    if (withoutCust.length !== rootKids.length) {
      setChildren(presRoot, withoutCust);
      archive.files.set(presPath, strToU8(buildXml(presTree)));
      if (opts.debug) console.log("[roundtrip] custShowLst removed (empty customShows)");
    }
    return;
  }

  const sldIdLst = findChildByLocal(rootKids, "sldIdLst");
  const prefix = (() => {
    const tag = sldIdLst ? getTagName(sldIdLst) : "p:sldIdLst";
    const i = (tag ?? "p:sldIdLst").indexOf(":");
    return i < 0 ? "p:" : tag!.slice(0, i + 1);
  })();

  const custShowNodes: RawNode[] = [];
  for (const show of shows) {
    const indices = resolveCustomShowIndices(show, pres, slideRelIds);
    const sldNodes: RawNode[] = [];
    for (const idx of indices) {
      const relId = slideRelIds[idx];
      const slide = pres.slides[idx];
      if (!relId || !slide || slide.show === false) continue;
      sldNodes.push({
        [`${prefix}sld`]: [],
        ":@": { "@_r:id": relId },
      } as RawNode);
    }
    if (!sldNodes.length) continue;
    custShowNodes.push({
      [`${prefix}custShow`]: [
        {
          [`${prefix}sldLst`]: sldNodes,
        } as RawNode,
      ],
      ":@": {
        "@_id": show.id,
        "@_name": show.name,
      },
    } as RawNode);
  }

  if (!custShowNodes.length) {
    if (withoutCust.length !== rootKids.length) {
      setChildren(presRoot, withoutCust);
      archive.files.set(presPath, strToU8(buildXml(presTree)));
    }
    return;
  }

  const custShowLst: RawNode = {
    [`${prefix}custShowLst`]: custShowNodes,
  };
  setChildren(presRoot, [...withoutCust, custShowLst]);
  archive.files.set(presPath, strToU8(buildXml(presTree)));
  if (opts.debug) console.log(`[roundtrip] custShowLst patched (${custShowNodes.length} show(s))`);
}

/** 把 rels Target（相对 base 目录或以 / 开头的绝对路径）归一化为 archive part 路径。 */
function resolveRelTarget(baseDir: string, target: string): string {
  if (target.startsWith("/")) return target.slice(1);
  const parts = `${baseDir}/${target}`.split("/");
  const out: string[] = [];
  for (const p of parts) {
    if (p === "..") out.pop();
    else if (p !== "." && p !== "") out.push(p);
  }
  return out.join("/");
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function removeContentTypesOverride(archive: MutableArchive, partName: string): void {
  const ctPath = "[Content_Types].xml";
  const bytes = archive.files.get(ctPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  const re = new RegExp(`<Override PartName="${escapeRegExp(partName)}"[^>]*/>`);
  if (!re.test(xml)) return;
  archive.files.set(ctPath, strToU8(xml.replace(re, "")));
}

/** 删除一个 slide part 及其 rels / notesSlide / Content_Types Override。 */
function removeSlidePart(partPath: string, archive: MutableArchive, opts: RoundTripOptions): void {
  const relsPath = partRelsPath(partPath);
  const relsBytes = archive.files.get(relsPath);
  if (relsBytes) {
    // notesSlide 与 slide 一一对应，slide 删除时一并清掉，避免残留孤儿 part +
    // Content_Types Override 指向不存在的 slide。
    try {
      const relsTree = parseXmlPreserveOrder(strFromU8(relsBytes));
      const relsRoot = findRootElement(relsTree, "Relationships");
      const baseDir = partPath.slice(0, partPath.lastIndexOf("/"));
      for (const rel of relsRoot ? getChildren(relsRoot) : []) {
        const attrs = getAttrs(rel);
        if (attrs["@_Type"] !== REL_TYPE_NOTES_SLIDE || !attrs["@_Target"]) continue;
        const notesPath = resolveRelTarget(baseDir, attrs["@_Target"]);
        archive.files.delete(notesPath);
        archive.files.delete(partRelsPath(notesPath));
        removeContentTypesOverride(archive, `/${notesPath}`);
      }
      for (const rel of relsRoot ? getChildren(relsRoot) : []) {
        const attrs = getAttrs(rel);
        if (attrs["@_Type"] !== REL_TYPE_COMMENTS || !attrs["@_Target"]) continue;
        const commentsPath = resolveRelTarget(baseDir, attrs["@_Target"]);
        archive.files.delete(commentsPath);
        removeContentTypesOverride(archive, `/${commentsPath}`);
      }
    } catch {
      // rels 解析失败 → 只删 slide 本体，notesSlide 残留为孤儿（不致命）。
    }
    archive.files.delete(relsPath);
  }
  archive.files.delete(partPath);
  removeContentTypesOverride(archive, `/${partPath}`);
  if (opts.debug) console.log(`[roundtrip] removed slide part ${partPath}`);
}

/** slide.layoutRef → archive 中的 layout part 路径；解析不到时退回编号最小的 layout。 */
function resolveLayoutPartPathForSlide(
  slide: Slide,
  pres: Presentation,
  archive: MutableArchive,
): string | undefined {
  const layoutId = slide.layoutRef?.layoutId;
  if (layoutId) {
    for (const m of pres.masters ?? []) {
      for (const l of m.layouts ?? []) {
        const p = l.id === layoutId ? l.__source?.partPath : undefined;
        if (p && archive.files.has(p)) return p;
      }
    }
  }
  let best: string | undefined;
  let bestN = Infinity;
  for (const p of archive.files.keys()) {
    const m = p.match(/^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/);
    if (m) {
      const n = Number(m[1]);
      if (n < bestN) {
        bestN = n;
        best = p;
      }
    }
  }
  return best;
}

/**
 * 为内存新增的 slide 渲染完整 part（XML + rels + 媒体 + 超链接 + Content_Types），
 * 并把 __source（partPath + 各快照 = 当前值）挂回 slide，让本轮后续阶段
 * （patchNotesParts）与同会话的下一次保存都走 patch 路径。
 * 成功返回 partPath，失败返回 undefined。
 */
function addNewSlidePart(
  slide: Slide,
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): string | undefined {
  const idx = nextPartIdx(archive, /^ppt\/slides\/slide(\d+)\.xml$/);
  const partPath = `ppt/slides/slide${idx}.xml`;
  const relsPath = partRelsPath(partPath);

  // 超链接收集器：rIdLnk 前缀与媒体的纯数字 rId 系列天然不冲突。
  const linkItems: Array<{ url: string; relId: string }> = [];
  const linkByUrl = new Map<string, string>();
  const links = {
    register(url: string): string {
      const hit = linkByUrl.get(url);
      if (hit) return hit;
      const relId = `rIdLnk${linkItems.length + 1}`;
      linkItems.push({ url, relId });
      linkByUrl.set(url, relId);
      return relId;
    },
  };

  const media = makeMediaTable();
  const charts = new PartChartRegistry(archive, partPath, false);
  const diagrams = new PartDiagramRegistry(archive, partPath, false);
  const inks = new PartInkRegistry(archive, partPath, false);
  const embeddings = new PartOleRegistry(archive, partPath, false);
  const mediaTimings: MediaTimingHint[] = [];
  let bgXml: string;
  let shapesXml: string;
  let transitionXml: string;
  let timingXml: string;
  try {
    bgXml = backgroundToXml(slide.background, { media }, pres.size, slide.bgRef);
    const ctx: ShapeCtx = { media, spIdCounter: { next: 2 }, slideSize: pres.size, links, charts, diagrams, inks, embeddings, mediaTimings };
    for (const l of slide.layers) assignSpIds(l.shapes, ctx);
    shapesXml = slide.layers.map((l) => l.shapes.map((s) => shapeToXml(s, ctx)).join("\n")).join("\n");
    transitionXml = serializeTransition(slide.transition, media);
    timingXml = serializeTiming(mergeMediaTiming(remapTimingSpids(slide.ooxmlTiming, ctx.spIdByShapeId), mediaTimings), media);
  } catch (e) {
    if (opts.debug) console.warn(`[roundtrip] addNewSlidePart render failed for "${slide.id}"`, e);
    return undefined;
  }

  // 媒体：文件名走 archive 级去重（ensureMediaFileName），rId 保持 MediaTable 分配的
  // rId1..N 原样 —— 本 part 的 rels 是全新写出的，数字系列由我们独占，无需重映射。
  const mediaRels: string[] = [];
  for (const item of media.list()) {
    if (item.external || isExternalMediaSrc(item.src)) {
      mediaRels.push(mediaRelationshipXml({ ...item, external: true }));
      continue;
    }
    if (!item.bytes.length) continue;
    try {
      const fileName = ensureMediaFileName(archive, item.src);
      mediaRels.push(mediaRelationshipXml({ ...item, name: fileName }));
    } catch {
      continue;
    }
  }

  const layoutPartPath = resolveLayoutPartPathForSlide(slide, pres, archive);
  const layoutRel = layoutPartPath
    ? `<Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../${layoutPartPath.replace(/^ppt\//, "")}"/>`
    : "";
  if (!layoutPartPath && opts.debug) {
    console.warn(`[roundtrip] no slideLayout part found for new slide "${slide.id}" (archive has none?)`);
  }
  const linkRels = linkItems
    .map(
      (l) =>
        `<Relationship Id="${l.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(l.url)}" TargetMode="External"/>`,
    )
    .join("");
  const chartRels = charts.relsFragment();
  const diagramRels = diagrams.relsFragment();
  const inkRels = inks.relsFragment();
  const oleRels = embeddings.relsFragment();
  const hfXml = hfToXml(slide.hf);
  const sldAttrs = sldRootAttrXml(slide);
  const cSldAttrs = cSldNameAttr(slide);
  const clrOvr = clrMapOvrXml(slide.clrMapOverride);

  const slideXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"${sldAttrs}><p:cSld${cSldAttrs}>${bgXml}<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${shapesXml}</p:spTree></p:cSld>${clrOvr}${transitionXml}${timingXml}${hfXml}</p:sld>`;
  const relsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${layoutRel}${chartRels}${diagramRels}${inkRels}${oleRels}${linkRels}${mediaRels.join("")}</Relationships>`;

  archive.files.set(partPath, strToU8(slideXml));
  archive.files.set(relsPath, strToU8(relsXml));
  appendContentTypesOverride(archive, `/${partPath}`, CT_SLIDE);

  // __source：partPath + 快照 = 当前值。快照对齐当前值 → 本轮 patchNotesParts 能给
  // 非空 notes 建部件（notesSnapshot=""），下一次保存的各 patch 均按"未再编辑"跳过。
  Object.defineProperty(slide, "__source", {
    value: {
      partPath,
      bgSnapshot: slide.background ? (JSON.parse(JSON.stringify(slide.background)) as Paint) : undefined,
      timingSnapshot: JSON.stringify(slide.ooxmlTiming ?? null),
      transitionSnapshot: JSON.stringify(slide.transition ?? null),
      notesSnapshot: "",
    },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  if (opts.debug) console.log(`[roundtrip] added new slide part ${partPath}`);
  return partPath;
}

// 阶段 2.3：对 slideMasterN.xml 做与 slide.xml 等价的 surgical patch。
// 复用 patchSpTreeInPlace —— 它只关心 shapes，不依赖 slide 特有字段。
function patchMasterPart(
  master: import("@ppt/core").SlideMaster,
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const partPath = master.__source?.partPath;
  if (!partPath) {
    if (opts.debug) console.warn(`[roundtrip] master "${master.id}" has no __source.partPath (newly added master); skipped (addNewMasterPart not implemented)`);
    return;
  }
  const bytes = archive.files.get(partPath);
  if (!bytes) return;
  const xmlText = strFromU8(bytes);
  const tree = parsePartCached(pres.__source?.files, partPath, xmlText);
  const before = JSON.stringify(tree);
  const root = findRootElement(tree, "sldMaster");
  if (!root) return;
  const cSld = findChildByLocal(getChildren(root), "cSld");
  if (!cSld) return;
  // 阶段 N：背景对齐。master 的 background 字段如果被编辑器/AI 改了，需要把
  // <p:cSld>/<p:bg> 写回。bgSnapshot 是 parser 解析时的深拷贝，用 JSON 比较：
  // 相等则不动 raw（保留原字节、保留 <p:bg> 缺省时的占位符继承）。
  // backgroundForThemeExport 的"对齐主题画布"覆盖**只在主题真的被改过时**参与 ——
  // 否则未编辑的深色/图片母版背景会被 inferThemeCanvasBackground 推断出的画布色
  // （常见 = 白）静默覆盖，open→save 即破坏原文件。
  patchBackgroundIn(cSld, masterLayoutExportBg(master.background, pres), master.__source?.bgSnapshot, archive, partPath, opts, false, pres.size);
  const spTree = findChildByLocal(getChildren(cSld), "spTree");
  if (!spTree) return;
  patchSpTreeInPlace(spTree, master.shapes, null, archive, partPath, opts);
  const after = JSON.stringify(tree);
  if (before === after) return;
  archive.files.set(partPath, strToU8(buildXml(tree)));
  if (opts.debug) console.log(`[roundtrip] master "${master.id}" patched`);
}

// ---------------------------------------------------------------------------
// 阶段 3.x：addNewMasterPart / addNewLayoutPart
//
// 处理流程：
//   1. 在 archive 内找最大 slideMasterN / slideLayoutM 编号，新部件用 max+1
//   2. 渲染完整 OOXML + .rels 写入 archive
//   3. 给 master/layout 对象补上 __source.partPath，让本轮后续 patch 路径能复用
//      （round-trip 同一次写出会把它当成"已存在部件"）
//   4. 更新 [Content_Types].xml 增加 Override
//   5. 更新 ppt/presentation.xml + ppt/_rels/presentation.xml.rels（仅 master）
//   6. 更新 master XML 内 sldLayoutIdLst + master rels（仅 layout）
//
// reconcileSlideLayoutRels：slide.layoutRef 与 slide rels 的 slideLayout Target 对齐。
// ---------------------------------------------------------------------------

function addNewMasterPart(
  master: import("@ppt/core").SlideMaster,
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const masterIdx = nextPartIdx(archive, /^ppt\/slideMasters\/slideMaster(\d+)\.xml$/);
  const partPath = `ppt/slideMasters/slideMaster${masterIdx}.xml`;
  const relsPath = `ppt/slideMasters/_rels/slideMaster${masterIdx}.xml.rels`;

  const media = makeMediaTable();
  const masterXml = renderSlideMasterXml(master, [], media, pres.size);
  const mediaItems = commitNewPartMedia(archive, media);
  archive.files.set(partPath, strToU8(masterXml));
  archive.files.set(relsPath, strToU8(renderMasterRelsXml([], 1, mediaItems)));

  // master.__source 补上，让后续可能的 layout add 能在 patch 时找到 master 路径
  Object.defineProperty(master, "__source", {
    value: { partPath },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  // 写 [Content_Types] / presentation.xml / presentation.xml.rels
  appendContentTypesOverride(archive, `/${partPath}`, "application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml");
  const relId = appendPresentationMasterRel(archive, masterIdx);
  appendSldMasterIdEntry(archive, relId);

  if (opts.debug) console.log(`[roundtrip] added new master ${partPath} (relId=${relId})`);
}

function addNewLayoutPart(
  layout: import("@ppt/core").SlideLayout,
  parentMaster: import("@ppt/core").SlideMaster,
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const masterPartPath = parentMaster.__source?.partPath;
  if (!masterPartPath) {
    if (opts.debug) console.warn(`[roundtrip] cannot add layout "${layout.id}": parent master has no partPath`);
    return;
  }
  const masterIdxMatch = masterPartPath.match(/slideMaster(\d+)\.xml$/);
  if (!masterIdxMatch) return;
  const masterIdx = parseInt(masterIdxMatch[1]!, 10);

  const layoutIdx = nextPartIdx(archive, /^ppt\/slideLayouts\/slideLayout(\d+)\.xml$/);
  const partPath = `ppt/slideLayouts/slideLayout${layoutIdx}.xml`;
  const relsPath = `ppt/slideLayouts/_rels/slideLayout${layoutIdx}.xml.rels`;

  const media = makeMediaTable();
  const layoutXml = renderSlideLayoutXml(layout, media, pres.size);
  const mediaItems = commitNewPartMedia(archive, media);
  archive.files.set(partPath, strToU8(layoutXml));
  archive.files.set(relsPath, strToU8(renderLayoutRelsXml(masterIdx, mediaItems)));

  Object.defineProperty(layout, "__source", {
    value: { partPath },
    enumerable: false,
    configurable: true,
    writable: true,
  });

  appendContentTypesOverride(archive, `/${partPath}`, "application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml");
  // 把新 layout 写进 master.rels + master XML 的 sldLayoutIdLst
  const layoutRelId = appendMasterLayoutRel(archive, masterPartPath, layoutIdx);
  appendSldLayoutIdEntry(archive, masterPartPath, layoutRelId);

  if (opts.debug) console.log(`[roundtrip] added new layout ${partPath} (relId=${layoutRelId} in ${masterPartPath})`);
}

const REL_TYPE_SLIDE_LAYOUT =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout";

/** slide part 目录 → layout part 的 OPC 相对 Target（如 ../slideLayouts/slideLayout2.xml）。 */
function layoutRelTargetFromSlide(slidePartPath: string, layoutPartPath: string): string {
  const slideDir = slidePartPath.slice(0, slidePartPath.lastIndexOf("/"));
  const layoutDir = layoutPartPath.slice(0, layoutPartPath.lastIndexOf("/"));
  const layoutFile = layoutPartPath.slice(layoutPartPath.lastIndexOf("/") + 1);
  const fromParts = slideDir.split("/");
  const layoutDirParts = layoutDir.split("/");
  let common = 0;
  while (
    common < fromParts.length &&
    common < layoutDirParts.length &&
    fromParts[common] === layoutDirParts[common]
  ) {
    common++;
  }
  const ups = fromParts.length - common;
  return [...Array(ups).fill(".."), ...layoutDirParts.slice(common), layoutFile].join("/");
}

function readSlideLayoutRelTarget(archive: MutableArchive, slidePartPath: string): string | undefined {
  const relsPath = partRelsPath(slidePartPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return undefined;
  const xml = strFromU8(bytes);
  const baseDir = slidePartPath.slice(0, slidePartPath.lastIndexOf("/"));
  const re = /<Relationship\s+([^>]+)\/>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const attrs = m[1]!;
    if (!attrs.includes("slideLayout")) continue;
    const targetM = attrs.match(/Target="([^"]+)"/);
    if (!targetM) continue;
    return resolveRelTarget(baseDir, targetM[1]!);
  }
  return undefined;
}

function patchSlideLayoutRel(
  slidePartPath: string,
  layoutPartPath: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
): boolean {
  const relsPath = partRelsPath(slidePartPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return false;
  const target = layoutRelTargetFromSlide(slidePartPath, layoutPartPath);
  let xml = strFromU8(bytes);
  const relRe = /<Relationship\s+([^>]*Type="[^"]*slideLayout"[^>]*)\/>/;
  const hit = xml.match(relRe);
  if (hit) {
    const attrs = hit[1]!;
    if (attrs.includes(`Target="${target}"`)) return false;
    const patchedAttrs = attrs.replace(/Target="[^"]*"/, `Target="${target}"`);
    xml = xml.replace(relRe, `<Relationship ${patchedAttrs}/>`);
  } else {
    const used = new Set<string>();
    for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
    let relId = "rIdLayout";
    if (used.has(relId)) {
      let n = 1;
      while (used.has(`rId${n}`)) n++;
      relId = `rId${n}`;
    }
    const rel = `<Relationship Id="${relId}" Type="${REL_TYPE_SLIDE_LAYOUT}" Target="${target}"/>`;
    xml = xml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
  }
  archive.files.set(relsPath, strToU8(xml));
  if (opts.debug) {
    console.log(`[roundtrip] ${slidePartPath} slideLayout rel → ${target}`);
  }
  return true;
}

/** 把每张 slide 的 slideLayout relationship 对齐到 slide.layoutRef 解析出的 layout part。 */
function reconcileSlideLayoutRels(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void {
  for (const slide of pres.slides) {
    const slidePartPath = slide.__source?.partPath;
    if (!slidePartPath || !archive.files.has(slidePartPath)) continue;
    const desiredLayout = resolveLayoutPartPathForSlide(slide, pres, archive);
    if (!desiredLayout) continue;
    const currentLayout = readSlideLayoutRelTarget(archive, slidePartPath);
    if (currentLayout === desiredLayout) continue;
    patchSlideLayoutRel(slidePartPath, desiredLayout, archive, opts);
  }
}

// ---- archive 操作辅助 -----------------------------------------------------

function nextPartIdx(archive: MutableArchive, pattern: RegExp): number {
  let max = 0;
  for (const path of archive.files.keys()) {
    const m = path.match(pattern);
    if (m) {
      const n = parseInt(m[1]!, 10);
      if (n > max) max = n;
    }
  }
  return max + 1;
}

function appendContentTypesOverride(archive: MutableArchive, partName: string, contentType: string): void {
  const ctPath = "[Content_Types].xml";
  const bytes = archive.files.get(ctPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  // 已存在则跳过 —— round-trip 阶段同一份 master/layout 可能被多次访问。
  if (xml.includes(`PartName="${partName}"`)) return;
  const insertion = `<Override PartName="${partName}" ContentType="${contentType}"/>`;
  const patched = xml.replace(/<\/Types>/, `${insertion}</Types>`);
  archive.files.set(ctPath, strToU8(patched));
}

const MEDIA_CONTENT_TYPE: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  mp4: "video/mp4",
  webm: "video/webm",
  mp3: "audio/mpeg",
  m4a: "audio/mp4",
  wav: "audio/wav",
  glb: "model/gltf-binary",
  gltf: "model/gltf+json",
};

/** 新增 ppt/media 文件时补 [Content_Types] Default；源文件常没有 svg/webp，WPS 会直接不显示。 */
function appendContentTypesDefault(archive: MutableArchive, ext: string, mime?: string): void {
  const ctPath = "[Content_Types].xml";
  const bytes = archive.files.get(ctPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  const patched = ensureContentTypesDefault(xml, ext, mime || MEDIA_CONTENT_TYPE[ext.toLowerCase().replace(/^\./, "")]);
  if (patched === xml) return;
  archive.files.set(ctPath, strToU8(patched));
}

function appendPresentationMasterRel(archive: MutableArchive, masterIdx: number): string {
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const bytes = archive.files.get(relsPath);
  if (!bytes) return `rIdMaster${masterIdx}`;
  const xml = strFromU8(bytes);
  // 找一个全局未占用的 rIdMasterN
  const usedRels = new Set<string>();
  for (const m of xml.matchAll(/Id="([^"]+)"/g)) usedRels.add(m[1]!);
  let candidate = `rIdMaster${masterIdx}`;
  let suffix = masterIdx;
  while (usedRels.has(candidate)) candidate = `rIdMaster${++suffix}`;
  const rel = `<Relationship Id="${candidate}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster${masterIdx}.xml"/>`;
  const patched = xml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
  archive.files.set(relsPath, strToU8(patched));
  return candidate;
}

function appendSldMasterIdEntry(archive: MutableArchive, relId: string): void {
  const presPath = "ppt/presentation.xml";
  const bytes = archive.files.get(presPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  if (xml.includes(`r:id="${relId}"`)) return;
  // 找一个全局未占用的 sldMasterId 数值
  const usedIds = new Set<number>();
  for (const m of xml.matchAll(/<p:sldMasterId id="(\d+)"/g)) usedIds.add(parseInt(m[1]!, 10));
  let candidate = 2147483648;
  while (usedIds.has(candidate)) candidate++;
  const entry = `<p:sldMasterId id="${candidate}" r:id="${relId}"/>`;
  // 优先把新条目追加到现有 sldMasterIdLst 末尾；如果不存在则在 <p:presentation> 内插一个
  let patched: string;
  if (/<p:sldMasterIdLst>/.test(xml)) {
    patched = xml.replace(/(<\/p:sldMasterIdLst>)/, `${entry}$1`);
  } else {
    patched = xml.replace(/<p:presentation([^>]*)>/, `<p:presentation$1><p:sldMasterIdLst>${entry}</p:sldMasterIdLst>`);
  }
  archive.files.set(presPath, strToU8(patched));
}

function appendMasterLayoutRel(archive: MutableArchive, masterPartPath: string, layoutIdx: number): string {
  const relsPath = masterPartPath.replace(/slideMaster(\d+)\.xml$/, "_rels/slideMaster$1.xml.rels");
  const bytes = archive.files.get(relsPath);
  if (!bytes) return `rIdLayout${layoutIdx}`;
  const xml = strFromU8(bytes);
  // 找未占用的 rIdLayoutN（这里 N 是 master scope 内）
  const used = new Set<string>();
  for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
  let n = 1;
  while (used.has(`rIdLayout${n}`)) n++;
  const candidate = `rIdLayout${n}`;
  const rel = `<Relationship Id="${candidate}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${layoutIdx}.xml"/>`;
  const patched = xml.replace(/<\/Relationships>/, `${rel}</Relationships>`);
  archive.files.set(relsPath, strToU8(patched));
  return candidate;
}

function appendSldLayoutIdEntry(archive: MutableArchive, masterPartPath: string, layoutRelId: string): void {
  const bytes = archive.files.get(masterPartPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  if (xml.includes(`r:id="${layoutRelId}"`)) return;
  const usedIds = new Set<number>();
  for (const m of xml.matchAll(/<p:sldLayoutId id="(\d+)"/g)) usedIds.add(parseInt(m[1]!, 10));
  let candidate = 2147483649;
  while (usedIds.has(candidate)) candidate++;
  const entry = `<p:sldLayoutId id="${candidate}" r:id="${layoutRelId}"/>`;
  let patched: string;
  if (/<p:sldLayoutIdLst>/.test(xml)) {
    patched = xml.replace(/(<\/p:sldLayoutIdLst>)/, `${entry}$1`);
  } else {
    // master 没有 sldLayoutIdLst（极少见的合规手写 XML）→ 在 clrMap 之后插入
    patched = xml.replace(/(<p:clrMap[^/]*\/>)/, `$1<p:sldLayoutIdLst>${entry}</p:sldLayoutIdLst>`);
  }
  archive.files.set(masterPartPath, strToU8(patched));
}

function partRelsPath(partPath: string): string {
  const slash = partPath.lastIndexOf("/");
  const dir = partPath.slice(0, slash);
  const file = partPath.slice(slash + 1);
  return `${dir}/_rels/${file}.rels`;
}

function resolvePartRelTarget(archive: MutableArchive, partPath: string, relId: string): string | undefined {
  const relsPath = partRelsPath(partPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return undefined;
  const xml = strFromU8(bytes);
  const escId = relId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = xml.match(new RegExp(`Id="${escId}"[^>]*Target="([^"]+)"`));
  if (!m) return undefined;
  const baseDir = partPath.slice(0, partPath.lastIndexOf("/"));
  return resolveRelTarget(baseDir, m[1]!);
}

function readChartRelIdFromRaw(raw: RawNode): string | undefined {
  const graphic = findChildByLocal(getChildren(raw), "graphic");
  if (!graphic) return undefined;
  const graphicData = findChildByLocal(getChildren(graphic), "graphicData");
  if (!graphicData) return undefined;
  for (const child of getChildren(graphicData)) {
    if (localName(getTagName(child) ?? "") !== "chart") continue;
    const relId = getAttrs(child)["@_r:id"];
    return typeof relId === "string" ? relId : undefined;
  }
  return undefined;
}

function chartDefChanged(shape: ChartShape): boolean {
  if (isDirty(shape, "chart")) return true;
  const snap = getOrigin(shape)?.chart;
  if (!snap) return false;
  return JSON.stringify(shape.chart) !== JSON.stringify(snap);
}

function patchChartGraphicFrame(
  raw: RawNode,
  chartShape: ChartShape,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
): void {
  if (!chartDefChanged(chartShape)) return;
  const relId = readChartRelIdFromRaw(raw);
  if (!relId) return;
  const chartPartPath = resolvePartRelTarget(archive, partPath, relId);
  if (!chartPartPath) return;
  const def = chartShape.chart;
  const chartEx = chartExExportSupported(def);
  const classic = chartExportSupported(def);
  if (!chartEx && !classic) return;
  const xml = chartEx ? renderChartExSpaceXml(def) : renderChartSpaceXml(def);
  archive.files.set(chartPartPath, strToU8(xml));
  if (opts.debug) console.log(`[roundtrip] ${chartPartPath} chart data patched (${def.type})`);
}

/** 把 src 注册到 ppt/media/，跨 part 复用同一张图只写一次 bytes。 */
function ensureMediaFileName(archive: MutableArchive, src: string): string {
  const cached = archive.newMediaPaths.get(src);
  if (cached) return cached;

  const table = new MediaTable();
  table.registerImage(src);
  const item = table.list()[0];
  if (!item || item.bytes.length === 0) {
    throw new Error(`roundtrip: failed to decode image (${src.slice(0, 48)}…)`);
  }

  const ext = item.name.includes(".") ? item.name.slice(item.name.lastIndexOf(".") + 1) : "png";
  const prefix = mediaNamePrefix(item.mime);
  let idx = nextPartIdx(archive, new RegExp(`/media/${prefix}(\\d+)\\.`));
  let fileName = `${prefix}${idx}.${ext}`;
  while (archive.files.has(`ppt/media/${fileName}`)) {
    idx += 1;
    fileName = `${prefix}${idx}.${ext}`;
  }
  archive.files.set(`ppt/media/${fileName}`, item.bytes.slice());
  archive.newMediaPaths.set(src, fileName);
  appendContentTypesDefault(archive, ext, item.mime);
  return fileName;
}

/** Write MediaTable bytes into ppt/media and return rel items for new master/layout parts. */
function commitNewPartMedia(
  archive: MutableArchive,
  media: MediaTable,
): Array<{ relId: string; name: string; src?: string; external?: boolean; relType?: string }> {
  const out: Array<{ relId: string; name: string; src?: string; external?: boolean; relType?: string }> = [];
  for (const item of media.list()) {
    if (item.external || isExternalMediaSrc(item.src)) {
      out.push({ relId: item.relId, name: "", src: item.src, external: true, relType: item.relType });
      continue;
    }
    if (!item.bytes.length) continue;
    try {
      const fileName = ensureMediaFileName(archive, item.src);
      out.push({ relId: item.relId, name: fileName, relType: item.relType });
    } catch {
      continue;
    }
  }
  return out;
}

function appendPartImageRel(archive: MutableArchive, partPath: string, mediaFileName: string, relType = REL_TYPE_IMAGE): string {
  return appendPartMediaRel(archive, partPath, mediaRelationshipXml({ relId: "rId0", name: mediaFileName, relType }));
}

function appendPartExternalRel(
  archive: MutableArchive,
  partPath: string,
  src: string,
  relType = REL_TYPE_IMAGE,
): string {
  return appendPartMediaRel(
    archive,
    partPath,
    mediaRelationshipXml({ relId: "rId0", src, relType, external: true }),
  );
}

function appendPartMediaRel(archive: MutableArchive, partPath: string, relTemplate: string): string {
  const relsPath = partRelsPath(partPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return "rId1";
  const xml = strFromU8(bytes);
  const used = new Set<string>();
  for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
  let n = 1;
  while (used.has(`rId${n}`)) n++;
  const relId = `rId${n}`;
  const rel = relTemplate.replace(/Id="rId0"/, `Id="${relId}"`);
  archive.files.set(relsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
  return relId;
}

function updatePartImageRelTarget(
  archive: MutableArchive,
  partPath: string,
  relId: string,
  mediaFileName: string,
): void {
  const relsPath = partRelsPath(partPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return;
  let xml = strFromU8(bytes);
  const idEsc = relId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relPattern = new RegExp(
    `<Relationship Id="${idEsc}" Type="[^"]*"[^/]*/>`,
    "i",
  );
  if (relPattern.test(xml)) {
    xml = xml.replace(
      relPattern,
      mediaRelationshipXml({ relId, name: mediaFileName, relType: REL_TYPE_IMAGE }),
    );
  } else {
    appendPartImageRel(archive, partPath, mediaFileName);
    return;
  }
  archive.files.set(relsPath, strToU8(xml));
}

function updatePartExternalRelTarget(
  archive: MutableArchive,
  partPath: string,
  relId: string,
  src: string,
): void {
  const relsPath = partRelsPath(partPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return;
  let xml = strFromU8(bytes);
  const idEsc = relId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const relPattern = new RegExp(`<Relationship Id="${idEsc}" Type="[^"]*"[^/]*/>`, "i");
  if (relPattern.test(xml)) {
    xml = xml.replace(
      relPattern,
      mediaRelationshipXml({ relId, src, relType: REL_TYPE_IMAGE, external: true }),
    );
  } else {
    appendPartExternalRel(archive, partPath, src);
    return;
  }
  archive.files.set(relsPath, strToU8(xml));
}

function commitRawMediaEmbeds(
  archive: MutableArchive,
  partPath: string,
  media: MediaTable,
  root: RawNode,
): void {
  const items = media.list();
  if (!items.length) return;
  const map = new Map<string, string>();
  for (const item of items) {
    if (item.external || isExternalMediaSrc(item.src)) {
      const relId = appendPartExternalRel(archive, partPath, item.src, item.relType || REL_TYPE_IMAGE);
      map.set(item.relId, relId);
      continue;
    }
    if (item.bytes.length === 0) continue;
    try {
      const fileName = ensureMediaFileName(archive, item.src);
      const relId = appendPartImageRel(archive, partPath, fileName, item.relType || REL_TYPE_IMAGE);
      map.set(item.relId, relId);
    } catch {
      continue;
    }
  }
  rewriteEmbedIds(root, map);
}

function rewriteEmbedIds(node: RawNode, map: Map<string, string>): void {
  const at = node[":@"] as Record<string, unknown> | undefined;
  if (typeof at?.["@_r:embed"] === "string") {
    const next = map.get(at["@_r:embed"]);
    if (next) at["@_r:embed"] = next;
  }
  if (typeof at?.["@_r:link"] === "string") {
    const next = map.get(at["@_r:link"]);
    if (next) at["@_r:link"] = next;
  }
  for (const c of getChildren(node)) rewriteEmbedIds(c, map);
}

/** 把 MediaTable 里临时 rId 映射到 part rels + ppt/media，并重写 xml 里的 r:embed / r:link。 */
function injectPartMedia(
  archive: MutableArchive,
  partPath: string,
  media: MediaTable,
  xml: string,
): string {
  let patched = xml;
  for (const item of media.list()) {
    if (item.external || isExternalMediaSrc(item.src)) {
      const relId = appendPartExternalRel(archive, partPath, item.src, item.relType || REL_TYPE_IMAGE);
      patched = patched.replaceAll(`r:embed="${item.relId}"`, `r:link="${relId}"`);
      patched = patched.replaceAll(`r:link="${item.relId}"`, `r:link="${relId}"`);
      continue;
    }
    if (item.bytes.length === 0) continue;
    try {
      const fileName = ensureMediaFileName(archive, item.src);
      const relId = appendPartImageRel(archive, partPath, fileName, item.relType || REL_TYPE_IMAGE);
      patched = patched.replaceAll(`r:embed="${item.relId}"`, `r:embed="${relId}"`);
      patched = patched.replaceAll(`r:link="${item.relId}"`, `r:link="${relId}"`);
    } catch {
      continue;
    }
  }
  return patched;
}

type LinkRegistrar = {
  register(url: string): string;
  registerSlide?(slideNumber: number): string | undefined;
};

/**
 * part 级超链接注册器：复用已有关系（含原始 rIdN），仅在目标 URL / 目标页确实
 * 没有对应关系时才增量写一条新 rels。
 *
 * 早期实现只认自己写的 `rIdLnk*` 前缀，导致「打开→保存」时每个原生 `rIdN` 超链接
 * 都会被再登记一条 `rIdLnk*` 重复关系：rels 每存一次涨一截，原 rId 变成孤儿。
 * 现在连原有的 hyperlink / slide 关系一并读入去重表。
 */
class PartLinkRegistry implements LinkRegistrar {
  private byUrl = new Map<string, string>();
  private bySlidePath = new Map<string, string>();
  private nextIdx = 1;

  constructor(
    private archive: MutableArchive,
    private partPath: string,
    private slidePathByNumber?: (slideNumber: number) => string | undefined,
  ) {
    const relsPath = partRelsPath(partPath);
    const bytes = archive.files.get(relsPath);
    if (!bytes) return;
    const xml = strFromU8(bytes);
    for (const m of xml.matchAll(/<Relationship\s([^>]*)\/>/g)) {
      const a = m[1]!;
      const id = /Id="([^"]+)"/.exec(a)?.[1];
      const type = /Type="([^"]+)"/.exec(a)?.[1];
      const target = /Target="([^"]+)"/.exec(a)?.[1];
      if (!id || !type || !target) continue;
      if (type.endsWith("/hyperlink")) this.byUrl.set(unesc(target), id);
      else if (type.endsWith("/slide")) this.bySlidePath.set(target, id);
      const n = /^rIdLnk(\d+)$/.exec(id)?.[1];
      if (n && Number(n) >= this.nextIdx) this.nextIdx = Number(n) + 1;
    }
  }

  register(url: string): string {
    const hit = this.byUrl.get(url);
    if (hit) return hit;
    const relId = `rIdLnk${this.nextIdx++}`;
    appendPartHyperlinkRel(this.archive, this.partPath, relId, url);
    this.byUrl.set(url, relId);
    return relId;
  }

  registerSlide(slideNumber: number): string | undefined {
    const targetPath = this.slidePathByNumber?.(slideNumber);
    if (!targetPath) return undefined;
    // slide rels 里的 slide 关系 Target 是同目录相对路径（如 `slide4.xml`）。
    const rel = targetPath.replace(/^ppt\/slides\//, "");
    const hit = this.bySlidePath.get(rel) ?? this.bySlidePath.get(targetPath);
    if (hit) return hit;
    const relId = `rIdLnk${this.nextIdx++}`;
    appendPartRelationship(this.archive, this.partPath, relId, REL_TYPE_SLIDE, rel);
    this.bySlidePath.set(rel, relId);
    return relId;
  }
}

function unesc(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function appendPartHyperlinkRel(
  archive: MutableArchive,
  partPath: string,
  relId: string,
  url: string,
): void {
  const relsPath = partRelsPath(partPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  if (xml.includes(`Id="${relId}"`)) return;
  const rel =
    `<Relationship Id="${relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${esc(url)}" TargetMode="External"/>`;
  archive.files.set(relsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
}

function hlinkRawNode(
  h: HyperlinkRef,
  tag: "a:hlinkClick" | "a:hlinkHover",
  links?: LinkRegistrar,
  media?: MediaTable,
): RawNode | undefined {
  const stubCtx: ShapeCtx = { media: media ?? makeMediaTable(), spIdCounter: { next: 1 }, ...(links ? { links } : {}) };
  const xml = hlinkTagXml(h, tag, stubCtx);
  if (!xml) return undefined;
  return parseFillFragment(xml);
}

function makeMediaTable(): MediaTable {
  return new MediaTable();
}

// ============================================================================
// 备注（notesSlide）回写
// ============================================================================

const REL_TYPE_NOTES_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide";
const REL_TYPE_NOTES_MASTER = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster";
const REL_TYPE_SLIDE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide";
const REL_TYPE_THEME = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme";
const CT_NOTES_SLIDE = "application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml";
const CT_NOTES_MASTER = "application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml";
const CT_THEME = "application/vnd.openxmlformats-officedocument.theme+xml";
const CT_CHART = "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
const REL_TYPE_CHART = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart";

/** round-trip 新增 chart / chartEx 部件：写 chartN.xml + rels + Content-Type。 */
class PartChartRegistry {
  readonly items: Array<{ partIdx: number; relId: string; chartEx: boolean }> = [];
  private nextChartIdx: number;

  constructor(
    private archive: MutableArchive,
    private partPath: string,
    private eagerRels: boolean,
  ) {
    this.nextChartIdx = nextPartIdx(archive, /^ppt\/charts\/chart(\d+)\.xml$/);
  }

  register(def: ChartDef): { relId: string; chartEx: boolean } | null {
    const chartEx = chartExExportSupported(def);
    const classic = chartExportSupported(def);
    if (!chartEx && !classic) return null;
    const partIdx = this.nextChartIdx++;
    const chartPartPath = `ppt/charts/chart${partIdx}.xml`;
    const xml = chartEx ? renderChartExSpaceXml(def) : renderChartSpaceXml(def);
    this.archive.files.set(chartPartPath, strToU8(xml));
    appendContentTypesOverride(
      this.archive,
      `/${chartPartPath}`,
      chartEx ? CHART_EX_CONTENT_TYPE : CT_CHART,
    );
    const relId = `rIdChart${this.items.length + 1}`;
    this.items.push({ partIdx, relId, chartEx });
    if (this.eagerRels) {
      const relType = chartEx ? CHART_EX_REL_TYPE : REL_TYPE_CHART;
      appendPartRelationship(
        this.archive,
        this.partPath,
        relId,
        relType,
        `../charts/chart${partIdx}.xml`,
      );
    }
    return { relId, chartEx };
  }

  relsFragment(): string {
    return this.items
      .map(
        (c) =>
          `<Relationship Id="${c.relId}" Type="${c.chartEx ? CHART_EX_REL_TYPE : REL_TYPE_CHART}" Target="../charts/chart${c.partIdx}.xml"/>`,
      )
      .join("");
  }
}

class PartDiagramRegistry {
  readonly items: Array<{ idx: number } & DiagramRelIds> = [];
  private nextIdx: number;

  constructor(
    private archive: MutableArchive,
    private partPath: string,
    private eagerRels: boolean,
  ) {
    this.nextIdx = nextPartIdx(archive, /^ppt\/diagrams\/data(\d+)\.xml$/);
  }

  register(group: Extract<Shape, { kind: "group" }>): DiagramRelIds | null {
    if (!group.smartArtMeta) return null;
    const idx = this.nextIdx++;
    const n = this.items.length + 1;
    const rels: DiagramRelIds = {
      dm: `rIdDm${n}`,
      lo: `rIdLo${n}`,
      qs: `rIdQs${n}`,
      cs: `rIdCs${n}`,
    };
    const drawingMedia = new MediaTable();
    const shifted = (group.children ?? []).map((c) => offsetShapeTree(c, -group.bbox.x, -group.bbox.y));
    // 所有 child 共用一个 id 计数器（id=1 留给 drawing spTree 根）；每个 child 各起
    // `{ next: 2 }` 会让全部 dsp:sp 撞成 id="2"，重新解析时只剩最后一个节点。
    const drawingCtx = { media: drawingMedia, spIdCounter: { next: 2 } };
    const childrenXml = shifted.map((c) => shapeToXml(c, drawingCtx)).join("\n");
    const files = buildSmartArtPartFiles({
      idx,
      layout: group.smartArtMeta.layout,
      items: extractSmartArtItems(group),
      bbox: group.bbox,
      childrenXml,
      drawingMedia: drawingMedia.list(),
    });
    for (const [path, xml] of Object.entries(files)) {
      this.archive.files.set(path, strToU8(xml));
    }
    for (const row of diagramContentTypeRows(idx)) {
      appendContentTypesOverride(this.archive, row.part, row.ct);
    }
    const drawingRelsPath = `ppt/diagrams/_rels/drawing${idx}.xml.rels`;
    let drawingRelsXml = files[drawingRelsPath] ?? "";
    for (const item of drawingMedia.list()) {
      if (!item.bytes.length) continue;
      try {
        const fileName = ensureMediaFileName(this.archive, item.src);
        drawingRelsXml = drawingRelsXml.replaceAll(`../media/${item.name}`, `../media/${fileName}`);
      } catch {
        continue;
      }
    }
    if (drawingRelsXml) this.archive.files.set(drawingRelsPath, strToU8(drawingRelsXml));
    this.items.push({ idx, ...rels });
    if (this.eagerRels) this.appendSlideRels(rels, idx);
    return rels;
  }

  relsFragment(): string {
    return this.items
      .map(
        (d) =>
          `<Relationship Id="${d.dm}" Type="${REL_DIAGRAM_DATA}" Target="../diagrams/data${d.idx}.xml"/>` +
          `<Relationship Id="${d.lo}" Type="${REL_DIAGRAM_LAYOUT}" Target="../diagrams/layout${d.idx}.xml"/>` +
          `<Relationship Id="${d.qs}" Type="${REL_DIAGRAM_STYLE}" Target="../diagrams/quickStyle${d.idx}.xml"/>` +
          `<Relationship Id="${d.cs}" Type="${REL_DIAGRAM_COLORS}" Target="../diagrams/colors${d.idx}.xml"/>`,
      )
      .join("");
  }

  private appendSlideRels(rels: DiagramRelIds, idx: number): void {
    appendPartRelationship(this.archive, this.partPath, rels.dm, REL_DIAGRAM_DATA, `../diagrams/data${idx}.xml`);
    appendPartRelationship(this.archive, this.partPath, rels.lo, REL_DIAGRAM_LAYOUT, `../diagrams/layout${idx}.xml`);
    appendPartRelationship(this.archive, this.partPath, rels.qs, REL_DIAGRAM_STYLE, `../diagrams/quickStyle${idx}.xml`);
    appendPartRelationship(this.archive, this.partPath, rels.cs, REL_DIAGRAM_COLORS, `../diagrams/colors${idx}.xml`);
  }
}

class PartInkRegistry {
  readonly items: Array<{ idx: number; relId: string }> = [];
  private nextIdx: number;

  constructor(
    private archive: MutableArchive,
    private partPath: string,
    private eagerRels: boolean,
  ) {
    this.nextIdx = nextPartIdx(archive, /^ppt\/ink\/ink(\d+)\.xml$/);
  }

  register(shape: Extract<Shape, { kind: "path" }>): InkRel | null {
    if (!isInkPath(shape)) return null;
    const idx = this.nextIdx++;
    const relId = `rIdInk${this.items.length + 1}`;
    this.archive.files.set(inkPartPath(idx), strToU8(buildInkMlXml(shape)));
    for (const row of inkContentTypeRows(idx)) {
      appendContentTypesOverride(this.archive, row.part, row.ct);
    }
    this.items.push({ idx, relId });
    if (this.eagerRels) {
      appendPartRelationship(this.archive, this.partPath, relId, INK_REL_TYPE, `../ink/ink${idx}.xml`);
    }
    return { relId, idx };
  }

  relsFragment(): string {
    return inkSlideRelsXml(this.items);
  }
}

const OLE_OBJECT_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.oleObject";

/** round-trip 新增 OLE：写 ppt/embeddings/oleObjectN.bin + slide rel + Content_Types Default。 */
class PartOleRegistry implements OleEmbeddingRegistrar {
  readonly items: Array<{ name: string; relId: string }> = [];
  private srcToRel = new Map<string, string>();
  private nextIdx: number;

  constructor(
    private archive: MutableArchive,
    private partPath: string,
    private eagerRels: boolean,
  ) {
    this.nextIdx = nextPartIdx(archive, /^ppt\/embeddings\/oleObject(\d+)\.bin$/);
  }

  registerOle(embedSrc: string, _fileName?: string): string {
    const hit = this.srcToRel.get(embedSrc);
    if (hit) return hit;
    const decoded = dataUrlToBytes(embedSrc);
    const bytes = decoded?.bytes ?? new Uint8Array(0);
    if (bytes.length === 0) return "";
    const idx = this.nextIdx++;
    const name = `oleObject${idx}.bin`;
    this.archive.files.set(`ppt/embeddings/${name}`, bytes);
    appendContentTypesDefault(this.archive, "bin", OLE_OBJECT_CONTENT_TYPE);
    const relId = `rIdOle${idx}`;
    this.items.push({ name, relId });
    this.srcToRel.set(embedSrc, relId);
    if (this.eagerRels) {
      appendPartRelationship(this.archive, this.partPath, relId, OLE_OBJECT_REL_TYPE, `../embeddings/${name}`);
    }
    return relId;
  }

  relsFragment(): string {
    return this.items
      .map(
        (o) =>
          `<Relationship Id="${o.relId}" Type="${OLE_OBJECT_REL_TYPE}" Target="../embeddings/${o.name}"/>`,
      )
      .join("");
  }
}

function appendPartRelationship(
  archive: MutableArchive,
  partPath: string,
  relId: string,
  type: string,
  target: string,
): void {
  const relsPath = partRelsPath(partPath);
  const bytes = archive.files.get(relsPath);
  if (!bytes) return;
  const xml = strFromU8(bytes);
  if (xml.includes(`Id="${relId}"`)) return;
  const rel = `<Relationship Id="${relId}" Type="${type}" Target="${target}"/>`;
  archive.files.set(relsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
}

function patchNotesParts(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void {
  for (const slide of pres.slides) {
    const src = slide.__source;
    if (!src?.partPath) continue;
    const snap = src.notesSnapshot;
    // 快照缺失（缓存恢复且基线重建失败）→ 无从判定，保守保留原字节。
    if (snap === undefined) continue;
    const current = slide.notes ?? "";
    if (current === snap) continue;
    if (src.notesPartPath && archive.files.has(src.notesPartPath)) {
      patchNotesBodyText(archive, src.notesPartPath, current, opts);
    } else if (current.trim()) {
      addNotesSlidePart(slide, current, pres, archive, opts);
    }
  }
}

// 就地替换 notesSlide part 中 body 占位符的 txBody 段落（保留 bodyPr / lstStyle 与
// 其余 shape：sldImg 占位符、页码等一概不动）。备注被清空时写一个空段落。
function patchNotesBodyText(
  archive: MutableArchive,
  notesPartPath: string,
  notes: string,
  opts: RoundTripOptions,
): void {
  const bytes = archive.files.get(notesPartPath);
  if (!bytes) return;
  const tree = parseXmlPreserveOrder(strFromU8(bytes));
  const root = findRootElement(tree, "notes");
  if (!root) return;
  const cSld = findChildByLocal(getChildren(root), "cSld");
  const spTree = cSld ? findChildByLocal(getChildren(cSld), "spTree") : undefined;
  if (!spTree) return;
  const body = findNotesBodySp(spTree);
  if (!body) {
    if (opts.debug) console.warn(`[roundtrip] ${notesPartPath} has no body placeholder, notes not written`);
    return;
  }
  const txBody = findChildByLocal(getChildren(body), "txBody");
  if (!txBody) return;
  // 保留 <a:p> 之前的 bodyPr / lstStyle，替换所有段落。
  const keep = getChildren(txBody).filter((c) => {
    const t = getTagName(c);
    return t !== undefined && localName(t) !== "p";
  });
  const paraXml = notes.length
    ? notes
        .split(/\r?\n/)
        .map((line) =>
          line
            ? `<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>`
            : `<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`,
        )
        .join("")
    : `<a:p xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"/>`;
  setChildren(txBody, [...keep, ...parseFragmentAsChildren(paraXml)]);
  archive.files.set(notesPartPath, strToU8(buildXml(tree)));
  if (opts.debug) console.log(`[roundtrip] ${notesPartPath} notes body rewritten`);
}

// 在 spTree 中找 ph type="body" 的 sp（备注正文占位符）。
function findNotesBodySp(spTree: RawNode): RawNode | undefined {
  for (const child of getChildren(spTree)) {
    const tag = getTagName(child);
    if (!tag || localName(tag) !== "sp") continue;
    const nvSpPr = findChildByLocal(getChildren(child), "nvSpPr");
    const nvPr = nvSpPr ? findChildByLocal(getChildren(nvSpPr), "nvPr") : undefined;
    const ph = nvPr ? findChildByLocal(getChildren(nvPr), "ph") : undefined;
    if (ph && getAttrs(ph)["@_type"] === "body") return child;
  }
  return undefined;
}

// slide 原本没有 notesSlide part：新建部件（notesMaster 缺失时一并兜底），
// 并补全 [Content_Types] / slide rels / notesSlide rels。
function addNotesSlidePart(
  slide: Slide,
  notes: string,
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const slidePartPath = slide.__source!.partPath;
  const slideFileMatch = slidePartPath.match(/\/([^/]+)\.xml$/);
  if (!slideFileMatch) return;

  const notesMasterPath = ensureNotesMasterPart(archive);
  if (!notesMasterPath) {
    if (opts.debug) console.warn(`[roundtrip] cannot ensure notesMaster, notes for ${slidePartPath} not written`);
    return;
  }

  const notesIdx = nextPartIdx(archive, /^ppt\/notesSlides\/notesSlide(\d+)\.xml$/);
  const notesPartPath = `ppt/notesSlides/notesSlide${notesIdx}.xml`;
  archive.files.set(notesPartPath, strToU8(renderNotesSlideXml(notes, pres.size)));
  const notesRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL_TYPE_NOTES_MASTER}" Target="../${notesMasterPath.replace(/^ppt\//, "")}"/>
  <Relationship Id="rId2" Type="${REL_TYPE_SLIDE}" Target="../slides/${slideFileMatch[1]}.xml"/>
</Relationships>`;
  archive.files.set(partRelsPath(notesPartPath), strToU8(notesRels));
  appendContentTypesOverride(archive, `/${notesPartPath}`, CT_NOTES_SLIDE);

  // slide rels 增加 notesSlide relationship。
  const slideRelsPath = partRelsPath(slidePartPath);
  const relsBytes = archive.files.get(slideRelsPath);
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    if (!xml.includes(`Type="${REL_TYPE_NOTES_SLIDE}"`)) {
      const used = new Set<string>();
      for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
      let n = 1;
      while (used.has(`rId${n}`)) n++;
      const rel = `<Relationship Id="rId${n}" Type="${REL_TYPE_NOTES_SLIDE}" Target="../notesSlides/notesSlide${notesIdx}.xml"/>`;
      archive.files.set(slideRelsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
    }
  } else {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL_TYPE_NOTES_SLIDE}" Target="../notesSlides/notesSlide${notesIdx}.xml"/>
</Relationships>`;
    archive.files.set(slideRelsPath, strToU8(xml));
  }

  // 记住新 partPath：同一会话内再次保存走 patch 路径。
  (slide.__source as { notesPartPath?: string }).notesPartPath = notesPartPath;
  if (opts.debug) console.log(`[roundtrip] added ${notesPartPath} for ${slidePartPath}`);
}

// 确保 archive 中存在 notesMaster part；缺失时新建最小合法 notesMaster（含 theme 克隆、
// [Content_Types]、presentation.xml notesMasterIdLst 与 rels）。返回 notesMaster part 路径。
function ensureNotesMasterPart(archive: MutableArchive): string | undefined {
  for (const path of archive.files.keys()) {
    if (/^ppt\/notesMasters\/notesMaster\d+\.xml$/.test(path)) return path;
  }
  const partPath = "ppt/notesMasters/notesMaster1.xml";
  // theme：PowerPoint 约定每个 master 有自己的 theme part —— 克隆现有 theme1 兜底。
  const themeSrc = archive.files.get("ppt/theme/theme1.xml");
  let themeRelXml = "";
  if (themeSrc) {
    const themeIdx = nextPartIdx(archive, /^ppt\/theme\/theme(\d+)\.xml$/);
    const themePath = `ppt/theme/theme${themeIdx}.xml`;
    archive.files.set(themePath, themeSrc.slice());
    appendContentTypesOverride(archive, `/${themePath}`, CT_THEME);
    themeRelXml = `<Relationship Id="rId1" Type="${REL_TYPE_THEME}" Target="../theme/theme${themeIdx}.xml"/>`;
  }
  archive.files.set(partPath, strToU8(renderNotesMasterXmlMinimal()));
  archive.files.set(
    partRelsPath(partPath),
    strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${themeRelXml}
</Relationships>`),
  );
  appendContentTypesOverride(archive, `/${partPath}`, CT_NOTES_MASTER);

  // presentation.xml.rels + notesMasterIdLst
  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relsBytes = archive.files.get(relsPath);
  let relId = "rIdNotesMaster";
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    if (!xml.includes(`Type="${REL_TYPE_NOTES_MASTER}"`)) {
      const used = new Set<string>();
      for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
      let n = 1;
      while (used.has(`rId${n}`) || used.has(relId)) {
        relId = `rIdNotesMaster${n}`;
        n++;
      }
      const rel = `<Relationship Id="${relId}" Type="${REL_TYPE_NOTES_MASTER}" Target="notesMasters/notesMaster1.xml"/>`;
      archive.files.set(relsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
    } else {
      // 已有 notesMaster rel（part 却不在 → 理论上不发生）；直接复用其 Id。
      const m = strFromU8(relsBytes).match(new RegExp(`Id="([^"]+)" Type="${REL_TYPE_NOTES_MASTER}"`));
      if (m) relId = m[1]!;
    }
  }
  const presPath = "ppt/presentation.xml";
  const presBytes = archive.files.get(presPath);
  if (presBytes) {
    const xml = strFromU8(presBytes);
    if (!/<p:notesMasterIdLst>/.test(xml)) {
      // CT_Presentation 顺序：sldMasterIdLst → notesMasterIdLst → handoutMasterIdLst → sldIdLst。
      const entry = `<p:notesMasterIdLst><p:notesMasterId r:id="${relId}"/></p:notesMasterIdLst>`;
      const patched = /<\/p:sldMasterIdLst>/.test(xml)
        ? xml.replace(/<\/p:sldMasterIdLst>/, `</p:sldMasterIdLst>${entry}`)
        : xml.replace(/<p:sldIdLst>/, `${entry}<p:sldIdLst>`);
      archive.files.set(presPath, strToU8(patched));
    }
  }
  return partPath;
}

// notesMaster 最小合法骨架（与 pptx-notes.ts renderNotesMasterXml 一致；此处内联避免
// from-scratch 模板将来演化影响 round-trip 路径）。
function renderNotesMasterXmlMinimal(): string {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:notesStyle><a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1"><a:defRPr sz="1200" kern="1200"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr></a:lvl1pPr></p:notesStyle></p:notesMaster>`;
}

// ============================================================================
// 审阅批注（comments / commentAuthors）回写
// ============================================================================

function patchCommentParts(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void {
  const allComments = pres.comments ?? [];
  const presSrc = pres.__source as PresentationSource | undefined;
  const useModern = shouldUseModernComments(allComments, presSrc?.commentsModern);
  const globalSnap = presSrc?.commentsSnapshot;
  const exportComments = useModern ? allComments : exportableComments(allComments);
  const currentGlobal = JSON.stringify(exportComments);
  const globalChanged = globalSnap !== undefined && currentGlobal !== globalSnap;
  const { authorIdByName: classicAuthorIdByName } = buildCommentAuthors(
    useModern ? [] : exportComments,
  );
  const existingModernAuthors = loadExistingModernAuthors(archive, presSrc?.modernAuthorsPartPath);
  const { authorIdByName: modernAuthorIdByName } = useModern
    ? buildModernAuthors(exportComments, existingModernAuthors)
    : { authorIdByName: new Map<string, string>() };
  let authorsPatched = false;

  for (const slide of pres.slides) {
    const src = slide.__source;
    if (!src?.partPath) continue;
    if (useModern) {
      // Always drop classic stubs on modern export (even if comment text is unchanged).
      stripCommentRelsOfType(src.partPath, REL_TYPE_COMMENTS, archive, opts);
    }
    const snap = src.commentsSnapshot;
    if (snap === undefined && !globalChanged) continue;
    if (snap === undefined && !globalChanged) continue;
    const current = commentsSnapshotForSlide(allComments, slide.index, useModern);
    if (snap !== undefined && current === snap && !globalChanged) continue;

    const slideComments = slideCommentsForExport(allComments, slide.index, useModern);
    if (!slideComments.length) {
      if (src.commentsPartPath) removeCommentsPart(src.partPath, src.commentsPartPath, archive, opts);
      continue;
    }

    const partPath = src.commentsPartPath;
    const partIsModern = partPath ? isModernCommentsPartPath(partPath) : false;
    if (partPath && useModern !== partIsModern) {
      removeCommentsPart(src.partPath, partPath, archive, opts);
      src.commentsPartPath = undefined;
    }

    if (useModern) {
      const xml = renderModernCommentsXml(slideComments, modernAuthorIdByName, pres.size);
      if (src.commentsPartPath && archive.files.has(src.commentsPartPath)) {
        archive.files.set(src.commentsPartPath, strToU8(xml));
        if (opts.debug) console.log(`[roundtrip] ${src.commentsPartPath} modern comments rewritten`);
      } else {
        addModernCommentsPart(slide, xml, archive, opts);
      }
      src.commentsModern = true;
    } else if (src.commentsPartPath && archive.files.has(src.commentsPartPath)) {
      archive.files.set(
        src.commentsPartPath,
        strToU8(renderCommentsXml(slideComments, classicAuthorIdByName, pres.size)),
      );
      if (opts.debug) console.log(`[roundtrip] ${src.commentsPartPath} comments rewritten`);
    } else {
      addCommentsPart(slide, slideComments, pres, archive, opts, classicAuthorIdByName);
    }
    authorsPatched = true;
  }

  if (authorsPatched || globalChanged) {
    if (useModern) {
      ensureModernAuthorsPart(pres, archive, exportComments, opts);
      if (presSrc) presSrc.commentsModern = true;
    } else {
      ensureCommentAuthorsPart(pres, archive, exportComments, opts);
    }
  }
}

function loadExistingModernAuthors(
  archive: MutableArchive,
  partPath?: string,
): Map<string, string> | undefined {
  if (!partPath) return undefined;
  const bytes = archive.files.get(partPath);
  if (!bytes) return undefined;
  return parseModernAuthorsFromXml(strFromU8(bytes));
}

function stripCommentRelsOfType(
  slidePartPath: string,
  relType: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const slideRelsPath = partRelsPath(slidePartPath);
  const relsBytes = archive.files.get(slideRelsPath);
  if (!relsBytes) return;
  const xml = strFromU8(relsBytes);
  const re = new RegExp(`<Relationship([^>]*Type="${relType}"[^>]*)/>`, "g");
  const baseDir = slidePartPath.replace(/\/[^/]+$/, "");
  let cleaned = xml;
  for (const m of xml.matchAll(re)) {
    const target = /Target="([^"]+)"/.exec(m[1] ?? "")?.[1];
    if (!target || /^https?:/i.test(target)) continue;
    const part = resolveRelTarget(baseDir, target);
    archive.files.delete(part);
    removeContentTypesOverride(archive, `/${part}`);
    if (opts.debug) console.log(`[roundtrip] stripped leftover comments part ${part}`);
  }
  cleaned = xml.replace(re, "");
  if (cleaned !== xml) archive.files.set(slideRelsPath, strToU8(cleaned));
}

function removeCommentsPart(
  slidePartPath: string,
  commentsPartPath: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  archive.files.delete(commentsPartPath);
  removeContentTypesOverride(archive, `/${commentsPartPath}`);
  const slideRelsPath = partRelsPath(slidePartPath);
  const relsBytes = archive.files.get(slideRelsPath);
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    const cleaned = xml
      .replace(new RegExp(`<Relationship[^>]*Type="${REL_TYPE_COMMENTS}"[^>]*/>`, "g"), "")
      .replace(new RegExp(`<Relationship[^>]*Type="${REL_MODERN_COMMENTS}"[^>]*/>`, "g"), "");
    if (cleaned !== xml) archive.files.set(slideRelsPath, strToU8(cleaned));
  }
  if (opts.debug) console.log(`[roundtrip] removed ${commentsPartPath}`);
}

function addCommentsPart(
  slide: Slide,
  slideComments: import("@ppt/core").DeckComment[],
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
  authorIdByName: Map<string, number>,
): void {
  const slidePartPath = slide.__source!.partPath;
  const idx = nextPartIdx(archive, /^ppt\/comments\/comment(\d+)\.xml$/);
  const commentsPartPath = `ppt/comments/comment${idx}.xml`;
  archive.files.set(
    commentsPartPath,
    strToU8(renderCommentsXml(slideComments, authorIdByName, pres.size)),
  );
  appendContentTypesOverride(archive, `/${commentsPartPath}`, CT_COMMENTS);

  const slideRelsPath = partRelsPath(slidePartPath);
  const relsBytes = archive.files.get(slideRelsPath);
  const target = `../comments/comment${idx}.xml`;
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    if (!xml.includes(`Type="${REL_TYPE_COMMENTS}"`)) {
      const used = new Set<string>();
      for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
      let n = 1;
      while (used.has(`rId${n}`)) n++;
      const rel = `<Relationship Id="rId${n}" Type="${REL_TYPE_COMMENTS}" Target="${target}"/>`;
      archive.files.set(slideRelsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
    }
  } else {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL_TYPE_COMMENTS}" Target="${target}"/>
</Relationships>`;
    archive.files.set(slideRelsPath, strToU8(xml));
  }

  (slide.__source as { commentsPartPath?: string }).commentsPartPath = commentsPartPath;
  if (opts.debug) console.log(`[roundtrip] added ${commentsPartPath} for ${slidePartPath}`);
}

function addModernCommentsPart(
  slide: Slide,
  commentsXml: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const slidePartPath = slide.__source!.partPath;
  const idx = nextPartIdx(archive, /^ppt\/comments\/modernComment(\d+)\.xml$/);
  const commentsPartPath = `ppt/comments/modernComment${idx}.xml`;
  archive.files.set(commentsPartPath, strToU8(commentsXml));
  appendContentTypesOverride(archive, `/${commentsPartPath}`, CT_MODERN_COMMENTS);

  const slideRelsPath = partRelsPath(slidePartPath);
  const relsBytes = archive.files.get(slideRelsPath);
  const target = `../comments/modernComment${idx}.xml`;
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    if (!xml.includes(`Type="${REL_MODERN_COMMENTS}"`)) {
      const used = new Set<string>();
      for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
      let n = 1;
      while (used.has(`rId${n}`)) n++;
      const rel = `<Relationship Id="rId${n}" Type="${REL_MODERN_COMMENTS}" Target="${target}"/>`;
      archive.files.set(slideRelsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
    }
  } else {
    const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="${REL_MODERN_COMMENTS}" Target="${target}"/>
</Relationships>`;
    archive.files.set(slideRelsPath, strToU8(xml));
  }

  const src = slide.__source as { commentsPartPath?: string; commentsModern?: boolean };
  src.commentsPartPath = commentsPartPath;
  src.commentsModern = true;
  if (opts.debug) console.log(`[roundtrip] added ${commentsPartPath} (modern) for ${slidePartPath}`);
}

function ensureModernAuthorsPart(
  pres: Presentation,
  archive: MutableArchive,
  comments: import("@ppt/core").DeckComment[],
  opts: RoundTripOptions,
): void {
  if (!comments.length) return;
  const presSrc = pres.__source as PresentationSource | undefined;
  const existingAuthors = loadExistingModernAuthors(archive, presSrc?.modernAuthorsPartPath);
  const { authors } = buildModernAuthors(comments, existingAuthors);
  const partPath =
    presSrc?.modernAuthorsPartPath ??
    `ppt/authors/author${nextPartIdx(archive, /^ppt\/authors\/author(\d+)\.xml$/)}.xml`;
  archive.files.set(partPath, strToU8(renderModernAuthorsXml(authors)));
  appendContentTypesOverride(archive, `/${partPath}`, CT_MODERN_AUTHORS);

  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relsBytes = archive.files.get(relsPath);
  const target = partPath.replace(/^ppt\//, "");
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    if (!xml.includes(`Type="${REL_MODERN_AUTHORS}"`)) {
      const used = new Set<string>();
      for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
      let n = 1;
      while (used.has(`rId${n}`)) n++;
      const rel = `<Relationship Id="rId${n}" Type="${REL_MODERN_AUTHORS}" Target="${target}"/>`;
      archive.files.set(relsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
    }
  }
  if (presSrc) presSrc.modernAuthorsPartPath = partPath;
  if (opts.debug) console.log(`[roundtrip] ${partPath} modern comment authors rewritten`);
}

function ensureCommentAuthorsPart(
  pres: Presentation,
  archive: MutableArchive,
  comments: import("@ppt/core").DeckComment[],
  opts: RoundTripOptions,
): void {
  if (!comments.length) return;
  const { authors } = buildCommentAuthors(comments);
  const presSrc = pres.__source as PresentationSource | undefined;
  const partPath = presSrc?.commentAuthorsPartPath ?? "ppt/commentAuthors.xml";
  archive.files.set(partPath, strToU8(renderCommentAuthorsXml(authors)));
  appendContentTypesOverride(archive, `/${partPath}`, CT_COMMENT_AUTHORS);

  const relsPath = "ppt/_rels/presentation.xml.rels";
  const relsBytes = archive.files.get(relsPath);
  const target = partPath.replace(/^ppt\//, "");
  if (relsBytes) {
    const xml = strFromU8(relsBytes);
    if (!xml.includes(`Type="${REL_TYPE_COMMENT_AUTHORS}"`)) {
      const used = new Set<string>();
      for (const m of xml.matchAll(/Id="([^"]+)"/g)) used.add(m[1]!);
      let n = 1;
      while (used.has(`rId${n}`)) n++;
      const rel = `<Relationship Id="rId${n}" Type="${REL_TYPE_COMMENT_AUTHORS}" Target="${target}"/>`;
      archive.files.set(relsPath, strToU8(xml.replace(/<\/Relationships>/, `${rel}</Relationships>`)));
    }
  }
  if (opts.debug) console.log(`[roundtrip] ${partPath} comment authors rewritten`);
}

function patchLayoutPart(
  layout: import("@ppt/core").SlideLayout,
  pres: Presentation,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const partPath = layout.__source?.partPath;
  if (!partPath) {
    if (opts.debug) console.warn(`[roundtrip] layout "${layout.id}" has no __source.partPath (newly added layout); skipped (addNewLayoutPart not implemented)`);
    return;
  }
  const bytes = archive.files.get(partPath);
  if (!bytes) return;
  const xmlText = strFromU8(bytes);
  const tree = parsePartCached(pres.__source?.files, partPath, xmlText);
  const before = JSON.stringify(tree);
  const root = findRootElement(tree, "sldLayout");
  if (!root) return;
  // 修复历史文件里的非枚举 type（sectionHead/pic）：不在 ST_SlideLayoutType 内 PowerPoint 会整 part 拒收。
  const rawType = getAttrs(root)["@_type"];
  if (rawType !== undefined && ooxmlSlideLayoutType(rawType) !== rawType) setAttr(root, "type", ooxmlSlideLayoutType(rawType));
  const cSld = findChildByLocal(getChildren(root), "cSld");
  if (!cSld) return;
  patchBackgroundIn(cSld, masterLayoutExportBg(layout.background, pres), layout.__source?.bgSnapshot, archive, partPath, opts, false, pres.size);
  const spTree = findChildByLocal(getChildren(cSld), "spTree");
  if (!spTree) return;
  patchSpTreeInPlace(spTree, layout.shapes, null, archive, partPath, opts);
  const after = JSON.stringify(tree);
  if (before === after) return;
  archive.files.set(partPath, strToU8(buildXml(tree)));
  if (opts.debug) console.log(`[roundtrip] layout "${layout.id}" patched`);
}

// master / layout 导出背景：主题未变（themeSnapshot 等值）→ 原样用 part 自己的
// background（与 bgSnapshot 等值 → patch 不 fire → 字节级保留）；主题被 AI/编辑器
// 改过 → 走 backgroundForThemeExport 的画布对齐逻辑。
function masterLayoutExportBg(partBackground: Paint | undefined, pres: Presentation): Paint | undefined {
  const source = pres.__source as PresentationSource | undefined;
  if (themeColorsFontsEqual(pres.theme, source?.themeSnapshot)) return partBackground;
  return backgroundForThemeExport(partBackground, pres);
}

function cloneFiles(src: Map<string, Uint8Array>): Map<string, Uint8Array> {
  const out = new Map<string, Uint8Array>();
  for (const [k, v] of src) {
    // 复制底层 buffer，避免 patch 阶段共享同一段 Uint8Array 被打包器原地修改。
    out.set(k, v.slice());
  }
  return out;
}

// ============================================================================
// slide XML patch
// ============================================================================

function patchSlideXml(
  tree: RawTree,
  slide: Slide,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  slideSize?: { width: number; height: number },
  slidePathByNumber?: (slideNumber: number) => string | undefined,
): void {
  // tree 顶部依次为 `<?xml?>` 指令、`<p:sld>` 根。
  const sldNode = findRootElement(tree, "sld");
  if (!sldNode) {
    if (opts.debug) console.warn(`[roundtrip] ${partPath} no <p:sld> root, skipped`);
    return;
  }
  const cSld = findChildByLocal(getChildren(sldNode), "cSld");
  if (!cSld) {
    if (opts.debug) console.warn(`[roundtrip] ${partPath} no <p:cSld>, skipped`);
    return;
  }
  // 阶段 N：背景对齐。AI 改主题（ApplyCustomThemeCmd）会改 slide.background，
  // 必须把新 background 写回 <p:cSld>/<p:bg>，否则保存出来的 PPTX 仍是原背景。
  // bgSnapshot 是 parser 解析时（含从 layout/master 继承的兜底）的快照，与当前
  // background 做 JSON 等值比较 → 相等则保留原 `<p:bg>` 字节（含"原本就没"
  // 的继承场景），不等则用 backgroundToXml 序列化后注入。
  patchBackgroundIn(cSld, slide.background, slide.__source?.bgSnapshot, archive, partPath, opts, isDirty(slide, "background"), slideSize);
  const spTree = findChildByLocal(getChildren(cSld), "spTree");
  if (!spTree) {
    if (opts.debug) console.warn(`[roundtrip] ${partPath} no <p:spTree>, skipped`);
    return;
  }
  // 内存模型的 shapes（合并所有 layer 的 main shapes，排除 master / layout 层）。
  const mainLayer = slide.layers.find((l) => l.id === "main") ?? slide.layers[slide.layers.length - 1];
  const memShapes = mainLayer ? mainLayer.shapes : [];
  const writtenSpIds = new Map<string, number>();
  // 新增的视频 / 音频 shape 需要补 p:video / p:audio 时序节点；hints 只进序列化副本，
  // 不回写 slide.ooxmlTiming（否则每保存一次内存模型就多一条指向写出编号的媒体节点，
  // 下次 from-scratch 导出会对同一媒体挂两条）。
  const mediaTimings: MediaTimingHint[] = [];
  patchSpTreeInPlace(spTree, memShapes, slide, archive, partPath, opts, slidePathByNumber, writtenSpIds, mediaTimings);
  // 阶段 N+1：动画 / 切换回写。编辑器动画面板改 slide.ooxmlTiming、切换面板改
  // slide.transition 后，之前 round-trip 只 patch cSld/spTree/bg，<p:timing> 与
  // <p:transition> 永远保留原字节 → **UI 里改了动画/切换，导出的 PPTX 仍是旧的**。
  // 这里用解析期快照做等值判定：未编辑 → 原字节级保留（幂等）；编辑过 → 用
  // serializeTiming / serializeTransition（与 parser 对称）重写对应子节点。
  // writtenSpIds 把新建 shape 的逻辑 id 对上这次分配的 cNvPr@id，避免时序 spid 仍写 sp_edit_ / sp_dg_。
  patchTransitionIn(sldNode, slide, partPath, archive, opts);
  patchTimingIn(sldNode, slide, partPath, archive, opts, writtenSpIds, mediaTimings);
  patchSlideShowIn(sldNode, slide, partPath, opts);
  patchCSldNameIn(cSld, slide);
  patchClrMapOvrIn(sldNode, slide);
  patchHfIn(sldNode, slide);
}

// CT_Slide 子元素顺序（ECMA-376 §19.3.1.38）：cSld → clrMapOvr → transition → timing → extLst。
// transition / timing 可能被 <mc:AlternateContent> 包裹（p14/p15 扩展切换），归类时向内看一层。
function sldTopLevelKind(node: RawNode): string | undefined {
  const tag = getTagName(node);
  if (!tag) return undefined;
  const local = localName(tag);
  if (local !== "AlternateContent") return local;
  for (const branch of getChildren(node)) {
    for (const inner of getChildren(branch)) {
      const t = getTagName(inner);
      if (!t) continue;
      const l = localName(t);
      if (l === "transition" || l === "timing") return l;
    }
  }
  return local;
}

// 把 <p:sld> 下的 transition / timing 子节点整体替换为 xml 序列化结果（xml 为空 → 仅删除）。
// 插入位置遵守 CT_Slide 顺序：新节点放在首个"应排在它之后"的兄弟之前，否则追加到末尾。
function replaceSldChild(sldNode: RawNode, kind: "clrMapOvr" | "transition" | "timing" | "hf", xml: string): void {
  const children = getChildren(sldNode);
  const filtered = children.filter((c) => sldTopLevelKind(c) !== kind);
  if (xml) {
    const nodes = parseFragmentAsChildren(xml);
    const mustFollow =
      kind === "clrMapOvr"
        ? ["transition", "timing", "hf", "extLst"]
        : kind === "transition"
          ? ["timing", "hf", "extLst"]
          : kind === "timing"
            ? ["hf", "extLst"]
            : ["extLst"];
    let insertAt = filtered.length;
    for (let i = 0; i < filtered.length; i++) {
      const k = sldTopLevelKind(filtered[i]!);
      if (k && mustFollow.includes(k)) {
        insertAt = i;
        break;
      }
    }
    filtered.splice(insertAt, 0, ...nodes);
  }
  setChildren(sldNode, filtered);
}

function hfEqual(a: Slide["hf"], b: HeaderFooterXml): boolean {
  const n = (v: boolean | undefined) => (v === undefined ? undefined : v ? 1 : 0);
  return n(a?.sldNum) === b.sldNum && n(a?.hdr) === b.hdr && n(a?.ftr) === b.ftr && n(a?.dt) === b.dt;
}

type HeaderFooterXml = { sldNum?: number; hdr?: number; ftr?: number; dt?: number };

function readRawHf(sldNode: RawNode): HeaderFooterXml | undefined {
  const node = findChildByLocal(getChildren(sldNode), "hf");
  if (!node) return undefined;
  const a = getAttrs(node);
  const bit = (k: string): number | undefined => {
    const v = a[`@_${k}`];
    if (v === undefined) return undefined;
    return v === "1" || v === "true" ? 1 : 0;
  };
  return { sldNum: bit("sldNum"), hdr: bit("hdr"), ftr: bit("ftr"), dt: bit("dt") };
}

function patchHfIn(sldNode: RawNode, slide: Slide): void {
  if (slide.hf === undefined) return;
  const existing = readRawHf(sldNode);
  if (existing && hfEqual(slide.hf, existing)) return;
  replaceSldChild(sldNode, "hf", hfToXml(slide.hf));
}

function patchSlideShowIn(sldNode: RawNode, slide: Slide, partPath: string, opts: RoundTripOptions): void {
  const snap = slide.__source?.showSnapshot;
  if (snap !== undefined || slide.show !== undefined) {
    const cur = slide.show;
    if (!(snap !== undefined && cur === snap)) {
      if (cur === false) setAttr(sldNode, "show", "0");
      else setAttr(sldNode, "show", undefined);
      if (opts.debug) console.info(`[roundtrip] ${partPath} patched sld@show → ${cur === false ? "0" : "(default)"}`);
    }
  }
  if (slide.showMasterSp === false) setAttr(sldNode, "showMasterSp", "0");
  else if (slide.showMasterSp === true) setAttr(sldNode, "showMasterSp", "1");
  if (slide.showMasterPhAnim === false) setAttr(sldNode, "showMasterPhAnim", "0");
  else if (slide.showMasterPhAnim === true) setAttr(sldNode, "showMasterPhAnim", "1");
}

function patchCSldNameIn(cSld: RawNode, slide: Slide): void {
  const n = slide.name?.trim();
  if (!n || /^Slide\s+\d+$/i.test(n)) return;
  setAttr(cSld, "name", n);
}

function patchClrMapOvrIn(sldNode: RawNode, slide: Slide): void {
  if (!slide.clrMapOverride) return;
  replaceSldChild(sldNode, "clrMapOvr", clrMapOvrXml(slide.clrMapOverride));
}

function patchTimingIn(
  sldNode: RawNode,
  slide: Slide,
  partPath: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
  writtenSpIds?: Map<string, number>,
  mediaTimings?: MediaTimingHint[],
): void {
  const snap = slide.__source?.timingSnapshot;
  const hasNewMedia = (mediaTimings?.length ?? 0) > 0;
  // 快照缺失（缓存恢复且 rebuildOriginsFromSource 失败）→ 无从判定是否编辑过，
  // 保守保留原字节（宁可丢一次动画编辑也不冒险把未编辑的复杂 timing 重写坏）。
  // 例外：这次新增了媒体 shape，必须重写才能带上 p:video / p:audio。
  if (snap === undefined && !hasNewMedia) return;
  const current = JSON.stringify(slide.ooxmlTiming ?? null);
  // 没编辑过就保留原字节——除非原字节本身是早期 serializer 写出的非标结构
  // （cTn@delay / 效果直挂 mainSeq），PowerPoint 读不出来，必须借这次保存修正。
  if (current === snap && !needsOoxmlNormalization(slide.ooxmlTiming) && !hasNewMedia) return;
  const media = new MediaTable();
  // 先 remap 再 merge：hints 里的 spid 已是写出的 cNvPr@id。
  let timingXml = serializeTiming(
    mergeMediaTiming(remapTimingSpids(slide.ooxmlTiming, writtenSpIds), mediaTimings),
    media,
  );
  if (media.list().length > 0) {
    timingXml = injectPartMedia(archive, partPath, media, timingXml);
  }
  replaceSldChild(sldNode, "timing", timingXml);
  if (opts.debug) console.log(`[roundtrip] ${partPath} <p:timing> rewritten (ooxmlTiming edited)`);
}

function patchTransitionIn(
  sldNode: RawNode,
  slide: Slide,
  partPath: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
): void {
  const snap = slide.__source?.transitionSnapshot;
  if (snap === undefined) return;
  const current = JSON.stringify(slide.transition ?? null);
  if (current === snap) return;
  const media = new MediaTable();
  let transitionXml = serializeTransition(slide.transition, media);
  if (media.list().length > 0) {
    transitionXml = injectPartMedia(archive, partPath, media, transitionXml);
  }
  replaceSldChild(sldNode, "transition", transitionXml);
  if (opts.debug) console.log(`[roundtrip] ${partPath} <p:transition> rewritten (transition edited)`);
}

function findRootElement(tree: RawTree, local: string): RawNode | undefined {
  for (const n of tree) {
    const tag = getTagName(n);
    if (tag && localName(tag) === local) return n;
  }
  return undefined;
}

// 在原 spTree 的 children 上做就地编辑，使其与 memShapes 对齐：
//   - cNvPr/@id 能匹配上的 raw shape → 按内存 shape 的字段做 patch（text/xfrm/...）
//   - cNvPr/@id 匹配不到（内存里已经删除） → 删除该 raw shape
//   - 内存里有但 raw 里没有（新增 shape） → 追加新生成的 raw shape
//   - 顺序：保留原序；新增的追加到末尾
//
// `<p:nvGrpSpPr>` / `<p:grpSpPr>` 这两个 spTree 的 housekeeping 节点必须保留。
function patchSpTreeInPlace(
  spTreeNode: RawNode,
  memShapes: Shape[],
  slide: Slide | null,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  slidePathByNumber?: (slideNumber: number) => string | undefined,
  writtenSpIds?: Map<string, number>,
  mediaTimingsOut?: MediaTimingHint[],
): void {
  const links = new PartLinkRegistry(archive, partPath, slidePathByNumber);
  const charts = new PartChartRegistry(archive, partPath, true);
  const diagrams = new PartDiagramRegistry(archive, partPath, true);
  const inks = new PartInkRegistry(archive, partPath, true);
  const embeddings = new PartOleRegistry(archive, partPath, true);
  const mediaTimings: MediaTimingHint[] = mediaTimingsOut ?? [];
  const children = getChildren(spTreeNode);
  const memById = indexShapesBySpId(memShapes);
  // 新 shape 的 cNvPr@id 分配器。上界要兼顾两边：(1) 内存中已有 sp_<n> id 的
  // shape（memById.keys()），(2) 原 raw XML 里**整棵 spTree（含 group 嵌套）**的
  // 所有 cNvPr@id —— 即使该 sp 已被删除（不在 memShapes 里），它原先占用的 id 仍
  // 可能比内存里所有 sp_<n> 都大；取号时必须避开，否则 PowerPoint 在同一 part 内
  // 出现重复 cNvPr@id 会报错。分配器下传到 group 子层（group 内新增子形状与顶层
  // 新增共用一个号段）。
  let maxId = 0;
  for (const id of memById.keys()) if (id > maxId) maxId = id;
  maxId = Math.max(maxId, maxCNvPrIdInSubtree(spTreeNode));
  const idAlloc: IdAlloc = { next: maxId + 1 };
  const seenIds = new Set<number>();
  const kept: RawTree = [];
  for (const child of children) {
    const tag = getTagName(child);
    if (!tag) continue;
    const local = localName(tag);
    if (local === "nvGrpSpPr" || local === "grpSpPr" || local === "extLst") {
      kept.push(child);
      continue;
    }
    if (local === "contentPart") {
      const spId = extractSpId(child);
      if (spId === undefined) {
        kept.push(child);
        continue;
      }
      const memShape = memById.get(spId);
      if (!memShape) continue;
      const inkDirty =
        memShape.kind === "path" &&
        (isDirty(memShape, "bbox") || isDirty(memShape, "transform") || isDirty(memShape, "stroke"));
      if (inkDirty) continue;
      seenIds.add(spId);
      kept.push(child);
      continue;
    }
    if (local === "sp" || local === "pic" || local === "grpSp" || local === "cxnSp" || local === "graphicFrame") {
      const spId = extractSpId(child);
      if (spId === undefined) {
        // 没有 cNvPr@id 的节点不知道怎么对齐到内存，保守保留以避免误删。
        kept.push(child);
        continue;
      }
      const memShape = memById.get(spId);
      if (!memShape) {
        // 该 sp 在内存模型中已被删除。
        if (opts.debug) console.log(`[roundtrip] ${partPath} drop sp id=${spId} (deleted in editor)`);
        continue;
      }
      seenIds.add(spId);
      patchShapeRawNode(child, memShape, slide, archive, partPath, opts, 1, false, undefined, idAlloc, links, charts, diagrams, inks, embeddings, mediaTimings, writtenSpIds);
      kept.push(child);
      continue;
    }
    // 其它节点（未来扩展）保守保留。
    kept.push(child);
  }
  // 追加新增 shapes。
  const newRaws: RawTree = [];
  for (const s of memShapes) {
    const spId = shapeOriginalSpId(s);
    if (spId !== undefined && seenIds.has(spId)) continue;
    // 内存里有 sp_<id> 但原 XML 树里找不到（理论上不该发生），按"新增"处理。
    const assignedId = spId ?? idAlloc.next++;
    const raw = shapeToRawNode(s, assignedId, archive, partPath, links, charts, diagrams, inks, embeddings, mediaTimings, writtenSpIds, idAlloc);
    if (raw) newRaws.push(raw);
    else if (opts.debug) console.warn(`[roundtrip] ${partPath} could not serialize new shape ${s.id}`);
  }
  // idempotent：当没有删除 / 新增 sp 时，保留原始 children 顺序 / 引用，
  // 避免对 `<p:spTree>` 自身做无谓的 setChildren 调用造成 JSON.stringify 差异。
  const removed = children.length - kept.length;
  if (removed === 0 && newRaws.length === 0) return;
  setChildren(spTreeNode, [...kept, ...newRaws]);
}

/** 递归扫整棵 raw 子树的 cNvPr@id 最大值（含 group 嵌套）——新 id 分配的安全下界。 */
function maxCNvPrIdInSubtree(node: RawNode): number {
  let max = 0;
  const own = extractSpId(node);
  if (own !== undefined && own > max) max = own;
  for (const child of getChildren(node)) {
    if (typeof child !== "object" || child === null) continue;
    const tag = getTagName(child);
    if (!tag) continue;
    max = Math.max(max, maxCNvPrIdInSubtree(child));
  }
  return max;
}

interface IdAlloc {
  next: number;
}

// 「内存 shape -> 原 XML cNvPr@id」的映射键：parser 给 sp 起的 id 是 `sp_<n>`，
// 编辑器新增的则用 `sp_edit_/sp_dup_/sp_img_/sp_grp_/sp_vid_/sp_aud_` 前缀
// （详见 editor.ts:genShapeId / commands.ts:GroupCmd）。所有编辑器 shape 都
// 以 `sp_` 开头，是 OOXML animation runtime 的硬约定（spTgt.spid 与 SceneNode.id
// 之间的转换都假设 `sp_<spid>`）。
function shapeOriginalSpId(shape: Shape): number | undefined {
  // 解析侧 parser 把 cNvPr@id 编为 `sp_<n>`；编辑器对解析的 shape 通常会包裹一层
  // group（id = `sp_<n>`），其 base 子形状叫 `sp_<n>_base`，文字子形状叫 `sp_<n>_text`。
  // 我们只用最外层 `sp_<n>` 来对齐到 raw XML 中的 `<p:sp>` 节点。
  const m = /^sp_(\d+)$/.exec(shape.id);
  if (m) return Number(m[1]);
  return undefined;
}

function indexShapesBySpId(shapes: Shape[]): Map<number, Shape> {
  const out = new Map<number, Shape>();
  for (const s of shapes) {
    const id = shapeOriginalSpId(s);
    if (id !== undefined) out.set(id, s);
  }
  return out;
}

function extractSpId(rawNode: RawNode): number | undefined {
  // 兼容 sp / pic / grpSp / cxnSp / graphicFrame / contentPart：cNvPr 嵌在 nv*Pr/cNvPr。
  for (const nvKey of ["nvSpPr", "nvPicPr", "nvGrpSpPr", "nvCxnSpPr", "nvGraphicFramePr", "nvContentPartPr"]) {
    const nv = findChildByLocal(getChildren(rawNode), nvKey);
    if (!nv) continue;
    const cNvPr = findChildByLocal(getChildren(nv), "cNvPr");
    if (!cNvPr) continue;
    const id = getAttrs(cNvPr)["@_id"];
    if (id === undefined) continue;
    const n = Number(id);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// ============================================================================
// 单个 shape 的 patch
// ============================================================================

function patchShapeRawNode(
  raw: RawNode,
  shape: Shape,
  _slide: Slide | null,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  parentOpacity: number = 1,
  /**
   * 进入 `<p:grpSp>` 子节点时为 true。group 内子 shape 的 `<a:xfrm>` 是在 group
   * 局部坐标系（chOff/chExt 决定）里，而内存里的 `view.bbox` 是 slide 坐标，二者
   * 不能直接互换。patchXfrmIn 没有"反算回 local 坐标"的能力，所以下钻 group
   * 时必须跳过 xfrm —— 否则没编辑过的 child 也会被写出错误坐标，下一次 parser
   * 又把它当 local + group transform 再放大一次，循环膨胀（典型现象：图片 bbox
   * 每轮翻 1500×+）。bbox 编辑仍由 from-scratch 路径处理（编辑器对 group 内子
   * shape 做 move/resize 时也会 mark 整个 group dirty，目前不会 round-trip）。
   */
  insideGroup: boolean = false,
  /**
   * 当前节点所处坐标系 → slide 绝对坐标的仿射（abs = off + local*scale）。
   * top-level 为 undefined（= 恒等，节点 xfrm 即绝对坐标）；group 内子节点为父 group
   * 的子坐标系 frame。用于 group 子 shape 的绝对 bbox ↔ local 反算。
   */
  parentFrame?: GroupFrameOrigin,
  /** part 级 cNvPr@id 分配器（group 内新增子形状取号用；见 patchSpTreeInPlace）。 */
  idAlloc?: IdAlloc,
  links?: LinkRegistrar,
  charts?: PartChartRegistry,
  diagrams?: PartDiagramRegistry,
  inks?: PartInkRegistry,
  embeddings?: OleEmbeddingRegistrar,
  mediaTimings?: MediaTimingHint[],
  writtenSpIds?: Map<string, number>,
): void {
  const tag = getTagName(raw);
  if (!tag) return;
  const local = localName(tag);
  // 内存模型可能把"原 sp"拆成 group(base + text)：text 信息在 group.children[*].kind==='text'。
  const effective = effectiveShapeForPatch(shape);

  if (local === "sp" || local === "cxnSp") {
    patchSpShape(raw, effective, archive, partPath, opts, parentOpacity, insideGroup, links);
  } else if (local === "pic") {
    patchPicShape(raw, effective, partPath, archive, opts, parentOpacity, insideGroup, links);
  } else if (local === "grpSp") {
    // group 自身只 patch xfrm；OOXML 没有 group 级 opacity，要保存"group 半透明"
    // 视觉就得递归到每个子 sp / pic 把 parentOpacity 乘进它们的 fill / stroke /
    // blip alpha 上。parser 端"sp + txBody"也会被展平成 group(base,text)，那种
    // 内部 group 的 children 不在原 raw 里 —— 这条递归只针对 raw 上是真 <p:grpSp>
    // 的场景（典型：用户 / AI 显式 Group 操作）。
    //
    // 注意：嵌套 group 的 xfrm/@off 使用**父 group 的 chOff/chExt 局部坐标系**，
    // 不能直接写 slide 绝对 bbox。和 sp/pic 一样，只在 top-level group 才 patch xfrm。
    patchGrpSpShape(raw, effective, partPath, opts, insideGroup, links, archive);
    if (shape.kind === "group" && Array.isArray(shape.children)) {
      // 与 patchSpShape / patchPicShape 一致：group.opacity 可能被入场动画压成 0 当作
      // "未入场前隐藏"，**绝不能**把它当成"用户改了 group 透明度"递归乘到子元素 alpha
      // 上 —— 否则保存后整个 group 的所有子图都 baked 成 alphaModFix amt=0，下次打开就
      // 是永久透明（且后续保存依然 0 → round-trip 持久化 bug）。snapshot 取解析时原值。
      const opSnap = shapeOrigin(shape)?.opacity;
      const userSetOpacity = isDirty(shape, "opacity");
      const ownOp = !userSetOpacity && opSnap !== undefined && shape.opacity === 0 && opSnap !== 0
        ? opSnap
        : (shape.opacity ?? 1);
      const nextParentOpacity = parentOpacity * ownOp;
      // 从**原始 grpSp 的 raw xfrm 字节**实时推导该 group 的子坐标系仿射（abs = off + local*scale），
      // 与 parentFrame 组合支持任意嵌套。供子 shape 把绝对 bbox 反算回 local 写回 xfrm。
      const childFrame = readRawGroupFrame(raw, parentFrame);
      patchGrpSpChildrenInPlace(raw, shape.children, archive, partPath, opts, nextParentOpacity, childFrame, idAlloc, links, charts, diagrams, inks, embeddings, mediaTimings, writtenSpIds);
    }
  } else if (local === "graphicFrame") {
    if (shape.kind === "group" && shape.tableMeta) {
      patchTableGraphicFrame(raw, shape, archive, partPath, opts, links);
    } else if (shape.kind === "chart") {
      patchChartGraphicFrame(raw, shape, archive, partPath, opts);
    }
    patchGraphicFrame(raw, effective, partPath, opts, links, archive);
  }
}

/**
 * 递归 patch `<p:grpSp>` 的 children。与 patchSpTreeInPlace 同构：
 *   - 跳过 nvGrpSpPr / grpSpPr / extLst housekeeping 节点（保留原位）
 *   - 按 cNvPr@id 与内存 group.children 对齐做字段级 patch
 *   - 内存里已删除的子形状 → 从 raw 中移除（之前保守不删，导出后"删掉的子形状
 *     还魂"）
 *   - 内存里新增的子形状（编辑器 sp_edit_* / AI dec_* 等无 sp_<n> id）→ 用
 *     shapeToRawNode 序列化后追加；其 xfrm 由 shapeToXml 按 slide 绝对坐标写出，
 *     必须再经 writeChildLocalXfrm 反算回 group 局部坐标（chOff/chExt 空间），
 *     否则位置会按 group 缩放错位。cNvPr@id 从 part 级分配器取号，保证全 part 唯一。
 *
 * parentOpacity 在这一层已经乘上 group.opacity，再下传到子 sp/pic 上。
 */
function patchGrpSpChildrenInPlace(
  grpSpNode: RawNode,
  memChildren: Shape[],
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  parentOpacity: number,
  groupFrame?: GroupFrameOrigin,
  idAlloc?: IdAlloc,
  links?: LinkRegistrar,
  charts?: PartChartRegistry,
  diagrams?: PartDiagramRegistry,
  inks?: PartInkRegistry,
  embeddings?: OleEmbeddingRegistrar,
  mediaTimings?: MediaTimingHint[],
  writtenSpIds?: Map<string, number>,
): void {
  const memById = indexShapesBySpId(memChildren);
  const seenIds = new Set<number>();
  const kept: RawTree = [];
  let removed = 0;
  for (const child of getChildren(grpSpNode)) {
    const tag = getTagName(child);
    if (!tag) continue;
    const local = localName(tag);
    if (local !== "sp" && local !== "pic" && local !== "grpSp" && local !== "cxnSp") {
      kept.push(child);
      continue;
    }
    const spId = extractSpId(child);
    if (spId === undefined) {
      kept.push(child);
      continue;
    }
    const memChild = memById.get(spId);
    if (!memChild) {
      // 该子形状在内存 group 里已被删除。
      removed++;
      if (opts.debug) console.log(`[roundtrip] ${partPath} drop group child id=${spId} (deleted in editor)`);
      continue;
    }
    seenIds.add(spId);
    // group 内子 shape 的 <a:xfrm> 是 group 局部坐标。仅当该 child 被命令显式标脏
    // （bbox / transform）且拿得到父 group 的解析期 frame 时，才把模型的 slide 绝对
    // bbox 反算回 local 写回 xfrm；否则保留原始字节（避免 patchShapeRawNode 注释里
    // 描述的"未编辑 child 被写错坐标 → 再解析又放大一轮"的循环膨胀）。
    if (groupFrame) writeChildLocalXfrm(child, local, memChild, groupFrame, partPath, opts);
    // insideGroup=true 跳过常规 xfrm 写入；fill / stroke / alphaModFix 仍按 slide 全局逻辑写。
    // parentFrame=groupFrame：嵌套 grpSp 子节点据此（再 compose 自身 raw xfrm）得到其子坐标系。
    patchShapeRawNode(child, memChild, null, archive, partPath, opts, parentOpacity, true, groupFrame, idAlloc, links, charts, diagrams, inks, embeddings, mediaTimings, writtenSpIds);
    kept.push(child);
  }
  // 追加内存里新增的子形状。
  const newRaws: RawTree = [];
  for (const c of memChildren) {
    const spId = shapeOriginalSpId(c);
    if (spId !== undefined && seenIds.has(spId)) continue;
    // 合成 group(base,text) 的 _base/_text 子形状不会以 group.children 成员身份
    // 出现在**真 grpSp** 的 memChildren 里（它们包在 sp_<n> 合成 group 内部，
    // 而合成 group 对齐的是 raw <p:sp>）；这里到达的都是真实新增。
    const assignedId = spId ?? idAlloc?.next;
    if (assignedId === undefined) {
      if (opts.debug) console.warn(`[roundtrip] ${partPath} no id allocator; skip new group child ${c.id}`);
      continue;
    }
    if (spId === undefined && idAlloc) idAlloc.next++;
    const raw = shapeToRawNode(c, assignedId, archive, partPath, links, charts, diagrams, inks, embeddings, mediaTimings, writtenSpIds, idAlloc);
    if (!raw) {
      if (opts.debug) console.warn(`[roundtrip] ${partPath} could not serialize new group child ${c.id}`);
      continue;
    }
    // shapeToXml 写的是 slide 绝对 xfrm → 反算成 group 局部坐标。
    // writeChildLocalXfrm 的"与 raw 差异比对"对新节点必然命中（abs != local，
    // 除非 frame 恒等 —— 此时写不写等价）。
    if (groupFrame) {
      const rawTag = getTagName(raw);
      if (rawTag) writeChildLocalXfrm(raw, localName(rawTag), c, groupFrame, partPath, opts);
    }
    newRaws.push(raw);
  }
  if (removed === 0 && newRaws.length === 0) return;
  setChildren(grpSpNode, [...kept, ...newRaws]);
}

// 从原始 grpSp 的 raw `<a:xfrm>`（off/ext/chOff/chExt）推导该 group 的"子 local → slide
// 绝对"仿射，并与 parentFrame 组合（支持嵌套）。与 parser readGroupFrame 正向公式对偶：
//   abs = off + local*scale,  scale = ext/chExt,  off 吸收 chOff*scale
// 单位为 px（EMU/9525），与模型 bbox 同坐标。
const EMU_PER_PX = 9525;
function emuToPx(emu: number): number {
  return emu / EMU_PER_PX;
}
function readRawGroupFrame(grpSpNode: RawNode, parentFrame?: GroupFrameOrigin): GroupFrameOrigin {
  const identity: GroupFrameOrigin = parentFrame ?? { offX: 0, offY: 0, scaleX: 1, scaleY: 1 };
  const grpSpPr = findChildByLocal(getChildren(grpSpNode), "grpSpPr");
  const xfrm = grpSpPr ? findChildByLocal(getChildren(grpSpPr), "xfrm") : undefined;
  if (!xfrm) return identity;
  const xc = getChildren(xfrm);
  const numOf = (n: RawNode | undefined, k: string): number => (n ? Number(getAttrs(n)[`@_${k}`] ?? 0) : 0);
  const off = findChildByLocal(xc, "off");
  const ext = findChildByLocal(xc, "ext");
  const chOff = findChildByLocal(xc, "chOff");
  const chExt = findChildByLocal(xc, "chExt");
  let ox = emuToPx(numOf(off, "x"));
  let oy = emuToPx(numOf(off, "y"));
  let ew = emuToPx(numOf(ext, "cx"));
  let eh = emuToPx(numOf(ext, "cy"));
  const cox = emuToPx(numOf(chOff, "x"));
  const coy = emuToPx(numOf(chOff, "y"));
  const cew = emuToPx(numOf(chExt, "cx"));
  const ceh = emuToPx(numOf(chExt, "cy"));
  if (parentFrame) {
    ew *= parentFrame.scaleX;
    eh *= parentFrame.scaleY;
    ox = parentFrame.offX + ox * parentFrame.scaleX;
    oy = parentFrame.offY + oy * parentFrame.scaleY;
  }
  const sx = cew > 0 ? ew / cew : 1;
  const sy = ceh > 0 ? eh / ceh : 1;
  return { offX: ox - cox * sx, offY: oy - coy * sy, scaleX: sx, scaleY: sy };
}

// 把被编辑过的 group 子 shape 的 slide 绝对 bbox 反算回 group 局部坐标后写回其
// <a:xfrm>。反向公式（对偶 parser readXfrm 的 abs = group.off + local*group.scale）：
//   local = (abs - off) / scale，  localExt = absExt / scale
// 仅在 child 自身 bbox / transform 脏时触发。frame 取自父 group 的原始 raw xfrm；纯平移
// 编辑（含父 group 整体平移）恒正确，父 group 被 resize 同时子又被单独编辑属罕见组合，
// 此处按常见场景处理。
function writeChildLocalXfrm(
  childRaw: RawNode,
  childLocal: string,
  memChild: Shape,
  frame: GroupFrameOrigin,
  partPath: string,
  opts: RoundTripOptions,
): void {
  const view = effectiveShapeForPatch(memChild);
  const propNode =
    childLocal === "grpSp"
      ? findChildByLocal(getChildren(childRaw), "grpSpPr")
      : childLocal === "graphicFrame"
        ? childRaw
        : findChildByLocal(getChildren(childRaw), "spPr");
  if (!propNode) return;
  const sx = frame.scaleX || 1;
  const sy = frame.scaleY || 1;
  const localBbox = {
    x: (view.bbox.x - frame.offX) / sx,
    y: (view.bbox.y - frame.offY) / sy,
    w: view.bbox.w / sx,
    h: view.bbox.h / sy,
  };
  let localMeta = view.meta;
  if (memChild.kind === "line") {
    localMeta = {
      ...memChild,
      x1: (memChild.x1 - frame.offX) / sx,
      y1: (memChild.y1 - frame.offY) / sy,
      x2: (memChild.x2 - frame.offX) / sx,
      y2: (memChild.y2 - frame.offY) / sy,
      bbox: localBbox,
    };
  }
  // 是否需要写回：命令侧标脏(bbox/transform) **或** 由模型反算出的 local 坐标与原始
  // raw `<a:xfrm>` 字节有实质差异（> 容差）。后者是「模型 != 解析期基线」在 group
  // 子坐标上的体现——raw 子 xfrm 字节即是 child 的几何 origin。缓存恢复后 __dirty
  // 丢失时，靠这条 raw 比对仍能识别"子 shape 被移动/缩放"，避免编辑被静默丢弃。
  //
  // 容差（CHILD_XFRM_EPS_EMU）防止历史"子坐标循环膨胀"bug：未编辑 child 反算出的
  // local 与 raw 完全一致(实测 0 噪声)，但留极小容差以吸收 scale!=1 时的浮点误差，
  // 远低于任何真实移动(≥1px=9525 emu)。
  if (
    !isDirty(view.meta, "bbox") &&
    !isDirty(view.meta, "transform") &&
    !(view.textHost && (isDirty(view.textHost, "bbox") || isDirty(view.textHost, "transform")))
  ) {
    if (!childXfrmDiffersFromRaw(propNode, localBbox, view.transform)) return;
  }
  patchXfrmIn(propNode, { ...view, bbox: localBbox, meta: localMeta }, partPath, opts);
}

// group 子 shape 反算出的 local 几何是否与原始 raw `<a:xfrm>` 有实质差异（> 容差）。
// 没有 xfrm（占位符继承）时返回 false：无 raw 基线可比，保守不写（与 patchXfrmIn 的
// !xfrm 早退一致）。
const CHILD_XFRM_EPS_EMU = 64; // ≈ 0.0067px，吸收浮点噪声；真实移动远大于此
// 占位符 bbox 与解析期基线的差异阈值（px）。> 此值才视作"被移动/缩放"→ 插入显式 xfrm。
// 0.5px 足以吸收继承解析的浮点噪声，又能捕获方向键 1px 微调等真实编辑。
const BBOX_EPS_PX = 0.5;
function rectClose(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number },
): boolean {
  return (
    Math.abs(a.x - b.x) <= BBOX_EPS_PX &&
    Math.abs(a.y - b.y) <= BBOX_EPS_PX &&
    Math.abs(a.w - b.w) <= BBOX_EPS_PX &&
    Math.abs(a.h - b.h) <= BBOX_EPS_PX
  );
}

/**
 * 合成 group 的文字半边是否被单独改过位置/尺寸。
 * 选择窗里的 "TextBox N text · text" 是 `_text`：移动/缩放只打在这一半，
 * 外层 group / `_base` 仍是解析期 bbox。边框写回 spPr 后若 xfrm 不跟着提升，
 * 保存出来的框就会落在旧坐标。
 *
 * transform 不能跟 bbox 绑在一起：解析后 rotation 挂在外层 group，`_text.transform`
 * 是 identity；一旦把 identity 写成 sp@xfrm 会把朝向清掉。
 */
function syntheticTextBboxDirty(
  group: Shape,
  text: Extract<Shape, { kind: "text" }> | undefined,
): boolean {
  if (!text) return false;
  if (isDirty(text, "bbox")) return true;
  const originBox = shapeOrigin(text)?.bbox;
  if (originBox) return !rectClose(text.bbox, originBox);
  // 缓存恢复丢 origin：txBox 的 textRect = 形状本身，bbox 分叉即用户改过框。
  // 自选图形的 textRect 本就可能小于形状 bbox，没有基线时不要误把内嵌文字区写成 xfrm。
  if (group.txBox || text.txBox) return !rectClose(text.bbox, group.bbox);
  return false;
}

function childXfrmDiffersFromRaw(
  propNode: RawNode,
  localBbox: { x: number; y: number; w: number; h: number },
  transform: Transform,
): boolean {
  const xfrm = findChildByLocal(getChildren(propNode), "xfrm");
  if (!xfrm) return false;
  const xfChildren = getChildren(xfrm);
  const off = findChildByLocal(xfChildren, "off");
  const ext = findChildByLocal(xfChildren, "ext");
  const oa = off ? getAttrs(off) : {};
  const ea = ext ? getAttrs(ext) : {};
  const xAttrs = getAttrs(xfrm);
  const dx = Math.abs(pxToEmu(localBbox.x) - Number(oa["@_x"] ?? 0));
  const dy = Math.abs(pxToEmu(localBbox.y) - Number(oa["@_y"] ?? 0));
  const dw = Math.abs(pxToEmu(Math.max(0, localBbox.w)) - Number(ea["@_cx"] ?? 0));
  const dh = Math.abs(pxToEmu(Math.max(0, localBbox.h)) - Number(ea["@_cy"] ?? 0));
  if (Math.max(dx, dy, dw, dh) > CHILD_XFRM_EPS_EMU) return true;
  // rot / flip 变化也算实质差异。
  const rot = Math.round(((transform.rotation ?? 0) % 360) * 60000);
  const flipH = (transform.scaleX ?? 1) < 0;
  const flipV = (transform.scaleY ?? 1) < 0;
  if ((xAttrs["@_rot"] ?? "") !== String(rot !== 0 ? rot : "")) return true;
  if ((xAttrs["@_flipH"] ?? "") !== (flipH ? "1" : "")) return true;
  if ((xAttrs["@_flipV"] ?? "") !== (flipV ? "1" : "")) return true;
  return false;
}

// 解析侧会把"sp + txBody"拆成一个 group：[base = sp 的图形, text = sp 的 txBody 文字]。
// 编辑器对文字 / 几何的修改通常落到这两个子形状上。这里把它们合并出"原 sp 的视图"，
// 便于 patcher 用统一字段（bbox, opacity, paragraphs, fill, ...）做 patch。
interface ShapeView {
  bbox: { x: number; y: number; w: number; h: number };
  transform: Transform;
  opacity: number;
  visible: boolean;
  paragraphs?: TextParagraph[];
  /** 合成 group(base,text) 的文字半边；bodyPr（vert / wrap / …）写回用。 */
  textHost?: Extract<Shape, { kind: "text" }>;
  fill?: Paint;
  fillSnapshot?: Paint;
  stroke?: import("@ppt/core").Stroke;
  strokeSnapshot?: import("@ppt/core").Stroke;
  // 解析期 bbox 基线。raw 无 <a:xfrm>（占位符继承几何）时，用它判断"位置/尺寸改没改"。
  bboxOrigin?: { x: number; y: number; w: number; h: number };
  // 占位符 / 锁定 / 旋转等元信息直接读最外层 group / sp 自身的字段。
  meta: Shape;
  /**
   * `<p:spPr>` 级几何属性（effectLst / scene3d / sp3d）的载体。
   *
   * 合成 group(base,text) 的两半都可能持有这些字段：
   *   - **解析**把原 sp 的 spPr 解进 **base 子形状**；
   *   - **编辑器命令**（SetShapeEffectsCmd / SetShape3DCmd 按 shape id 定位）改的是
   *     最外层 **group**。
   * 只看 group 会把解析来的阴影当成"没有效果"而整段删掉（带文字的自选图形保存后
   * 阴影 / 发光 / 三维全丢）；只看 base 又会让用户新加的效果写不出去。故按字段各取
   * 其一：group 上有值或被标脏 → 用 group，否则回落 base。
   */
  effectsCarrier: Shape;
  meta3DCarrier: Shape;
}

/** 合成 group(base,text) 场景下，某个 spPr 级字段应以哪一半为准。 */
function pickCarrier(group: Shape, base: Shape | undefined, field: "effects" | "meta3D"): Shape {
  if (!base) return group;
  if (isDirty(group, field)) return group;
  const own = (group as unknown as Record<string, unknown>)[field];
  if (Array.isArray(own) ? own.length > 0 : own !== undefined) return group;
  return base;
}

function isVisibleStroke(stroke: import("@ppt/core").Stroke | undefined): boolean {
  if (!stroke?.paint || stroke.paint.kind === "none") return false;
  return (stroke.width ?? 0) > 0;
}

function isVisibleFill(fill: Paint | undefined): boolean {
  return Boolean(fill && fill.kind !== "none");
}

/**
 * 选择窗里的 "TextBox N text · text" 是文字半边。用户改描边 / 填充时常打在
 * `_text` 上，几何半边 `_base` 仍是解析期的 noFill。写回 spPr 时要认这一半，
 * 否则保存后边框消失。缓存恢复会丢掉 __dirty，所以不能只看脏标记。
 */
function pickSyntheticSpPr<T>(
  field: "fill" | "stroke",
  base: Shape | undefined,
  text: Shape | undefined,
  visible: (v: T | undefined) => boolean,
): { value: T | undefined; snapshot: T | undefined } {
  const tVal = text ? (text as unknown as Record<string, T | undefined>)[field] : undefined;
  const bVal = base ? (base as unknown as Record<string, T | undefined>)[field] : undefined;
  const tSnap = text ? (shapeOrigin(text) as Record<string, T | undefined> | undefined)?.[field] : undefined;
  const bSnap = base ? (shapeOrigin(base) as Record<string, T | undefined> | undefined)?.[field] : undefined;
  if (isDirty(text, field) || (visible(tVal) && !visible(bVal))) {
    return { value: tVal, snapshot: tSnap };
  }
  return { value: bVal, snapshot: bSnap };
}

// ---- 统一脏判定（路线 C 的核心）-------------------------------------------
// dirty = 命令侧精确标记(__dirty) OR (模型值 != 解析期 origin 基线)。两者 OR：
//   - 命令明确标了脏 → 直接生效（覆盖 origin diff 的歧义，如 group 子坐标）；
//   - 没标 / 缓存恢复丢标记 → 回落到 origin diff，鲁棒不漏。
// 关键：未编辑（无标记 + 模型==origin）→ false → 保留原始字节，open→save 幂等。
function shapeOrigin(obj: unknown): ShapeOrigin | undefined {
  return getOrigin<ShapeOrigin>(obj);
}

function fieldDirty<T>(
  meta: unknown,
  field: DirtyField,
  modelVal: T,
  originVal: T | undefined,
  eq: (a: T, b: T | undefined) => boolean,
): boolean {
  if (isDirty(meta, field)) return true;
  return !eq(modelVal, originVal);
}

function effectiveShapeForPatch(s: Shape): ShapeView {
  if (s.kind === "group") {
    const base = s.children.find((c) => c.id === s.id + "_base") ?? s.children[0];
    const text = s.children.find((c): c is Shape & { kind: "text" } => c.kind === "text");
    // 选择窗里的 "TextBox N text · text" 是合成 group 的文字半边。用户对它做
    // 移动 / 缩放时脏标记和 bbox 都在 _text 上，外层 group 仍是解析期值 ——
    // 必须把半边的 bbox 提升到 sp 的 xfrm，否则保存后边框落在旧位置。
    // rotation 仍取外层 group：解析后旋转挂在 group 上，_text.transform 是 identity。
    const textBboxDirty = syntheticTextBboxDirty(s, text);
    const textXfDirty = !!text && isDirty(text, "transform");
    const fillPick = pickSyntheticSpPr<Paint>("fill", base, text, isVisibleFill);
    const strokePick = pickSyntheticSpPr<import("@ppt/core").Stroke>("stroke", base, text, isVisibleStroke);
    return {
      bbox: { ...(textBboxDirty ? text!.bbox : s.bbox) },
      transform: { ...(textXfDirty ? text!.transform : s.transform) },
      opacity: s.opacity,
      visible: s.visible,
      paragraphs: text?.paragraphs,
      textHost: text,
      fill: fillPick.value,
      fillSnapshot: fillPick.snapshot,
      stroke: strokePick.value,
      strokeSnapshot: strokePick.snapshot,
      // 合成 group(base,text) 的几何基线挂在 group 自身（parser 给 group 也记了 bbox origin）。
      bboxOrigin: shapeOrigin(s)?.bbox,
      meta: s,
      effectsCarrier: pickCarrier(s, base, "effects"),
      meta3DCarrier: pickCarrier(s, base, "meta3D"),
    };
  }
  const sObj = s as unknown;
  return {
    bbox: { ...s.bbox },
    transform: { ...s.transform },
    opacity: s.opacity,
    visible: s.visible,
    paragraphs: s.kind === "text" ? s.paragraphs : undefined,
    textHost: s.kind === "text" ? s : undefined,
    fill: (s as { fill?: Paint }).fill,
    fillSnapshot: shapeOrigin(sObj)?.fill,
    stroke: (s as { stroke?: import("@ppt/core").Stroke }).stroke,
    strokeSnapshot: shapeOrigin(sObj)?.stroke,
    bboxOrigin: shapeOrigin(sObj)?.bbox,
    meta: s,
    effectsCarrier: s,
    meta3DCarrier: s,
  };
}

function patchSpShape(
  raw: RawNode,
  view: ShapeView,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  parentOpacity: number = 1,
  insideGroup: boolean = false,
  links?: LinkRegistrar,
  charts?: PartChartRegistry,
): void {
  // 1) patch spPr / xfrm
  const spPr = findChildByLocal(getChildren(raw), "spPr");
  if (spPr) {
    if (!insideGroup) patchXfrmIn(spPr, view, partPath, opts);
    // 阶段 N：fill 回写。编辑器修改 solid/gradient/image/pattern fill（含 alpha）
    // 后，没有这条路径就只能写出 xfrm 变化，颜色/透明度被静默丢弃。
    // fill / stroke 仅在内存值（含累计 opacity）与 parser 解析时的快照不同时才回写，
    // 避免每次「打开即保存」都把 schemeClr 引用替换成 srgbClr。
    //
    // 这里 effOp 包括两部分：
    //   - 祖先 group 链累计 opacity（parentOpacity）
    //   - 当前 shape 自身的 opacity（ownOp）
    // 都要乘到 fill / stroke 的 paint alpha 上 —— OOXML 没有 shape / group 级 opacity 字段。
    //
    // 注意：parser 的 timing pass 会把"有 entrance 动画的整 shape"opacity 强行写成 0
    // 作为 runtime "入场前隐藏"。这条 runtime 状态如果直接被烘焙到 OOXML，就会让
    // 没编辑过的 shape 在保存后整片消失。用 __opacitySnapshot 区分：内存 opacity=0
    // 但 snapshot != 0 → 视作动画压入，按 snapshot 写。
    const opSnap = shapeOrigin(view.meta)?.opacity;
    const userSetOpacity = isDirty(view.meta, "opacity");
    const ownOp = !userSetOpacity && opSnap !== undefined && view.opacity === 0 && opSnap !== 0
      ? opSnap
      : (view.opacity ?? 1);
    const effOp = clampOp(parentOpacity * ownOp);
    if (view.fill !== undefined) {
      const desiredFill = applyOpacityToPaint(view.fill, effOp);
      const fillDirty =
        fieldDirty(view.meta, "fill", desiredFill, view.fillSnapshot, paintEqual) ||
        isDirty(view.textHost, "fill");
      if (desiredFill && fillDirty) {
        patchSpPrFillIn(spPr, desiredFill, archive, partPath, opts);
      }
    }
    if (view.stroke !== undefined) {
      const desiredStroke = applyOpacityToStroke(view.stroke, effOp);
      const strokeDirty =
        fieldDirty(view.meta, "stroke", desiredStroke, view.strokeSnapshot, strokeEqual) ||
        isDirty(view.textHost, "stroke");
      if (desiredStroke && strokeDirty) {
        patchSpPrStrokeIn(spPr, desiredStroke, opts, partPath);
      }
    }
    patchSpPrEffectsIn(spPr, view.effectsCarrier, opts, partPath);
    patchSpPr3DIn(spPr, view.meta3DCarrier, opts, partPath);
  }
  // 2) patch txBody（替换其 a:p 序列；bodyPr 在文字半边脏时同步 vert / wrap）
  if (view.paragraphs) {
    const txBody = findChildByLocal(getChildren(raw), "txBody");
    if (txBody) {
      const media = new MediaTable();
      patchTxBody(txBody, view.paragraphs, links, view.textHost, media);
      commitRawMediaEmbeds(archive, partPath, media, txBody);
    }
  }
  // 3) cNvPr 上的 hidden / name / hyperlink
  patchCNvPr(raw, view, partPath, opts, links, archive);
}

function clampOp(v: number): number {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

// 与 pptx-shapes.ts 内同名 helper 等价 —— 这里复制一份避免 round-trip 模块对
// pptx-shapes 内部函数的依赖耦合（fillToXml / strokeToXml 已经是公开 export）。
function applyOpacityToPaint(p: Paint | undefined, opacity: number): Paint | undefined {
  if (!p || opacity >= 1) return p;
  const mul = (a: number | undefined): number => clampOp((a ?? 1) * opacity);
  if (p.kind === "solid") return { ...p, alpha: mul(p.alpha) };
  if (p.kind === "linear" || p.kind === "radial") {
    const stops = Array.isArray(p.stops) ? p.stops : [];
    return { ...p, stops: stops.map((s) => ({ ...s, alpha: mul(s.alpha) })) };
  }
  if (p.kind === "pattern") return { ...p, fgAlpha: mul(p.fgAlpha), bgAlpha: mul(p.bgAlpha) };
  if (p.kind === "image") return { ...p, alpha: mul(p.alpha) };
  return p;
}

function applyOpacityToStroke(
  stroke: import("@ppt/core").Stroke | undefined,
  opacity: number,
): import("@ppt/core").Stroke | undefined {
  if (!stroke || opacity >= 1) return stroke;
  if (!stroke.paint || stroke.paint.kind === "none") return stroke;
  const next = applyOpacityToPaint(stroke.paint, opacity);
  if (!next) return stroke;
  return { ...stroke, paint: next };
}

// `<p:spPr>` 下已知 fill 子节点的本地名。任意时刻只能有其中一个。
const FILL_LOCAL_NAMES = new Set([
  "noFill",
  "solidFill",
  "gradFill",
  "blipFill",
  "pattFill",
  "grpFill",
]);

/**
 * 把内存中的 `Paint` 写回 `<p:spPr>` 的 fill 子节点。
 *
 * idempotent：先在「不改 archive」的前提下生成期望的 fill RawNode，与现存的 fill
 * 子节点做 JSON 比较；完全相同则不动 raw（保留 schemeClr 引用 / 注释等扩展节点）。
 * 不同时再正式注入新 fill（含 image fill 的 media + rels 写入）。
 *
 * 插入位置：fill 必须在 xfrm / prstGeom / custGeom 等几何节点之后；PowerPoint 实际
 * 接受任意位置，这里只要替换原 fill 节点的索引即可。原本无 fill 时追加到末尾。
 */
function patchSpPrFillIn(
  spPr: RawNode,
  fill: Paint,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
): void {
  // 1) 生成 desired fill XML（不挂 media，仅用于结构比较）。
  let probeXml: string;
  try {
    const probeMedia = new MediaTable();
    probeXml = fillToXml(fill, { media: probeMedia });
  } catch {
    return;
  }
  if (!probeXml || !probeXml.trim()) return;
  const desiredNode = parseFillFragment(probeXml);
  if (!desiredNode) return;

  // 2) 与现存 fill 子节点比较，相同则跳过（保留原始字节 / schemeClr 等扩展引用）。
  const children = getChildren(spPr);
  const existingIdx = children.findIndex((c) => {
    const tag = getTagName(c);
    return tag !== undefined && FILL_LOCAL_NAMES.has(localName(tag));
  });
  if (existingIdx >= 0) {
    const existingJson = JSON.stringify(children[existingIdx]);
    const desiredJson = JSON.stringify(desiredNode);
    if (existingJson === desiredJson) return;
  }

  // 3) 真正写入：image fill 走 ensureMediaFileName + 重写 r:embed；其它直接用 desiredNode。
  let newNode = desiredNode;
  if (fill.kind === "image") {
    const media = new MediaTable();
    let realXml = fillToXml(fill, { media });
    if (media.list().length > 0) {
      realXml = injectPartMedia(archive, partPath, media, realXml);
    }
    const parsed = parseFillFragment(realXml);
    if (!parsed) return;
    newNode = parsed;
  }

  const nextChildren: RawTree = [];
  let replaced = false;
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && FILL_LOCAL_NAMES.has(localName(tag))) {
      if (!replaced) {
        nextChildren.push(newNode);
        replaced = true;
      }
      continue;
    }
    nextChildren.push(c);
  }
  if (!replaced) nextChildren.push(newNode);
  setChildren(spPr, nextChildren);
  if (opts.debug) console.log(`[roundtrip] ${partPath} spPr fill patched (kind=${fill.kind})`);
}

/**
 * 把内存中的 `Stroke` 写回 `<p:spPr>` 的 `<a:ln>` 子节点。
 * idempotent：与现存 `<a:ln>` 结构做 JSON 比较，相同则跳过。
 *
 * stroke 为 undefined 时不动 raw（保留占位符继承）。当编辑器把 stroke 设为
 * 一个 `paint.kind === "none"` 或 width=0 的 Stroke 时表示"主动去掉描边"，
 * strokeToXml 会输出 `<a:ln w="0"><a:noFill/></a:ln>` 让 PowerPoint 显示无描边。
 */
function patchSpPrStrokeIn(
  spPr: RawNode,
  stroke: import("@ppt/core").Stroke,
  opts: RoundTripOptions,
  partPath: string,
): void {
  let xml: string;
  try {
    xml = strokeToXml(stroke);
  } catch {
    return;
  }
  if (!xml || !xml.trim()) return;
  const desired = parseFillFragment(xml);
  if (!desired) return;

  const children = getChildren(spPr);
  const existingIdx = children.findIndex((c) => {
    const tag = getTagName(c);
    return tag !== undefined && localName(tag) === "ln";
  });
  if (existingIdx >= 0) {
    if (JSON.stringify(children[existingIdx]) === JSON.stringify(desired)) return;
  }
  const next: RawTree = [];
  let replaced = false;
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "ln") {
      if (!replaced) {
        next.push(desired);
        replaced = true;
      }
      continue;
    }
    next.push(c);
  }
  if (!replaced) next.push(desired);
  setChildren(spPr, next);
  if (opts.debug) console.log(`[roundtrip] ${partPath} spPr stroke patched`);
}

/** effects 列表等值比较（顺序敏感；字段全是 JSON 可序列化标量）。 */
function effectsEqual(
  a: import("@ppt/core").ShapeEffect[],
  b: import("@ppt/core").ShapeEffect[],
): boolean {
  if (a.length !== b.length) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}

function patchSpPrEffectsIn(
  spPr: RawNode,
  shape: Shape,
  opts: RoundTripOptions,
  partPath: string,
): void {
  const effects = collectShapeEffectsForWrite(shape);
  // 未编辑 → 保留 raw `<a:effectLst>` 原字节。这一步不能省：`shape.effects` 里同时装着
  // 显式 effectLst 和 `<p:style>/<a:effectRef>` 继承来的主题效果，无差别写出会把继承效果
  // 烘焙进 spPr（切主题不再跟随），并把 schemeClr 阴影降级成 srgbClr。
  const originEffects = shapeOrigin(shape)?.effects;
  if (!isDirty(shape, "effects") && originEffects !== undefined && effectsEqual(effects, originEffects)) {
    return;
  }
  const desiredXml = effectsToXml(effects);
  const children = getChildren(spPr);
  const existingIdx = children.findIndex((c) => {
    const tag = getTagName(c);
    return tag !== undefined && localName(tag) === "effectLst";
  });
  if (!desiredXml) {
    if (existingIdx < 0) return;
    const next = children.filter((_, i) => i !== existingIdx);
    setChildren(spPr, next);
    if (opts.debug) console.log(`[roundtrip] ${partPath} spPr effectLst cleared`);
    return;
  }
  const desired = parseFillFragment(desiredXml);
  if (!desired) return;
  if (existingIdx >= 0 && JSON.stringify(children[existingIdx]) === JSON.stringify(desired)) return;
  const next: RawTree = [];
  let replaced = false;
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "effectLst") {
      if (!replaced) {
        next.push(desired);
        replaced = true;
      }
      continue;
    }
    next.push(c);
  }
  if (!replaced) next.push(desired);
  setChildren(spPr, next);
  if (opts.debug) console.log(`[roundtrip] ${partPath} spPr effectLst patched`);
}

function patchTableGraphicFrame(
  raw: RawNode,
  g: GroupShape,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  links?: LinkRegistrar,
): void {
  const graphic = findChildByLocal(getChildren(raw), "graphic");
  if (!graphic) return;
  const graphicData = findChildByLocal(getChildren(graphic), "graphicData");
  if (!graphicData) return;
  const tbl = findChildByLocal(getChildren(graphicData), "tbl");
  const rows = g.tableMeta?.rows ?? 0;
  const cols = g.tableMeta?.cols ?? 0;
  // 早期 serializer 写出的表：tcPr 排在 txBody 前、边线名 lnTlBr/lnBlTr —— 不合 §21.1.3.16/17，
  // PowerPoint 会拒收整张表。即使这次没编辑表格，也借保存机会整张重写。
  const structureChanged = tableStructureChanged(tbl, g, rows, cols) || tableCellOrderBroken(tbl);
  const dirty = tableContentDirty(g);
  if (!dirty && !structureChanged) return;

  const ctx: ShapeCtx = { media: makeMediaTable(), spIdCounter: { next: 2 }, ...(links ? { links } : {}) };
  if (structureChanged || !tbl || tableVisualDirty(g)) {
    let tblXml: string;
    try {
      tblXml = tableTblXml(g, ctx);
    } catch {
      return;
    }
    const tblNode = parseFillFragment(tblXml);
    if (!tblNode) return;
    const children = getChildren(graphicData);
    const next = children.filter((c) => localName(getTagName(c) ?? "") !== "tbl");
    next.push(tblNode);
    setChildren(graphicData, next);
    if (opts.debug) console.log(`[roundtrip] ${partPath} table tbl rewritten`);
    return;
  }

  const trs = findAllChildrenByLocal(getChildren(tbl), "tr");
  const media = new MediaTable();
  for (let r = 0; r < rows; r++) {
    const tcs = findAllChildrenByLocal(getChildren(trs[r]!), "tc");
    for (let c = 0; c < cols; c++) {
      const cell = g.children[r * cols + c];
      if (!cell || cell.kind !== "text") continue;
      if (!isDirty(cell, "text") && !isDirty(cell, "textStyle") && !isDirty(cell, "paragraph")) continue;
      const tc = tcs[c];
      if (!tc) continue;
      const txBody = findChildByLocal(getChildren(tc), "txBody");
      if (!txBody) {
        tblXmlFallback(g, ctx, graphicData);
        return;
      }
      patchTxBody(txBody, cell.paragraphs, links, cell, media);
    }
  }
  commitRawMediaEmbeds(archive, partPath, media, tbl);
  if (opts.debug) console.log(`[roundtrip] ${partPath} table cell txBody patched`);
}

function tblXmlFallback(g: GroupShape, ctx: ShapeCtx, graphicData: RawNode): void {
  const tblXml = tableTblXml(g, ctx);
  const tblNode = parseFillFragment(tblXml);
  if (!tblNode) return;
  const children = getChildren(graphicData);
  const next = children.filter((c) => localName(getTagName(c) ?? "") !== "tbl");
  next.push(tblNode);
  setChildren(graphicData, next);
}

function tableCellOrderBroken(tbl: RawNode | undefined): boolean {
  if (!tbl) return false;
  for (const tr of findAllChildrenByLocal(getChildren(tbl), "tr")) {
    for (const tc of findAllChildrenByLocal(getChildren(tr), "tc")) {
      const names = getChildren(tc).map((c) => localName(getTagName(c) ?? ""));
      const txBodyAt = names.indexOf("txBody");
      const tcPrAt = names.indexOf("tcPr");
      if (txBodyAt >= 0 && tcPrAt >= 0 && tcPrAt < txBodyAt) return true;
      const tcPr = tcPrAt >= 0 ? getChildren(tc)[tcPrAt] : undefined;
      if (tcPr && getChildren(tcPr).some((c) => /^ln(TlBr|BlTr)$/.test(localName(getTagName(c) ?? "")))) return true;
    }
  }
  return false;
}

function tableStructureChanged(tbl: RawNode | undefined, g: GroupShape, rows: number, cols: number): boolean {
  if (!tbl || rows < 1 || cols < 1) return true;
  if (g.children.length !== rows * cols) return true;
  const trs = findAllChildrenByLocal(getChildren(tbl), "tr");
  if (trs.length !== rows) return true;
  for (const tr of trs) {
    if (findAllChildrenByLocal(getChildren(tr), "tc").length !== cols) return true;
  }
  return false;
}

function tableVisualDirty(g: GroupShape): boolean {
  if (isDirty(g, "bbox") || isDirty(g, "fill") || isDirty(g, "stroke")) return true;
  for (const c of g.children) {
    if (isDirty(c, "fill") || isDirty(c, "stroke") || isDirty(c, "bbox")) return true;
  }
  return false;
}

function tableContentDirty(g: GroupShape): boolean {
  if (isDirty(g, "bbox") || isDirty(g, "text") || isDirty(g, "paragraph") || isDirty(g, "fill")) return true;
  for (const c of g.children) {
    if (
      isDirty(c, "text") ||
      isDirty(c, "textStyle") ||
      isDirty(c, "paragraph") ||
      isDirty(c, "fill") ||
      isDirty(c, "stroke") ||
      isDirty(c, "bbox")
    ) {
      return true;
    }
  }
  return false;
}

function parseFillFragment(xml: string): RawNode | undefined {
  const wrapped =
    `<__root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
    xml +
    `</__root>`;
  let tree: RawTree;
  try {
    tree = parseFragmentAsChildren(wrapped);
  } catch {
    return undefined;
  }
  if (!tree.length) return undefined;
  const wrapper = tree[0]!;
  if (getTagName(wrapper) !== "__root") return undefined;
  const inner = getChildren(wrapper);
  return inner[0];
}

function patchPicShape(
  raw: RawNode,
  view: ShapeView,
  partPath: string,
  archive: MutableArchive,
  opts: RoundTripOptions,
  parentOpacity: number = 1,
  insideGroup: boolean = false,
  links?: LinkRegistrar,
  charts?: PartChartRegistry,
): void {
  const spPr = findChildByLocal(getChildren(raw), "spPr");
  if (spPr && !insideGroup) patchXfrmIn(spPr, view, partPath, opts);
  if (spPr) patchSpPrEffectsIn(spPr, view.effectsCarrier, opts, partPath);
  if (spPr) patchSpPr3DIn(spPr, view.meta3DCarrier, opts, partPath);
  patchCNvPr(raw, view, partPath, opts, links, archive);
  if (view.meta.kind === "image" && view.meta.src) {
    // 仅在 src 相对 parse 时快照确有变化时才回写 blip / rel —— 否则 data:URL 的
    // 字符串自比较虽相同但每次写入都会通过 ensureMediaFileName 新建一份媒体文件，
    // 导致每次 open-save 都让 ppt/media 翻倍、_rels 永远脏。
    const srcSnapshot = shapeOrigin(view.meta)?.src;
    if (isDirty(view.meta, "src") || srcSnapshot === undefined || srcSnapshot !== view.meta.src) {
      patchPicImageSrc(raw, view.meta.src, archive, partPath);
    }
  }
  // 把 shape.opacity（含祖先 group 链累计）烘焙进 <a:blip><a:alphaModFix amt=…/>。
  // OOXML 没有 pic 级 opacity 字段，必须通过 alphaModFix 表达；之前 round-trip 完全
  // 漏写这一通道，用户对 image shape 调透明度保存后被丢。
  //
  // 关键陷阱：parse.ts 在处理 timing 时会把"有 entrance 动画的整 shape"opacity 强行
  // 改为 0（runtime 模拟"入场前隐藏"）。如果直接以 view.opacity 烘焙，没编辑过的图
  // 也会被写出 amt="0"，下次解析时又被认成"用户改了"，造成永远脏。
  // 解决：用 parser 留下的 __opacitySnapshot 作为"实际 OOXML opacity"基线，
  //   - 内存 opacity == snapshot → 用户没改 → 用 snapshot 作为 effOp 源头
  //   - 否则 → 用户真的改了 → 用 view.opacity
  const ownOpSnapshot = shapeOrigin(view.meta)?.opacity;
  const ownOpPic = !isDirty(view.meta, "opacity") && ownOpSnapshot !== undefined && view.opacity === 0 && ownOpSnapshot !== 0
    ? ownOpSnapshot
    : (view.opacity ?? 1);
  const effOp = clampOp(parentOpacity * ownOpPic);
  // 仅在 effOp < 1（或 raw 上已有 alphaModFix）时才动 blip 节点，避免对 opacity=1 的
  // 普通图片触发无谓的 part 重写（保留原 <a:blip> 上可能存在的 <a:duotone> / <a:lum> /
  // 扩展节点字节序）。
  if (effOp < 1) patchPicBlipAlpha(raw, effOp);
  else removePicBlipAlphaIfNeeded(raw);
}

/**
 * 当 effOp >= 1 但 raw 上已经存在 `<a:alphaModFix>`（来自原文件 / 上一次保存的烘焙）
 * 时，移除它；其它 case 不动。和 patchPicBlipAlpha 合在一起保证：
 *   - opacity < 1：blip 上必有 alphaModFix amt=effOp*100000
 *   - opacity >= 1：blip 上没有 alphaModFix
 */
function removePicBlipAlphaIfNeeded(raw: RawNode): void {
  const blipFill = findChildByLocal(getChildren(raw), "blipFill");
  if (!blipFill) return;
  const blip = findChildByLocal(getChildren(blipFill), "blip");
  if (!blip) return;
  const children = getChildren(blip);
  let foundIdx = -1;
  for (let i = 0; i < children.length; i++) {
    const t = getTagName(children[i]!);
    if (t && localName(t) === "alphaModFix") { foundIdx = i; break; }
  }
  if (foundIdx < 0) return;
  setChildren(blip, children.filter((_, i) => i !== foundIdx));
}

/**
 * 在 `<p:blipFill><a:blip>` 上同步 `<a:alphaModFix>`。effOp >= 1 时移除该子节点，
 * effOp < 1 时 upsert 一个新的（amt = round(effOp * 100000)）。其余 `<a:duotone>`
 * 等扩展节点保留不动，避免误删用户原有颜色调整。
 */
function patchPicBlipAlpha(raw: RawNode, effOp: number): void {
  const blipFill = findChildByLocal(getChildren(raw), "blipFill");
  if (!blipFill) return;
  const blip = findChildByLocal(getChildren(blipFill), "blip");
  if (!blip) return;
  const children = getChildren(blip);
  const wantPresent = effOp < 1;
  const wantAmt = wantPresent ? String(Math.round(effOp * 100000)) : undefined;
  let foundIdx = -1;
  for (let i = 0; i < children.length; i++) {
    const t = getTagName(children[i]!);
    if (t && localName(t) === "alphaModFix") { foundIdx = i; break; }
  }
  if (wantPresent) {
    const node: RawNode = { "a:alphaModFix": [], ":@": { "@_amt": wantAmt! } };
    if (foundIdx >= 0) {
      // idempotent：amt 相同就不动
      const existing = children[foundIdx]!;
      const existingAmt = getAttrs(existing)["@_amt"];
      if (existingAmt === wantAmt) return;
      const next = [...children];
      next[foundIdx] = node;
      setChildren(blip, next);
    } else {
      setChildren(blip, [...children, node]);
    }
  } else {
    if (foundIdx < 0) return; // already absent
    const next = children.filter((_, i) => i !== foundIdx);
    setChildren(blip, next);
  }
}

function patchPicImageSrc(raw: RawNode, src: string, archive: MutableArchive, partPath: string): void {
  const blipFill = findChildByLocal(getChildren(raw), "blipFill");
  if (!blipFill) return;
  const blip = findChildByLocal(getChildren(blipFill), "blip");
  if (!blip) return;
  try {
    const attrs = getAttrs(blip);
    const existingRelId = attrs["@_r:embed"] ?? attrs["@_embed"] ?? attrs["@_r:link"] ?? attrs["@_link"];
    if (isExternalMediaSrc(src)) {
      let relId = existingRelId;
      if (existingRelId) {
        updatePartExternalRelTarget(archive, partPath, existingRelId, src);
      } else {
        relId = appendPartExternalRel(archive, partPath, src);
      }
      setAttr(blip, "r:embed", undefined);
      setAttr(blip, "embed", undefined);
      setAttr(blip, "r:link", relId);
      return;
    }
    const fileName = ensureMediaFileName(archive, src);
    if (existingRelId) {
      updatePartImageRelTarget(archive, partPath, existingRelId, fileName);
      setAttr(blip, "r:embed", existingRelId);
    } else {
      const relId = appendPartImageRel(archive, partPath, fileName);
      setAttr(blip, "r:embed", relId);
    }
    setAttr(blip, "r:link", undefined);
    setAttr(blip, "link", undefined);
  } catch {
    // 解码失败时保留原 blip 引用，避免写出损坏 rel。
  }
}

function patchGrpSpShape(
  raw: RawNode,
  view: ShapeView,
  partPath: string,
  opts: RoundTripOptions,
  insideGroup: boolean = false,
  links?: LinkRegistrar,
  archive?: MutableArchive,
): void {
  const grpSpPr = findChildByLocal(getChildren(raw), "grpSpPr");
  if (grpSpPr && !insideGroup) patchXfrmIn(grpSpPr, view, partPath, opts);
  patchCNvPr(raw, view, partPath, opts, links, archive);
}

function patchGraphicFrame(
  raw: RawNode,
  view: ShapeView,
  partPath: string,
  opts: RoundTripOptions,
  links?: LinkRegistrar,
  archive?: MutableArchive,
): void {
  // graphicFrame 的几何用 xfrm 直接挂在 graphicFrame 下（不在 spPr 内）。
  patchXfrmIn(raw, view, partPath, opts);
  patchCNvPr(raw, view, partPath, opts, links, archive);
}

// 在 cNvPr 上同步 name / hidden（visible=false → hidden="1"）及 shape 级超链接。
// idempotent：仅在新旧值不同时才写入。
function patchCNvPr(
  raw: RawNode,
  view: ShapeView,
  partPath: string,
  _opts: RoundTripOptions,
  links?: LinkRegistrar,
  archive?: MutableArchive,
): void {
  for (const nvKey of ["nvSpPr", "nvPicPr", "nvGrpSpPr", "nvCxnSpPr", "nvGraphicFramePr"]) {
    const nv = findChildByLocal(getChildren(raw), nvKey);
    if (!nv) continue;
    const cNvPr = findChildByLocal(getChildren(nv), "cNvPr");
    if (!cNvPr) continue;
    const attrs = getAttrs(cNvPr);
    if (view.meta.name && attrs["@_name"] !== view.meta.name) setAttr(cNvPr, "name", view.meta.name);
    const wantHidden = view.visible ? undefined : "1";
    const curHidden = attrs["@_hidden"] ?? undefined;
    if (wantHidden !== curHidden) setAttr(cNvPr, "hidden", wantHidden);
    const click = view.meta.hyperlink ?? view.textHost?.hyperlink;
    const hover = view.meta.hoverLink ?? view.textHost?.hoverLink;
    const media = new MediaTable();
    if (click) {
      const node = hlinkRawNode(click, "a:hlinkClick", links, media);
      if (node) replaceOrInsertChild(cNvPr, "hlinkClick", node);
    } else {
      removeChildByLocal(cNvPr, "hlinkClick");
    }
    if (hover) {
      const node = hlinkRawNode(hover, "a:hlinkHover", links, media);
      if (node) replaceOrInsertChild(cNvPr, "hlinkHover", node);
    } else {
      removeChildByLocal(cNvPr, "hlinkHover");
    }
    if (archive && media.list().length > 0) commitRawMediaEmbeds(archive, partPath, media, cNvPr);
    return;
  }
}

// 在 spPr / grpSpPr 中替换 xfrm 子节点。原 xfrm 上其它属性（chOff/chExt for group）
// 保留；只动 off/ext/rot/flipH/flipV。
// idempotent：当新值与原值字节级一致时，**不改动** raw 节点，避免把未修改的 sp
// 也标记为 dirty 引发不必要的 part 重写。
function patchXfrmIn(propNode: RawNode, view: ShapeView, _partPath: string, _opts: RoundTripOptions): void {
  const propChildren = getChildren(propNode);
  let xfrm = findChildByLocal(propChildren, "xfrm");
  const isGroup = localName(getTagName(propNode) ?? "") === "grpSpPr";
  let x: number;
  let y: number;
  let w: number;
  let h: number;
  let rot: number;
  let flipH: boolean;
  let flipV: boolean;
  if (!isGroup && view.meta.kind === "line") {
    const g = lineXfrmFromEndpoints(view.meta.x1, view.meta.y1, view.meta.x2, view.meta.y2, view.transform);
    x = pxToEmu(g.x);
    y = pxToEmu(g.y);
    w = pxToEmu(Math.max(0, g.w));
    h = pxToEmu(Math.max(0, g.h));
    rot = g.rot;
    flipH = g.flipH;
    flipV = g.flipV;
  } else {
    x = pxToEmu(view.bbox.x);
    y = pxToEmu(view.bbox.y);
    w = pxToEmu(Math.max(0, view.bbox.w));
    h = pxToEmu(Math.max(0, view.bbox.h));
    rot = Math.round(((view.transform.rotation ?? 0) % 360) * 60000);
    flipH = (view.transform.scaleX ?? 1) < 0;
    flipV = (view.transform.scaleY ?? 1) < 0;
  }
  // group 的 chOff/chExt 是组合坐标系，需要从内存中重新计算才能正确支持移动 / 缩放
  // group。这是 ECMA-376 §20.1.7.5 grpSpPr/xfrm 必备的内层坐标系定义。
  // 对**没有改动**过的 group，我们想保留原有 chOff/chExt 字节；对**改动**过的 group，
  // 应该把 chOff/chExt 对齐到新的 off/ext（最简单的策略：让 chOff/chExt = off/ext，
  // 等价于"组合内坐标 = 屏幕坐标"，与 editor 内的 translate / rescale 行为一致）。
  // 这里先判断 group 自身是否「整体未变」，未变则保留 chOff/chExt 不动。
  if (!xfrm) {
    // raw 没有 xfrm 子节点 → 该 sp 几何完全继承自占位符（master / layout 的 <p:ph>）。
    // 默认**保留继承**（不写显式 xfrm），否则会破坏"在 master/layout 改占位符尺寸时
    // 该 sp 跟随"的能力，也会污染纯"解析-写回"的 round-trip。
    //
    // 但用户确实移动/缩放过占位符时**必须**写回，否则导出看不到改动（典型：拖动标题）。
    // 判定 = 命令标脏(bbox/transform) OR (有 bbox 基线 && 模型 bbox 与基线有实质差异)。
    // 后者让缓存恢复（__dirty 丢失）后仍能识别——占位符没有 raw xfrm 字节可比，bbox
    // origin 就是它的几何基线。无基线（undefined）时保守保留继承。
    const movedByCmd = isDirty(view.meta, "bbox") || isDirty(view.meta, "transform");
    const ob = view.bboxOrigin;
    const movedVsOrigin = ob !== undefined && (
      Math.abs(view.bbox.x - ob.x) > BBOX_EPS_PX ||
      Math.abs(view.bbox.y - ob.y) > BBOX_EPS_PX ||
      Math.abs(view.bbox.w - ob.w) > BBOX_EPS_PX ||
      Math.abs(view.bbox.h - ob.h) > BBOX_EPS_PX
    );
    if (!movedByCmd && !movedVsOrigin) return;
    // 插入显式 <a:xfrm>，置于 propNode 子节点首位（OOXML schema：xfrm 必须在 prstGeom/
    // 几何之前）。group 的 grpSpPr 也加 chOff/chExt（= off/ext，子坐标=屏幕坐标）。
    const off: RawNode = { "a:off": [], ":@": { "@_x": String(x), "@_y": String(y) } };
    const ext: RawNode = { "a:ext": [], ":@": { "@_cx": String(w), "@_cy": String(h) } };
    const xfrmChildren: RawTree = [off, ext];
    if (isGroup) {
      xfrmChildren.push({ "a:chOff": [], ":@": { "@_x": String(x), "@_y": String(y) } });
      xfrmChildren.push({ "a:chExt": [], ":@": { "@_cx": String(w), "@_cy": String(h) } });
    }
    const xfrmAttrs: Record<string, string> = {};
    if (rot !== 0) xfrmAttrs["@_rot"] = String(rot);
    if (flipH) xfrmAttrs["@_flipH"] = "1";
    if (flipV) xfrmAttrs["@_flipV"] = "1";
    const newXfrm: RawNode = Object.keys(xfrmAttrs).length > 0
      ? { "a:xfrm": xfrmChildren, ":@": xfrmAttrs }
      : { "a:xfrm": xfrmChildren };
    setChildren(propNode, [newXfrm, ...propChildren]);
    return;
  }
  // 已有 xfrm：比较新旧值，相同则不动。
  const oldAttrs = getAttrs(xfrm);
  const oldChildren = getChildren(xfrm);
  const oldOff = findChildByLocal(oldChildren, "off");
  const oldExt = findChildByLocal(oldChildren, "ext");
  const oldOffA = oldOff ? getAttrs(oldOff) : {};
  const oldExtA = oldExt ? getAttrs(oldExt) : {};
  const sameRot = (oldAttrs["@_rot"] ?? "") === String(rot !== 0 ? rot : "");
  const sameFlipH = (oldAttrs["@_flipH"] ?? "") === (flipH ? "1" : "");
  const sameFlipV = (oldAttrs["@_flipV"] ?? "") === (flipV ? "1" : "");
  const sameOff = oldOffA["@_x"] === String(x) && oldOffA["@_y"] === String(y);
  const sameExt = oldExtA["@_cx"] === String(w) && oldExtA["@_cy"] === String(h);
  if (sameRot && sameFlipH && sameFlipV && sameOff && sameExt) {
    // 未改动 → 不动 raw。保留原始 chOff/chExt / 其它扩展属性。
    return;
  }
  // 重置 xfrm 的属性 + 子节点。
  // group 被移动/缩放后必须把 chOff/chExt 对齐到 off/ext（子坐标 = 屏幕坐标）。
  // 旧实现保留原始 chOff 却改写 off，WPS 对 off≠chOff 的组合坐标系会把子文本
  // 框画到错误位置、甚至看起来像文字方向错了。
  const preservedChildren: RawTree = [];
  if (isGroup) {
    preservedChildren.push({ "a:chOff": [], ":@": { "@_x": String(x), "@_y": String(y) } });
    preservedChildren.push({ "a:chExt": [], ":@": { "@_cx": String(w), "@_cy": String(h) } });
  }
  // 写属性。
  setAttr(xfrm, "rot", rot !== 0 ? rot : undefined);
  setAttr(xfrm, "flipH", flipH ? "1" : undefined);
  setAttr(xfrm, "flipV", flipV ? "1" : undefined);
  // 重建子节点：a:off, a:ext, [chOff, chExt for group]。
  const off: RawNode = { "a:off": [], ":@": { "@_x": String(x), "@_y": String(y) } };
  const ext: RawNode = { "a:ext": [], ":@": { "@_cx": String(w), "@_cy": String(h) } };
  setChildren(xfrm, [off, ext, ...preservedChildren]);
}

/** OOXML bodyPr defaults that parser keeps as explicit attrs but export omits. */
function normBodyVert(v: string | undefined): string | undefined {
  return !v || v === "horz" ? undefined : v;
}

/** wrap 缺省 = square（ECMA-376）；仅 "none" 与 square 两档影响排版。 */
function normBodyWrap(v: string | undefined): "none" | "square" {
  return v === "none" ? "none" : "square";
}

/** 布尔类 0/1 属性：显式 "0" 与缺省等价于 false。 */
function normBodyFlag01(v: string | undefined): "1" | undefined {
  return v === "1" ? "1" : undefined;
}

/**
 * bodyPr 属性语义是否与 host 不一致。
 * 用于缓存恢复丢 __dirty 后仍能检出「用户改过竖排/wrap」；同时必须把
 * vert="horz" / rtlCol="0" / fromWordArt="0" / 缺省 wrap 等与模型 undefined/false
 * 视为相等，否则 open→save 会误判 dirty 并剥掉原文件显式默认值（master/layout
 * 字节漂移，verify-master-roundtrip 红）。
 */
function bodyPrAttrsSemanticallyDiffer(
  raw: Record<string, string>,
  host: Extract<Shape, { kind: "text" }>,
  stacked: ReturnType<typeof stackedBodyPrExport>,
): boolean {
  const rot = host.bodyRot ? String(Math.round(host.bodyRot * 60000)) : undefined;
  if (normBodyVert(raw["@_vert"]) !== normBodyVert(host.vert ?? stacked.vert)) return true;
  if ((raw["@_rot"] || undefined) !== rot) return true;
  if (normBodyFlag01(raw["@_fromWordArt"]) !== (host.fromWordArt ? "1" : undefined)) return true;
  if (normBodyFlag01(raw["@_upright"]) !== (host.upright ? "1" : undefined)) return true;

  // wrap：stacked 导出恒 square；raw 缺省 ≡ square。仅在模型/raw 语义冲突时脏。
  const desiredWrap: "none" | "square" | undefined =
    host.wrap === false ? "none" : host.wrap === true ? "square" : stacked.wrap;
  if (desiredWrap !== undefined && normBodyWrap(raw["@_wrap"]) !== desiredWrap) return true;

  // rtlCol：host 未记录（parse 时 raw 也缺）→ 保留 raw，不因 stacked 合成 "1" 判脏。
  // host===true 要求 raw 为 "1"；host===false 要求 raw 为 "0" 或缺省。
  if (host.rtlCol === true && raw["@_rtlCol"] !== "1") return true;
  if (host.rtlCol === false && raw["@_rtlCol"] === "1") return true;
  // stacked 合成的 rtlCol 仅在 host 显式要求时参与；避免 eaVert 缺省补 rtlCol="1"。

  const anchor =
    host.vAlign === "middle" ? "ctr" : host.vAlign === "bottom" ? "b" : host.vAlign === "top" ? "t" : undefined;
  if (anchor !== undefined && (raw["@_anchor"] || undefined) !== anchor) return true;
  return false;
}

function patchBodyPr(bodyPr: RawNode, host: Extract<Shape, { kind: "text" }>): void {
  const raw = getAttrs(bodyPr);
  const stacked = stackedBodyPrExport(host);
  const vert = stacked.vert;
  const wrap = stacked.wrap;
  const rtlCol = stacked.rtlCol;
  const flagDirty = isDirty(host, "text") || isDirty(host, "textStyle") || isDirty(host, "paragraph");
  // 缓存恢复会丢掉 __dirty。选择窗里改「竖排堆叠」只写在文字半边，必须对照 raw
  // bodyPr 属性，否则打开→改方向→保存会静默丢 vert。
  const attrDirty = bodyPrAttrsSemanticallyDiffer(raw, host, stacked);
  if (!flagDirty && !attrDirty) return;
  setAttr(bodyPr, "vert", vert);
  setAttr(bodyPr, "rot", host.bodyRot ? Math.round(host.bodyRot * 60000) : undefined);
  setAttr(bodyPr, "fromWordArt", host.fromWordArt ? "1" : undefined);
  setAttr(bodyPr, "upright", host.upright ? "1" : undefined);
  if (wrap === "none") setAttr(bodyPr, "wrap", "none");
  else if (wrap === "square") setAttr(bodyPr, "wrap", "square");
  if (rtlCol) setAttr(bodyPr, "rtlCol", "1");
  else if (host.rtlCol === false) setAttr(bodyPr, "rtlCol", undefined);
  if (host.vAlign === "middle") setAttr(bodyPr, "anchor", "ctr");
  else if (host.vAlign === "bottom") setAttr(bodyPr, "anchor", "b");
  else if (host.vAlign === "top") setAttr(bodyPr, "anchor", "t");
  if (host.anchorCtr !== undefined) setAttr(bodyPr, "anchorCtr", host.anchorCtr ? "1" : "0");
  if (host.compatLnSpc) setAttr(bodyPr, "compatLnSpc", "1");
  if (host.forceAA) setAttr(bodyPr, "forceAA", "1");
  if (host.insets) {
    setAttr(bodyPr, "lIns", pxToEmu(host.insets.l));
    setAttr(bodyPr, "tIns", pxToEmu(host.insets.t));
    setAttr(bodyPr, "rIns", pxToEmu(host.insets.r));
    setAttr(bodyPr, "bIns", pxToEmu(host.insets.b));
  }
  if (host.numCol && host.numCol > 1) setAttr(bodyPr, "numCol", host.numCol);
  if (host.spcCol !== undefined) setAttr(bodyPr, "spcCol", pxToEmu(host.spcCol));
  if (host.vertOverflow && host.vertOverflow !== "overflow") setAttr(bodyPr, "vertOverflow", host.vertOverflow);
  if (host.horzOverflow && host.horzOverflow !== "overflow") setAttr(bodyPr, "horzOverflow", host.horzOverflow);
  if (host.spcFirstLastPara !== undefined) setAttr(bodyPr, "spcFirstLastPara", host.spcFirstLastPara ? "1" : "0");
  replaceBodyPrChild(bodyPr, ["prstTxWarp"], prstTxWarpXml(host.prstTxWarp));
  replaceBodyPrChild(bodyPr, ["spAutoFit", "noAutofit", "normAutofit"], autoFitXml(host.autoFit));
  replaceBodyPr3D(bodyPr, host);
}

function replaceBodyPr3D(bodyPr: RawNode, host: Extract<Shape, { kind: "text" }>): void {
  const children = getChildren(bodyPr);
  const without = children.filter((c) => {
    const loc = localName(getTagName(c) ?? "");
    return loc !== "scene3d" && loc !== "sp3d";
  });
  const xml = meta3DToXml(host.body3D);
  if (!xml) {
    if (without.length !== children.length) setChildren(bodyPr, without);
    return;
  }
  const nodes = parseFragmentAsChildren(xml);
  if (!nodes.length) return;
  setChildren(bodyPr, [...without, ...nodes]);
}

function replaceBodyPrChild(bodyPr: RawNode, locals: string[], xml: string): void {
  const children = getChildren(bodyPr);
  const filtered = children.filter((c) => {
    const tag = getTagName(c);
    return !tag || !locals.includes(localName(tag));
  });
  if (!xml) {
    if (filtered.length !== children.length) setChildren(bodyPr, filtered);
    return;
  }
  const node = rawFromDrawingMl(xml);
  if (!node) return;
  setChildren(bodyPr, [...filtered, node]);
}

// 把内存中的 paragraphs 写回 txBody 的 `<a:p>` 节点。保留 bodyPr / lstStyle / 现有
// 段落上未在内存模型中体现的属性。
//
// 策略：「精确文字替换」+ 「样式保留」
//   遍历内存段落 i = 0..N-1：
//     - 如果原 txBody 第 i 个 <a:p> 存在 → 在该 <a:p> 上「逐 run 重写」（保留 a:pPr 与
//       原有第 0 个 a:r 的 a:rPr 作为新 run 的 rPr 模板）
//     - 否则追加新的 <a:p>
//   如果原 txBody 段落数多于内存 → 删除尾部多余段落。
//
// 这能让「编辑器只改文字」的常见场景，保留所有原有字号 / 字体 / 颜色 / pPr 缩进等。
//
// idempotent 优化：当所有段落的纯文本（runs 顺序拼接）都与原 raw 完全一致时，跳过
// txBody 重建。这样 quicktour 这种「仅解析-写回」的场景，txBody 字节级保留。
function patchTxBody(
  txBody: RawNode,
  paragraphs: TextParagraph[],
  links?: LinkRegistrar,
  textHost?: Extract<Shape, { kind: "text" }>,
  media?: MediaTable,
): void {
  const children = getChildren(txBody);
  // 找出 bodyPr / lstStyle，以及所有 a:p。
  const head: RawTree = [];
  const oldParas: RawNode[] = [];
  for (const c of children) {
    const tag = getTagName(c);
    if (!tag) continue;
    const l = localName(tag);
    if (l === "bodyPr" || l === "lstStyle") head.push(c);
    else if (l === "p") oldParas.push(c);
    else head.push(c); // 其它未知 child（如 extLst）保留
  }
  if (textHost) {
    const bodyPr = findChildByLocal(head, "bodyPr");
    if (bodyPr) patchBodyPr(bodyPr, textHost);
  }
  // 1) 文字内容完全一致 → 不动 raw（最干净的"零修改"路径）。
  //    raw 中一段 <a:p> 含 <a:br> 时会被 parser 拆成多段，所以用「跨段展平 + 用 \u0001
  //    作为段间分隔」的统一形式比对。
  const memJoined = paragraphs.map((p) => p.runs.map((r) => r.text ?? "").join("")).join("\u0001");
  const rawJoined = oldParas.map((p) => paragraphTextWithBr(p).join("\u0001")).join("\u0001");
  const memHasExplicitStyle = paragraphs.some((p) => p.runs.some((r) => runHasExplicitStyle(r)));
  const pPrDirty = isDirty(textHost, "paragraph");
  if (memJoined === rawJoined && !memHasExplicitStyle && !pPrDirty) return;
  if (memJoined === rawJoined && !memHasExplicitStyle && pPrDirty) {
    syncAllParaPPr(oldParas, paragraphs, media);
    return;
  }
  // 2) 跨段对齐路径：只要 raw 的「段 + 段内 br 拆分」结构与内存的 paragraphs 结构
  //    完全对得上，每个 raw `<a:r>` 都能找到对应的内存 run。此时只替换 `<a:t>` 文字，
  //    `<a:rPr>` 一字不改 —— 这是「用户只改字 / 不改样式」的常见编辑路径，对外
  //    表现为「字号 / 字体 / 颜色 / pitchFamily / charset / lang ... 全部保留」。
  //
  //    即便有 `memHasExplicitStyle`，只要跨段结构对得上，也按 a:r 1:1 对齐做"merge rPr
  //    on top of template"——保留 raw 中所有 `<a:br>` / `<a:fld>` 不动，避免整段 rebuild
  //    把 `<a:br>` 扁平为 `<a:endParaRPr>` 这种语义损伤。
  if (tryCrossParaAlign(oldParas, paragraphs, memHasExplicitStyle, links, media)) {
    if (pPrDirty) syncAllParaPPr(oldParas, paragraphs, media);
    return;
  }
  // 3) 结构变化（增段 / 删段 / 段内 run 数量变 / br 移位）→ 回落到「按段重建」路径。
  //    此时尽量保留 pPr / endParaRPr / 首个 rPr 作为模板。
  const newParas: RawNode[] = [];
  for (let i = 0; i < paragraphs.length; i++) {
    const para = paragraphs[i]!;
    const old = oldParas[i];
    const built = old ? patchExistingPara(old, para, links, pPrDirty ? media : undefined) : buildParaFromScratch(para, links, media);
    newParas.push(built);
  }
  setChildren(txBody, [...head, ...newParas]);
}

// 跨段对齐：尝试把 raw 的 [a:p1, a:p2, ...] 按其内部 [a:r, a:br, a:r, ...] 拆出来的
// "sub-段"序列与内存 paragraphs 1:1 配对：
//   - sub-段数量 === paragraphs.length
//   - 每个 sub-段内 a:r 数 === 对应 paragraph.runs.length
// 满足时**就地替换**每个 a:r 内 a:t 的文字，保留 rPr / pPr / br / endParaRPr。
// `mergeStyle=true` 时还会把内存 run 上的样式 merge 进每个原 a:r 的 rPr（只 override
// 被用户真正改动的字段，见 mergeRPr）—— 这是"用户改文字 + 改样式但段落结构未变"
// 的常见编辑路径，相比 step 3 的整段 rebuild，能完整保留 raw 上的 `<a:br>` / `<a:fld>`
// / `pitchFamily` / `charset` 等无须变动的字节。
// 返回 true 表示已成功完成对齐式 patch；false 表示结构对不上，调用方走重建路径。
function tryCrossParaAlign(
  oldParas: RawNode[],
  paragraphs: TextParagraph[],
  mergeStyle: boolean = false,
  links?: LinkRegistrar,
  media?: MediaTable,
): boolean {
  // 把每个 oldPara 的 body 按 br 拆成多个 sub-段，记录 [r1, r2, ...] 序列。
  // body 中含 fld（域）等不可对齐的节点时放弃。
  interface SubSeg {
    pIdx: number; // 所在 oldPara 的 index
    runs: RawNode[]; // a:r 节点列表
    br?: RawNode; // 终结这个 sub-段的 <a:br>（每段最后一个 sub-段没有）
  }
  const subs: SubSeg[] = [];
  for (let pi = 0; pi < oldParas.length; pi++) {
    const oldP = oldParas[pi]!;
    let cur: SubSeg = { pIdx: pi, runs: [] };
    let started = false;
    for (const c of getChildren(oldP)) {
      const tag = getTagName(c);
      const l = tag ? localName(tag) : "";
      if (l === "pPr" || l === "endParaRPr") continue;
      if (l === "r") {
        cur.runs.push(c);
        started = true;
      } else if (l === "br") {
        cur.br = c;
        subs.push(cur);
        cur = { pIdx: pi, runs: [] };
        started = true;
      } else if (l === "fld") {
        return false; // 含域；当前不在对齐路径支持
      }
      // 其它扩展（extLst 等）不影响对齐，跳过。
    }
    if (started || cur.runs.length > 0 || !oldParas[pi - 1]) {
      // 把当前段最后一个 sub-段也算进去（即便它的 runs 为空 —— 对应 "空段落"）。
      subs.push(cur);
    }
  }
  if (subs.length !== paragraphs.length) return false;
  for (let i = 0; i < subs.length; i++) {
    const subRunCount = subs[i]!.runs.length;
    const memRunCount = paragraphs[i]!.runs.length;
    if (subRunCount === memRunCount) continue;
    // 容差：parseParagraph 会在最后一个空 sub-段里补一个 text="" 的 run（带 endParaRPr
    // 的样式作为占位）。raw 端 subs[i].runs=0 + memRuns 长度 1 且首 run text="" 时，
    // 视为对齐成功——后续 patch 跳过该 mem run，不影响 raw 字节。
    if (subRunCount === 0 && memRunCount === 1 && (paragraphs[i]!.runs[0]!.text ?? "") === "") continue;
    return false;
  }
  // 结构完全对齐。逐 a:r 替换文字。原 RawNode 是 patcher 持有的可变对象，对其内部
  // children 直接 setChildren 即可生效。
  for (let i = 0; i < subs.length; i++) {
    const sub = subs[i]!;
    const memRuns = paragraphs[i]!.runs;
    // sub.runs 是 raw 的 a:r 序列；少于 memRuns 时，循环只走 raw 边界（空 sub 的"虚拟"
    // empty mem run 自动忽略，对应上面的容差分支）。
    for (let j = 0; j < sub.runs.length; j++) {
      const oldR = sub.runs[j]!;
      const memRun = memRuns[j]!;
      const newText = memRun.text ?? "";
      if (mergeStyle && runHasExplicitStyle(memRun)) {
        // 用 mergeRPr 把内存 run 上"真正被编辑过"的样式字段叠加到原 rPr 模板。
        // mergeRPr 内部用 __explicitRPr snapshot 区分继承 vs 编辑，未编辑字段保留模板。
        const templateRPr = findChildByLocal(getChildren(oldR), "rPr");
        const newRPr = mergeRPr(templateRPr, memRun, links, media);
        const newChildren: RawTree = [];
        if (newRPr) newChildren.push(newRPr);
        let tHandled = false;
        for (const c of getChildren(oldR)) {
          const tag = getTagName(c);
          const l = tag ? localName(tag) : "";
          if (l === "rPr") continue; // 用新合并出的 rPr 替代
          if (l === "t" && !tHandled) {
            const tClone: RawNode = { "a:t": [{ "#text": newText }] };
            const at = c[":@"];
            if (at) tClone[":@"] = at;
            newChildren.push(tClone);
            tHandled = true;
          } else {
            newChildren.push(c);
          }
        }
        if (!tHandled) newChildren.push({ "a:t": [{ "#text": newText }] });
        setChildren(oldR, newChildren);
      } else {
        replaceRunTextInPlace(oldR, newText);
      }
    }
  }
  // run 的 rPr 改完后，把同段的「格式载体」一并跟上（见 syncTrailingRPrColor）。
  if (mergeStyle) {
    for (let i = 0; i < subs.length; i++) {
      const sub = subs[i]!;
      const memRuns = paragraphs[i]!.runs;
      const lastMem = memRuns[memRuns.length - 1];
      if (sub.br) syncTrailingRPrColor(findChildByLocal(getChildren(sub.br), "rPr"), lastMem);
      // 段尾 endParaRPr 归属该 oldPara 的最后一个 sub-段。
      if (i + 1 >= subs.length || subs[i + 1]!.pIdx !== sub.pIdx) {
        syncTrailingRPrColor(findChildByLocal(getChildren(oldParas[sub.pIdx]!), "endParaRPr"), lastMem);
      }
    }
  }
  return true;
}

// 在原 <a:r> 节点上**就地**替换其内部 <a:t> 的文字。rPr 与其它子节点保留。
function replaceRunTextInPlace(rNode: RawNode, newText: string): void {
  const oldChildren = getChildren(rNode);
  let touched = false;
  for (const c of oldChildren) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "t") {
      // 先比较：文本一致则**完全不动**（避免把 self-closing <a:t/> 强行展开破坏字节）。
      const curText = (() => {
        let s = "";
        for (const tc of getChildren(c)) {
          if ("#text" in tc) {
            const v = tc["#text"];
            s += typeof v === "string" ? v : String(v ?? "");
          }
        }
        return s;
      })();
      if (curText !== newText) setChildren(c, [{ "#text": newText }]);
      touched = true;
    }
  }
  if (!touched) {
    // 原 a:r 没有 a:t（极少见），补一个。
    setChildren(rNode, [...oldChildren, { "a:t": [{ "#text": newText }] }]);
  }
}

// 收集 `<a:p>` 节点下所有 `<a:r>/<a:t>` + `<a:fld>/<a:t>` 的文本（按 children 顺序）。
// `<a:br>` 在 OOXML 里是「软换行」，但 parser 把它拆成多个段落以方便内存模型表达；
// 这里把 `<a:br>` 转换成段落分隔，返回一个段落数组，使得跟内存中 paragraphs 的
// 1:1 对比可行。
function paragraphTextWithBr(pNode: RawNode): string[] {
  const out: string[] = [""];
  for (const child of getChildren(pNode)) {
    const tag = getTagName(child);
    if (!tag) continue;
    const l = localName(tag);
    if (l === "r" || l === "fld") {
      const t = findChildByLocal(getChildren(child), "t");
      if (t) {
        for (const tc of getChildren(t)) {
          if ("#text" in tc) {
            const v = tc["#text"];
            out[out.length - 1]! += typeof v === "string" ? v : String(v ?? "");
          }
        }
      }
    } else if (l === "br") {
      out.push("");
    }
  }
  return out;
}

const PPR_REPLACE_LOCALS = new Set([
  "lnSpc",
  "spcBef",
  "spcAft",
  "tabLst",
  "buNone",
  "buChar",
  "buAutoNum",
  "buBlip",
  "buFont",
  "buSzPts",
  "buSzPct",
  "buClr",
  "buClrTx",
]);

function syncAllParaPPr(oldParas: RawNode[], paragraphs: TextParagraph[], media?: MediaTable): void {
  const n = Math.min(oldParas.length, paragraphs.length);
  for (let i = 0; i < n; i++) syncParaPPr(oldParas[i]!, paragraphs[i]!, media);
}

function syncParaPPr(paraNode: RawNode, para: TextParagraph, media?: MediaTable): void {
  const children = getChildren(paraNode);
  let pPr = findChildByLocal(children, "pPr");
  if (!pPr) {
    pPr = { "a:pPr": [] };
    setChildren(paraNode, [pPr, ...children]);
  }
  const align =
    para.align === "start" ? "l" : para.align === "middle" ? "ctr" : para.align === "end" ? "r" : para.align === "justify" ? "just" : undefined;
  if (align) setAttr(pPr, "algn", align);
  if (para.level !== undefined) setAttr(pPr, "lvl", String(para.level));
  if (para.marginLeft !== undefined) setAttr(pPr, "marL", pxToEmu(para.marginLeft));
  if (para.marginRight !== undefined) setAttr(pPr, "marR", pxToEmu(para.marginRight));
  if (para.indent !== undefined) setAttr(pPr, "indent", pxToEmu(para.indent));
  if (para.rtl) setAttr(pPr, "rtl", "1");
  if (para.fontAlign) setAttr(pPr, "fontAlgn", para.fontAlign);
  if (para.defTabSz !== undefined) setAttr(pPr, "defTabSz", pxToEmu(para.defTabSz));
  const innerXml = paragraphPPrInnerXml(para, media ? { media, spIdCounter: { next: 1 } } : undefined);
  const fresh = innerXml ? parseFragmentAsChildren(innerXml) : [];
  const kept = getChildren(pPr).filter((c) => {
    const l = localName(getTagName(c) ?? "");
    return l ? !PPR_REPLACE_LOCALS.has(l) : true;
  });
  setChildren(pPr, [...fresh, ...kept]);
}

function patchExistingPara(oldP: RawNode, para: TextParagraph, links?: LinkRegistrar, media?: MediaTable): RawNode {
  // 切分原 <a:p> 的 children：[pPr?] + body(r/br/fld 序列) + [endParaRPr?] + 其它扩展
  const oldChildren = getChildren(oldP);
  const head: RawTree = [];
  const body: RawNode[] = [];
  const tail: RawTree = [];
  let sawBody = false;
  for (const c of oldChildren) {
    const tag = getTagName(c);
    const l = tag ? localName(tag) : "";
    if (!sawBody && (l === "pPr")) {
      head.push(c);
      continue;
    }
    if (l === "r" || l === "br" || l === "fld") {
      sawBody = true;
      body.push(c);
      continue;
    }
    if (l === "endParaRPr") {
      tail.push(c);
      continue;
    }
    // 其它（如 extLst）：保守放到 tail。
    (sawBody ? tail : head).push(c);
  }
  // 原段中是否含 `<a:br>` 或 `<a:fld>`？若含，则与内存的"无 br/fld"模型对不上，
  // 走整段重建（保留 pPr / 首个 rPr 作模板）。
  const hasBrOrFld = body.some((n) => {
    const l = localName(getTagName(n) ?? "");
    return l === "br" || l === "fld";
  });
  if (hasBrOrFld) {
    const rebuilt = rebuildParaWithTemplate(head, body, tail, para, links, media);
    if (media) syncParaPPr(rebuilt, para, media);
    return rebuilt;
  }
  // 简单路径：原段 body 都是 `<a:r>`，按位置与内存 runs 对齐。
  const newBody: RawNode[] = [];
  const oldRuns = body; // 全部是 a:r
  const N = oldRuns.length;
  const M = para.runs.length;
  for (let i = 0; i < Math.min(N, M); i++) {
    const oldR = oldRuns[i]!;
    const memRun = para.runs[i]!;
    const templateRPr = findChildByLocal(getChildren(oldR), "rPr");
    // AI 换主题 / setShapeTextStyle 会改 run.color 等字段；此时必须 merge rPr，
    // 不能只 replaceRunText 保留旧颜色。
    if (runHasExplicitStyle(memRun)) {
      newBody.push(buildRunNode(memRun, templateRPr, links, media));
    } else {
      newBody.push(replaceRunText(oldR, memRun.text ?? ""));
    }
  }
  if (M > N) {
    // 内存比原多 → 追加。rPr 模板用最后一个 oldR 的 rPr（继承相邻样式）。
    const templateRPr = N > 0 ? findChildByLocal(getChildren(oldRuns[N - 1]!), "rPr") : undefined;
    for (let i = N; i < M; i++) {
      newBody.push(buildRunNode(para.runs[i]!, templateRPr, links, media));
    }
  }
  // M < N：尾部多余 oldR 被丢弃（不进入 newBody）。
  syncTailEndParaRPr(tail, para);
  const node: RawNode = { "a:p": [...head, ...newBody, ...tail] };
  if (media) syncParaPPr(node, para, media);
  return node;
}

// tail 里若带着原段的 `<a:endParaRPr>`，让它的颜色跟上末尾 run（见 syncTrailingRPrColor）。
function syncTailEndParaRPr(tail: RawTree, para: TextParagraph): void {
  const endRPr = findChildByLocal(tail, "endParaRPr");
  if (endRPr) syncTrailingRPrColor(endRPr, para.runs[para.runs.length - 1]);
}

// 复制原 `<a:r>` 节点，仅把内部 `<a:t>` 的文字替换为新文本，rPr 与其它字段保留。
function replaceRunText(oldR: RawNode, newText: string): RawNode {
  const oldChildren = getChildren(oldR);
  const newChildren: RawTree = [];
  let replaced = false;
  for (const c of oldChildren) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "t") {
      // 浅 clone：复用 ":@"（保留 xml:space 等属性）。
      const tClone: RawNode = { "a:t": [{ "#text": newText }] };
      const at = c[":@"];
      if (at) tClone[":@"] = at;
      newChildren.push(tClone);
      replaced = true;
    } else {
      newChildren.push(c);
    }
  }
  if (!replaced) newChildren.push({ "a:t": [{ "#text": newText }] });
  return { "a:r": newChildren };
}

// 整段重建：当原段含 `<a:br>` / `<a:fld>` 等复杂结构、无法 1:1 对齐内存 runs 时使用。
// 仍保留 head (pPr / 扩展) 与 tail (endParaRPr) 不动；rPr 模板取原首个 `<a:r>`。
function rebuildParaWithTemplate(
  head: RawTree,
  body: RawNode[],
  tail: RawTree,
  para: TextParagraph,
  links?: LinkRegistrar,
  media?: MediaTable,
): RawNode {
  let templateRPr: RawNode | undefined;
  for (const c of body) {
    if (localName(getTagName(c) ?? "") === "r") {
      templateRPr = findChildByLocal(getChildren(c), "rPr");
      if (templateRPr) break;
    }
  }
  const newBody: RawTree = [];
  for (let i = 0; i < para.runs.length; i++) {
    newBody.push(buildRunNode(para.runs[i]!, templateRPr, links, media));
  }
  syncTailEndParaRPr(tail, para);
  return { "a:p": [...head, ...newBody, ...tail] };
}

function buildParaFromScratch(para: TextParagraph, links?: LinkRegistrar, media?: MediaTable): RawNode {
  const newChildren: RawTree = [];
  const align =
    para.align === "start" ? "l" : para.align === "middle" ? "ctr" : para.align === "end" ? "r" : para.align === "justify" ? "just" : undefined;
  const pPrAttrs: Record<string, string> = {};
  if (align) pPrAttrs["@_algn"] = align;
  if (para.level !== undefined) pPrAttrs["@_lvl"] = String(para.level);
  if (para.marginLeft !== undefined) pPrAttrs["@_marL"] = String(pxToEmu(para.marginLeft));
  if (para.marginRight !== undefined) pPrAttrs["@_marR"] = String(pxToEmu(para.marginRight));
  if (para.indent !== undefined) pPrAttrs["@_indent"] = String(pxToEmu(para.indent));
  if (para.rtl) pPrAttrs["@_rtl"] = "1";
  if (para.fontAlign) pPrAttrs["@_fontAlgn"] = para.fontAlign;
  if (para.defTabSz !== undefined) pPrAttrs["@_defTabSz"] = String(pxToEmu(para.defTabSz));
  if (para.eaLnBrk === false) pPrAttrs["@_eaLnBrk"] = "0";
  else if (para.eaLnBrk) pPrAttrs["@_eaLnBrk"] = "1";
  if (para.latinLnBrk === false) pPrAttrs["@_latinLnBrk"] = "0";
  else if (para.latinLnBrk) pPrAttrs["@_latinLnBrk"] = "1";
  if (para.hangingPunct === false) pPrAttrs["@_hangingPunct"] = "0";
  else if (para.hangingPunct) pPrAttrs["@_hangingPunct"] = "1";
  const innerXml = paragraphPPrInnerXml(para, media ? { media, spIdCounter: { next: 1 } } : undefined);
  const pPr: RawNode = { "a:pPr": innerXml ? parseFragmentAsChildren(innerXml) : [] };
  if (Object.keys(pPrAttrs).length > 0) pPr[":@"] = pPrAttrs;
  newChildren.push(pPr);
  for (const run of para.runs) {
    newChildren.push(buildRunNode(run, undefined, links, media));
  }
  return { "a:p": newChildren };
}

// 构建一个 `<a:r>` raw 节点。templateRPr 用于继承字号 / 字体 / 颜色等样式 —— 仅当内存
// run 字段中显式给出新值时才覆盖。
function buildRunNode(run: TextRun, templateRPr?: RawNode, links?: LinkRegistrar, media?: MediaTable): RawNode {
  // 简单起见，先把 run 序列化为 XML 字符串再 parse —— 这能复用 esc/hex 等小工具，
  // 且能正确处理 namespace 前缀。模板 rPr 上的所有属性会被合并；只在内存 run 显式
  // 指定时覆盖（fontFamily / fontSize / bold / italic / underline / color）。
  const mergedRPr = mergeRPr(templateRPr, run, links, media);
  // 由于 mergedRPr 已经是 raw node，直接组装 a:r。
  const text = run.text ?? "";
  // <a:t> 的子节点是 #text。OOXML 中即使空字符串也应该输出 `<a:t></a:t>` 而不是 self-closing
  // —— self-closing 在 PowerPoint 上偶有兼容问题。这里强制非 self-closing。
  const tNode: RawNode = { "a:t": [{ "#text": text }] };
  const children: RawTree = [];
  if (mergedRPr) children.push(mergedRPr);
  children.push(tNode);
  return { "a:r": children };
}

function mergeRPr(template: RawNode | undefined, run: TextRun, links?: LinkRegistrar, media?: MediaTable): RawNode | undefined {
  // 把 template 浅复制一份再写入新字段。template 缺失时按内存 run 重新构造。
  const out: RawNode = template ? deepCloneRawNode(template) : { "a:rPr": [] };
  // parse-time 留下的"原 rPr 里 *显式* 出现过的字段"snapshot；undefined 表示该字段
  // 是继承得来的（master / layout / 默认）。round-trip 写回时若内存 run 字段与
  // snapshot 一致，则视为"未编辑"，不应该把继承值显式写进 raw rPr —— 否则会让
  // master 默认 Calibri 之类被每次保存都拷一份到 slide 上，污染整个 OOXML。
  // 内联 ExplicitRPrSnapshot 形状（parser 端定义），避免 serializer 反向依赖 parser
  // 包；保持单向依赖关系：parser ← serializer。字段含义详见 parser/src/text.ts。
  const snap = getOrigin<RunOrigin>(run)?.explicitRPr;
  // 字段是否"被用户改过"判定：
  //   - snap === undefined：原 raw 完全没 rPr 节点 → 内存所有字段都视为编辑后值，
  //     按内存写（典型场景：编辑器新加的 run）
  //   - snap 存在（包括 `{}`）：内存值与 snap 比较；
  //       - snap 字段已定义 + 内存字段不同 → 编辑了 → 写
  //       - snap 字段未定义（即 raw 上没显式写过该字段）→ 内存值是继承得来的 → 不写
  //         （不能区分"继承 vs 编辑器新加"；编辑器若要支持后者，需在 run 上额外 mark
  //         `__userEdited`，目前没实装）
  const fieldEdited = <K extends keyof NonNullable<typeof snap>>(key: K, current: unknown): boolean => {
    if (current === undefined || current === null) return false;
    if (snap === undefined) return true;
    const snapVal = snap[key];
    if (snapVal === undefined) return false;
    // theme typeface 引用（"+mn-lt" 等）见 runHasExplicitStyle 注释；同口径处理。
    if (key === "fontFamily" && typeof snapVal === "string" && snapVal.startsWith("+")) return false;
    return snapVal !== current;
  };
  const fontSizeEdited = run.fontSize !== undefined && (snap === undefined ? true : snap.fontSize !== undefined && Math.abs((snap.fontSize as number) - run.fontSize) > 1e-6);
  const weightEdited = run.fontWeight !== undefined && fieldEdited("fontWeight", typeof run.fontWeight === "number" ? run.fontWeight : (run.fontWeight === "bold" ? 700 : 400));
  const italicEdited = run.italic !== undefined && fieldEdited("italic", run.italic);
  // fieldEdited 同口径：仅当快照里显式存在且与内存值不同才算编辑（相同值不重写，
  // 避免 underlineToOoxml 把 raw 上的 heavy/dashLongHeavy 等细分枚举压成 sng）。
  const underlineEdited = run.underline !== undefined && run.underline !== false && fieldEdited("underline", run.underline);
  const latin = firstCssTypeface(run.fontFamily);
  const fontFamilyEdited = latin !== undefined && fieldEdited("fontFamily", latin);
  // 属性覆盖：sz / b / i / u。
  // ECMA-376 §21.1.2.3.9 rPr/@sz：单位是「百分点」（pt × 100）。内存 fontSize 单位是
  // px（96dpi 屏幕），换算 pt = px × 72 / 96，即 sz = px × 75。
  if (fontSizeEdited) setAttr(out, "sz", Math.round(run.fontSize! * 75));
  if (weightEdited) {
    const w = run.fontWeight!;
    const bold = typeof w === "number" ? w >= 600 : w === "bold";
    setAttr(out, "b", bold ? "1" : undefined);
  }
  if (italicEdited) setAttr(out, "i", run.italic ? "1" : undefined);
  if (run.underline === false && snap?.underline) {
    // 用户主动取消 underline → 清掉
    setAttr(out, "u", undefined);
  } else if (underlineEdited) {
    setAttr(out, "u", underlineToOoxml(run.underline));
  }
  // 子节点覆盖：color (solidFill) / family (a:latin)。
  // 颜色支持 `#rrggbb` / `#rrggbbaa` / `rgba(...)` — 解析出 hex+alpha，alpha<1 时
  // 插入 `<a:alpha val=N/>` 子节点，否则只写 srgbClr。早期版本走 `hex()` 直接丢
  // alpha，编辑器里半透明文字保存后会变成不透明。
  const colorChange = runColorChange(run);
  if (colorChange) replaceOrInsertChild(out, "solidFill", colorChange.fill);
  // 取 CSS list 的首项作为 typeface；OOXML 单值约束，详见 firstCssTypeface 注释。
  if (fontFamilyEdited) {
    replaceOrInsertChild(out, "latin", {
      "a:latin": [],
      ":@": { "@_typeface": esc(latin!) },
    });
    const ea = pickEaTypeface(run.fontFamily);
    if (ea) {
      replaceOrInsertChild(out, "ea", {
        "a:ea": [],
        ":@": { "@_typeface": esc(ea) },
      });
    }
    replaceOrInsertChild(out, "cs", {
      "a:cs": [],
      ":@": { "@_typeface": esc(latin!) },
    });
  }
  const strikeVal =
    run.strikethrough === "double" ? "dblStrike" : run.strikethrough === "single" ? "sngStrike" : undefined;
  if (runAddedOrChanged(run.strikethrough && run.strikethrough !== "none" ? run.strikethrough : undefined, snap?.strikethrough, snap === undefined)) {
    setAttr(out, "strike", strikeVal);
  } else if (styleCleared(run.strikethrough && run.strikethrough !== "none" ? run.strikethrough : undefined, snap?.strikethrough)) {
    setAttr(out, "strike", undefined);
  }
  if (runAddedOrChanged(run.caps && run.caps !== "none" ? run.caps : undefined, snap?.caps, snap === undefined)) {
    setAttr(out, "cap", run.caps);
  } else if (styleCleared(run.caps && run.caps !== "none" ? run.caps : undefined, snap?.caps)) {
    setAttr(out, "cap", undefined);
  }
  if (run.letterSpacing !== undefined && runAddedOrChanged(run.letterSpacing, snap?.letterSpacing, snap === undefined)) {
    setAttr(out, "spc", pxToHundredthPt(run.letterSpacing));
  } else if (styleCleared(run.letterSpacing, snap?.letterSpacing)) {
    setAttr(out, "spc", undefined);
  }
  if (run.highlight && runAddedOrChanged(run.highlight.toLowerCase(), snap?.highlight, snap === undefined)) {
    replaceOrInsertChild(out, "highlight", {
      "a:highlight": [{ "a:srgbClr": [], ":@": { "@_val": parseColor(run.highlight).hex } }],
    });
  } else if (styleCleared(run.highlight, snap?.highlight)) {
    removeChildByLocal(out, "highlight");
  }
  // 仅在链接确实变了时重写。run 因为别的字段（改文字 / 改字号）走到这里时，原
  // `<a:hlinkClick r:id="rIdN">` 必须原样保留 —— 重登记会留下孤儿关系，且内部跳页
  // 的 action 属性会丢。
  if (run.hyperlink && hyperlinkEdited(run.hyperlink, snap?.hyperlink, snap === undefined)) {
    const node = hlinkRawNode(run.hyperlink, "a:hlinkClick", links, media);
    if (node) replaceOrInsertChild(out, "hlinkClick", node);
  }
  if (run.hoverLink && hyperlinkEdited(run.hoverLink, snap?.hoverLink, snap === undefined)) {
    const node = hlinkRawNode(run.hoverLink, "a:hlinkHover", links, media);
    if (node) replaceOrInsertChild(out, "hlinkHover", node);
  }
  // 文字描边 / 效果不会从 master 继承到 run（parser 只在 raw rPr 有 ln/effectLst
  // 时写入）。所以 snap 缺字段 + 内存有值 = 用户新加（WordArt 套到已有文本），必须写。
  const outlineFp = outlineFingerprint(run);
  if (outlineFp && runAddedOrChanged(outlineFp, snap?.textOutline, snap === undefined)) {
    const node = rawFromDrawingMl(strokeToXml(run.textOutline!));
    if (node) replaceOrInsertChild(out, "ln", node);
  } else if (styleCleared(outlineFp, snap?.textOutline)) {
    removeChildByLocal(out, "ln");
  }
  const fxFp = effectsFingerprint(run);
  if (fxFp && runAddedOrChanged(fxFp, snap?.effects, snap === undefined)) {
    const node = rawFromDrawingMl(effectsToXml(run.effects!));
    if (node) replaceOrInsertChild(out, "effectLst", node);
  } else if (styleCleared(fxFp, snap?.effects)) {
    removeChildByLocal(out, "effectLst");
  }
  return out;
}

function rawFromDrawingMl(xml: string): RawNode | undefined {
  if (!xml) return undefined;
  const wrapped =
    `<__root xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main">${xml}</__root>`;
  try {
    const tree = parseFragmentAsChildren(wrapped);
    const wrapper = tree[0];
    if (!wrapper) return undefined;
    return getChildren(wrapper)[0];
  } catch {
    return undefined;
  }
}

function buildSolidFillChild(color: string): RawNode {
  const parsed = parseColor(color);
  // 命中主题色板 → 写 <a:schemeClr>，让文字色在 PowerPoint 换主题时继续跟随
  // （schemeClr 保留策略，见 pptx-shapes.ts setActiveSchemeColors）。
  const slot = schemeSlotForHex(parsed.hex.toUpperCase());
  const alphaChild: RawTree = parsed.alpha !== undefined && parsed.alpha < 1
    ? [{ "a:alpha": [], ":@": { "@_val": String(Math.round(parsed.alpha * 100000)) } }]
    : [];
  const clr: RawNode = slot
    ? { "a:schemeClr": alphaChild, ":@": { "@_val": slot } }
    : { "a:srgbClr": alphaChild, ":@": { "@_val": parsed.hex } };
  return { "a:solidFill": [clr] };
}

// run 的文字色相对 parse 期快照是否被改过；改过则给出改动前的颜色与要写入的 solidFill。
// 颜色支持 `#rrggbb` / `#rrggbbaa` / `rgba(...)` —— alpha<1 时带 `<a:alpha>` 子节点，
// 早期版本走 `hex()` 直接丢 alpha，编辑器里半透明文字保存后会变成不透明。
function runColorChange(run: TextRun): { oldColor: string | undefined; fill: RawNode } | undefined {
  if (!run.color) return undefined;
  const snap = getOrigin<RunOrigin>(run)?.explicitRPr;
  if (!(snap === undefined || snap.color === undefined || snap.color !== run.color)) return undefined;
  return { oldColor: snap?.color, fill: buildSolidFillChild(run.color) };
}

// 读 raw rPr 上**显式**的 srgbClr 文字色，归一成 parser 快照口径（`#rrggbb` 小写，
// alpha<1 时补两位 hex），好与 explicitRPr.color 直接比较。
// - none：没有 solidFill（走继承）
// - other：有 solidFill 但不是直接 srgbClr（schemeClr / 渐变等），不属于"停在旧色"的情形
function explicitSrgbOfRPr(rPr: RawNode): { kind: "none" | "other" } | { kind: "srgb"; color: string } {
  const fill = findChildByLocal(getChildren(rPr), "solidFill");
  if (!fill) return { kind: "none" };
  const srgb = findChildByLocal(getChildren(fill), "srgbClr");
  if (!srgb) return { kind: "other" };
  const hex = getAttrs(srgb)["@_val"];
  if (!hex || !/^[0-9a-fA-F]{6}$/.test(hex)) return { kind: "other" };
  const alphaAttr = getAttrs(findChildByLocal(getChildren(srgb), "alpha") ?? {})["@_val"];
  const alpha = alphaAttr ? Number(alphaAttr) / 100000 : 1;
  if (alpha >= 1) return { kind: "srgb", color: "#" + hex.toLowerCase() };
  const aHex = Math.round(alpha * 255).toString(16).padStart(2, "0");
  return { kind: "srgb", color: "#" + hex.toLowerCase() + aHex };
}

// `<a:br>` 的 rPr 与段尾 `<a:endParaRPr>` 是「格式载体」：不渲染可见文字，但决定软换行
// 的行高、以及用户在段尾继续输入时新字的样式。换主题 / 改文字色时若只补 `<a:r>`，这两处
// 会停在旧色 —— 深色主题下在段尾接着打字，新字仍是原来的近黑色，看不清。
//
// 同步规则：仅当载体当前是显式 srgbClr **且等于该 run 改动前的颜色**（说明二者本来就同步）
// 才跟着改。载体没有显式色（继承，会自然跟上新主题）、走 schemeClr（已跟随主题）、或本来
// 就是另一种颜色（刻意的差异化格式）时一律不动，避免越权改写原始字节。
function syncTrailingRPrColor(rPr: RawNode | undefined, run: TextRun | undefined): void {
  if (!rPr || !run) return;
  const change = runColorChange(run);
  if (!change || change.oldColor === undefined) return;
  const cur = explicitSrgbOfRPr(rPr);
  if (cur.kind !== "srgb" || cur.color !== change.oldColor) return;
  replaceOrInsertChild(rPr, "solidFill", change.fill);
}

function replaceOrInsertChild(parent: RawNode, local: string, newChild: RawNode): void {
  const children = getChildren(parent);
  const out: RawTree = [];
  let replaced = false;
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && localName(tag) === local) {
      out.push(newChild);
      replaced = true;
    } else {
      out.push(c);
    }
  }
  if (!replaced) out.push(newChild);
  setChildren(parent, out);
}

function removeChildByLocal(parent: RawNode, local: string): void {
  const children = getChildren(parent);
  const next = children.filter((c) => {
    const tag = getTagName(c);
    return !tag || localName(tag) !== local;
  });
  if (next.length !== children.length) setChildren(parent, next);
}

function deepCloneRawNode(node: RawNode): RawNode {
  // raw node 只含 JSON-safe 类型（string / object / array），用 JSON 深拷即可。
  return JSON.parse(JSON.stringify(node)) as RawNode;
}

// ============================================================================
// 新增 shape 的 raw 构造（覆盖编辑器场景：插入 rect/ellipse/text/triangle/...
// 以及 AI 主题切换时注入的 `dec_*` 装饰 shape）。已存在原始 sp（id 命中）不会走这里。
//
// 实现策略：复用 from-scratch 路径的 `shapeToXml`（pptx-shapes.ts）把内存 Shape
// 序列化为一段 OOXML 字符串，再用 `parseFragmentAsChildren` 转回 RawNode 注入。
// 关键约束：
//   - 序列化产物含 `p:` / `a:` / `r:` / `pic:` 命名空间前缀，但所在 slide / master
//     part 的根元素已经声明了这些 xmlns，因此**新追加的 sp / pic / grpSp 不需要
//     自带 xmlns 属性**；外层包一个 `<__root>` 仅用于让 fast-xml-parser 接受前缀
//     声明，最终注入到 `<p:spTree>` 时只取里面那个真正的 shape RawNode。
//   - 媒体（image / video / audio fill）的关系处理（rels / ppt/media 写入）尚未
//     完整接通：若新 shape 触发了 MediaTable 注册（即用到了图片资源），暂时返回
//     undefined 让调用方 warn 后跳过 —— 避免生成"找不到 rId"的 broken pptx。
//     `dec_*` 装饰 shape 都是 rect/ellipse + solidFill，不会触发；典型用户插入的
//     "插一张图"会走 image shape，也不命中"完全没图片关系"的判断（pic 自带 rId）。
//   - cNvPr@id 由调用方指定（避开内存 / 原 XML 现有 ID 上限 +1），新 shape 内嵌
//     的 spIdCounter 仅在 group 递归 / text 等内部场景递增。
// ============================================================================

function shapeToRawNode(
  shape: Shape,
  id: number,
  archive: MutableArchive,
  partPath: string,
  links?: LinkRegistrar,
  charts?: PartChartRegistry,
  diagrams?: PartDiagramRegistry,
  inks?: PartInkRegistry,
  embeddings?: OleEmbeddingRegistrar,
  mediaTimings?: MediaTimingHint[],
  writtenSpIds?: Map<string, number>,
  idAlloc?: IdAlloc,
): RawNode | undefined {
  const media = new MediaTable();
  const linkReg = links ?? new PartLinkRegistry(archive, partPath);
  const chartReg = charts ?? new PartChartRegistry(archive, partPath, true);
  const diagramReg = diagrams ?? new PartDiagramRegistry(archive, partPath, true);
  const inkReg = inks ?? new PartInkRegistry(archive, partPath, true);
  const oleReg = embeddings ?? new PartOleRegistry(archive, partPath, true);
  const ctx: ShapeCtx = {
    media,
    spIdCounter: { next: id },
    links: linkReg,
    charts: chartReg,
    diagrams: diagramReg,
    inks: inkReg,
    embeddings: oleReg,
    mediaTimings,
  };
  let xml: string;
  try {
    xml = shapeToXml(shape, ctx);
  } catch {
    return undefined;
  }
  // group 子形状会在同一次 shapeToXml 里继续取号。调用方只预留了根 id，
  // 这里把实际写出去的 id 记下来，并把分配器推过最高号，避免下一个新 shape 撞号。
  let maxWritten = id;
  for (const [shapeId, num] of ctx.spIdByShapeId ?? []) {
    writtenSpIds?.set(shapeId, num);
    if (num > maxWritten) maxWritten = num;
  }
  if (idAlloc && idAlloc.next <= maxWritten) idAlloc.next = maxWritten + 1;
  if (media.list().length > 0) {
    xml = injectPartMedia(archive, partPath, media, xml);
  }
  if (!xml || !xml.trim()) return undefined;
  const wrapped =
    `<__root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
    `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
    `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" ` +
    `xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture">` +
    xml +
    `</__root>`;
  let tree: RawTree;
  try {
    tree = parseFragmentAsChildren(wrapped);
  } catch {
    return undefined;
  }
  if (!tree.length) return undefined;
  const wrapper = tree[0]!;
  if (getTagName(wrapper) !== "__root") return undefined;
  const inner = getChildren(wrapper);
  return inner[0];
}

// ============================================================================
// 背景对齐（slide / master / layout 共用）
// ============================================================================

/**
 * 在原 `<p:cSld>` 上对齐内存 `Paint` 背景：
 *
 *   - 若 `current` 与 `snapshot`（parser 解析时的快照）JSON 相等 → 不动 raw 节点，
 *     保留原始 `<p:bg>` 字节级状态（含"原本无 `<p:bg>` 保留继承"的情况）。
 *   - 若发生变化（典型：AI 通过 `ApplyCustomThemeCmd` 把 `slide.background` 换成
 *     新主题色 / 渐变）→ 用 `backgroundToXml` 重新序列化，注入到 `<p:cSld>` 里。
 *     注入位置：`<p:bg>` 必须在 `<p:spTree>` 之前（OOXML schema 要求）。
 *
 * 已知限制：当前 `<p:bg>` 序列化不解决"新引入图片背景的 rels 写回"问题。AI 主题
 * 工具默认 `preserveImageBackgrounds: true`，不会把图片背景换走 → 不会触发该路径；
 * 用户手动 `setSlideBackground { kind: "image" }` 时图片资源走单独的资产注册流程，
 * 此处保留生成的 `<p:bg>` 即可（图片 rId 由 from-scratch 路径产生，对 round-trip
 * 而言 image bg 是单独课题，本次未覆盖）。
 */
function patchBackgroundIn(
  cSld: RawNode,
  current: Paint | undefined,
  snapshot: Paint | undefined,
  archive: MutableArchive,
  partPath: string,
  opts: RoundTripOptions,
  forceDirty: boolean = false,
  slideSize?: { width: number; height: number },
): void {
  if (!forceDirty && paintEqual(current, snapshot)) return;
  const children = getChildren(cSld);
  const existing = findChildByLocal(children, "bg");
  let newBgNode: RawNode | undefined;
  if (current) {
    const media = new MediaTable();
    let bgXml = backgroundToXml(current, { media }, slideSize);
    if (media.list().length > 0) {
      bgXml = injectPartMedia(archive, partPath, media, bgXml);
    }
    if (bgXml && bgXml.trim()) {
      const wrapped =
        `<__root xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" ` +
        `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" ` +
        `xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
        bgXml +
        `</__root>`;
      try {
        const tree = parseFragmentAsChildren(wrapped);
        const wrapper = tree[0];
        if (wrapper && getTagName(wrapper) === "__root") {
          const inner = getChildren(wrapper);
          newBgNode = inner[0];
        }
      } catch {
        if (opts.debug) console.warn(`[roundtrip] ${partPath} failed to parse generated <p:bg>; skipped bg patch`);
        return;
      }
    }
  }
  const next: RawTree = [];
  let replaced = false;
  for (const child of children) {
    if (child === existing) {
      // 老 <p:bg> 命中：用 newBgNode 替换；newBgNode 为空（current 是 undefined）则删除整段。
      if (newBgNode) next.push(newBgNode);
      replaced = true;
      continue;
    }
    next.push(child);
  }
  if (!replaced && newBgNode) {
    // 原本没 <p:bg>，按 OOXML schema 把新 <p:bg> 放到 <p:spTree> 之前；
    // 若没找到 spTree（极少见），放在 cSld 子节点开头作为兜底。
    const idx = next.findIndex((c) => {
      const tag = getTagName(c);
      return tag !== undefined && localName(tag) === "spTree";
    });
    if (idx >= 0) next.splice(idx, 0, newBgNode);
    else next.unshift(newBgNode);
  }
  setChildren(cSld, next);
  if (opts.debug) console.log(`[roundtrip] ${partPath} background patched (snapshot != current)`);
}

function strokeEqual(
  a: import("@ppt/core").Stroke | undefined,
  b: import("@ppt/core").Stroke | undefined,
): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function paintEqual(a: Paint | undefined, b: Paint | undefined): boolean {
  // Paint 是纯 JSON 数据结构（kind / color / stops / src / fit ...）；JSON.stringify
  // 比较已经足够覆盖语义等价（字段顺序在我们的构造路径里是稳定的）。如果未来字段
  // 序列化顺序不稳定，再换成递归比较。
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

// ============================================================================
// 主题色板 / 字体回写
// ============================================================================

/**
 * 把内存里 `pres.theme.colors` / `pres.theme.fonts` 对齐到 archive 中所有
 * `ppt/theme/themeN.xml` 的 `<a:clrScheme>` / `<a:fontScheme>`。
 *
 * 触发条件：`pres.theme` 与 `pres.__source.themeSnapshot` JSON 不一致（典型：AI
 * `ApplyCustomThemeCmd` 写入新 colors / fonts）。snapshot 等于 current 时整段跳过 →
 * 原 theme XML 字节级保留。
 *
 * 色名映射（ECMA-376 §20.1.6.2 ClrScheme）：
 *   bg1 → lt1   tx1 → dk1
 *   bg2 → lt2   tx2 → dk2
 *   accent1..6 → accent1..6
 *   hlink / folHlink：内存模型不存这两个 → 保留 raw 原值不动。
 * 字体映射（§20.1.4.1.16 FontScheme）：
 *   theme.fonts.major → <a:majorFont>/<a:latin @typeface>
 *   theme.fonts.minor → <a:minorFont>/<a:latin @typeface>
 *
 * 实施细节：
 *   - 多 theme part：parser 只读首个 theme，但 pres.theme 是 deck 全局；
 *     这里"广播"到 archive 内所有 theme XML，让多主题 deck 也保持一致。
 *   - 不动 fmtScheme / objectDefaults / extLst：内存模型不携带这些，强行重写会丢失。
 *   - 只在 srgbClr 上写值：sysClr / schemeClr 引用结构在新主题下没意义，
 *     统一改成 srgbClr 是 PowerPoint 模板里也常见的做法。
 */
function patchThemeParts(pres: Presentation, archive: MutableArchive, opts: RoundTripOptions): void {
  const source = pres.__source as PresentationSource | undefined;
  if (!source) return;
  const theme = pres.theme;
  // 没设主题（极少见，新建空白模板可能命中） → 不动。
  if (!theme) return;
  const snapshot = source.themeSnapshot;
  if (themeColorsFontsEqual(theme, snapshot)) {
    if (opts.debug) console.log(`[roundtrip] theme unchanged, keep ${themePartCount(archive)} theme part(s) byte-identical`);
    return;
  }
  for (const partPath of archive.files.keys()) {
    if (!/^ppt\/theme\/theme\d+\.xml$/.test(partPath)) continue;
    patchSingleThemePart(partPath, theme, archive, opts, source.files);
  }
}

function themePartCount(archive: MutableArchive): number {
  let n = 0;
  for (const p of archive.files.keys()) if (/^ppt\/theme\/theme\d+\.xml$/.test(p)) n++;
  return n;
}

const COLOR_KEY_TO_SCHEME_LOCAL: Record<string, string> = {
  bg1: "lt1",
  tx1: "dk1",
  bg2: "lt2",
  tx2: "dk2",
  accent1: "accent1",
  accent2: "accent2",
  accent3: "accent3",
  accent4: "accent4",
  accent5: "accent5",
  accent6: "accent6",
};

function patchSingleThemePart(
  partPath: string,
  theme: Theme,
  archive: MutableArchive,
  opts: RoundTripOptions,
  files?: Map<string, Uint8Array>,
): void {
  const bytes = archive.files.get(partPath);
  if (!bytes) return;
  const xmlText = strFromU8(bytes);
  const tree = parsePartCached(files, partPath, xmlText);
  const before = JSON.stringify(tree);
  const themeEl = findRootElement(tree, "theme");
  if (!themeEl) return;
  const elements = findChildByLocal(getChildren(themeEl), "themeElements");
  if (!elements) return;
  const clrScheme = findChildByLocal(getChildren(elements), "clrScheme");
  if (clrScheme && theme.colors) {
    for (const [memKey, schemeLocal] of Object.entries(COLOR_KEY_TO_SCHEME_LOCAL)) {
      const value = theme.colors[memKey] ?? theme.colors[schemeLocal];
      if (!value) continue;
      const slot = findChildByLocal(getChildren(clrScheme), schemeLocal);
      if (!slot) continue;
      // 用 <a:srgbClr val="XXXXXX"/> 强制替换。原有 sysClr / schemeClr 内层结构丢弃。
      setChildren(slot, [{ "a:srgbClr": [], ":@": { "@_val": hex(value) } }]);
    }
  }
  const fontScheme = findChildByLocal(getChildren(elements), "fontScheme");
  if (fontScheme && theme.fonts) {
    const majorFace = primaryTypeface(theme.fonts.major);
    const minorFace = primaryTypeface(theme.fonts.minor);
    const majorEa = pickEaTypeface(theme.fonts.major);
    const minorEa = pickEaTypeface(theme.fonts.minor);
    if (majorFace) {
      const major = findChildByLocal(getChildren(fontScheme), "majorFont");
      if (major) {
        replaceLatinTypeface(major, majorFace);
        if (majorEa) replaceEaTypeface(major, majorEa);
        replaceCsTypeface(major, majorFace);
      }
    }
    if (minorFace) {
      const minor = findChildByLocal(getChildren(fontScheme), "minorFont");
      if (minor) {
        replaceLatinTypeface(minor, minorFace);
        if (minorEa) replaceEaTypeface(minor, minorEa);
        replaceCsTypeface(minor, minorFace);
      }
    }
  }
  const after = JSON.stringify(tree);
  if (before === after) return;
  archive.files.set(partPath, strToU8(buildXml(tree)));
  if (opts.debug) console.log(`[roundtrip] ${partPath} clrScheme / fontScheme patched to pres.theme`);
}

function replaceEaTypeface(fontEl: RawNode, typeface: string): void {
  const children = getChildren(fontEl);
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "ea") {
      setAttr(c, "typeface", typeface);
      return;
    }
  }
  setChildren(fontEl, [
    ...children,
    { "a:ea": [], ":@": { "@_typeface": typeface } },
  ]);
}

function replaceCsTypeface(fontEl: RawNode, typeface: string): void {
  const children = getChildren(fontEl);
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "cs") {
      setAttr(c, "typeface", typeface);
      return;
    }
  }
  setChildren(fontEl, [...children, { "a:cs": [], ":@": { "@_typeface": typeface } }]);
}

function replaceLatinTypeface(fontEl: RawNode, typeface: string): void {
  const children = getChildren(fontEl);
  for (const c of children) {
    const tag = getTagName(c);
    if (tag && localName(tag) === "latin") {
      setAttr(c, "typeface", typeface);
      return;
    }
  }
  // 没 <a:latin>（极少见）→ 在 fontEl 子节点开头插一个。
  setChildren(fontEl, [
    { "a:latin": [], ":@": { "@_typeface": typeface } },
    ...children,
  ]);
}

/**
 * run 上的超链接相对解析期快照是否被编辑过。
 * `noSnapshot` = 原 raw 完全没有 rPr（编辑器新建 run）→ 有链接就得写。
 */
function hyperlinkEdited(
  current: import("@ppt/core").HyperlinkRef | undefined,
  snap: { kind: string; target?: string; sound?: boolean; highlightClick?: boolean; endSnd?: boolean } | undefined,
  noSnapshot: boolean,
): boolean {
  if (!current) return false;
  if (noSnapshot || !snap) return true;
  if (current.kind !== snap.kind || (current.target ?? undefined) !== (snap.target ?? undefined)) return true;
  const hasSound = Boolean(current.sound?.name || current.sound?.src);
  if (hasSound !== Boolean(snap.sound)) return true;
  if (Boolean(current.highlightClick) !== Boolean(snap.highlightClick)) return true;
  if (Boolean(current.endSnd) !== Boolean(snap.endSnd)) return true;
  return false;
}

function runHasExplicitStyle(r: TextRun): boolean {
  // 「显式样式」判定的本意：run 上是否有需要 serializer 写回的样式字段。
  // 历史上是「内存 run 上任意样式字段非空」就算 true，但 parser 给所有 run 注入
  // 继承得来的 fontFamily / color，会让 master / layout 上"完全未编辑"的 run 也
  // 被判定为有显式样式，触发整段 rebuild，把 `<a:fld>` 等结构化节点扁平成 `<a:r>`。
  //
  // 用 parse-time 留下的 __explicitRPr 区分：当字段值与 snapshot 完全一致时
  // 视为「继承未改」，不算显式样式。snap === undefined 表示原 raw 完全没 rPr
  // 节点，这种情况下任何字段都按"用户加的"处理。
  const snap = getOrigin<RunOrigin>(r)?.explicitRPr;
  // `isEdited`：内存字段 vs snap 字段，差异时认为"被用户编辑了"。
  //   - snap===undefined：原 raw 完全没 rPr，内存字段都算 explicit（用户/编辑器加的）
  //   - snap 存在 + snap[key] 也存在 + 与 current 不同 → 编辑了
  //   - snap 存在 + snap[key] 不存在 → 内存值是继承得来的，未编辑
  //   - snap.fontFamily 形如 "+mn-lt" / "+mj-ea"：theme typeface 引用，parser 会把它
  //     解析成主题 fontScheme 里的具体字体（如 "Book Antiqua"），内存 run.fontFamily
  //     不会和 snap 字符串直接相等。这种引用如果按 "不等→edited" 处理就会把
  //     `<a:latin typeface="+mn-lt"/>` 错误地覆盖成 `<a:latin typeface="Book Antiqua"/>`，
  //     破坏 theme-switch 时跟随字体的语义。专门兜底：snap 值是 theme typeface 引用
  //     时一律视为未编辑（用户主动改字体会走另外的命令路径，此处不影响）。
  const isEdited = <K extends keyof NonNullable<typeof snap>>(key: K, current: unknown): boolean => {
    if (current === undefined || current === null) return false;
    if (snap === undefined) return true;
    const snapVal = snap[key];
    if (snapVal === undefined) return false;
    if (key === "fontFamily" && typeof snapVal === "string" && snapVal.startsWith("+")) return false;
    return snapVal !== current;
  };
  if (r.color) {
    // 用 parseColor 把内存 color (`#rrggbb` / `#rrggbbaa` / `rgba(...)` 等) 归一为
    // `#rrggbb`(小写) + 可选 alpha 后缀，与 snap.color 同格式逐字符比较即可。
    // snap.color 只抓 srgbClr 直写；schemeClr / themeColor 引用时 snap.color 为
    // undefined，按 isEdited 语义 → 视为继承未改 → 不重写 raw（保留原 <a:schemeClr/>）。
    const parsed = parseColor(r.color);
    const aHex = parsed.alpha !== undefined && parsed.alpha < 1
      ? Math.round(parsed.alpha * 255).toString(16).padStart(2, "0")
      : "";
    const cur = "#" + parsed.hex.toLowerCase() + aHex;
    if (isEdited("color", cur)) return true;
  }
  if (r.fontSize !== undefined && isEdited("fontSize", r.fontSize)) return true;
  const latinFirst = firstCssTypeface(r.fontFamily);
  if (latinFirst !== undefined && isEdited("fontFamily", latinFirst)) return true;
  if (r.fontWeight !== undefined) {
    const n = typeof r.fontWeight === "number" ? r.fontWeight : (r.fontWeight === "bold" ? 700 : 400);
    if (isEdited("fontWeight", n)) return true;
  }
  if (r.italic !== undefined && isEdited("italic", r.italic)) return true;
  if (r.underline !== undefined && r.underline !== false && isEdited("underline", r.underline)) return true;
  // 超链接：只有「模型里有、但与解析期快照不同」才算编辑。早先无条件 return true，
  // 使每个原生超链接 run 都走 rPr 重建 —— 作者显式的 <a:srgbClr> 被换成
  // <a:schemeClr val="hlink">，且 r:id 被重新登记，rels 每次保存都变长。
  if (hyperlinkEdited(r.hyperlink, snap?.hyperlink, snap === undefined)) return true;
  if (hyperlinkEdited(r.hoverLink, snap?.hoverLink, snap === undefined)) return true;
  if (runAddedOrChanged(outlineFingerprint(r), snap?.textOutline, snap === undefined)) return true;
  if (styleCleared(outlineFingerprint(r), snap?.textOutline)) return true;
  if (runAddedOrChanged(effectsFingerprint(r), snap?.effects, snap === undefined)) return true;
  if (styleCleared(effectsFingerprint(r), snap?.effects)) return true;
  if (runAddedOrChanged(r.strikethrough && r.strikethrough !== "none" ? r.strikethrough : undefined, snap?.strikethrough, snap === undefined)) return true;
  if (runAddedOrChanged(r.letterSpacing, snap?.letterSpacing, snap === undefined)) return true;
  if (r.highlight && runAddedOrChanged(r.highlight.toLowerCase(), snap?.highlight, snap === undefined)) return true;
  if (runAddedOrChanged(r.caps && r.caps !== "none" ? r.caps : undefined, snap?.caps, snap === undefined)) return true;
  return false;
}

function jsonEq(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** 描边 / 效果 / 高亮等：原 rPr 没有该项时内存有值 = 用户新加，必须写回。 */
function runAddedOrChanged(current: unknown, snapVal: unknown, noSnapshot: boolean): boolean {
  if (current === undefined || current === null) return false;
  if (noSnapshot) return true;
  if (snapVal === undefined) return true;
  return !jsonEq(current, snapVal);
}

function styleCleared(current: unknown, snapVal: unknown): boolean {
  return snapVal !== undefined && (current === undefined || current === null);
}

function outlineFingerprint(run: TextRun): { width: number; color?: string } | undefined {
  if (!run.textOutline) return undefined;
  const p = run.textOutline.paint;
  const color = p && p.kind === "solid" ? p.color.toLowerCase() : undefined;
  return { width: Math.round(run.textOutline.width * 1000) / 1000, color };
}

function effectsFingerprint(run: TextRun): Array<{ kind: string; color?: string }> | undefined {
  if (!run.effects?.length) return undefined;
  return run.effects.map((e) => {
    const color = "color" in e && typeof (e as { color?: unknown }).color === "string"
      ? (e as { color: string }).color.toLowerCase()
      : undefined;
    return color ? { kind: e.kind, color } : { kind: e.kind };
  });
}
