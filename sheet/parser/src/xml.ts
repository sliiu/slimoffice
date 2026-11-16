import { XMLParser } from "fast-xml-parser";

export interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const parser = new XMLParser({
  preserveOrder: true,
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: false,
});

export function parseXml(xml: string): XmlNode {
  const parsed = parser.parse(xml) as unknown[];
  return { name: "#root", attrs: {}, children: nodesFrom(parsed), text: "" };
}

function nodesFrom(items: unknown[]): XmlNode[] {
  const nodes: XmlNode[] = [];
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const attrs = attrsFrom(record[":@"]);
    for (const [key, value] of Object.entries(record)) {
      if (key === ":@" || !Array.isArray(value)) continue;
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

function attrsFrom(raw: unknown): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (!raw || typeof raw !== "object") return attrs;
  for (const [key, value] of Object.entries(raw)) {
    if (!key.startsWith("@_")) continue;
    attrs[key.slice(2)] = String(value);
  }
  return attrs;
}

function textFrom(items: unknown[]): string {
  let text = "";
  for (const item of items) {
    if (!item || typeof item !== "object") continue;
    const value = (item as Record<string, unknown>)["#text"];
    if (typeof value === "string" || typeof value === "number") text += String(value);
  }
  return text;
}

export function child(node: XmlNode | undefined, name: string): XmlNode | undefined {
  return node?.children.find((item) => item.name === name);
}

export function children(node: XmlNode | undefined, name: string): XmlNode[] {
  return node?.children.filter((item) => item.name === name) ?? [];
}

export function attr(node: XmlNode | undefined, name: string): string | undefined {
  if (!node) return undefined;
  return node.attrs[name] ?? node.attrs[name.charAt(0).toUpperCase() + name.slice(1)];
}
