// from-scratch 路径的演讲备注部件（notesSlide + notesMaster）渲染。
//
// ECMA-376 结构（PresentationML §13.3.4 / §13.3.5）：
//   ppt/notesMasters/notesMaster1.xml   ← 有任何一页带 notes 就必须存在
//   ppt/notesSlides/notesSlide{K}.xml   ← 每个带 notes 的 slide 一个（K 按出现顺序编号）
//   presentation.xml <p:notesMasterIdLst> + rels notesMaster relationship
//   slide{N}.xml.rels 增加 notesSlide relationship
//
// 之前 from-scratch 完全不产这些部件：AI 生成 deck（skill Step 6 的演讲备注）
// 和 setSlideNotes 工具写入的 slide.notes 一经导出即丢失。
import { esc, xmlHeader } from "./xml-util.js";
import { renderAuxMasterRelsXml, renderNotesMasterFromIr, } from "./pptx-master-layout.js";
export function planNotes(pres) {
    const notesIdxBySlide = new Map();
    let next = 1;
    pres.slides.forEach((s, i) => {
        if (s.notes && s.notes.trim())
            notesIdxBySlide.set(i, next++);
    });
    const hasNotes = notesIdxBySlide.size > 0;
    return {
        notesIdxBySlide,
        hasNotes,
        hasNotesMaster: hasNotes || (pres.notesMasters?.length ?? 0) > 0,
        hasHandoutMaster: (pres.handoutMasters?.length ?? 0) > 0,
    };
}
/**
 * notesSlide 部件：最小合法结构 —— slide image 占位符 + notes body 占位符。
 * 备注文本按换行拆段。坐标基于 notesSz（纵向页：宽 = slide 高，高 = slide 宽）。
 */
export function renderNotesSlideXml(notes, slideSize) {
    // presentation.xml 里 notesSz = (cy, cx)，即 slide 尺寸旋转 90°（竖版 notes 页）。
    const pageW = slideSize.height;
    const pageH = slideSize.width;
    const emu = (px) => Math.round(px * 9525);
    // 上半页：幻灯片缩略图占位（居中，保持 slide 比例）；下半页：备注正文。
    const thumbW = pageW * 0.7;
    const thumbH = thumbW * (slideSize.height / slideSize.width);
    const thumbX = (pageW - thumbW) / 2;
    const thumbY = pageH * 0.05;
    const bodyX = pageW * 0.1;
    const bodyY = pageH * 0.52;
    const bodyW = pageW * 0.8;
    const bodyH = pageH * 0.4;
    const paragraphs = notes
        .split(/\r?\n/)
        .map((line) => `<a:p><a:r><a:rPr lang="en-US" dirty="0"/><a:t>${esc(line)}</a:t></a:r></a:p>`)
        .join("");
    return `${xmlHeader()}
<p:notes xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
         xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
         xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="2" name="Slide Image Placeholder 1"/>
          <p:cNvSpPr><a:spLocks noGrp="1" noRot="1" noChangeAspect="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="sldImg"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="${emu(thumbX)}" y="${emu(thumbY)}"/><a:ext cx="${emu(thumbW)}" cy="${emu(thumbH)}"/></a:xfrm>
        </p:spPr>
      </p:sp>
      <p:sp>
        <p:nvSpPr>
          <p:cNvPr id="3" name="Notes Placeholder 2"/>
          <p:cNvSpPr><a:spLocks noGrp="1"/></p:cNvSpPr>
          <p:nvPr><p:ph type="body" idx="1"/></p:nvPr>
        </p:nvSpPr>
        <p:spPr>
          <a:xfrm><a:off x="${emu(bodyX)}" y="${emu(bodyY)}"/><a:ext cx="${emu(bodyW)}" cy="${emu(bodyH)}"/></a:xfrm>
        </p:spPr>
        <p:txBody>
          <a:bodyPr/>
          <a:lstStyle/>
          ${paragraphs}
        </p:txBody>
      </p:sp>
    </p:spTree>
  </p:cSld>
  <p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr>
</p:notes>`;
}
export function renderNotesSlideRelsXml(slideIdx1Based) {
    return `${xmlHeader()}
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/notesMaster" Target="../notesMasters/notesMaster1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="../slides/slide${slideIdx1Based}.xml"/>
</Relationships>`;
}
/** notesMaster：有 IR 则写出形状/背景/页眉页脚；否则最小合法骨架。 */
export function renderNotesMasterXml(master, media, pageSize) {
    if (master && media)
        return renderNotesMasterFromIr(master, media, pageSize);
    return `${xmlHeader()}
<p:notesMaster xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"
               xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"
               xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <p:cSld>
    <p:spTree>
      <p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>
      <p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>
    </p:spTree>
  </p:cSld>
  <p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/>
  <p:notesStyle>
    <a:lvl1pPr marL="0" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">
      <a:defRPr sz="1200" kern="1200">
        <a:solidFill><a:schemeClr val="tx1"/></a:solidFill>
        <a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/>
      </a:defRPr>
    </a:lvl1pPr>
  </p:notesStyle>
</p:notesMaster>`;
}
export function renderNotesMasterRelsXml(themeIdx, mediaItems = []) {
    return renderAuxMasterRelsXml(themeIdx, mediaItems);
}
