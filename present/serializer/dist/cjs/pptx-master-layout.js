"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderShapesXml = renderShapesXml;
exports.renderNotesMasterFromIr = renderNotesMasterFromIr;
exports.renderHandoutMasterFromIr = renderHandoutMasterFromIr;
exports.renderAuxMasterRelsXml = renderAuxMasterRelsXml;
exports.renderSlideMasterXml = renderSlideMasterXml;
exports.renderMasterRelsXml = renderMasterRelsXml;
exports.ooxmlSlideLayoutType = ooxmlSlideLayoutType;
exports.renderSlideLayoutXml = renderSlideLayoutXml;
exports.renderLayoutRelsXml = renderLayoutRelsXml;
const media_table_1 = require("./media-table");
const pptx_shapes_1 = require("./pptx-shapes");
const xml_util_1 = require("./xml-util");
/** 把一组 media 项渲染成 image relationship 行（master/layout/slide rels 共用）。 */
function imageRelsXml(items = []) {
    return items.map((it) => (0, media_table_1.mediaRelationshipXml)(it)).join("\n");
}
function renderShapesXml(shapes, media) {
    const spIdCounter = { next: 2 };
    return (shapes ?? []).map((s) => (0, pptx_shapes_1.shapeToXml)(s, { media, spIdCounter })).join("\n");
}
function clrMapXml(map) {
    if (map && Object.keys(map).length) {
        return `<p:clrMap${Object.entries(map)
            .map(([k, v]) => ` ${k}="${(0, xml_util_1.esc)(v)}"`)
            .join("")}/>`;
    }
    return `<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>`;
}
function auxMasterCSldXml(master, media, pageSize) {
    const bg = (0, pptx_shapes_1.backgroundToXml)(master.background, { media }, pageSize, master.bgRef);
    const shapesXml = renderShapesXml(master.shapes, media);
    const name = master.name?.trim();
    const nameAttr = name && !/^(Notes|Handout) Master$/i.test(name) ? ` name="${(0, xml_util_1.esc)(name)}"` : "";
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
function renderNotesMasterFromIr(master, media, pageSize) {
    return `${(0, xml_util_1.xmlHeader)()}
<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${auxMasterCSldXml(master, media, pageSize)}
  ${clrMapXml(master.clrMap)}
  ${(0, pptx_shapes_1.hfToXml)(master.hf)}
  ${(0, pptx_shapes_1.notesStyleToXml)(master.txStyles?.body, media)}
</p:notesMaster>`;
}
/** ECMA-376 §19.3.1.20 handoutMaster：cSld + clrMap + hf。 */
function renderHandoutMasterFromIr(master, media, pageSize) {
    return `${(0, xml_util_1.xmlHeader)()}
<p:handoutMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
                 xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
                 xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  ${auxMasterCSldXml(master, media, pageSize)}
  ${clrMapXml(master.clrMap)}
  ${(0, pptx_shapes_1.hfToXml)(master.hf)}
</p:handoutMaster>`;
}
/** notesMaster / handoutMaster rels：theme + 部件内图片。 */
function renderAuxMasterRelsXml(themeIdx, mediaItems = []) {
    const items = [
        `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme${themeIdx}.xml"/>`,
    ];
    const imgs = imageRelsXml(mediaItems);
    if (imgs)
        items.push(imgs);
    return `${(0, xml_util_1.xmlHeader)()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${items.join("\n")}
</Relationships>`;
}
function renderSlideMasterXml(master, layoutRefs, media, slideSize) {
    const bg = (0, pptx_shapes_1.backgroundToXml)(master.background, { media }, slideSize, master.bgRef);
    const shapesXml = renderShapesXml(master.shapes, media);
    const layoutIds = layoutRefs
        .map((l, i) => `<p:sldLayoutId id="${2147483649 + i}" r:id="${l.relId}"/>`)
        .join("");
    const clrMap = clrMapXml(master.clrMap);
    return `${(0, xml_util_1.xmlHeader)()}
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
  ${(0, pptx_shapes_1.hfToXml)(master.hf)}
  ${(0, pptx_shapes_1.txStylesToXml)(master.txStyles, media)}
</p:sldMaster>`;
}
function renderMasterRelsXml(layoutRefs, themeIdx, mediaItems = []) {
    const items = layoutRefs.map((l) => `<Relationship Id="${l.relId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout${l.layoutIdx}.xml"/>`);
    items.push(`<Relationship Id="rIdTheme" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme${themeIdx}.xml"/>`);
    // 母版背景 / 装饰 shape 的图片填充注册的 media → 必须补 image rel，否则 r:embed 悬空，
    // PowerPoint 打开时图片丢失甚至报修复。
    const imgs = imageRelsXml(mediaItems);
    if (imgs)
        items.push(imgs);
    return `${(0, xml_util_1.xmlHeader)()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${items.join("\n")}
</Relationships>`;
}
const SLIDE_LAYOUT_TYPES = new Set([
    "title", "tx", "twoColTx", "tbl", "txAndChart", "chartAndTx", "dgm", "chart", "txAndClipArt", "clipArtAndTx",
    "titleOnly", "blank", "txAndObj", "objAndTx", "objOnly", "obj", "txAndMedia", "mediaAndTx", "objOverTx",
    "txOverObj", "txAndTwoObj", "twoObjAndTx", "twoObjOverTx", "fourObj", "vertTx", "clipArtAndVertTx",
    "vertTitleAndTx", "vertTitleAndTxOverChart", "twoObj", "objAndTwoObj", "twoObjAndObj", "cust", "secHead",
    "twoTxTwoObj", "objTx", "picTx",
]);
/** 历史上 deckgen 写过的非枚举别名 → §19.7.15 ST_SlideLayoutType 合法值。 */
const LEGACY_LAYOUT_TYPE_ALIASES = { sectionHead: "secHead", pic: "picTx" };
/**
 * 把任意 layout type 收敛到 ST_SlideLayoutType 封闭枚举：已知别名映射，其他未知值写 cust，
 * 缺省 blank。round-trip 与 from-scratch 共用，否则 PowerPoint 按 schema 拒收整个 layout part。
 */
function ooxmlSlideLayoutType(type) {
    if (!type)
        return "blank";
    if (SLIDE_LAYOUT_TYPES.has(type))
        return type;
    return LEGACY_LAYOUT_TYPE_ALIASES[type] ?? "cust";
}
function renderSlideLayoutXml(layout, media, slideSize) {
    const bg = (0, pptx_shapes_1.backgroundToXml)(layout.background, { media }, slideSize, layout.bgRef);
    const shapesXml = renderShapesXml(layout.shapes, media);
    const typeAttr = ` type="${(0, xml_util_1.esc)(ooxmlSlideLayoutType(layout.type))}"`;
    return `${(0, xml_util_1.xmlHeader)()}
<p:sldLayout xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
             xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
             xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"
             xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"
             ${typeAttr}>
  <p:cSld${layout.name ? ` name="${(0, xml_util_1.esc)(layout.name)}"` : ""}>
    ${bg}
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      ${shapesXml}
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
  ${(0, pptx_shapes_1.hfToXml)(layout.hf)}
</p:sldLayout>`;
}
function renderLayoutRelsXml(masterIdx, mediaItems = []) {
    const imgs = imageRelsXml(mediaItems);
    return `${(0, xml_util_1.xmlHeader)()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rIdMaster" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster${masterIdx}.xml"/>
  ${imgs}
</Relationships>`;
}
