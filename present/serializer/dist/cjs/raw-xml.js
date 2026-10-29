"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseXmlPreserveOrder = parseXmlPreserveOrder;
exports.buildXml = buildXml;
exports.getAttrs = getAttrs;
exports.setAttr = setAttr;
exports.getTagName = getTagName;
exports.localName = localName;
exports.getChildren = getChildren;
exports.setChildren = setChildren;
exports.findChildByLocal = findChildByLocal;
exports.findAllChildrenByLocal = findAllChildrenByLocal;
exports.getText = getText;
exports.setText = setText;
exports.parseFragmentAsChildren = parseFragmentAsChildren;
// fast-xml-parser preserveOrder 模式下的"原始 AST"格式工具：
//   每个 element 表示为 `{ [tagName]: Array<RawNode>, ":@": { "@_attr": value, ... } }`
//   文本叶子表示为 `{ "#text": "string" }`
// 这种结构能被 XMLBuilder 完整还原回 XML 字符串（attribute / 顺序 / namespace 前缀全部保留）。
// 我们把所有 OOXML round-trip 的修改都在这个数组结构上做"外科手术"，未修改的节点字节级保留。
const fast_xml_parser_1 = require("fast-xml-parser");
// fast-xml-parser 4.x：preserveOrder 模式下 attrs 默认放在 `:@` 键（与
// element 同级），不要再传 `attributesGroupName: ":@"`，否则会嵌套两层
// 导致 XMLBuilder 把属性输出为 `="[object Object]"`。
const PARSER_OPTS = {
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: false,
    allowBooleanAttributes: true,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    textNodeName: "#text",
    preserveOrder: true,
    alwaysCreateTextNode: false,
};
const xmlParser = new fast_xml_parser_1.XMLParser(PARSER_OPTS);
const xmlBuilder = new fast_xml_parser_1.XMLBuilder({
    ...PARSER_OPTS,
    // round-trip 时不格式化，避免改动空白引起 diff；XML 标准对白空敏感字段（如 <a:t>）
    // 也会被破坏。需要精确字节级别保留时用 `format: false`。
    format: false,
    // OOXML / PowerPoint / WPS 习惯把空元素写成自闭合 `<tag/>` 而不是 `<tag></tag>`，
    // 后者虽然语义等价但会增大文件体积、并造成 round-trip 时出现"无意义"的 diff。
    suppressEmptyNode: true,
    suppressBooleanAttributes: false,
    suppressUnpairedNode: true,
});
function parseXmlPreserveOrder(text) {
    return xmlParser.parse(text);
}
// 部分 OOXML part 期望 `<?xml ?>` 头与 `standalone="yes"`。XMLBuilder 默认不加，
// 我们手动 prepend 确保 PowerPoint / WPS 接受。
//
// 头后用 CRLF：PowerPoint 自己生成的 OOXML 全部用 `?>\r\n<`，保留这个分隔符让
// "打开即保存" 与原文件首行对齐。round-trip 路径上其它行已经被 XMLBuilder 写成
// 单行（无格式化），只这一处需要手动加分隔符。
//
// preserveOrder 模式下 fast-xml-parser 会把 `<?xml ?>` 解析成 tree 的第一个 node
// （tag="?xml"），XMLBuilder 重新输出时没有 `\r\n`。所以无论是 "自带头" 还是
// "我们 prepend"，都得统一在 `?>` 后塞 CRLF。
function buildXml(tree) {
    const body = xmlBuilder.build(tree);
    if (body.startsWith("<?xml")) {
        // XMLBuilder 输出的形态是 `<?xml ...?><nextElement>`，把第一个 `?>` 后插入 CRLF。
        const m = body.match(/^<\?xml[^?]*\?>/);
        if (m) {
            return m[0] + "\r\n" + body.slice(m[0].length);
        }
        return body;
    }
    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + body;
}
// 从 raw node 中取出 attrs。preserveOrder 下属性集中在 ":@" 键。
function getAttrs(node) {
    const a = node[":@"];
    return (a && typeof a === "object" ? a : {});
}
// 写入/覆盖一个属性（key 不含 "@_" 前缀）。空字符串视为有值；undefined / null 视为删除。
function setAttr(node, key, value) {
    const ak = "@_" + key;
    let attrs = node[":@"];
    if (value === undefined || value === null) {
        if (attrs && ak in attrs) {
            delete attrs[ak];
            if (Object.keys(attrs).length === 0)
                delete node[":@"];
        }
        return;
    }
    if (!attrs) {
        attrs = {};
        node[":@"] = attrs;
    }
    attrs[ak] = String(value);
}
// 取 raw node 的"标签名"（在 preserveOrder 下，除 ":@" 外仅有一个非空键即标签名）。
function getTagName(node) {
    for (const k of Object.keys(node)) {
        if (k === ":@")
            continue;
        return k;
    }
    return undefined;
}
// 把标签名归一化为不含 namespace 前缀的 local name。
function localName(tag) {
    const i = tag.indexOf(":");
    return i < 0 ? tag : tag.slice(i + 1);
}
// 取一个 element 节点的 children 数组（即标签键对应的值）。
function getChildren(node) {
    const tag = getTagName(node);
    if (!tag)
        return [];
    const v = node[tag];
    return Array.isArray(v) ? v : [];
}
function setChildren(node, children) {
    const tag = getTagName(node);
    if (!tag)
        return;
    node[tag] = children;
}
// 在 children 中找首个 localName 匹配的子节点（不递归）。
function findChildByLocal(children, local) {
    for (const c of children) {
        const tag = getTagName(c);
        if (tag && localName(tag) === local)
            return c;
    }
    return undefined;
}
function findAllChildrenByLocal(children, local) {
    const out = [];
    for (const c of children) {
        const tag = getTagName(c);
        if (tag && localName(tag) === local)
            out.push(c);
    }
    return out;
}
// 取一个 element 节点的 `<x>…</x>` 内文本（合并所有 "#text" 叶子）。
function getText(node) {
    const children = getChildren(node);
    let out = "";
    for (const c of children) {
        if ("#text" in c) {
            const v = c["#text"];
            out += typeof v === "string" ? v : String(v ?? "");
        }
    }
    return out;
}
// 用一段纯文本替换 element 的 children（清空原有子节点）。
function setText(node, text) {
    setChildren(node, [{ "#text": text }]);
}
// 把任意 XML 字符串解析为 RawTree 子节点序列，便于拼接到现有结构。
// 输入一般是 `<a:xfrm>…</a:xfrm>` 这样的片段；为避免 XMLParser 对裸 namespace 前缀
// 报错，调用方需要保证前缀都已在该片段或所在的祖先有 xmlns 声明。
function parseFragmentAsChildren(xml) {
    return xmlParser.parse(xml);
}
