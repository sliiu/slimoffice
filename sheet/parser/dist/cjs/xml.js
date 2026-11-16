"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseXml = parseXml;
exports.child = child;
exports.children = children;
exports.attr = attr;
const fast_xml_parser_1 = require("fast-xml-parser");
const parser = new fast_xml_parser_1.XMLParser({
    preserveOrder: true,
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    trimValues: false,
});
function parseXml(xml) {
    const parsed = parser.parse(xml);
    return { name: "#root", attrs: {}, children: nodesFrom(parsed), text: "" };
}
function nodesFrom(items) {
    const nodes = [];
    for (const item of items) {
        if (!item || typeof item !== "object")
            continue;
        const record = item;
        const attrs = attrsFrom(record[":@"]);
        for (const [key, value] of Object.entries(record)) {
            if (key === ":@" || !Array.isArray(value))
                continue;
            nodes.push({
                name: key,
                attrs,
                children: nodesFrom(value),
                text: textFrom(value),
            });
        }
    }
    return nodes;
}
function attrsFrom(raw) {
    const attrs = {};
    if (!raw || typeof raw !== "object")
        return attrs;
    for (const [key, value] of Object.entries(raw)) {
        if (!key.startsWith("@_"))
            continue;
        attrs[key.slice(2)] = String(value);
    }
    return attrs;
}
function textFrom(items) {
    let text = "";
    for (const item of items) {
        if (!item || typeof item !== "object")
            continue;
        const value = item["#text"];
        if (typeof value === "string" || typeof value === "number")
            text += String(value);
    }
    return text;
}
function child(node, name) {
    return node?.children.find((item) => item.name === name);
}
function children(node, name) {
    return node?.children.filter((item) => item.name === name) ?? [];
}
function attr(node, name) {
    if (!node)
        return undefined;
    return node.attrs[name] ?? node.attrs[name.charAt(0).toUpperCase() + name.slice(1)];
}
