"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SlideMediaTable = exports.DeckMediaRegistry = exports.MediaTable = void 0;
exports.writePptx = writePptx;
exports.buildDeckParts = buildDeckParts;
const core_1 = require("@sliiu/present-core");
const zip_write_1 = require("./zip-write");
const xml_util_1 = require("./xml-util");
const media_table_1 = require("./media-table");
const embedding_table_1 = require("./embedding-table");
const embedded_font_export_1 = require("./embedded-font-export");
const core_2 = require("@sliiu/present-core");
const pptx_shapes_1 = require("./pptx-shapes");
const pptx_smartart_1 = require("./pptx-smartart");
const pptx_ink_1 = require("./pptx-ink");
const pptx_sections_1 = require("./pptx-sections");
const pptx_default_text_style_1 = require("./pptx-default-text-style");
const theme_export_1 = require("./theme-export");
const pptx_timing_1 = require("./pptx-timing");
const pptx_roundtrip_1 = require("./pptx-roundtrip");
const pptx_master_layout_1 = require("./pptx-master-layout");
const pptx_notes_1 = require("./pptx-notes");
const pptx_comments_1 = require("./pptx-comments");
const pptx_comment_meta_1 = require("./pptx-comment-meta");
const pptx_view_props_1 = require("./pptx-view-props");
const pptx_pres_props_1 = require("./pptx-pres-props");
const pptx_chart_1 = require("./pptx-chart");
const pptx_chart_ex_1 = require("./pptx-chart-ex");
var media_table_2 = require("./media-table"); // 兼容旧 pptx-shapes import 路径
Object.defineProperty(exports, "MediaTable", { enumerable: true, get: function () { return media_table_2.MediaTable; } });
Object.defineProperty(exports, "DeckMediaRegistry", { enumerable: true, get: function () { return media_table_2.DeckMediaRegistry; } });
Object.defineProperty(exports, "SlideMediaTable", { enumerable: true, get: function () { return media_table_2.SlideMediaTable; } });
function writePptx(pres, opts = {}) {
    // round-trip 路径：演示文稿是从 pptx 解析得到的（带原始 archive 字节）
    // → 克隆原始 archive，仅对内存中改动的部分做 surgical patch，
    //   保留母版 / 版式 / 主题 / 动画 / Chart / SmartArt / 嵌入字体 / Notes / customXml / 扩展节点。
    // from-scratch 路径仅在「新建演示文稿」或 forceFromScratch 时使用。
    const src = pres.__source;
    if (src && !opts.forceFromScratch) {
        const patched = (0, pptx_roundtrip_1.writePptxRoundTrip)(pres, { debug: opts.debugRoundTrip });
        return packMapZip(patched);
    }
    // ---- from-scratch 路径 ----
    // 生成全部文本部件（buildFromScratchParts），再把 DeckMediaRegistry 收集到的媒体
    // 字节内联进同一个 zip，一次性打包。
    const deckMedia = new media_table_1.DeckMediaRegistry();
    const deckEmbeddings = new embedding_table_1.DeckEmbeddingRegistry();
    const deckFonts = new embedded_font_export_1.DeckEmbeddedFontRegistry();
    const parts = buildFromScratchParts(pres, opts, deckMedia, deckEmbeddings, deckFonts);
    const files = { ...parts };
    for (const m of deckMedia.fileEntries()) {
        files[`ppt/media/${m.name}`] = m.bytes;
    }
    for (const e of deckEmbeddings.fileEntries()) {
        files[`ppt/embeddings/${e.name}`] = e.bytes;
    }
    for (const f of deckFonts.fileEntries()) {
        files[`ppt/fonts/${f.name}`] = f.bytes;
    }
    return (0, zip_write_1.packZip)(files);
}
/**
 * 「分离生成」入口（服务端专用）：只做 from-scratch 的**纯文本部件生成**。
 * 媒体不解码、不打包，改为返回引用 manifest（zipPath + ref + mime）；zip 拼接由前端
 * assembleDeck 完成（媒体字节全程留在客户端）。
 *
 * 强制 from-scratch —— 服务端拿不到原始归档，round-trip 由客户端本地处理。
 */
function buildDeckParts(pres, opts = {}) {
    const deckMedia = new media_table_1.RefDeckMediaRegistry();
    const deckEmbeddings = new embedding_table_1.DeckEmbeddingRegistry();
    const deckFonts = new embedded_font_export_1.DeckEmbeddedFontRegistry();
    const files = buildFromScratchParts(pres, opts, deckMedia, deckEmbeddings, deckFonts);
    return { files, media: deckMedia.manifestEntries() };
}
/**
 * from-scratch 的核心渲染：按 pres.masters[].layouts[] + slides 输出所有 OOXML 文本部件，
 * 媒体经 `pool.createPartTable()` 分配文件名 / rId（真实池内联字节 / 引用池只记 manifest）。
 * 返回纯文本部件表（不含媒体字节，也不打包）——由调用方决定如何落地媒体与打包。
 *
 * 阶段 3.x：原本只输出一个硬编码空 master + 空 layout、所有 slide 都指向 slideLayout1。
 * 现在按 pres.masters[].layouts[] 完整输出多 master / 多 layout，保留模板的装饰 / 占位符 / 配色；
 * pres.masters 为空时 fallback 到"单空 master + 空 layout"最小骨架。
 */
function buildFromScratchParts(pres, opts, deckMedia, deckEmbeddings, deckFonts) {
    // schemeClr 保留：字面色命中 pres.theme 色板时写 <a:schemeClr>（与 round-trip 一致；
    // theme1.xml 由下方 renderTheme 用同一份 pres.theme 写出，引用必然自洽）。
    (0, pptx_shapes_1.setActiveSchemeColors)(pres.theme?.colors);
    try {
        return buildFromScratchPartsInner(pres, opts, deckMedia, deckEmbeddings, deckFonts);
    }
    finally {
        (0, pptx_shapes_1.setActiveSchemeColors)(undefined);
    }
}
function buildFromScratchPartsInner(pres, opts, deckMedia, deckEmbeddings, deckFonts) {
    const plan = planMastersAndLayouts(pres);
    const files = {};
    const fontTable = deckFonts.createPartTable();
    const embeddedFontLst = (0, embedded_font_export_1.renderEmbeddedFontLst)((0, embedded_font_export_1.groupEmbeddedFontsForExport)(pres.fonts ?? []), fontTable);
    const fontRelItems = fontTable.list();
    // master / layout 部件渲染（先于 slide，确保 layoutRef 解析时 plan 已经定型）。
    // 各 master 的 layoutRefs 是 master scope 内的 rIdLayout1..N，layoutIdx 是 deck-wide
    // 部件路径编号（slideLayout{N}.xml）。每个部件用 pool.createPartTable() 拿 per-part rId，
    // 再把 list() 喂给 rels 渲染器补 image relationship（否则母版/版式的图片会 r:embed 悬空）。
    for (const m of plan.masters) {
        const masterMedia = deckMedia.createPartTable();
        const layoutRefs = m.layouts.map((l, i) => ({ relId: `rIdLayout${i + 1}`, layoutIdx: l.layoutIdx }));
        const masterForRender = {
            ...m.master,
            background: (0, theme_export_1.backgroundForThemeExport)(m.master.background, pres),
        };
        files[`ppt/slideMasters/slideMaster${m.masterIdx}.xml`] = (0, pptx_master_layout_1.renderSlideMasterXml)(masterForRender, layoutRefs, masterMedia, pres.size);
        files[`ppt/slideMasters/_rels/slideMaster${m.masterIdx}.xml.rels`] = (0, pptx_master_layout_1.renderMasterRelsXml)(layoutRefs, 1, masterMedia.list());
        for (const l of m.layouts) {
            const layoutMedia = deckMedia.createPartTable();
            const layoutForRender = {
                ...l.layout,
                background: (0, theme_export_1.backgroundForThemeExport)(l.layout.background, pres),
            };
            files[`ppt/slideLayouts/slideLayout${l.layoutIdx}.xml`] = (0, pptx_master_layout_1.renderSlideLayoutXml)(layoutForRender, layoutMedia, pres.size);
            files[`ppt/slideLayouts/_rels/slideLayout${l.layoutIdx}.xml.rels`] = (0, pptx_master_layout_1.renderLayoutRelsXml)(m.masterIdx, layoutMedia.list());
        }
    }
    // 演讲备注 / 讲义母版：有 notes 文本就必须有 notesMaster；IR 里的 notesMasters /
    // handoutMasters 形状也要从零写出（编辑器母版视图改过的装饰）。
    const notesPlan = (0, pptx_notes_1.planNotes)(pres);
    const commentsPlan = planScratchComments(pres);
    const notesSize = pres.notesSize ?? { width: pres.size.height, height: pres.size.width };
    const needAuxTheme = notesPlan.hasNotesMaster || notesPlan.hasHandoutMaster;
    if (notesPlan.hasNotesMaster) {
        const notesMedia = deckMedia.createPartTable();
        const nm = pres.notesMasters?.[0];
        files["ppt/notesMasters/notesMaster1.xml"] = (0, pptx_notes_1.renderNotesMasterXml)(nm, nm ? notesMedia : undefined, notesSize);
        files["ppt/notesMasters/_rels/notesMaster1.xml.rels"] = (0, pptx_notes_1.renderNotesMasterRelsXml)(2, notesMedia.list());
    }
    if (notesPlan.hasHandoutMaster) {
        const handoutMedia = deckMedia.createPartTable();
        const hm = pres.handoutMasters[0];
        files["ppt/handoutMasters/handoutMaster1.xml"] = (0, pptx_master_layout_1.renderHandoutMasterFromIr)(hm, handoutMedia, pres.size);
        files["ppt/handoutMasters/_rels/handoutMaster1.xml.rels"] = (0, pptx_master_layout_1.renderAuxMasterRelsXml)(2, handoutMedia.list());
    }
    if (needAuxTheme) {
        files["ppt/theme/theme2.xml"] = renderTheme(pres.theme);
    }
    if (notesPlan.hasNotes) {
        for (const [slideIdx, notesIdx] of notesPlan.notesIdxBySlide) {
            const notes = pres.slides[slideIdx].notes;
            files[`ppt/notesSlides/notesSlide${notesIdx}.xml`] = (0, pptx_notes_1.renderNotesSlideXml)(notes, pres.size);
            files[`ppt/notesSlides/_rels/notesSlide${notesIdx}.xml.rels`] = (0, pptx_notes_1.renderNotesSlideRelsXml)(slideIdx + 1);
        }
    }
    // chart / SmartArt 部件编号 deck 级递增。
    const chartCounter = { next: 1 };
    const diagramCounter = { next: 1 };
    const inkCounter = { next: 1 };
    const allChartParts = [];
    const allDiagramIdx = [];
    const allInkIdx = [];
    pres.slides.forEach((slide, idx) => {
        const media = deckMedia.createPartTable();
        const embeddings = deckEmbeddings.createPartTable();
        const charts = new SlideChartCollector(chartCounter);
        const diagrams = new SlideDiagramCollector(diagramCounter, deckMedia);
        const inks = new SlideInkCollector(inkCounter);
        const links = new SlideLinkCollector(pres.slides.length);
        const xml = renderSlide(slide, media, pres.size, charts, links, embeddings, diagrams, inks);
        files[`ppt/slides/slide${idx + 1}.xml`] = xml;
        for (const c of charts.items) {
            allChartParts.push({ partIdx: c.partIdx, chartEx: c.chartEx });
            files[`ppt/charts/chart${c.partIdx}.xml`] = c.chartEx
                ? (0, pptx_chart_ex_1.renderChartExSpaceXml)(c.def)
                : (0, pptx_chart_1.renderChartSpaceXml)(c.def);
        }
        for (const d of diagrams.items) {
            allDiagramIdx.push(d.idx);
            Object.assign(files, d.files);
        }
        for (const ink of inks.items) {
            allInkIdx.push(ink.idx);
            files[(0, pptx_ink_1.inkPartPath)(ink.idx)] = ink.xml;
        }
        files[`ppt/slides/_rels/slide${idx + 1}.xml.rels`] = renderSlideRels(media.list(), resolveSlideLayoutIdx(slide, plan), notesPlan.notesIdxBySlide.get(idx), charts.items, links.items, embeddings.list(), links.slideItems, diagrams.items, inks.items, commentsPlan.bySlide.get(idx));
    });
    if (commentsPlan.authorsXml)
        files["ppt/commentAuthors.xml"] = commentsPlan.authorsXml;
    for (const p of commentsPlan.parts) {
        files[`ppt/comments/comment${p.partIdx}.xml`] = p.xml;
    }
    const hasEmbeddings = deckEmbeddings.fileEntries().length > 0;
    const hasFonts = deckFonts.fileEntries().length > 0;
    files["[Content_Types].xml"] = renderContentTypes(pres.slides.length, plan, notesPlan, allChartParts, hasEmbeddings, hasFonts, deckFonts.fileEntries().map((f) => f.name), allDiagramIdx, allInkIdx, commentsPlan);
    files["_rels/.rels"] = renderTopRels();
    files["ppt/_rels/presentation.xml.rels"] = renderPresRels(pres.slides.length, plan, notesPlan, fontRelItems, !!commentsPlan.authorsXml);
    files["ppt/presentation.xml"] = renderPresentation(pres, plan, notesPlan, embeddedFontLst);
    // 阶段 N：from-scratch 路径也要把 pres.theme 写进 theme1.xml。
    // 典型触发点：cache restore（IndexedDB structured clone 丢掉了非可枚举的 __source）
    // → round-trip 入口被跳过 → 走 from-scratch。如果这里还硬编码 Microsoft 默认 clrScheme，
    // AI 设置的 pres.theme.colors / fonts 就只会"显示在前端但保存不进去"，呈现"主题旧"的 bug。
    files["ppt/theme/theme1.xml"] = renderTheme(pres.theme);
    files["docProps/core.xml"] = renderCore(opts);
    files["docProps/app.xml"] = renderApp(pres.slides.length);
    (0, pptx_comment_meta_1.injectScratchPresentationTags)(pres, files);
    (0, pptx_comment_meta_1.injectScratchSlideTags)(pres, files);
    (0, pptx_view_props_1.injectScratchViewProps)(pres, files);
    (0, pptx_pres_props_1.injectScratchPresProps)(pres, files);
    return files;
}
function planScratchComments(pres) {
    const list = (0, pptx_comments_1.exportableComments)(pres.comments);
    const bySlide = new Map();
    if (!list.length)
        return { parts: [], bySlide };
    const { authors, authorIdByName } = (0, pptx_comments_1.buildCommentAuthors)(list);
    const parts = [];
    let partIdx = 1;
    for (let si = 0; si < pres.slides.length; si++) {
        const slideCm = (0, pptx_comments_1.slideCommentsForExport)(list, si, false);
        if (!slideCm.length)
            continue;
        parts.push({
            slideIdx: si,
            partIdx,
            xml: (0, pptx_comments_1.renderCommentsXml)(slideCm, authorIdByName, pres.size),
        });
        bySlide.set(si, partIdx);
        partIdx++;
    }
    return { authorsXml: (0, pptx_comments_1.renderCommentAuthorsXml)(authors), parts, bySlide };
}
function planMastersAndLayouts(pres) {
    const masters = [];
    const layoutIdxById = new Map();
    let nextLayoutIdx = 1;
    // 没 master：合成一个空 master + 空 blank layout，让最小骨架仍合法。
    if (!pres.masters || pres.masters.length === 0) {
        const fakeMaster = {
            id: "__synthetic_master__",
            name: "Default Master",
            shapes: [],
            layouts: [
                {
                    id: "__synthetic_layout__",
                    name: "Blank",
                    type: "blank",
                    shapes: [],
                },
            ],
        };
        masters.push({
            master: fakeMaster,
            masterIdx: 1,
            layouts: [{ layout: fakeMaster.layouts[0], layoutIdx: 1 }],
        });
        layoutIdxById.set("__synthetic_layout__", 1);
        return { masters, layoutIdxById, fallbackLayoutIdx: 1 };
    }
    pres.masters.forEach((m, mi) => {
        const entry = { master: m, masterIdx: mi + 1, layouts: [] };
        const layouts = m.layouts ?? [];
        for (const l of layouts) {
            const idx = nextLayoutIdx++;
            entry.layouts.push({ layout: l, layoutIdx: idx });
            layoutIdxById.set(l.id, idx);
        }
        // master 没有 layout 时强行加一个 blank，否则 PPT 打不开。
        if (entry.layouts.length === 0) {
            const idx = nextLayoutIdx++;
            const blank = {
                id: `${m.id}__synthetic_blank`,
                name: "Blank",
                type: "blank",
                shapes: [],
            };
            entry.layouts.push({ layout: blank, layoutIdx: idx });
            layoutIdxById.set(blank.id, idx);
        }
        masters.push(entry);
    });
    return { masters, layoutIdxById, fallbackLayoutIdx: 1 };
}
function resolveSlideLayoutIdx(slide, plan) {
    if (slide.layoutRef) {
        const idx = plan.layoutIdxById.get(slide.layoutRef.layoutId);
        if (idx !== undefined)
            return idx;
    }
    return plan.fallbackLayoutIdx;
}
// 单 slide 的 chart 部件收集器：graphicFrame 序列化时注册 ChartDef，
// 分配 deck 级部件编号 + slide 级 relId（rIdChart1..N，与 media 的 rId1..N 不冲突）。
class SlideChartCollector {
    counter;
    items = [];
    constructor(counter) {
        this.counter = counter;
    }
    register(def) {
        const chartEx = (0, pptx_chart_ex_1.chartExExportSupported)(def);
        const classic = (0, pptx_chart_1.chartExportSupported)(def);
        if (!chartEx && !classic)
            return null;
        const partIdx = this.counter.next++;
        const relId = `rIdChart${this.items.length + 1}`;
        this.items.push({ def, partIdx, relId, chartEx });
        return { relId, chartEx };
    }
}
// 单 slide 的外部超链接收集器：shape / run 级 `hyperlink: { kind: "url" }` 序列化时
// 注册 URL → relId（rIdLink1..N），rels 里写 TargetMode="External" 的 hyperlink 关系。
// 同一 URL 去重复用同一 relId（PowerPoint 自己也是这么写的）。
class SlideLinkCollector {
    slideCount;
    items = [];
    /** 内部跳页关系（ppaction://hlinksldjump 的 r:id 目标）。 */
    slideItems = [];
    byUrl = new Map();
    bySlide = new Map();
    constructor(slideCount) {
        this.slideCount = slideCount;
    }
    register(url) {
        const hit = this.byUrl.get(url);
        if (hit)
            return hit;
        const relId = `rIdLink${this.items.length + 1}`;
        this.items.push({ url, relId });
        this.byUrl.set(url, relId);
        return relId;
    }
    registerSlide(slideNumber) {
        // 越界页码（例如删页后残留的链接）不写关系 —— 悬空 Target 会让 PowerPoint 报修复。
        if (slideNumber < 1 || slideNumber > this.slideCount)
            return undefined;
        const hit = this.bySlide.get(slideNumber);
        if (hit)
            return hit;
        const relId = `rIdSld${this.slideItems.length + 1}`;
        this.slideItems.push({ slideNumber, relId });
        this.bySlide.set(slideNumber, relId);
        return relId;
    }
}
class SlideDiagramCollector {
    counter;
    deckMedia;
    items = [];
    constructor(counter, deckMedia) {
        this.counter = counter;
        this.deckMedia = deckMedia;
    }
    register(group) {
        if (!group.smartArtMeta)
            return null;
        const idx = this.counter.next++;
        const n = this.items.length + 1;
        const rels = {
            dm: `rIdDm${n}`,
            lo: `rIdLo${n}`,
            qs: `rIdQs${n}`,
            cs: `rIdCs${n}`,
        };
        const drawingMedia = this.deckMedia.createPartTable();
        const shifted = (group.children ?? []).map((c) => (0, pptx_smartart_1.offsetShapeTree)(c, -group.bbox.x, -group.bbox.y));
        // drawing.xml 的 spTree 是一棵独立的 id 空间（id=1 留给根 grpSp），但所有子 shape
        // 必须共用同一个计数器 —— 每个 child 各起一个 `{ next: 2 }` 会让全部 dsp:sp 都写成
        // id="2"，parser 按 id 建索引时后者覆盖前者，SmartArt 打开后只剩最后一个节点。
        const drawingCtx = { media: drawingMedia, spIdCounter: { next: 2 } };
        const childrenXml = shifted.map((c) => (0, pptx_shapes_1.shapeToXml)(c, drawingCtx)).join("\n");
        const files = (0, pptx_smartart_1.buildSmartArtPartFiles)({
            idx,
            layout: group.smartArtMeta.layout,
            items: (0, core_2.extractSmartArtItems)(group),
            bbox: group.bbox,
            childrenXml,
            drawingMedia: drawingMedia.list(),
        });
        this.items.push({ idx, files, ...rels });
        return rels;
    }
}
class SlideInkCollector {
    counter;
    items = [];
    constructor(counter) {
        this.counter = counter;
    }
    register(shape) {
        if (!(0, pptx_ink_1.isInkPath)(shape))
            return null;
        const idx = this.counter.next++;
        const relId = `rIdInk${this.items.length + 1}`;
        this.items.push({ idx, relId, xml: (0, pptx_ink_1.buildInkMlXml)(shape) });
        return { relId, idx };
    }
}
function renderSlide(slide, media, slideSize, charts, links, embeddings, diagrams, inks) {
    const spIdCounter = { next: 2 };
    const mediaTimings = [];
    const bg = (0, pptx_shapes_1.backgroundToXml)(slide.background, { media }, slideSize, slide.bgRef);
    // entrance 目标被 runtime 压成 opacity=0（parser timing pass / applyInitialEntranceState）；
    // 写盘时必须视作可见，否则 fill / stroke alpha 被烘焙成 0，shape 保存后整片消失。
    const entranceHidden = (0, core_1.computeInitialEntranceState)(slide).hiddenShapes;
    const ctx = {
        media,
        spIdCounter,
        slideSize,
        mediaTimings,
        entranceHidden,
        ...(charts ? { charts } : {}),
        ...(links ? { links } : {}),
        ...(embeddings ? { embeddings } : {}),
        ...(diagrams ? { diagrams } : {}),
        ...(inks ? { inks } : {}),
    };
    for (const layer of slide.layers ?? [])
        (0, pptx_shapes_1.assignSpIds)(layer.shapes ?? [], ctx);
    const layers = (slide.layers ?? []).map((l) => (l.shapes ?? []).map((s) => (0, pptx_shapes_1.shapeToXml)(s, ctx)).join("\n")).join("\n");
    const transitionXml = (0, pptx_timing_1.serializeTransition)(slide.transition, media);
    // 先把逻辑 spid 换成写出的 cNvPr@id，再补媒体节点：mediaTimings 里的 spid 就是写出的号，
    // 顺序反了会因为对不上号而给同一个视频重复挂一条 p:video。
    const timingXml = (0, pptx_timing_1.serializeTiming)((0, pptx_timing_1.mergeMediaTiming)((0, pptx_timing_1.remapTimingSpids)(slide.ooxmlTiming, ctx.spIdByShapeId), mediaTimings), media);
    const hfXml = (0, pptx_shapes_1.hfToXml)(slide.hf);
    const sldAttrs = (0, pptx_shapes_1.sldRootAttrXml)(slide);
    const cSldAttrs = (0, pptx_shapes_1.cSldNameAttr)(slide);
    const clrOvr = (0, pptx_shapes_1.clrMapOvrXml)(slide.clrMapOverride);
    return `${(0, xml_util_1.xmlHeader)()}
<p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
       xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
       xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
       xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"${sldAttrs}>
  <p:cSld${cSldAttrs}>
    ${bg}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${layers}
    </p:spTree>
  </p:cSld>
  ${clrOvr}
  ${transitionXml}
  ${timingXml}
  ${hfXml}
</p:sld>`;
}
function renderSlideRels(items, layoutIdx, notesIdx, chartItems, linkItems, oleItems, slideLinkItems, diagramItems, inkItems, commentsIdx) {
    const relsXml = items.map((m) => (0, media_table_1.mediaRelationshipXml)(m)).join("");
    const oleRels = (oleItems ?? [])
        .map((o) => `<Relationship Id="${o.relId}" Type="${embedding_table_1.OLE_OBJECT_REL_TYPE}" Target="../embeddings/${o.name}"/>`)
        .join("");
    const notesRel = notesIdx
        ? `<Relationship Id="rIdNotes" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesSlide" Target="../notesSlides/notesSlide${notesIdx}.xml"/>`
        : "";
    const commentsRel = commentsIdx
        ? `<Relationship Id="rIdComments" Type="${pptx_comments_1.REL_TYPE_COMMENTS}" Target="../comments/comment${commentsIdx}.xml"/>`
        : "";
    const chartRels = (chartItems ?? [])
        .map((c) => `<Relationship Id="${c.relId}" Type="${c.chartEx ? pptx_chart_ex_1.CHART_EX_REL_TYPE : "http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart"}" Target="../charts/chart${c.partIdx}.xml"/>`)
        .join("");
    const linkRels = (linkItems ?? [])
        .map((l) => `<Relationship Id="${l.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="${(0, xml_util_1.esc)(l.url)}" TargetMode="External"/>`)
        .join("");
    // 内部跳页：同目录下的 slideN.xml，internal 关系（无 TargetMode）。
    const slideLinkRels = (slideLinkItems ?? [])
        .map((s) => `<Relationship Id="${s.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slide${s.slideNumber}.xml"/>`)
        .join("");
    return `${(0, xml_util_1.xmlHeader)()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdLayout" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${layoutIdx}.xml"/>
  ${notesRel}
  ${commentsRel}
  ${chartRels}
  ${linkRels}
  ${slideLinkRels}
  ${oleRels}
  ${(0, pptx_smartart_1.diagramSlideRelsXml)(diagramItems ?? [])}
  ${(0, pptx_ink_1.inkSlideRelsXml)(inkItems ?? [])}
  ${relsXml}
</Relationships>`;
}
function renderContentTypes(slideCount, plan, notesPlan, chartParts = [], hasEmbeddings = false, hasFonts = false, fontPartNames = [], diagramIdx = [], inkIdx = [], commentsPlan) {
    const defaults = [
        `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>`,
        `<Default Extension="xml" ContentType="application/xml"/>`,
        `<Default Extension="png" ContentType="image/png"/>`,
        `<Default Extension="jpg" ContentType="image/jpeg"/>`,
        `<Default Extension="jpeg" ContentType="image/jpeg"/>`,
        `<Default Extension="gif" ContentType="image/gif"/>`,
        `<Default Extension="webp" ContentType="image/webp"/>`,
        `<Default Extension="svg" ContentType="image/svg+xml"/>`,
        `<Default Extension="mp4" ContentType="video/mp4"/>`,
        `<Default Extension="webm" ContentType="video/webm"/>`,
        `<Default Extension="mp3" ContentType="audio/mpeg"/>`,
        `<Default Extension="m4a" ContentType="audio/mp4"/>`,
        `<Default Extension="wav" ContentType="audio/wav"/>`,
        `<Default Extension="glb" ContentType="model/gltf-binary"/>`,
        `<Default Extension="gltf" ContentType="model/gltf+json"/>`,
        ...(hasEmbeddings
            ? [`<Default Extension="bin" ContentType="application/vnd.openxmlformats-officedocument.oleObject"/>`]
            : []),
    ];
    const overrides = [
        `<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>`,
        `<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`,
        `<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>`,
        `<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`,
    ];
    for (const m of plan.masters) {
        overrides.push(`<Override PartName="/ppt/slideMasters/slideMaster${m.masterIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>`);
        for (const l of m.layouts) {
            overrides.push(`<Override PartName="/ppt/slideLayouts/slideLayout${l.layoutIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>`);
        }
    }
    for (let i = 1; i <= slideCount; i++) {
        overrides.push(`<Override PartName="/ppt/slides/slide${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`);
    }
    if (notesPlan?.hasNotesMaster) {
        overrides.push(`<Override PartName="/ppt/notesMasters/notesMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesMaster+xml"/>`);
    }
    if (notesPlan?.hasHandoutMaster) {
        overrides.push(`<Override PartName="/ppt/handoutMasters/handoutMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.handoutMaster+xml"/>`);
    }
    if (notesPlan?.hasNotesMaster || notesPlan?.hasHandoutMaster) {
        overrides.push(`<Override PartName="/ppt/theme/theme2.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>`);
    }
    if (notesPlan?.hasNotes) {
        for (const notesIdx of notesPlan.notesIdxBySlide.values()) {
            overrides.push(`<Override PartName="/ppt/notesSlides/notesSlide${notesIdx}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.notesSlide+xml"/>`);
        }
    }
    for (const part of chartParts) {
        const ct = part.chartEx
            ? pptx_chart_ex_1.CHART_EX_CONTENT_TYPE
            : "application/vnd.openxmlformats-officedocument.drawingml.chart+xml";
        overrides.push(`<Override PartName="/ppt/charts/chart${part.partIdx}.xml" ContentType="${ct}"/>`);
    }
    for (const idx of diagramIdx) {
        for (const row of (0, pptx_smartart_1.diagramContentTypeRows)(idx)) {
            overrides.push(`<Override PartName="${row.part}" ContentType="${row.ct}"/>`);
        }
    }
    for (const idx of inkIdx) {
        for (const row of (0, pptx_ink_1.inkContentTypeRows)(idx)) {
            overrides.push(`<Override PartName="${row.part}" ContentType="${row.ct}"/>`);
        }
    }
    if (commentsPlan?.authorsXml) {
        overrides.push(`<Override PartName="/ppt/commentAuthors.xml" ContentType="${pptx_comments_1.CT_COMMENT_AUTHORS}"/>`);
        for (const p of commentsPlan.parts) {
            overrides.push(`<Override PartName="/ppt/comments/comment${p.partIdx}.xml" ContentType="${pptx_comments_1.CT_COMMENTS}"/>`);
        }
    }
    for (const name of fontPartNames) {
        overrides.push(`<Override PartName="/ppt/fonts/${name}" ContentType="application/x-fontdata"/>`);
    }
    return `${(0, xml_util_1.xmlHeader)()}
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  ${defaults.join("\n")}
  ${overrides.join("\n")}
</Types>`;
}
function renderTopRels() {
    return `${(0, xml_util_1.xmlHeader)()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;
}
function renderPresRels(slideCount, plan, notesPlan, fontItems, hasCommentAuthors) {
    const items = [];
    for (const m of plan.masters) {
        items.push(`<Relationship Id="rIdMaster${m.masterIdx}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster${m.masterIdx}.xml"/>`);
    }
    items.push(`<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>`);
    if (notesPlan?.hasNotesMaster) {
        items.push(`<Relationship Id="rIdNotesMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="notesMasters/notesMaster1.xml"/>`);
    }
    if (notesPlan?.hasHandoutMaster) {
        items.push(`<Relationship Id="rIdHandoutMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/handoutMaster" Target="handoutMasters/handoutMaster1.xml"/>`);
    }
    for (let i = 1; i <= slideCount; i++) {
        items.push(`<Relationship Id="rIdSlide${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i}.xml"/>`);
    }
    if (fontItems?.length) {
        items.push((0, embedded_font_export_1.renderPresentationFontRels)(fontItems));
    }
    if (hasCommentAuthors) {
        items.push(`<Relationship Id="rIdCommentAuthors" Type="${pptx_comments_1.REL_TYPE_COMMENT_AUTHORS}" Target="commentAuthors.xml"/>`);
    }
    return `${(0, xml_util_1.xmlHeader)()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${items.join("\n")}
</Relationships>`;
}
function renderCustomShowsXml(pres) {
    const shows = pres.customShows ?? [];
    if (!shows.length)
        return "";
    const items = shows
        .map((show, i) => {
        const indices = show.slideIndices?.length
            ? show.slideIndices
            : show.slideRIds
                .map((rid) => {
                const m = /^rIdSlide(\d+)$/.exec(rid);
                return m ? Number(m[1]) - 1 : -1;
            })
                .filter((n) => n >= 0);
        const slds = indices
            .filter((idx) => idx >= 0 && idx < pres.slides.length && pres.slides[idx]?.show !== false)
            .map((idx) => `<p:sld r:id="rIdSlide${idx + 1}"/>`)
            .join("");
        const id = Number.parseInt(show.id, 10);
        const idAttr = Number.isFinite(id) ? String(id) : String(i);
        return `<p:custShow id="${(0, xml_util_1.esc)(idAttr)}" name="${(0, xml_util_1.esc)(show.name)}"><p:sldLst>${slds}</p:sldLst></p:custShow>`;
    })
        .join("");
    return items ? `  <p:custShowLst>${items}</p:custShowLst>\n` : "";
}
function renderPhotoAlbumXml(album) {
    if (!album)
        return "";
    const attrs = [];
    if (album.bw)
        attrs.push('bw="1"');
    if (album.showCaptions)
        attrs.push('showCaptions="1"');
    if (album.layout)
        attrs.push(`layout="${(0, xml_util_1.esc)(album.layout)}"`);
    if (album.frame)
        attrs.push(`frame="${(0, xml_util_1.esc)(album.frame)}"`);
    return `  <p:photoAlbum${attrs.length ? ` ${attrs.join(" ")}` : ""}/>\n`;
}
function presentationRootAttrs(opts) {
    if (!opts)
        return "";
    const a = [];
    const flag = (k, v) => {
        if (v === true)
            a.push(`${k}="1"`);
        else if (v === false)
            a.push(`${k}="0"`);
    };
    if (opts.serverZoom !== undefined)
        a.push(`serverZoom="${Math.round(opts.serverZoom * 100000)}"`);
    if (opts.firstSlideNum !== undefined)
        a.push(`firstSlideNum="${opts.firstSlideNum}"`);
    flag("showSpecialPlsOnTitleSld", opts.showSpecialPlsOnTitleSld);
    flag("rtl", opts.rtl);
    flag("removePersonalInfoOnSave", opts.removePersonalInfoOnSave);
    flag("compatMode", opts.compatMode);
    flag("strictFirstAndLastChars", opts.strictFirstAndLastChars);
    flag("embedTrueTypeFonts", opts.embedTrueTypeFonts);
    flag("saveSubsetFonts", opts.saveSubsetFonts);
    flag("autoCompressPictures", opts.autoCompressPictures);
    if (opts.bookmarkIdSeed !== undefined)
        a.push(`bookmarkIdSeed="${opts.bookmarkIdSeed}"`);
    if (opts.conformance)
        a.push(`conformance="${(0, xml_util_1.esc)(opts.conformance)}"`);
    return a.length ? ` ${a.join(" ")}` : "";
}
function sldSzTypeAttr(width, height) {
    if (!(width > 0) || !(height > 0))
        return ` type="screen16x9"`;
    const r = width / height;
    const near = (t) => Math.abs(r - t) < 0.04;
    if (near(16 / 9))
        return ` type="screen16x9"`;
    if (near(16 / 10))
        return ` type="screen16x10"`;
    if (near(4 / 3))
        return ` type="screen4x3"`;
    return ` type="custom"`;
}
function renderModifyVerifierXml(mv) {
    if (!mv)
        return "";
    const a = [];
    if (mv.algorithmName)
        a.push(`algorithmName="${(0, xml_util_1.esc)(mv.algorithmName)}"`);
    if (mv.hashValue)
        a.push(`hashValue="${(0, xml_util_1.esc)(mv.hashValue)}"`);
    if (mv.hashData)
        a.push(`hashData="${(0, xml_util_1.esc)(mv.hashData)}"`);
    if (mv.saltValue)
        a.push(`saltValue="${(0, xml_util_1.esc)(mv.saltValue)}"`);
    if (mv.saltData)
        a.push(`saltData="${(0, xml_util_1.esc)(mv.saltData)}"`);
    if (mv.spinValue !== undefined)
        a.push(`spinValue="${mv.spinValue}"`);
    if (mv.spinCount !== undefined)
        a.push(`spinCount="${mv.spinCount}"`);
    if (mv.cryptProviderType)
        a.push(`cryptProviderType="${(0, xml_util_1.esc)(mv.cryptProviderType)}"`);
    if (mv.cryptAlgorithmClass)
        a.push(`cryptAlgorithmClass="${(0, xml_util_1.esc)(mv.cryptAlgorithmClass)}"`);
    if (mv.cryptAlgorithmType)
        a.push(`cryptAlgorithmType="${(0, xml_util_1.esc)(mv.cryptAlgorithmType)}"`);
    if (mv.cryptAlgorithmSid !== undefined)
        a.push(`cryptAlgorithmSid="${mv.cryptAlgorithmSid}"`);
    return a.length ? `  <p:modifyVerifier ${a.join(" ")}/>\n` : "";
}
function renderKinsokuXml(kinsoku) {
    if (!kinsoku)
        return "";
    const attrs = [];
    if (kinsoku.lang)
        attrs.push(`lang="${(0, xml_util_1.esc)(kinsoku.lang)}"`);
    if (kinsoku.invalStChars)
        attrs.push(`invalStChars="${(0, xml_util_1.esc)(kinsoku.invalStChars)}"`);
    if (kinsoku.invalEndChars)
        attrs.push(`invalEndChars="${(0, xml_util_1.esc)(kinsoku.invalEndChars)}"`);
    return attrs.length ? `  <p:kinsoku ${attrs.join(" ")}/>\n` : "";
}
function renderPresentation(pres, plan, notesPlan, embeddedFontLst = "") {
    const cxEmu = Math.round(pres.size.width * 9525);
    const cyEmu = Math.round(pres.size.height * 9525);
    const sldIds = pres.slides
        .map((_, i) => `<p:sldId id="${256 + i}" r:id="rIdSlide${i + 1}"/>`)
        .join("");
    const sldMasterIds = plan.masters
        .map((m, i) => `<p:sldMasterId id="${2147483648 + i}" r:id="rIdMaster${m.masterIdx}"/>`)
        .join("");
    // CT_Presentation 子元素顺序：sldMasterIdLst → notesMasterIdLst → handoutMasterIdLst → sldIdLst → sldSz → notesSz。
    const notesMasterIds = notesPlan?.hasNotesMaster
        ? `<p:notesMasterIdLst><p:notesMasterId r:id="rIdNotesMaster"/></p:notesMasterIdLst>`
        : "";
    const handoutMasterIds = notesPlan?.hasHandoutMaster
        ? `<p:handoutMasterIdLst><p:handoutMasterId r:id="rIdHandoutMaster"/></p:handoutMasterIdLst>`
        : "";
    const notesCx = Math.round((pres.notesSize?.width ?? pres.size.height) * 9525);
    const notesCy = Math.round((pres.notesSize?.height ?? pres.size.width) * 9525);
    const sectionLst = (0, pptx_sections_1.renderSectionLstXml)(pres.sections ?? [], (0, pptx_sections_1.fromScratchSldIds)(pres.slides.length));
    return `${(0, xml_util_1.xmlHeader)()}
<p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"${presentationRootAttrs(pres.options)}>
  <p:sldMasterIdLst>${sldMasterIds}</p:sldMasterIdLst>
  ${notesMasterIds}
  ${handoutMasterIds}
  <p:sldIdLst>${sldIds}</p:sldIdLst>
  ${embeddedFontLst}
  <p:sldSz cx="${cxEmu}" cy="${cyEmu}"${sldSzTypeAttr(pres.size.width, pres.size.height)}/>
  <p:notesSz cx="${notesCx}" cy="${notesCy}"/>
${renderCustomShowsXml(pres)}${renderPhotoAlbumXml(pres.photoAlbum)}${renderKinsokuXml(pres.kinsoku)}${(0, pptx_default_text_style_1.renderDefaultTextStyleXml)((0, core_1.ooxmlLangFromProofingId)((0, core_1.getProofingLanguage)(pres)), pres.defaultTextStyle)}
${renderModifyVerifierXml(pres.modifyVerifier)}${sectionLst}
</p:presentation>`;
}
// Microsoft Office 默认主题色（ECMA-376 兼容兜底）。pres.theme 缺字段时按 key fallback。
// 注意：lt1/dk1 在 ECMA 默认是 sysClr，这里改为 srgbClr 简化输出；
// 视觉上等价（window/windowText 在普通桌面环境即纯白/纯黑）。
const DEFAULT_THEME_COLORS = {
    dk1: "000000",
    lt1: "FFFFFF",
    dk2: "44546A",
    lt2: "E7E6E6",
    accent1: "4472C4",
    accent2: "ED7D31",
    accent3: "A5A5A5",
    accent4: "FFC000",
    accent5: "5B9BD5",
    accent6: "70AD47",
    hlink: "0563C1",
    folHlink: "954F72",
};
// pres.theme.colors 用 bg1/tx1/bg2/tx2 命名，OOXML clrScheme 用 lt1/dk1/lt2/dk2，
// 二者互为别名（见 ECMA-376 §20.1.6.2 + parseTheme 反向映射）。
const SCHEME_KEY_TO_COLOR_ENTRY = {
    lt1: "bg1",
    dk1: "tx1",
    lt2: "bg2",
    dk2: "tx2",
    accent1: "accent1",
    accent2: "accent2",
    accent3: "accent3",
    accent4: "accent4",
    accent5: "accent5",
    accent6: "accent6",
    hlink: "hlink",
    folHlink: "folHlink",
};
// 与 pptx-shapes SCHEME_SLOT_SOURCES 同序（别名优先、槽位名兜底），否则 schemeClr 引用会指向写出值不同的槽位。
function pickThemeColor(theme, schemeKey) {
    const memKey = SCHEME_KEY_TO_COLOR_ENTRY[schemeKey];
    const raw = (memKey ? theme?.colors?.[memKey] : undefined) ?? theme?.colors?.[schemeKey];
    if (raw && typeof raw === "string") {
        const stripped = raw.startsWith("#") ? raw.slice(1) : raw;
        if (/^[0-9a-fA-F]{6}$/.test(stripped))
            return stripped.toUpperCase();
        if (/^[0-9a-fA-F]{8}$/.test(stripped))
            return stripped.slice(0, 6).toUpperCase();
    }
    return DEFAULT_THEME_COLORS[schemeKey];
}
function renderTheme(theme) {
    // ECMA-376 §20.1.6.2 ClrScheme：dk1/lt1/dk2/lt2 + 6 个 accent + hlink/folHlink。
    // 全部输出为 srgbClr —— 简单可控，PowerPoint / WPS / Keynote 都接受。
    // pres.theme 缺字段时回落到 Microsoft 默认色，避免出现 schemeClr 引用解析不到。
    const major = (0, theme_export_1.primaryTypeface)(theme?.fonts?.major) ?? "Calibri Light";
    const minor = (0, theme_export_1.primaryTypeface)(theme?.fonts?.minor) ?? "Calibri";
    const majorEa = (0, theme_export_1.pickEaTypeface)(theme?.fonts?.major) ?? "";
    const minorEa = (0, theme_export_1.pickEaTypeface)(theme?.fonts?.minor) ?? "";
    const c = (k) => pickThemeColor(theme, k);
    return `${(0, xml_util_1.xmlHeader)()}
<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="${(0, xml_util_1.esc)(theme?.name ?? "Default")}">
  <a:themeElements>
    <a:clrScheme name="${(0, xml_util_1.esc)(theme?.name ?? "Default")}">
      <a:dk1><a:srgbClr val="${c("dk1")}"/></a:dk1>
      <a:lt1><a:srgbClr val="${c("lt1")}"/></a:lt1>
      <a:dk2><a:srgbClr val="${c("dk2")}"/></a:dk2>
      <a:lt2><a:srgbClr val="${c("lt2")}"/></a:lt2>
      <a:accent1><a:srgbClr val="${c("accent1")}"/></a:accent1>
      <a:accent2><a:srgbClr val="${c("accent2")}"/></a:accent2>
      <a:accent3><a:srgbClr val="${c("accent3")}"/></a:accent3>
      <a:accent4><a:srgbClr val="${c("accent4")}"/></a:accent4>
      <a:accent5><a:srgbClr val="${c("accent5")}"/></a:accent5>
      <a:accent6><a:srgbClr val="${c("accent6")}"/></a:accent6>
      <a:hlink><a:srgbClr val="${c("hlink")}"/></a:hlink>
      <a:folHlink><a:srgbClr val="${c("folHlink")}"/></a:folHlink>
    </a:clrScheme>
    <a:fontScheme name="${(0, xml_util_1.esc)(theme?.name ?? "Default")}">
      <a:majorFont>${(0, theme_export_1.themeTypefacesXml)(major, majorEa || undefined)}</a:majorFont>
      <a:minorFont>${(0, theme_export_1.themeTypefacesXml)(minor, minorEa || undefined)}</a:minorFont>
    </a:fontScheme>
    ${(0, theme_export_1.officeFmtSchemeXml)()}
  </a:themeElements>
  ${(0, theme_export_1.objectDefaultsXml)()}
  <a:extraClrSchemeLst/>
</a:theme>`;
}
function renderCore(opts) {
    const now = new Date().toISOString().replace(/\.\d+/, "");
    return `${(0, xml_util_1.xmlHeader)()}
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
                   xmlns:dc="http://purl.org/dc/elements/1.1/"
                   xmlns:dcterms="http://purl.org/dc/terms/"
                   xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${(0, xml_util_1.esc)(opts.title ?? "Presentation")}</dc:title>
  <dc:creator>${(0, xml_util_1.esc)(opts.author ?? "ppt-convert")}</dc:creator>
  <cp:lastModifiedBy>${(0, xml_util_1.esc)(opts.author ?? "ppt-convert")}</cp:lastModifiedBy>
  <dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
  <dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified>
</cp:coreProperties>`;
}
function renderApp(slideCount) {
    return `${(0, xml_util_1.xmlHeader)()}
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"
            xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">
  <Application>ppt-convert</Application>
  <Slides>${slideCount}</Slides>
  <PresentationFormat>Widescreen</PresentationFormat>
</Properties>`;
}
// 把一个「path → bytes」Map 打包成 zip，供 round-trip 路径复用。
function packMapZip(map) {
    const files = {};
    for (const [k, v] of map)
        files[k] = v;
    return (0, zip_write_1.packZip)(files);
}
