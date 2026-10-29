"use strict";
// ECMA-376 §19.2.1.7 defaultTextStyle — 演示文稿级 9 级正文默认。
// from-scratch 写出带校对 lang 的 lstStyle；round-trip 在校对语言变化时只改 lang，
// 避免整段覆盖 Office 原有的字号 / 缩进。
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderDefaultTextStyleXml = renderDefaultTextStyleXml;
exports.patchDefaultTextStyleLang = patchDefaultTextStyleLang;
const core_1 = require("@sliiu/present-core");
const fflate_1 = require("fflate");
const xml_util_1 = require("./xml-util");
const pptx_shapes_1 = require("./pptx-shapes");
function defRPrXml(lang, withSz) {
    const sz = withSz ? ` sz="1800"` : "";
    return `<a:defRPr lang="${(0, xml_util_1.esc)(lang)}"${sz} kern="1200" dirty="0"><a:solidFill><a:schemeClr val="tx1"/></a:solidFill><a:latin typeface="+mn-lt"/><a:ea typeface="+mn-ea"/><a:cs typeface="+mn-cs"/></a:defRPr>`;
}
/** From-scratch `<p:defaultTextStyle>`：有 IR 就按级写出，否则 PowerPoint 默认 18pt + 校对语言。 */
function renderDefaultTextStyleXml(lang, styles) {
    const fromIr = (0, pptx_shapes_1.defaultTextStyleToXml)(styles, lang);
    if (fromIr)
        return fromIr;
    const levels = [`<a:defPPr>${defRPrXml(lang, false)}</a:defPPr>`];
    for (let i = 1; i <= 9; i++) {
        const marL = (i - 1) * 457200;
        levels.push(`<a:lvl${i}pPr marL="${marL}" algn="l" defTabSz="914400" rtl="0" eaLnBrk="1" latinLnBrk="0" hangingPunct="1">${defRPrXml(lang, true)}</a:lvl${i}pPr>`);
    }
    return `  <p:defaultTextStyle>\n    ${levels.join("\n    ")}\n  </p:defaultTextStyle>\n`;
}
function patchLangInDefaultTextStyle(block, lang) {
    if (/\slang="[^"]*"/.test(block)) {
        return block.replace(/\slang="[^"]*"/g, ` lang="${(0, xml_util_1.esc)(lang)}"`);
    }
    return block.replace(/<a:defRPr\b([^/>]*)(\/?)>/g, (_m, rest, slash) => {
        if (/\slang=/.test(rest))
            return `<a:defRPr${rest}${slash}>`;
        return `<a:defRPr lang="${(0, xml_util_1.esc)(lang)}"${rest}${slash}>`;
    });
}
function patchDefaultTextStyleLang(pres, archive, opts) {
    const source = pres.__source;
    if (!source)
        return;
    const prev = source.proofingLangMetaSnapshot ?? "";
    const next = (0, core_1.buildProofingLangMeta)(pres) ?? "";
    if (next === prev)
        return;
    const lang = (0, core_1.ooxmlLangFromProofingId)((0, core_1.getProofingLanguage)(pres));
    const presPath = source.presentationPath ?? "ppt/presentation.xml";
    const bytes = archive.files.get(presPath);
    if (!bytes)
        return;
    let xml = (0, fflate_1.strFromU8)(bytes);
    if (/<p:defaultTextStyle\s*\/>/.test(xml) || /<p:defaultTextStyle>\s*<\/p:defaultTextStyle>/.test(xml)) {
        xml = xml
            .replace(/<p:defaultTextStyle\s*\/>/, renderDefaultTextStyleXml(lang).trim())
            .replace(/<p:defaultTextStyle>\s*<\/p:defaultTextStyle>/, renderDefaultTextStyleXml(lang).trim());
    }
    else if (/<p:defaultTextStyle\b/.test(xml)) {
        xml = xml.replace(/<p:defaultTextStyle\b[\s\S]*?<\/p:defaultTextStyle>/, (block) => patchLangInDefaultTextStyle(block, lang));
    }
    else {
        xml = xml.replace(/(<\/p:presentation>)/, `${renderDefaultTextStyleXml(lang)}$1`);
    }
    archive.files.set(presPath, (0, fflate_1.strToU8)(xml));
    if (opts.debug)
        console.log(`[roundtrip] defaultTextStyle lang → ${lang}`);
}
