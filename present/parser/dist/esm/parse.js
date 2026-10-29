import { getOrigin, setOrigin, VBA_PROJECT_PART_PATH } from "@sliiu/present-core";
import { boolish } from "./units.js";
import { findByLocalName, findAllByLocalName, attr, orderedChildren, stripNs } from "./xml.js";
import { emuToPx } from "./units.js";
import { loadArchive } from "./zip.js";
import { findPresentationPath, loadRels, loadXmlPart } from "./parts.js";
import { applyClrMapToTheme, parseTheme } from "./theme.js";
import { parseTimingOoxml, resolveTimingSoundTargets } from "./timing-ooxml.js";
import { collectEntranceTargets } from "@sliiu/present-animation";
import { parseBuildList } from "./bld-list.js";
import { parseSlideTransition } from "./transition.js";
import { MediaResolver } from "./media.js";
import { parseEmbeddedFonts } from "./embedded-fonts.js";
import { parsePhotoAlbum, photoAlbumSnapshot } from "./photo-album.js";
import { parseViewGuides } from "./view-props.js";
import { parseShowProperties } from "./pres-props.js";
import { parseVbaProjectMetadata } from "./vba-project-parse.js";
import { followFirstRelByType, parseSlideLikePart } from "./slide-like.js";
import { loadTableStyles } from "./table-styles.js";
import { applyAutoFit, applyInheritance, indexPlaceholders, } from "./inherit.js";
import { parseLstStyle, parseTxStyles } from "./tx-styles.js";
import { loadCommentAuthors, loadSlideComments, linkImportedCommentThreads, loadCommentMetaFromArchive, loadMetaTagFromArchive, } from "./comments.js";
import { loadModernAuthors, modernAuthorsPartPath } from "./modern-comments.js";
import { applyCommentMeta, applyEditorPluginsMeta, applyModifyVerifierProtection, applyPlaybackPluginsMeta, applyDeckSectionsMeta, applyProofingLangMeta, applyProtectionMeta, proofingIdFromOoxmlLang, setProofingLanguageMeta, buildCommentMeta, buildEditorPluginsMeta, buildPlaybackPluginsMeta, buildDeckSectionsMeta, buildProofingLangMeta, buildProtectionMeta, COMMENT_META_TAG, EDITOR_PLUGINS_META_TAG, PLAYBACK_PLUGINS_META_TAG, PROTECTION_META_TAG, PROOFING_LANG_META_TAG, PROOFING_LANG_META_KEY, SECTIONS_META_TAG, kinsokuSnapshot, viewGuidesSnapshot, showPropertiesSnapshot, } from "@sliiu/present-core";
import { parsePPrDefaults, readRunProps } from "./text.js";
import { parsePresentationSectionLst } from "./sections.js";
import { findByLocalName as findEl } from "./xml.js";
const TYPE_LAYOUT = "/slideLayout";
const TYPE_MASTER = "/slideMaster";
const TYPE_THEME = "/theme";
const TYPE_NOTES_MASTER = "/notesMaster";
const TYPE_HANDOUT_MASTER = "/handoutMaster";
const TYPE_NOTES_SLIDE = "/notesSlide";
const TYPE_TABLE_STYLES = "/tableStyles";
/** 打不开的文件类型；宿主按 `code` 给本地化提示。 */
export class PptxOpenError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = "PptxOpenError";
    }
}
// UTF-16LE "EncryptedPackage"：[MS-OFFCRYPTO] §2.3.4 加密 OOXML 包在 CFB 里的流名。
const ENCRYPTED_PACKAGE_UTF16 = Array.from("EncryptedPackage").flatMap((c) => [c.charCodeAt(0), 0]);
function containsBytes(hay, needle) {
    const first = needle[0];
    outer: for (let i = hay.indexOf(first); i >= 0 && i <= hay.length - needle.length; i = hay.indexOf(first, i + 1)) {
        for (let j = 1; j < needle.length; j++)
            if (hay[i + j] !== needle[j])
                continue outer;
        return true;
    }
    return false;
}
/**
 * OLE2 compound document magic。两种来源：设了打开密码的 .pptx（[MS-OFFCRYPTO] 把
 * 整个包加密后装进 CFB 的 EncryptedPackage 流）和 97–2003 二进制 .ppt，都不支持。
 */
function assertNotCompoundFile(bytes) {
    if (bytes.length < 8)
        return;
    const ole = bytes[0] === 0xd0 &&
        bytes[1] === 0xcf &&
        bytes[2] === 0x11 &&
        bytes[3] === 0xe0 &&
        bytes[4] === 0xa1 &&
        bytes[5] === 0xb1 &&
        bytes[6] === 0x1a &&
        bytes[7] === 0xe1;
    if (!ole)
        return;
    if (containsBytes(bytes, ENCRYPTED_PACKAGE_UTF16)) {
        throw new PptxOpenError("ENCRYPTED_PPTX", "Password-protected .pptx is not supported; remove the password and try again");
    }
    throw new PptxOpenError("LEGACY_PPT", "Legacy .ppt (97-2003 binary) is not supported; please open or save as .pptx");
}
export async function parsePptx(input, opts = {}) {
    const bytes = await toBytes(input);
    assertNotCompoundFile(bytes);
    const archive = await loadArchive(bytes);
    const pres = parseFromArchive(archive, opts);
    if (opts.bake3D) {
        await bakeAll3D(pres, opts.bake3D);
    }
    return pres;
}
async function toBytes(input) {
    if (input instanceof Uint8Array)
        return input;
    if (input instanceof ArrayBuffer)
        return new Uint8Array(input);
    if (typeof Blob !== "undefined" && input instanceof Blob) {
        return new Uint8Array(await input.arrayBuffer());
    }
    return new Uint8Array(0);
}
export function parseFromArchive(archive, opts = {}) {
    const presPath = findPresentationPath(archive);
    const presXml = loadXmlPart(archive, presPath);
    if (!presXml) {
        const sample = archive.list().slice(0, 30);
        throw new Error(`presentation.xml not found at "${presPath}". archive has ${archive.files.size} files. sample: ${sample.join(", ")}`);
    }
    const presEl = findByLocalName(presXml, "presentation");
    if (!presEl) {
        throw new Error(`presentation.xml has unexpected root: ${Object.keys(presXml).join(",")}`);
    }
    const size = parseSize(findByLocalName(presEl, "sldSz"));
    const notesSize = parseNotesSize(findByLocalName(presEl, "notesSz"));
    const presRels = loadRels(archive, presPath);
    const presTheme = loadFirstTheme(archive, presRels);
    const media = new MediaResolver(archive, opts.mediaMode ?? "blob");
    const masterCache = new Map();
    const layoutCache = new Map();
    // 嵌入字体需在 slide 解析之前先解析出来，便于以"基底族名"作为同脚本兜底注入 TextCtx —
    // 浏览器在 SVG <text> 上对 font-family 列表的回退在部分内核上并不总能逐字符尝试整个链；
    // 把"已加载的嵌入字体族名"显式放到链尾可显著提升缺省 typeface（如未嵌入的中文族名）时
    // 的渲染一致性。
    const fonts = parseEmbeddedFonts(presEl, presRels, archive, media);
    const embeddedFontFamilies = collectEmbeddedFontFamilies(fonts);
    // ECMA-376 §19.2.1.7 defaultTextStyle 必须在 slide 解析之前计算 —— inherit.ts 要用它给
    // txBox=1 的 non-placeholder 文本框补缺省 fontSize/fontFamily（PowerPoint 行为：txBox 走
    // presentation.xml/defaultTextStyle，而不是 master/txStyles/otherStyle）。
    const defaultTextStyle = parseDefaultTextStyle(presEl, { theme: presTheme });
    // 先 prefetch 所有 master 和它们的 layout：getLayout / getMaster 在 parseSlide 内是
    // lazy 触发，没有被任何 slide 引用的 master/layout 不会进 cache，导致 pres.masters[]
    // 漏失。母版「完整还原」要求与 .pptx 内 sldMasterIdLst / sldLayoutIdLst 一一对应。
    prefetchAllMastersAndLayouts(archive, presRels, presTheme, media, masterCache, layoutCache, embeddedFontFamilies);
    const tableStylesPath = followFirstRelByType(presRels, TYPE_TABLE_STYLES);
    const fillCtx = presTheme
        ? { theme: presTheme, rels: presRels, resolveImage: (p) => media.resolve(p) }
        : { rels: presRels, resolveImage: (p) => media.resolve(p) };
    const tableStyleMap = loadTableStyles(archive, tableStylesPath, fillCtx);
    const commentAuthors = loadCommentAuthors(archive, presRels);
    const modernAuthors = loadModernAuthors(archive, presRels);
    const deckComments = [];
    const slides = parseSlides(archive, presEl, presRels, presTheme, media, masterCache, layoutCache, embeddedFontFamilies, defaultTextStyle, tableStyleMap, commentAuthors, deckComments, modernAuthors);
    // 把所有命中的 master/layout 汇总成 deck 级 Presentation.masters[]，
    // 阶段 1 只读暴露 —— editor 仍然走 slide.layers 上的副本编辑路径，
    // 但 single source of truth 在这里 ready 供阶段 2 切换。
    const masters = collectMasters(masterCache, layoutCache);
    const options = parsePresentationOptions(presEl);
    const customShows = parseCustomShows(presEl);
    const photoAlbum = parsePhotoAlbum(presEl);
    const kinsoku = parseKinsoku(presEl);
    const modifyVerifier = parseModifyVerifier(presEl);
    const customData = parseCustomData(presEl, presRels, archive);
    const hasVbaProject = archive.files.has(VBA_PROJECT_PART_PATH);
    const vbaProjectBytes = hasVbaProject ? archive.getBytes(VBA_PROJECT_PART_PATH) : undefined;
    const vbaProjectMeta = vbaProjectBytes ? parseVbaProjectMetadata(vbaProjectBytes) : undefined;
    const notesMasters = loadAuxMasters(archive, presRels, presTheme, media, TYPE_NOTES_MASTER, embeddedFontFamilies);
    const handoutMasters = loadAuxMasters(archive, presRels, presTheme, media, TYPE_HANDOUT_MASTER, embeddedFontFamilies);
    if (deckComments.length) {
        if (!deckComments.some((c) => c.parentId || c.resolved)) {
            linkImportedCommentThreads(deckComments);
        }
        const metaRaw = customData?.tags?.[COMMENT_META_TAG] ??
            loadCommentMetaFromArchive(archive, presRels);
        applyCommentMeta(deckComments, metaRaw);
    }
    const pres = {
        id: opts.baseId ?? "pres_" + Math.random().toString(36).slice(2, 9),
        size,
        notesSize,
        slides,
        theme: presTheme
            ? {
                id: "theme1",
                name: "default",
                fonts: { major: presTheme.fontMajor, minor: presTheme.fontMinor },
                colors: Object.fromEntries(presTheme.schemeColors),
            }
            : undefined,
        fonts: fonts.length ? fonts : undefined,
        options,
        customShows,
        photoAlbum,
        vbaProject: vbaProjectMeta,
        kinsoku,
        modifyVerifier,
        customData,
        defaultTextStyle,
        masters: masters.length ? masters : undefined,
        notesMasters,
        handoutMasters,
        comments: deckComments.length ? deckComments : undefined,
    };
    const { viewGuides, viewPropsPartPath } = parseViewGuides(archive, presRels);
    if (viewGuides)
        pres.viewGuides = viewGuides;
    const { showPr, presPropsPartPath } = parseShowProperties(archive, presRels);
    if (showPr)
        pres.showPr = showPr;
    const protectionRaw = customData?.tags?.[PROTECTION_META_TAG] ??
        loadMetaTagFromArchive(archive, presRels, PROTECTION_META_TAG);
    applyProtectionMeta(pres, protectionRaw);
    const editorPluginsRaw = customData?.tags?.[EDITOR_PLUGINS_META_TAG] ??
        loadMetaTagFromArchive(archive, presRels, EDITOR_PLUGINS_META_TAG);
    applyEditorPluginsMeta(pres, editorPluginsRaw);
    const playbackPluginsRaw = customData?.tags?.[PLAYBACK_PLUGINS_META_TAG] ??
        loadMetaTagFromArchive(archive, presRels, PLAYBACK_PLUGINS_META_TAG);
    applyPlaybackPluginsMeta(pres, playbackPluginsRaw);
    const sectionsFromLst = parsePresentationSectionLst(presEl, slides.length);
    if (sectionsFromLst.length) {
        pres.sections = sectionsFromLst;
    }
    else {
        const sectionsRaw = customData?.tags?.[SECTIONS_META_TAG] ??
            loadMetaTagFromArchive(archive, presRels, SECTIONS_META_TAG);
        applyDeckSectionsMeta(pres, sectionsRaw);
    }
    const proofingLangRaw = customData?.tags?.[PROOFING_LANG_META_TAG] ??
        loadMetaTagFromArchive(archive, presRels, PROOFING_LANG_META_TAG);
    applyProofingLangMeta(pres, proofingLangRaw);
    if (!pres.meta?.[PROOFING_LANG_META_KEY]) {
        const ooxmlLang = defaultTextStyle?.body?.[1]?.rPr?.lang ?? defaultTextStyle?.body?.[0]?.rPr?.lang;
        const fromXml = proofingIdFromOoxmlLang(ooxmlLang);
        if (fromXml)
            setProofingLanguageMeta(pres, fromXml);
    }
    applyModifyVerifierProtection(pres);
    // round-trip 保存：把原始 archive 字节以非可枚举属性挂到 Presentation 上。
    // serializer 在 `pres.__source` 存在时走「surgical patch」路径，避免「从内存模型
    // 重建 OOXML」造成的母版/版式/主题/动画/Chart/SmartArt/嵌入字体等大量丢失。
    const commentsModern = slides.some((s) => s.__source?.commentsModern) || deckComments.some((c) => c.modernId);
    Object.defineProperty(pres, "__source", {
        value: {
            files: new Map(archive.files),
            presentationPath: presPath,
            // 主题快照：round-trip 时与 pres.theme 做 JSON 比较，未变化则原 theme XML
            // 字节级保留；变化（AI 改主题色 / 字体）则在 ppt/theme/themeN.xml 上 patch
            // <a:clrScheme> / <a:fontScheme>，让保存的 .pptx 真正用上新主题色板。
            themeSnapshot: pres.theme ? deepCloneJson(pres.theme) : undefined,
            commentAuthorsPartPath: followFirstRelByType(presRels, "/commentAuthors"),
            modernAuthorsPartPath: modernAuthorsPartPath(archive, presRels),
            commentsModern,
            commentsSnapshot: deckComments.length ? JSON.stringify(deckComments) : "",
            commentMetaSnapshot: buildCommentMeta(deckComments) ??
                customData?.tags?.[COMMENT_META_TAG] ??
                loadCommentMetaFromArchive(archive, presRels) ??
                "",
            protectionMetaSnapshot: buildProtectionMeta(pres) ??
                customData?.tags?.[PROTECTION_META_TAG] ??
                loadMetaTagFromArchive(archive, presRels, PROTECTION_META_TAG) ??
                "",
            editorPluginsMetaSnapshot: buildEditorPluginsMeta(pres) ??
                customData?.tags?.[EDITOR_PLUGINS_META_TAG] ??
                loadMetaTagFromArchive(archive, presRels, EDITOR_PLUGINS_META_TAG) ??
                "",
            playbackPluginsMetaSnapshot: buildPlaybackPluginsMeta(pres) ??
                customData?.tags?.[PLAYBACK_PLUGINS_META_TAG] ??
                loadMetaTagFromArchive(archive, presRels, PLAYBACK_PLUGINS_META_TAG) ??
                "",
            sectionsMetaSnapshot: buildDeckSectionsMeta(pres) ??
                customData?.tags?.[SECTIONS_META_TAG] ??
                loadMetaTagFromArchive(archive, presRels, SECTIONS_META_TAG) ??
                "",
            proofingLangMetaSnapshot: buildProofingLangMeta(pres) ??
                customData?.tags?.[PROOFING_LANG_META_TAG] ??
                loadMetaTagFromArchive(archive, presRels, PROOFING_LANG_META_TAG) ??
                "",
            tagsPartPath: followFirstRelByType(presRels, "/tags"),
            macroEnabled: hasVbaProject,
            vbaProjectPartPath: hasVbaProject ? VBA_PROJECT_PART_PATH : undefined,
            fontsSnapshot: fonts.length
                ? JSON.stringify(fonts.map((f) => ({ family: f.family, weight: f.weight, style: f.style, src: f.src })))
                : "",
            photoAlbumSnapshot: photoAlbumSnapshot(photoAlbum),
            kinsokuSnapshot: kinsokuSnapshot(pres.kinsoku),
            viewGuidesSnapshot: viewGuidesSnapshot(pres.viewGuides),
            viewPropsPartPath,
            showPrSnapshot: showPropertiesSnapshot(pres.showPr),
            presPropsPartPath,
        },
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return pres;
}
// JSON 深拷贝：用于 __source.bgSnapshot / themeSnapshot 等快照字段。
// Paint / Theme 都是 JSON-safe 结构（无函数 / 循环引用），用 JSON 即可。
// 之所以不用 structuredClone：旧 Node / 旧浏览器兼容性 + 显式简单。
function deepCloneJson(v) {
    return JSON.parse(JSON.stringify(v));
}
/**
 * 递归遍历 shapes，给每个节点挂上「解析时 fill / stroke 的深拷贝快照」。
 * 这两个字段为非可枚举属性（不会被 JSON.stringify / structuredClone 误带出），
 * round-trip 保存时通过 JSON 比较 `current vs snapshot` 判断「用户是否真的改了
 * fill / stroke」—— 未改动则跳过 spPr 重写，保留原始 schemeClr 等扩展引用。
 */
export function attachFillStrokeSnapshots(shapes) {
    if (!Array.isArray(shapes))
        return;
    for (const s of shapes) {
        if (!s || typeof s !== "object")
            continue;
        const shape = s;
        if ("fill" in shape) {
            setOrigin(shape, {
                fill: shape.fill !== undefined ? deepCloneJson(shape.fill) : undefined,
            });
        }
        if ("stroke" in shape) {
            setOrigin(shape, {
                stroke: shape.stroke !== undefined
                    ? deepCloneJson(shape.stroke)
                    : undefined,
            });
        }
        // 给图片 / 视频 / 音频 shape 挂上 src 快照，让 round-trip 能在「src 未变」时
        // 跳过 patchPicImageSrc —— 否则 parser 把 r:embed → data:URL 之后 src 字符串
        // 与 parse-time「相同」也会被认为是"用户改了"，导致每次保存都新建一份
        // ppt/media/imageN.png 并污染 _rels，造成文件体积每轮翻倍。
        if ((shape.kind === "image" || shape.kind === "video" || shape.kind === "audio") &&
            "src" in shape) {
            setOrigin(shape, { src: typeof shape.src === "string" ? shape.src : undefined });
        }
        // 给所有 shape 留一个 opacity 快照，记录"解析时 OOXML 里实际表达的 alpha"。
        //   - geom/text/group 的 opacity 在 OOXML 没有原生表达 → 解析时一律是 1
        //   - image/video/audio 上若有 <a:alphaModFix amt=N/> → 解析期 readPic 会把
        //     shape.opacity 改成 N/100000，并提前在 parsePic 里 def-property 写过快照
        //
        // 解析后的 timing pass 还会把"有 entrance 动画的整 shape"opacity 强制改 0 当成
        // runtime"入场前隐藏"。**这条"运行时压成 0"绝不能被烘焙回 OOXML**，否则保存后
        // 文件里到处都是 alphaModFix amt="0"，下次解析再把它读成 0，写出又是 0，循环
        // 持久化下去。serializer 用 (shape.opacity vs __opacitySnapshot) 判断"用户是否
        // 真的编辑过 opacity"：相等 → 没改 → 按 snapshot 写；不等 → 用户改了 → 按内存值写。
        // parsePic 已为 image 写过 origin.opacity（来自 alphaModFix），不要覆盖；其余 shape 默认 1。
        if (getOrigin(shape)?.opacity === undefined) {
            const o = shape.opacity;
            setOrigin(shape, { opacity: typeof o === "number" ? o : 1 });
        }
        // bbox 基线：记录解析期（继承解析后）的绝对 bbox。占位符 shape 的 raw <p:spPr> 常常没有
        // <a:xfrm>，几何全继承自 layout/master —— 没有 raw 字节可比。serializer 靠这条基线在
        // 「raw 无 xfrm」时判断是否需要插入显式 xfrm（用户移动了占位符），且缓存恢复后仍有效。
        const bb = shape.bbox;
        if (bb && typeof bb.x === "number" && typeof bb.y === "number") {
            setOrigin(shape, { bbox: { x: bb.x, y: bb.y, w: bb.w, h: bb.h } });
        }
        if (shape.kind === "chart" && "chart" in shape) {
            setOrigin(shape, {
                chart: deepCloneJson(shape.chart),
            });
        }
        const meta3D = shape.meta3D;
        if (meta3D) {
            setOrigin(shape, { meta3D: deepCloneJson(meta3D) });
        }
        // effects 基线始终记录（含"解析期就没有效果"的空数组）：serializer 靠
        // `模型值 == 基线` 判定未编辑 → 保留 raw `<a:effectLst>` 原字节。缺基线时
        // 会被当成"用户新加了效果"而写出，把 effectRef 继承来的阴影钉死进 spPr。
        const fx = shape.effects;
        setOrigin(shape, {
            effects: deepCloneJson(fx ?? []),
        });
        if (Array.isArray(shape.children))
            attachFillStrokeSnapshots(shape.children);
    }
}
// 从 presentation rels 找出所有 sldMaster，再从每个 master rels 找出所有 sldLayout，
// 全部塞到 masterCache / layoutCache。这样即使某个 layout 没有被任何 slide 引用，
// pres.masters[].layouts[] 中也能完整出现 —— 与原 .pptx 字节级一致是阶段 1 的硬约束。
function prefetchAllMastersAndLayouts(archive, presRels, presTheme, media, masterCache, layoutCache, embeddedFontFamilies) {
    for (const r of presRels.list) {
        if (!r.type.endsWith(TYPE_MASTER))
            continue;
        const masterPath = presRels.resolve(r.id);
        if (!masterPath)
            continue;
        const master = getMaster(archive, masterPath, media, masterCache, embeddedFontFamilies);
        if (!master)
            continue;
        const masterRels = loadRels(archive, masterPath);
        for (const lr of masterRels.list) {
            if (!lr.type.endsWith(TYPE_LAYOUT))
                continue;
            const layoutPath = masterRels.resolve(lr.id);
            if (!layoutPath)
                continue;
            getLayout(archive, layoutPath, presTheme, media, masterCache, layoutCache, embeddedFontFamilies);
        }
    }
}
// 把命中的 master/layout cache 整理成 deck 级 SlideMaster[]（每个 master.layouts 嵌套自己的 layout）。
// 阶段 1：单一数据源已 ready 但 editor 仍走 slide.layers 副本路径；阶段 2 删除副本后此处即唯一来源。
//
// 重要：masters[].shapes 用 m.part.shapes 原版（含 placeholder），不做 nonPlaceholder 过滤，
// 也不做 prefixShapeIds，因为 editor 阶段 2 需要原始 placeholder 模板来编辑占位符默认样式。
function collectMasters(masterCache, layoutCache) {
    const masterById = new Map();
    for (const [path, m] of masterCache) {
        const id = idFromPath(path);
        const sm = {
            id,
            name: id,
            background: m.background,
            bgRef: m.part.bgRef,
            shapes: m.part.shapes,
            clrMap: m.part.clrMap,
            hf: m.part.hf,
            preserve: m.part.rootAttrs?.preserve,
            txStyles: convertTxStylesToCore(m.txStyles),
            layouts: [],
        };
        Object.defineProperty(sm, "__source", {
            // bgSnapshot：见 SlideLikeSource.bgSnapshot 注释。round-trip 比较内存
            // sm.background 与快照决定是否要在 <p:cSld>/<p:bg> 上 patch。
            value: { partPath: path, bgSnapshot: sm.background ? deepCloneJson(sm.background) : undefined },
            enumerable: false,
            configurable: true,
            writable: true,
        });
        // master 形状也参与 round-trip 的 spPr fill/stroke 幂等比较。
        attachFillStrokeSnapshots(sm.shapes);
        masterById.set(id, sm);
    }
    for (const [path, l] of layoutCache) {
        if (!l.master)
            continue;
        const masterId = idFromPath(l.master.part.path);
        const master = masterById.get(masterId);
        if (!master)
            continue;
        const id = idFromPath(path);
        const layout = {
            id,
            name: id,
            type: l.part.rootAttrs?.type,
            matchingName: l.part.rootAttrs?.matchingName,
            preserve: l.part.rootAttrs?.preserve,
            background: l.background,
            bgRef: l.part.bgRef,
            shapes: l.part.shapes,
            hf: l.part.hf,
        };
        Object.defineProperty(layout, "__source", {
            value: { partPath: path, bgSnapshot: layout.background ? deepCloneJson(layout.background) : undefined },
            enumerable: false,
            configurable: true,
            writable: true,
        });
        attachFillStrokeSnapshots(layout.shapes);
        master.layouts.push(layout);
    }
    return [...masterById.values()];
}
// 用 partPath 末尾文件名（去扩展名）作为 master/layout 的稳定 id —— 与 loadAuxMasters 一致。
// 例如 "ppt/slideMasters/slideMaster1.xml" → "slideMaster1"。
function idFromPath(p) {
    return p.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? p;
}
// parser 内部 TxStyles → core TextStyles：字段结构一致，只是 array 空判断 / 空对象剥离。
function convertTxStylesToCore(s) {
    if (!s)
        return undefined;
    const conv = (arr) => {
        if (arr.length === 0)
            return undefined;
        const out = arr.map((l) => ({
            pPr: l.pPr && Object.keys(l.pPr).length ? l.pPr : undefined,
            rPr: l.rPr && Object.keys(l.rPr).length ? l.rPr : undefined,
            bullet: l.bullet,
        }));
        // 全空数组（lvl1..lvl9 都是空对象）就当无值。
        const any = out.some((s) => s.pPr || s.rPr || s.bullet);
        return any ? out : undefined;
    };
    const out = {};
    const t = conv(s.title);
    const b = conv(s.body);
    const o = conv(s.other);
    if (t)
        out.title = t;
    if (b)
        out.body = b;
    if (o)
        out.other = o;
    return out.title || out.body || out.other ? out : undefined;
}
// ECMA-376 §19.3.1.27 notesMaster / §19.3.1.20 handoutMaster — 从 presentation rels
// 找出这两个辅助母版部件，按 slide-like 方式解析其形状，按 SlideMaster 接口暴露。
function loadAuxMasters(archive, presRels, theme, media, relType, embeddedFontFamilies) {
    const rootName = relType.endsWith(TYPE_NOTES_MASTER)
        ? "notesMaster"
        : "handoutMaster";
    const out = [];
    for (const r of presRels.list) {
        if (!r.type.endsWith(relType))
            continue;
        const path = presRels.resolve(r.id);
        if (!path)
            continue;
        const part = parseSlideLikePart(archive, path, theme, media, rootName, embeddedFontFamilies);
        if (!part)
            continue;
        const id = path.split("/").pop()?.replace(/\.[^/.]+$/, "") ?? r.id;
        let txStyles;
        if (rootName === "notesMaster") {
            const notesStyleEl = findByLocalName(part.rootEl, "notesStyle");
            const parsed = parseLstStyle(notesStyleEl, { theme: applyClrMapToTheme(theme, part.clrMap) });
            txStyles = convertTxStylesToCore({ title: [], body: parsed, other: [] });
        }
        const sm = {
            id,
            name: id,
            background: part.background,
            bgRef: part.bgRef,
            shapes: part.shapes,
            clrMap: part.clrMap,
            hf: part.hf,
            preserve: part.rootAttrs?.preserve,
            txStyles,
        };
        Object.defineProperty(sm, "__source", {
            value: { partPath: path, bgSnapshot: sm.background ? deepCloneJson(sm.background) : undefined },
            enumerable: false,
            configurable: true,
            writable: true,
        });
        attachFillStrokeSnapshots(sm.shapes);
        out.push(sm);
    }
    return out.length ? out : undefined;
}
// ECMA-376 §19.2.1.7 defaultTextStyle — 演示文稿级 9 级正文默认。
// 同 lstStyle 结构：defPPr 作为 0 级默认，lvl1pPr..lvl9pPr 为各级。
//
// 输出 body 数组始终为 10 个槽位（即便对应 lvl 在 XML 中不存在也会 push 空对象）：
//   body[0] = defPPr（段落默认，没有 level 概念）
//   body[i] (i=1..9) = lvl{i}pPr
// 这样下游（inherit.ts / serializer）拿到 body[i] 即等价于 lvl{i}pPr，避免索引漂移。
function parseDefaultTextStyle(presEl, ctx) {
    if (!presEl)
        return undefined;
    const dts = findByLocalName(presEl, "defaultTextStyle");
    if (!dts)
        return undefined;
    const body = [];
    let any = false;
    const pushLvl = (key) => {
        const el = findByLocalName(dts, key);
        if (!el) {
            body.push({});
            return;
        }
        any = true;
        const lvl = extractLevelInline(el, ctx);
        body.push({
            pPr: Object.keys(lvl.pPr).length ? lvl.pPr : undefined,
            rPr: Object.keys(lvl.rPr).length ? lvl.rPr : undefined,
            bullet: lvl.bullet,
        });
    };
    pushLvl("defPPr");
    for (let i = 1; i <= 9; i++)
        pushLvl(`lvl${i}pPr`);
    return any ? { body } : undefined;
}
function extractLevelInline(lvlPPr, ctx) {
    const pPrDefaults = parsePPrDefaults(lvlPPr, ctx);
    const defRPr = findByLocalName(lvlPPr, "defRPr");
    const rPr = readRunProps(defRPr, ctx);
    const out = {
        pPr: { ...pPrDefaults },
        rPr,
    };
    if (pPrDefaults.bullet) {
        out.bullet = pPrDefaults.bullet;
        delete out.pPr.bullet;
    }
    return out;
}
// ECMA-376 §19.2.1.4 custShowLst — 自定义放映列表。
function parseCustomShows(presEl) {
    const lst = findByLocalName(presEl, "custShowLst");
    if (!lst)
        return undefined;
    const out = [];
    for (const cs of findAllByLocalName(lst, "custShow")) {
        const id = attr(cs, "id") ?? String(out.length);
        const name = attr(cs, "name") ?? `Custom Show ${out.length + 1}`;
        const sldLst = findByLocalName(cs, "sldLst");
        const slideRIds = [];
        for (const s of findAllByLocalName(sldLst, "sld")) {
            const rid = attr(s, "r:id") ?? attr(s, "id");
            if (rid)
                slideRIds.push(rid);
        }
        out.push({ id, name, slideRIds });
    }
    return out.length ? out : undefined;
}
// parsePhotoAlbum — see photo-album.ts
// ECMA-376 §19.2.1.20 kinsoku — 中日韩首尾禁则字符。
function parseKinsoku(presEl) {
    const k = findByLocalName(presEl, "kinsoku");
    if (!k)
        return undefined;
    const out = {};
    const lang = attr(k, "lang");
    if (lang)
        out.lang = lang;
    const inv = attr(k, "invalStChars");
    if (inv)
        out.invalStChars = inv;
    const ie = attr(k, "invalEndChars");
    if (ie)
        out.invalEndChars = ie;
    return Object.keys(out).length ? out : undefined;
}
// ECMA-376 §19.2.1.23 modifyVerifier — 修改保护信息（解析 + Office 密码校验见 office-password.ts）。
function parseModifyVerifier(presEl) {
    const mv = findByLocalName(presEl, "modifyVerifier");
    if (!mv)
        return undefined;
    const out = {};
    const algName = attr(mv, "algorithmName");
    if (algName)
        out.algorithmName = algName;
    const hash = attr(mv, "hashValue") ?? attr(mv, "hashData");
    if (hash)
        out.hashValue = hash;
    const hashData = attr(mv, "hashData");
    if (hashData)
        out.hashData = hashData;
    const salt = attr(mv, "saltValue") ?? attr(mv, "saltData");
    if (salt)
        out.saltValue = salt;
    const saltData = attr(mv, "saltData");
    if (saltData)
        out.saltData = saltData;
    const spin = attr(mv, "spinValue") ?? attr(mv, "spinCount");
    if (spin !== undefined) {
        const n = Number(spin);
        if (Number.isFinite(n)) {
            out.spinValue = n;
            out.spinCount = n;
        }
    }
    const cpt = attr(mv, "cryptProviderType");
    if (cpt)
        out.cryptProviderType = cpt;
    const cac = attr(mv, "cryptAlgorithmClass");
    if (cac)
        out.cryptAlgorithmClass = cac;
    const cat = attr(mv, "cryptAlgorithmType");
    if (cat)
        out.cryptAlgorithmType = cat;
    const cas = attr(mv, "cryptAlgorithmSid");
    if (cas !== undefined) {
        const n = Number(cas);
        if (Number.isFinite(n))
            out.cryptAlgorithmSid = n;
    }
    return Object.keys(out).length ? out : undefined;
}
// ECMA-376 §15.2 custData / tagLst — 标签和自定义 XML 部件引用。
function parseCustomData(el, rels, archive) {
    if (!el)
        return undefined;
    const cdLst = findByLocalName(el, "custDataLst");
    if (!cdLst)
        return undefined;
    const tags = {};
    const customXmlRefs = [];
    for (const child of orderedChildren(cdLst)) {
        const local = stripNs(child.tag);
        if (local === "tags") {
            const rid = attr(child.node, "r:id") ?? attr(child.node, "id");
            const path = rid && rels ? rels.resolve(rid) : undefined;
            if (path) {
                const xml = loadXmlPart(archive, path);
                const tagLst = findByLocalName(xml, "tagLst");
                for (const tag of findAllByLocalName(tagLst, "tag")) {
                    const name = attr(tag, "name");
                    const val = attr(tag, "val");
                    if (name)
                        tags[name] = val ?? "";
                }
            }
        }
        else if (local === "custData") {
            const rid = attr(child.node, "r:id") ?? attr(child.node, "id");
            if (rid)
                customXmlRefs.push(rid);
        }
    }
    const out = {};
    if (Object.keys(tags).length)
        out.tags = tags;
    if (customXmlRefs.length)
        out.customXmlRefs = customXmlRefs;
    return Object.keys(out).length ? out : undefined;
}
function parseNotesSize(el) {
    if (!el)
        return undefined;
    const cx = emuToPx(attr(el, "cx"));
    const cy = emuToPx(attr(el, "cy"));
    if (!cx || !cy)
        return undefined;
    return { width: cx, height: cy };
}
// ECMA-376 §19.2.1 presentation 根元素的全局开关。
function parsePresentationOptions(presEl) {
    if (!presEl)
        return undefined;
    const out = {};
    const num = (n) => {
        if (n === undefined)
            return undefined;
        const v = Number(n);
        return Number.isFinite(v) ? v : undefined;
    };
    const sz = num(attr(presEl, "serverZoom"));
    if (sz !== undefined)
        out.serverZoom = sz / 100000;
    const fsn = num(attr(presEl, "firstSlideNum"));
    if (fsn !== undefined)
        out.firstSlideNum = fsn;
    const ssp = boolish(attr(presEl, "showSpecialPlsOnTitleSld"));
    if (ssp !== undefined)
        out.showSpecialPlsOnTitleSld = ssp;
    const rtl = boolish(attr(presEl, "rtl"));
    if (rtl !== undefined)
        out.rtl = rtl;
    const rmPi = boolish(attr(presEl, "removePersonalInfoOnSave"));
    if (rmPi !== undefined)
        out.removePersonalInfoOnSave = rmPi;
    const cm = boolish(attr(presEl, "compatMode"));
    if (cm !== undefined)
        out.compatMode = cm;
    const sfl = boolish(attr(presEl, "strictFirstAndLastChars"));
    if (sfl !== undefined)
        out.strictFirstAndLastChars = sfl;
    const ettf = boolish(attr(presEl, "embedTrueTypeFonts"));
    if (ettf !== undefined)
        out.embedTrueTypeFonts = ettf;
    const ssf = boolish(attr(presEl, "saveSubsetFonts"));
    if (ssf !== undefined)
        out.saveSubsetFonts = ssf;
    const acp = boolish(attr(presEl, "autoCompressPictures"));
    if (acp !== undefined)
        out.autoCompressPictures = acp;
    const bid = num(attr(presEl, "bookmarkIdSeed"));
    if (bid !== undefined)
        out.bookmarkIdSeed = bid;
    const conf = attr(presEl, "conformance");
    if (conf)
        out.conformance = conf;
    return Object.keys(out).length ? out : undefined;
}
function parseSize(sldSz) {
    if (!sldSz)
        return { width: 960, height: 540 };
    return {
        width: emuToPx(attr(sldSz, "cx")) || 960,
        height: emuToPx(attr(sldSz, "cy")) || 540,
    };
}
function loadFirstTheme(archive, rels) {
    const path = followFirstRelByType(rels, TYPE_THEME);
    if (!path)
        return undefined;
    const theme = parseTheme(loadXmlPart(archive, path));
    // theme part 自己的 rels：styleLst 里的 blip r:embed 解析要用（见 ThemeData.rels）。
    theme.rels = loadRels(archive, path);
    return theme;
}
function loadThemeForPart(archive, rels) {
    const path = followFirstRelByType(rels, TYPE_THEME);
    if (!path)
        return undefined;
    const theme = parseTheme(loadXmlPart(archive, path));
    theme.rels = loadRels(archive, path);
    return theme;
}
function getMaster(archive, path, media, cache, embeddedFontFamilies) {
    const cached = cache.get(path);
    if (cached)
        return cached;
    const masterRels = loadRels(archive, path);
    const theme = loadThemeForPart(archive, masterRels);
    const part = parseSlideLikePart(archive, path, theme, media, "sldMaster", embeddedFontFamilies);
    if (!part)
        return undefined;
    const masterRoot = part.rootEl ?? (part.xml ? findEl(part.xml, "sldMaster") : undefined);
    // txStyles 里的 schemeClr 同样要走 master clrMap 映射后的有效 theme。
    const txStyles = parseTxStyles(masterRoot, { theme: applyClrMapToTheme(theme, part.clrMap) });
    const m = {
        part,
        phIndex: indexPlaceholders(part.shapes),
        background: part.background,
        theme,
        txStyles,
    };
    cache.set(path, m);
    return m;
}
function getLayout(archive, path, presTheme, media, masterCache, layoutCache, embeddedFontFamilies) {
    const cached = layoutCache.get(path);
    if (cached)
        return cached;
    const layoutRels = loadRels(archive, path);
    const masterPath = followFirstRelByType(layoutRels, TYPE_MASTER);
    const master = masterPath ? getMaster(archive, masterPath, media, masterCache, embeddedFontFamilies) : undefined;
    const theme = master?.theme ?? presTheme;
    // layout 继承 master 的 clrMap（自身 clrMapOvr overrideClrMapping 时在 part 内覆盖）。
    const part = parseSlideLikePart(archive, path, theme, media, "sldLayout", embeddedFontFamilies, undefined, master?.part.clrMap);
    if (!part)
        return undefined;
    const l = {
        part,
        master,
        phIndex: indexPlaceholders(part.shapes),
        background: part.background,
        theme,
    };
    layoutCache.set(path, l);
    return l;
}
// 收集嵌入字体的唯一"基底族名"（去重 + 保留首次出现顺序），不包括 "X Bold" / "X Italic"
// 这类按 PowerPoint 命名习惯生成的子族别名 —— 子族通常仍指向同一 TTF，因此用基底名作为脚本
// 兜底已足够，避免 font-family 列表过度膨胀。
function collectEmbeddedFontFamilies(fonts) {
    const SUFFIXES = [" Bold Italic", " Bold", " Italic"];
    const out = [];
    const seen = new Set();
    for (const f of fonts) {
        let base = f.family;
        for (const s of SUFFIXES) {
            if (base.endsWith(s)) {
                base = base.slice(0, -s.length);
                break;
            }
        }
        base = base.trim();
        if (!base || seen.has(base))
            continue;
        seen.add(base);
        out.push(base);
    }
    return out;
}
function parseSlides(archive, presEl, presRels, presTheme, media, masterCache, layoutCache, embeddedFontFamilies, defaultTextStyle, tableStyleMap, commentAuthors, deckComments, modernAuthors) {
    const sldIdLst = findByLocalName(presEl, "sldIdLst");
    const sldIds = findAllByLocalName(sldIdLst, "sldId");
    if (sldIds.length === 0) {
        console.warn("[parser] no <p:sldId> found.", "presEl keys:", presEl ? Object.keys(presEl) : null, "sldIdLst keys:", sldIdLst ? Object.keys(sldIdLst) : null);
    }
    // 先按 sldIdLst 顺序把「slide part 路径 → 1-based 页码」建好，再解析各页：内部跳页
    // 链接（ppaction://hlinksldjump）指向的是**任意**一页，可能在当前页之后，必须提前建表。
    const slideNumberByPath = new Map();
    for (const idNode of sldIds) {
        const rId = attr(idNode, "r:id") ?? attr(idNode, "id");
        const p = rId ? presRels.resolve(rId) : undefined;
        if (p && !slideNumberByPath.has(p))
            slideNumberByPath.set(p, slideNumberByPath.size + 1);
    }
    const resolveSlideNumber = (partPath) => slideNumberByPath.get(partPath);
    const slides = [];
    let idx = 0;
    for (const idNode of sldIds) {
        const rId = attr(idNode, "r:id") ?? attr(idNode, "id");
        if (!rId) {
            console.warn("[parser] sldId missing r:id attr:", Object.keys(idNode));
            continue;
        }
        const path = presRels.resolve(rId);
        if (!path) {
            console.warn(`[parser] cannot resolve rId=${rId}. rels:`, presRels.list);
            continue;
        }
        const slide = parseSlide(archive, path, idx++, presTheme, media, masterCache, layoutCache, embeddedFontFamilies, defaultTextStyle, tableStyleMap, commentAuthors, deckComments, modernAuthors, resolveSlideNumber);
        if (slide)
            slides.push(slide);
        else
            console.warn(`[parser] slide ${path} parsed to undefined`);
    }
    return slides;
}
function parseSlide(archive, slidePath, index, presTheme, media, masterCache, layoutCache, embeddedFontFamilies, defaultTextStyle, tableStyleMap, commentAuthors, deckComments, modernAuthors, resolveSlideNumber) {
    const slideRels = loadRels(archive, slidePath);
    const layoutPath = followFirstRelByType(slideRels, TYPE_LAYOUT);
    const layout = layoutPath
        ? getLayout(archive, layoutPath, presTheme, media, masterCache, layoutCache, embeddedFontFamilies)
        : undefined;
    const master = layout?.master;
    const theme = layout?.theme ?? master?.theme ?? presTheme;
    // slide 继承 layout 的有效 clrMap（layout 自身可能已 override master）。
    const part = parseSlideLikePart(archive, slidePath, theme, media, "sld", embeddedFontFamilies, tableStyleMap, layout?.part.clrMap ?? master?.part.clrMap, resolveSlideNumber);
    if (!part)
        return undefined;
    const inheritedShapes = applyAutoFit(applyInheritance(part.shapes, [layout?.phIndex, master?.phIndex].filter((x) => !!x), { masterTxStyles: master?.txStyles, presDefaultTextStyle: defaultTextStyle }));
    // 给每个 shape 挂上 fill / stroke 解析时快照（非可枚举），round-trip 保存时
    // 用于幂等比较：未改动 → 保留原始 OOXML 字节（schemeClr 引用 / 注释扩展节点等）。
    attachFillStrokeSnapshots(inheritedShapes);
    // 阶段 2.1 起：slide.layers 只剩 "main" 一层。
    // master/layout 装饰由 renderer.composeSlideForRender 在 createScene 时实时合成
    // （单一数据源：Presentation.masters[]）。slide.layoutRef 已在 parseFromArchive 里建立引用。
    const layers = [
        {
            id: "main",
            name: "Slide",
            visible: true,
            locked: false,
            shapes: inheritedShapes,
        },
    ];
    const background = part.background ?? layout?.background ?? master?.background;
    const shapeIndex = buildShapeIndex(inheritedShapes);
    const timingEl = findByLocalName(part.rootEl, "timing");
    const ooxmlTiming = parseTimingOoxml(timingEl);
    if (ooxmlTiming) {
        resolveTimingSoundTargets(ooxmlTiming, {
            rels: slideRels,
            resolveMedia: (p) => media.resolve(p),
        });
    }
    // §19.5.37 iterate：scan 阶段就要做与 walk/expandIterateSlices 一致的段落拆分，
    // 否则 entrance hide 会落在整个 sp 上，把 atom 真正想 toggle 的段落覆盖压死。
    // getTextSlices 直接读 inheritedShapes 中 sp_X 或 sp_X_text 的 paragraphs。
    const findTextParagraphs = (spid) => {
        const baseId = `sp_${spid}`;
        const candidate = shapeIndex.get(`${baseId}_text`) ?? shapeIndex.get(baseId);
        if (!candidate)
            return null;
        if (candidate.kind === "text")
            return candidate.paragraphs;
        if (candidate.kind === "group") {
            // 在 group 内深度优先找 text 子形状。
            const stack = [...candidate.children];
            while (stack.length) {
                const cur = stack.pop();
                if (cur.kind === "text")
                    return cur.paragraphs;
                if (cur.kind === "group")
                    stack.push(...cur.children);
            }
        }
        return null;
    };
    const isCjkChar = (ch) => {
        const cp = ch.codePointAt(0);
        if (cp === undefined)
            return false;
        return ((cp >= 0x2e80 && cp <= 0x303f) ||
            (cp >= 0x3040 && cp <= 0x30ff) ||
            (cp >= 0x3400 && cp <= 0x4dbf) ||
            (cp >= 0x4e00 && cp <= 0x9fff) ||
            (cp >= 0xf900 && cp <= 0xfaff) ||
            (cp >= 0xfe30 && cp <= 0xfe4f) ||
            (cp >= 0xff00 && cp <= 0xffef) ||
            (cp >= 0x20000 && cp <= 0x2ffff));
    };
    const textSlicesFor = (spid, kind) => {
        const paras = findTextParagraphs(spid);
        if (!paras)
            return null;
        if (kind === "el")
            return paras.map((_, i) => ({ pRg: { st: i, end: i } }));
        const out = [];
        for (let p = 0; p < paras.length; p++) {
            const txt = paras[p].runs.map((r) => r.text ?? "").join("");
            if (kind === "wd") {
                let i = 0;
                while (i < txt.length) {
                    while (i < txt.length && /\s/.test(txt[i]))
                        i++;
                    if (i >= txt.length)
                        break;
                    const st = i;
                    if (isCjkChar(txt[i]))
                        i++;
                    else
                        while (i < txt.length && !/\s/.test(txt[i]) && !isCjkChar(txt[i]))
                            i++;
                    if (i > st)
                        out.push({ pRg: { st: p, end: p }, charRg: { st, end: i } });
                }
            }
            else {
                for (let c = 0; c < txt.length;) {
                    const cp = txt.codePointAt(c);
                    const step = cp > 0xffff ? 2 : 1;
                    out.push({ pRg: { st: p, end: p }, charRg: { st: c, end: c + step } });
                    c += step;
                }
            }
        }
        return out;
    };
    const initialParaOverrides = [];
    const initialCharOverrides = [];
    // 收集每个 spid 的 hide 形态：要么"整体 hide"，要么"按段落/字符 range hide"。
    // 同一 spid 不能既 set sp.opacity=0 又设 paragraph override—— group 级 0 会
    // 永久压制 paragraph 显示。优先顺序：有任何 paragraph/char 范围 → 段落级；否则整体。
    const sliceMap = new Map();
    const ensure = (spid) => {
        let v = sliceMap.get(spid);
        if (!v) {
            v = { whole: false, paras: new Set(), charRgs: [] };
            sliceMap.set(spid, v);
        }
        return v;
    };
    for (const t of collectEntranceTargets(ooxmlTiming, { getTextSlices: textSlicesFor })) {
        const slot = ensure(t.spid);
        if (t.paraRange && !t.charRange) {
            for (let p = t.paraRange.st; p <= t.paraRange.end; p++)
                slot.paras.add(p);
        }
        else if (t.charRange) {
            const paraIdx = t.paraRange?.st ?? 0;
            slot.charRgs.push({ paraIdx, st: t.charRange.st, end: t.charRange.end });
        }
        else {
            slot.whole = true;
        }
    }
    // 检查 sp_X 是否带 visible base fill（即除文字外还有填充框/背景，例如蓝色按钮块）。
    // 这种 shape 的整体 hide 不能仅靠 paragraph override：base 仍然会显示出底色。
    // 需要整体 sp.opacity=0；reveal 时由 ParagraphAnimatable/CharRangeAnimatable.setProperty
    // 内部把所属 SceneNode 的 opacity 一并 set 1（见 scene-node.ts）。
    const hasVisibleBaseFill = (baseId) => {
        const candidate = shapeIndex.get(`${baseId}_base`);
        const probe = candidate ?? shapeIndex.get(baseId);
        if (!probe)
            return false;
        // §20.1.8.fill: 任何 a:solidFill / a:gradFill / a:pattFill / a:blipFill 都视为 visible；
        // a:noFill / 缺省视为 none。core 在 build 时把空填充转为 fill?: undefined / { kind: "none" }。
        const fill = probe.fill;
        if (!fill)
            return false;
        if (fill.kind === "none")
            return false;
        return true;
    };
    for (const [spid, info] of sliceMap) {
        const baseId = `sp_${spid}`;
        const hasFineGrained = info.paras.size > 0 || info.charRgs.length > 0;
        const baseShape = shapeIndex.get(baseId);
        if (info.whole && !hasFineGrained) {
            // 整 shape 入场（image / 非文字 group）：直接 sp.opacity=0。
            if (baseShape)
                baseShape.opacity = 0;
            continue;
        }
        // 文本段落/字符级入场（iterate by-word/by-letter）：
        //   - 文字 override 必须落在被拆出的 _text 子形状上，否则
        //     父 group 的 paraOverrides 不会被 svg-backend.renderText 读取。
        //   - 同时如果父 group 自带可见 base fill（如蓝色按钮块），
        //     必须 group 整体 hide，否则 base 会一开始就显示出来。
        if (baseShape && hasVisibleBaseFill(baseId)) {
            baseShape.opacity = 0;
        }
        let shapeId = shapeIndex.has(baseId) ? baseId : baseId;
        if (!shapeIndex.has(shapeId))
            continue;
        if (baseShape?.kind === "group" && shapeIndex.has(`${shapeId}_text`)) {
            shapeId = `${shapeId}_text`;
        }
        for (const paraIdx of info.paras) {
            initialParaOverrides.push({ shapeId, paraIdx, opacity: 0 });
        }
        for (const r of info.charRgs) {
            initialCharOverrides.push({ shapeId, paraIdx: r.paraIdx, unit: "char", start: r.st, end: r.end, opacity: 0 });
        }
    }
    const transition = parseSlideTransition(part.rootEl, {
        rels: slideRels,
        resolveMedia: (p) => media.resolve(p),
    });
    const builds = parseBuildList(timingEl);
    const show = boolish(attr(part.rootEl, "show"));
    const showMasterSp = boolish(attr(part.rootEl, "showMasterSp"));
    const showMasterPhAnim = boolish(attr(part.rootEl, "showMasterPhAnim"));
    const hf = parseHF(findByLocalName(part.rootEl, "hf"));
    // 仅当 slide 显式写了 overrideClrMapping 才记为 override（masterClrMapping = 继承，不算）。
    const clrMapOverride = part.clrMapOvr;
    const customData = parseCustomData(part.cSld, slideRels, archive)
        ?? parseCustomData(part.rootEl, slideRels, archive);
    const notesPartPath = followFirstRelByType(slideRels, TYPE_NOTES_SLIDE);
    const notes = loadNotesText(archive, notesPartPath);
    const { comments: slideComments, commentsPartPath, commentsModern, } = loadSlideComments(archive, slideRels, commentAuthors ?? { byId: new Map() }, index, modernAuthors);
    if (deckComments && slideComments.length)
        deckComments.push(...slideComments);
    // layoutRef 指向 deck 级 Presentation.masters[masterId].layouts[layoutId]。
    // id 与 collectMasters 共用同一 idFromPath 算法 —— 二者必须保持一致。
    const layoutRef = layout && master
        ? { masterId: idFromPath(master.part.path), layoutId: idFromPath(layout.part.path) }
        : undefined;
    const slide = {
        id: `slide_${index + 1}`,
        name: attr(part.cSld, "name") ?? `Slide ${index + 1}`,
        index,
        background,
        bgRef: part.bgRef,
        layers,
        layoutRef,
        ooxmlTiming,
        transition,
        builds: builds.length ? builds : undefined,
        initialParaOverrides: initialParaOverrides.length ? initialParaOverrides : undefined,
        initialCharOverrides: initialCharOverrides.length ? initialCharOverrides : undefined,
        show,
        showMasterSp,
        showMasterPhAnim,
        hf,
        clrMapOverride,
        customData,
        notes,
    };
    for (const layer of layers)
        applyMediaAutoplayFromTiming(layer.shapes, ooxmlTiming);
    // round-trip 保存：记录 slide part 在原始 archive 中的归一化路径，
    // serializer 通过该路径定位原始 XML 做 surgical patch。
    // rawMainShapes：parser 解析得到的、未经 applyInheritance 合并占位符默认值的 main 层
    // 原始 shapes。recomputeSlideInheritance 在 editor 改 master/layout 后用它重算。
    Object.defineProperty(slide, "__source", {
        value: {
            partPath: slidePath,
            rawMainShapes: part.shapes,
            // bgSnapshot：解析时 slide.background（可能从 layout/master 继承）的快照。
            // round-trip 时和当前 slide.background 做 JSON 比较：相等 → 保留原 <p:bg>
            // 字节级（含"原本就没 <p:bg>"的继承状态）；不等 → 把当前 background 写进
            // slide part 的 <p:cSld>/<p:bg>。AI 改主题（ApplyCustomThemeCmd）正是
            // 通过这里把新背景色 / 渐变落到保存出来的 .pptx 上。
            bgSnapshot: background ? deepCloneJson(background) : undefined,
            // timing/transition/notes 解析期快照：round-trip 判定"编辑器改没改"。
            // 相等 → 原 <p:timing>/<p:transition>/notesSlide 字节级保留；不等 → 重写。
            timingSnapshot: JSON.stringify(ooxmlTiming ?? null),
            transitionSnapshot: JSON.stringify(transition ?? null),
            notesSnapshot: notes ?? "",
            showSnapshot: show,
            notesPartPath,
            customDataSnapshot: JSON.stringify(customData?.tags ?? null),
            commentsSnapshot: slideComments.length ? JSON.stringify(slideComments) : "",
            commentsPartPath,
            commentsModern,
        },
        enumerable: false,
        configurable: true,
        writable: true,
    });
    return slide;
}
// ECMA-376 §19.3.1.26 notesSlide — 演讲者备注。仅抽取纯文本即可（保留段落换行）。
// 占位符 type="body" 内的 a:p/a:r/a:t 是备注正文；其他装饰文本（页码等）一并提取。
function loadNotesText(archive, notesPath) {
    if (!notesPath)
        return undefined;
    const xml = loadXmlPart(archive, notesPath);
    if (!xml)
        return undefined;
    const notesEl = findByLocalName(xml, "notes");
    const cSld = findByLocalName(notesEl, "cSld");
    const spTree = findByLocalName(cSld, "spTree");
    if (!spTree)
        return undefined;
    const lines = [];
    const collectFromTxBody = (txBody) => {
        if (!txBody)
            return;
        for (const p of findAllByLocalName(txBody, "p")) {
            const segs = [];
            for (const ref of orderedChildren(p)) {
                const local = stripNs(ref.tag);
                if (local === "r" || local === "fld") {
                    const t = findByLocalName(ref.node, "t");
                    const text = typeof t === "string" ? t : t?.["#text"] ?? "";
                    if (text)
                        segs.push(String(text));
                }
                else if (local === "br") {
                    segs.push("\n");
                }
            }
            lines.push(segs.join(""));
        }
    };
    const walkSpTree = (n) => {
        for (const ref of orderedChildren(n)) {
            const local = stripNs(ref.tag);
            if (local === "sp") {
                const txBody = findByLocalName(ref.node, "txBody");
                const nvSpPr = findByLocalName(ref.node, "nvSpPr");
                const phEl = findByLocalName(findByLocalName(nvSpPr, "nvPr"), "ph");
                const phType = attr(phEl, "type");
                // 仅 body 占位符是真正的备注正文；其他（页码/日期等）跳过避免污染。
                if (phType === "body")
                    collectFromTxBody(txBody);
            }
            else if (local === "grpSp") {
                walkSpTree(ref.node);
            }
        }
    };
    walkSpTree(spTree);
    const text = lines.filter((l) => l.length > 0).join("\n");
    return text || undefined;
}
// ECMA-376 §19.3.3 hf — 占位符可见性（默认全部 true，仅在显式标注 0 时关闭）。
function parseHF(el) {
    if (!el)
        return undefined;
    const out = {};
    const sldNum = boolish(attr(el, "sldNum"));
    if (sldNum !== undefined)
        out.sldNum = sldNum;
    const hdr = boolish(attr(el, "hdr"));
    if (hdr !== undefined)
        out.hdr = hdr;
    const ftr = boolish(attr(el, "ftr"));
    if (ftr !== undefined)
        out.ftr = ftr;
    const dt = boolish(attr(el, "dt"));
    if (dt !== undefined)
        out.dt = dt;
    return Object.keys(out).length ? out : undefined;
}
async function bakeAll3D(pres, baker) {
    for (const slide of pres.slides) {
        for (const layer of slide.layers) {
            layer.shapes = await Promise.all(layer.shapes.map((s) => bake3DTree(s, baker)));
        }
    }
}
async function bake3DTree(s, baker) {
    if (s.kind === "group") {
        const groupShape = s;
        const children = await Promise.all(groupShape.children.map((c) => bake3DTree(c, baker)));
        return Object.assign({}, groupShape, { children });
    }
    const info = s.meta3D;
    if (!info)
        return s;
    // image shape (`<p:pic>`) 把 blip 的解析结果（dataURL / URL）以及 srcRect 一起
    // 喂给 baker，让 three-bake 把图贴到 3D 体的正面、按 cropRect 裁剪 UV。
    const imgShape = s.kind === "image" ? s : undefined;
    const baked = await baker({
        id: s.id,
        bbox: s.bbox,
        pathD: s.kind === "path" ? s.d : undefined,
        fill: s.fill,
        stroke: s.stroke,
        effects: s.effects,
        sp3d: info.sp3d,
        scene3d: info.scene3d,
        imageSrc: imgShape?.src,
        cropRect: imgShape?.cropRect,
    });
    if (!baked)
        return s;
    // PNG 已经把 srcRect 烘进 texture，shape 不再持有 cropRect；bbox 替成 paddedBBox。
    const out = {
        id: s.id,
        name: s.name,
        zIndex: s.zIndex,
        visible: s.visible,
        locked: s.locked,
        opacity: s.opacity,
        placeholder: s.placeholder,
        shadow: s.shadow,
        effects: s.effects,
        hyperlink: s.hyperlink,
        hoverLink: s.hoverLink,
        styleRefs: s.styleRefs,
        kind: "image",
        bbox: baked.paddedBBox ?? s.bbox,
        transform: s.transform,
        src: baked.src,
        natural: baked.natural,
    };
    return out;
}
function buildShapeIndex(shapes) {
    const map = new Map();
    const walk = (s) => {
        if (!map.has(s.id))
            map.set(s.id, s);
        if (s.kind === "group")
            for (const c of s.children)
                walk(c);
    };
    for (const s of shapes)
        walk(s);
    return map;
}
/** `p:video`/`p:audio` 的 stCond delay=0 表示进入幻灯片即播 → shape.autoplay。 */
export function applyMediaAutoplayFromTiming(shapes, timing) {
    if (!timing?.tnLst?.length)
        return;
    const auto = new Set();
    const narration = new Set();
    const volById = new Map();
    const muteById = new Set();
    const numSldById = new Map();
    const walk = (nodes) => {
        if (!nodes)
            return;
        for (const raw of nodes) {
            const n = raw;
            if (n.kind === "video" || n.kind === "audio") {
                const spid = n.cMediaNode?.tgtEl?.spTgt?.spid;
                if (spid) {
                    const id = `sp_${spid}`;
                    const delay = n.cMediaNode?.ctn?.stCondLst?.[0]?.delay;
                    if (delay === 0)
                        auto.add(id);
                    if (n.kind === "audio" && n.isNarration)
                        narration.add(id);
                    const vol = n.cMediaNode?.vol;
                    if (typeof vol === "number" && Number.isFinite(vol)) {
                        volById.set(id, Math.max(0, Math.min(1, vol / 100000)));
                    }
                    if (n.cMediaNode?.mute)
                        muteById.add(id);
                    const numSld = n.cMediaNode?.numSld;
                    if (n.kind === "audio" && typeof numSld === "number" && Number.isFinite(numSld) && numSld > 0) {
                        numSldById.set(id, numSld);
                    }
                }
                walk(n.cMediaNode?.ctn?.childTnLst);
            }
            if (n.kind === "par" || n.kind === "seq" || n.kind === "excl")
                walk(n.ctn?.childTnLst);
        }
    };
    walk(timing.tnLst);
    if (!auto.size && !volById.size && !muteById.size && !narration.size && !numSldById.size)
        return;
    const visit = (list) => {
        for (const s of list) {
            if (s.kind === "group")
                visit(s.children ?? []);
            if (s.kind !== "video" && s.kind !== "audio")
                continue;
            if (auto.has(s.id))
                s.autoplay = true;
            if (s.kind === "audio" && narration.has(s.id))
                s.isNarration = true;
            if (s.kind === "audio") {
                const numSld = numSldById.get(s.id);
                if (numSld !== undefined)
                    s.numSld = numSld;
            }
            const vol = volById.get(s.id);
            if (vol !== undefined && s.volume === undefined)
                s.volume = vol;
            if (muteById.has(s.id))
                s.muted = true;
        }
    };
    visit(shapes);
}
export { loadArchive };
