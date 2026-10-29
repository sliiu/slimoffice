import type { Layer, Shape, Slide, SlideMaster } from "@ppt/core";

// 阶段 2.1：把 slide.layoutRef 指向的 master/layout 装饰 shape 实时合成为渲染 layer，
// 替代阶段 1 中 parser 把副本注入 slide.layers[0]/[1] 的做法。这使得 deck 级
// `Presentation.masters[]` 成为单一数据源：editor 改 master 后所有 slide 自动联动。
//
// id 命名约定（必须保持兼容！）：
//   - master 装饰 shape 在 SceneNode 树里的 id 仍然是 `master__sp_N`
//   - layout 装饰 shape 的 id 仍然是 `layout__sp_N`
// 这与历史 parser 注入路径一致，OOXML animation runtime / SceneNode lookup 路径不需要改。
//
// 合成顺序：master shapes（底） → layout shapes → slide.layers[*]（顶）。
// 母版/版式 shapes 只取「非占位符」（占位符在 slide 内通过 inherit 已合并）。
export function composeSlideForRender(
  slide: Slide,
  masters: SlideMaster[] | undefined,
): Layer[] {
  const out: Layer[] = [];
  // ECMA-376 sld@showMasterSp defaults to true. When false, hide master/layout
  // graphics (non-placeholders). Placeholders are never composed here.
  const showMasterSp = slide.showMasterSp !== false;
  if (showMasterSp && slide.layoutRef && masters && masters.length > 0) {
    const master = masters.find((m) => m.id === slide.layoutRef!.masterId);
    const layout = master?.layouts?.find((l) => l.id === slide.layoutRef!.layoutId);
    if (master) {
      const ms = prefixShapeIds(nonPlaceholderShapes(master.shapes), "master__", true);
      if (ms.length > 0) {
        out.push({ id: "master", name: "Master", visible: true, locked: true, shapes: ms });
      }
    }
    if (layout) {
      const ls = prefixShapeIds(nonPlaceholderShapes(layout.shapes), "layout__", true);
      if (ls.length > 0) {
        out.push({ id: "layout", name: "Layout", visible: true, locked: true, shapes: ls });
      }
    }
  }
  // 注意 slide.layers 阶段 2 起只剩 "main"；为兼容历史 parser 输出（仍可能含 "master"/"layout"），
  // 这里显式过滤，避免重复渲染装饰。
  for (const l of slide.layers) {
    if (l.id === "master" || l.id === "layout") continue;
    out.push(l);
  }
  return out;
}

function nonPlaceholderShapes(shapes: Shape[]): Shape[] {
  return shapes.filter((s) => !s.placeholder);
}

// 与 parser/parse.ts 的 prefixShapeIds 行为一致 —— 给装饰 shape 一个 prefix
// 防止与 slide 内部 sp_N 冲突；同时强制 locked=true 保护它在 hit-test 时不被点中。
function prefixShapeIds(shapes: Shape[], prefix: string, forceLock: boolean): Shape[] {
  // 收集这批 shapes 用到的所有 id（顶层 + group children 递归），
  // 只 prefix 这些 id —— 兼容旧逻辑：跟 parser 那侧基于 slideIdSet 的判定等价（在
  // composer 这边 master 装饰本身不会出现在 slide 主体里，所以全部 prefix 即可）。
  const collected = new Set<string>();
  const collectIds = (s: Shape): void => {
    collected.add(s.id);
    if (s.kind === "group") for (const c of s.children) collectIds(c);
  };
  for (const s of shapes) collectIds(s);
  const rename = (id: string): string => (collected.has(id) ? `${prefix}${id}` : id);
  const walk = (s: Shape): Shape => {
    const next: Shape = { ...s, id: rename(s.id) } as Shape;
    if (forceLock) next.locked = true;
    if (s.kind === "group") {
      (next as Shape & { children: Shape[] }).children = (s as Shape & { children: Shape[] }).children.map(walk);
    }
    return next;
  };
  return shapes.map(walk);
}
