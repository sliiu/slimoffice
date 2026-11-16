import { XMLParser } from "fast-xml-parser";

export type XmlNode = Record<string, unknown>;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  preserveOrder: true,
});

type OrderedItem = Record<string, unknown>;

export function parseXml(input: string): XmlNode {
  return nodeFrom(parser.parse(input) as OrderedItem[]);
}

/** Children in the order they appear in the file. */
export function ordered(node: XmlNode): Array<{ name: string; node: XmlNode }> {
  const items = node["#items"];
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is { name: string; node: XmlNode } => !!item && typeof item === "object");
}

export function child(node: XmlNode, name: string): XmlNode | undefined {
  return ordered(node).find((item) => item.name === name)?.node;
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  if (!node) return [];
  return ordered(node).filter((item) => item.name === name).map((item) => item.node);
}

export function attr(node: XmlNode, name: string): string | undefined {
  const value = node[`@_${name}`] ?? node[`@_${name[0]?.toUpperCase() ?? ""}${name.slice(1)}`];
  return typeof value === "string" ? value : undefined;
}

export function text(node: XmlNode | undefined): string {
  if (!node) return "";
  const value = node["#text"];
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return "";
}

function nodeFrom(items: OrderedItem[]): XmlNode {
  const node: XmlNode = {};
  const list: Array<{ name: string; node: XmlNode }> = [];
  for (const item of items) {
    let textValue: string | undefined;
    let childNode: XmlNode | undefined;
    let name: string | undefined;
    for (const [key, value] of Object.entries(item)) {
      if (key === ":@") continue;
      if (key === "#text") {
        textValue = typeof value === "string" ? value : String(value ?? "");
        continue;
      }
      name = key;
      childNode = nodeFrom(Array.isArray(value) ? (value as OrderedItem[]) : []);
    }
    if (textValue !== undefined) node["#text"] = textValue;
    if (!name || !childNode) continue;
    const attrs = item[":@"];
    if (attrs && typeof attrs === "object") {
      for (const [key, value] of Object.entries(attrs as Record<string, unknown>)) {
        if (typeof value === "string") childNode[key] = value;
      }
    }
    list.push({ name, node: childNode });
  }
  node["#items"] = list;
  return node;
}
