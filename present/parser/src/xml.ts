import { XMLParser } from "fast-xml-parser";

export type XmlNode = Record<string, any>;

export interface OrderedRef {
  tag: string;
  node: XmlNode;
}

const parser = new XMLParser({
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
});

const ATTRS_KEY = ":@";

export function parseXml(input: string): XmlNode {
  const raw = parser.parse(input) as Array<Record<string, unknown>>;
  const root: XmlNode = {};
  ingest(root, raw);
  return root;
}

function ingest(parent: XmlNode, items: Array<Record<string, unknown>>): void {
  const order: OrderedRef[] = [];
  for (const item of items) {
    let tag: string | undefined;
    let body: unknown;
    let attrs: Record<string, string> | undefined;
    for (const k of Object.keys(item)) {
      if (k === ATTRS_KEY) attrs = item[k] as Record<string, string>;
      else {
        tag = k;
        body = item[k];
      }
    }
    if (!tag) continue;
    if (tag === "#text") {
      const text = typeof body === "string" ? body : String(body ?? "");
      parent["#text"] = text;
      continue;
    }
    const child: XmlNode = {};
    if (attrs) {
      for (const ak of Object.keys(attrs)) child[ak] = attrs[ak];
    }
    if (Array.isArray(body)) {
      ingest(child, body as Array<Record<string, unknown>>);
    } else if (typeof body === "string") {
      child["#text"] = body;
    }
    const existing = parent[tag];
    if (existing === undefined) {
      parent[tag] = child;
    } else if (Array.isArray(existing)) {
      existing.push(child);
    } else {
      parent[tag] = [existing, child];
    }
    order.push({ tag, node: child });
  }
  if (order.length) {
    Object.defineProperty(parent, "$children", {
      value: order,
      enumerable: false,
      configurable: true,
    });
  }
}

export function orderedChildren(node: XmlNode | undefined): OrderedRef[] {
  if (!node) return [];
  const ord = (node as { $children?: OrderedRef[] }).$children;
  return ord ?? [];
}

export const arr = <T>(v: T | T[] | undefined | null): T[] => {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
};

export const attr = (node: XmlNode | undefined, name: string): string | undefined => {
  if (!node) return undefined;
  const v = node[`@_${name}`];
  return v === undefined || v === null ? undefined : String(v);
};

export const child = (node: XmlNode | undefined, name: string): XmlNode | undefined => {
  if (!node) return undefined;
  const v = node[name];
  if (Array.isArray(v)) return v[0];
  return v as XmlNode | undefined;
};

export const children = (node: XmlNode | undefined, name: string): XmlNode[] => {
  if (!node) return [];
  return arr(node[name]);
};

export function findByLocalName(node: XmlNode | undefined, localName: string): XmlNode | undefined {
  if (!node) return undefined;
  for (const k of Object.keys(node)) {
    if (k.startsWith("@_") || k === "#text") continue;
    if (stripNs(k) === localName) {
      const v = node[k];
      return Array.isArray(v) ? v[0] : v;
    }
  }
  return undefined;
}

export function findAllByLocalName(node: XmlNode | undefined, localName: string): XmlNode[] {
  if (!node) return [];
  const out: XmlNode[] = [];
  for (const k of Object.keys(node)) {
    if (k.startsWith("@_") || k === "#text") continue;
    if (stripNs(k) === localName) {
      const v = node[k];
      if (Array.isArray(v)) out.push(...v);
      else out.push(v);
    }
  }
  return out;
}

export function stripNs(name: string): string {
  const i = name.indexOf(":");
  return i < 0 ? name : name.slice(i + 1);
}

// ECMA-376 Part 3 §13 Markup Compatibility — `<mc:AlternateContent>` 是一个**容器**：
// 编辑端为 PowerPoint 2010+ 的扩展（a14 / p14 / p15 等命名空间）写一份"现代版"在
// `<mc:Choice Requires="...">` 里，再写一份退化版本在 `<mc:Fallback>` 里，给老版本 PowerPoint /
// 解析器读。我们能解析标准 OOXML（包括大部分扩展命名空间外的形状/文本特性），所以
// **优先取 Choice**；只有 Choice 缺失或里面没有可识别的子节点时才回到 Fallback。
//
// 典型案例：
//   - 7.pptx slide20 的"通项公式"黄盒子：`<p:grpSp>` 里嵌一层 AlternateContent 包了一个
//     带数学公式的 a14 文本框 → Choice 路径有普通 `a:r` 文字，保留可编辑文本；
//     Fallback 把整段渲成图片。Choice 含普通文字时仍优先 Choice。
//   - WPS/Office 插入公式：Choice 只有 `<a14:m>` OMML、Fallback 是公式栅格。
//     纯 OMML 文本框改走 Fallback 图片（见 parseShapeTree），否则公式不可见。
//   - slide 根节点上的 `<p:transition>`：`<mc:Choice>` 用 p14:dur，`<mc:Fallback>` 用经典
//     `<p:transition>`。两者效果相同，但拿 Choice 即可。
//
// 这里只**提取分支**，不做具体的展开逻辑（呼叫者自己决定怎么处理 OrderedRef 列表，
// 包括对嵌套 AlternateContent 的递归）。
export function pickAlternateContentChildren(altNode: XmlNode | undefined): OrderedRef[] {
  if (!altNode) return [];
  const choice = findByLocalName(altNode, "Choice");
  const choiceChildren = orderedChildren(choice);
  if (choiceChildren.length > 0) return choiceChildren;
  const fallback = findByLocalName(altNode, "Fallback");
  return orderedChildren(fallback);
}
