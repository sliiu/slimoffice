import { XMLParser } from "fast-xml-parser";
const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: false,
    preserveOrder: true,
});
export function parseXml(input) {
    return nodeFrom(parser.parse(input));
}
/** Children in the order they appear in the file. */
export function ordered(node) {
    const items = node["#items"];
    if (!Array.isArray(items))
        return [];
    return items.filter((item) => !!item && typeof item === "object");
}
export function child(node, name) {
    return ordered(node).find((item) => item.name === name)?.node;
}
export function children(node, name) {
    if (!node)
        return [];
    return ordered(node).filter((item) => item.name === name).map((item) => item.node);
}
export function attr(node, name) {
    const value = node[`@_${name}`] ?? node[`@_${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`];
    return typeof value === "string" ? value : undefined;
}
export function text(node) {
    if (!node)
        return "";
    const value = node["#text"];
    if (typeof value === "string")
        return value;
    if (typeof value === "number")
        return String(value);
    return "";
}
function nodeFrom(items) {
    const node = {};
    const list = [];
    for (const item of items) {
        let textValue;
        let childNode;
        let name;
        for (const [key, value] of Object.entries(item)) {
            if (key === ":@")
                continue;
            if (key === "#text") {
                textValue = typeof value === "string" ? value : String(value ?? "");
                continue;
            }
            name = key;
            childNode = nodeFrom(Array.isArray(value) ? value : []);
        }
        if (textValue !== undefined)
            node["#text"] = textValue;
        if (!name || !childNode)
            continue;
        const attrs = item[":@"];
        if (attrs && typeof attrs === "object") {
            for (const [key, value] of Object.entries(attrs)) {
                if (typeof value === "string")
                    childNode[key] = value;
            }
        }
        list.push({ name, node: childNode });
    }
    node["#items"] = list;
    return node;
}
