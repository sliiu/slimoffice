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

/** Keeps namespace prefixes, used only when markup has to be written back unchanged. */
const prefixed = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: false,
  parseAttributeValue: false,
  parseTagValue: false,
  trimValues: false,
  preserveOrder: true,
});

type OrderedItem = Record<string, unknown>;

export function parseXml(input: string): XmlNode {
  return nodeFrom(parser.parse(input) as OrderedItem[]);
}

/** Parses one element and returns its markup with the original prefixes, so it can be written back unchanged. */
export function keepMarkup(input: string): string {
  const items = prefixed.parse(input) as OrderedItem[];
  const node = nodeFrom(items);
  const first = ordered(node)[0];
  return first ? serialize(first.name, first.node) : "";
}

/** The body of a document, parsed with prefixes kept, in document order. */
export function keptBody(input: string): Array<{ name: string; node: XmlNode }> {
  const parsed = nodeFrom(prefixed.parse(input) as OrderedItem[]);
  const root = ordered(parsed).find((item) => item.name === "document" || item.name.endsWith(":document"))?.node;
  const body = root ? ordered(root).find((item) => item.name === "body" || item.name.endsWith(":body"))?.node : undefined;
  return body ? ordered(body) : [];
}

/**
 * One element's markup with its original prefixes. `path` is the local name at each level,
 * and `occurrence` counts how many earlier siblings share that name, so the prefixed tree
 * lines up with the tree that had its prefixes removed.
 */
export function keptAt(items: Array<{ name: string; node: XmlNode }>, index: number, path: Array<[string, string, number]>): string {
  let current = items[index];
  for (const [local, signature, occurrence] of path) {
    const same = current ? ordered(current.node).filter((item) => localName(item.name) === local && attrSignature(item.node) === signature) : [];
    current = same[occurrence];
  }
  return current ? serialize(current.name, current.node) : "";
}

function attrSignature(node: XmlNode): string {
  return Object.entries(node)
    .filter(([key]) => key.startsWith("@_"))
    .map(([key, value]) => `${localName(key.slice(2))}=${String(value)}`)
    .sort()
    .join(",");
}

function localName(name: string): string {
  const colon = name.indexOf(":");
  return colon < 0 ? name : name.slice(colon + 1);
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

/** The markup of one node, with its attributes and children, so a part the model does not edit can be written back as it was. */
export function serialize(name: string, node: XmlNode): string {
  const attrs = Object.entries(node)
    .filter(([key]) => key.startsWith("@_"))
    .map(([key, value]) => ` ${key.slice(2)}="${escapeXml(String(value))}"`)
    .join("");
  const body = ordered(node)
    .map((item) => serialize(item.name, item.node))
    .join("");
  const own = typeof node["#text"] === "string" || typeof node["#text"] === "number" ? escapeXml(String(node["#text"])) : "";
  const inner = `${own}${body}`;
  return inner ? `<${name}${attrs}>${inner}</${name}>` : `<${name}${attrs}/>`;
}

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
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
