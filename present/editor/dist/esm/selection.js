// 背景"哨兵"id：把"选中幻灯片背景"塞进同一个 Selection（而不是另起一套状态），
// 这样 overlay / inspector / ribbon 的 selection.subscribe 刷新链路无需改动即可联动。
// findShape 对它返回 undefined，所以 move/resize/delete 等 shape 命令天然 no-op；
// 遍历选区"当 shape 用"的地方（marquee / Ctrl+A / Tab / AI 面板）必须显式跳过它。
export const BACKGROUND_SEL_ID = "__background__";
export class Selection {
    ids = new Set();
    listeners = new Set();
    get values() {
        return this.ids;
    }
    // 当前选区是否为"背景"（唯一选中且是背景哨兵）。
    isBackground() {
        return this.ids.size === 1 && this.ids.has(BACKGROUND_SEL_ID);
    }
    has(id) {
        return this.ids.has(id);
    }
    set(ids) {
        const next = new Set(ids);
        if (next.size === this.ids.size) {
            let same = true;
            for (const id of next)
                if (!this.ids.has(id)) {
                    same = false;
                    break;
                }
            if (same)
                return;
        }
        this.ids = next;
        this.emit();
    }
    add(id) {
        if (this.ids.has(id))
            return;
        this.ids.add(id);
        this.emit();
    }
    remove(id) {
        if (!this.ids.delete(id))
            return;
        this.emit();
    }
    toggle(id) {
        if (this.ids.has(id))
            this.ids.delete(id);
        else
            this.ids.add(id);
        this.emit();
    }
    clear() {
        if (this.ids.size === 0)
            return;
        this.ids.clear();
        this.emit();
    }
    subscribe(fn) {
        this.listeners.add(fn);
        fn(this.ids);
        return () => this.listeners.delete(fn);
    }
    emit() {
        for (const fn of this.listeners)
            fn(this.ids);
    }
}
export function findShape(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const found = walk(s, id);
            if (found)
                return found;
        }
    }
    return undefined;
}
// 同 findShape，但额外返回所在 layer。commands.ts 的 editable guard
// 用它来判断 shape 是否处于 master/layout 的只读副本层。
export function findShapeWithLayer(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const found = walk(s, id);
            if (found)
                return { shape: found, layer };
        }
    }
    return undefined;
}
// parser 把 master/layout 的装饰 shape 复制到 slide.layers[0]/[1]，layer.id 固定为
// "master" / "layout"。这两个层的副本永远不应由 slide 级 cmd 写入，否则编辑
// 看似生效但导出 .pptx 时会被 serializer 的 mainLayer 过滤掉，造成隐性数据丢失。
// 真正改母版要走「母版视图」（阶段 2）。
export function isMasterCopyLayer(layer) {
    return layer.id === "master" || layer.id === "layout";
}
function walk(shape, id) {
    if (shape.id === id)
        return shape;
    if (shape.kind === "group") {
        for (const c of shape.children) {
            const f = walk(c, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
export function findTopLevelId(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            if (containsId(s, id))
                return s.id;
        }
    }
    return undefined;
}
function containsId(shape, id) {
    if (shape.id === id)
        return true;
    if (shape.kind === "group") {
        for (const c of shape.children)
            if (containsId(c, id))
                return true;
    }
    return false;
}
// 返回 id 所在的直接父 group（不是 top-level shape）。用于实现"cell 与表格 group"
// 的双向关系：表格 cell 是 group.children 中的 TextShape，inspector / 编辑器需要
// 知道某个 cell 属于哪个 table group，以及反向枚举该 group 下所有 cell。
export function findParentGroup(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const p = findParentInTree(s, id);
            if (p)
                return p;
        }
    }
    return undefined;
}
/**
 * Parser 把带 txBody 的 sp 拆成 group(sp_N_base, sp_N_text)。
 * 选择窗里的 "TextBox N text · text" 是文字半边；移动 / 缩放应对整框，
 * 否则 _base 停在解析期 bbox，保存后边框落在旧位置。
 */
export function syntheticTextBoxGroupId(slide, id) {
    if (!id.endsWith("_text") || id.startsWith("tbl_"))
        return id;
    const parent = findParentGroup(slide, id);
    if (parent?.kind === "group" &&
        parent.children.some((c) => c.id === `${parent.id}_base`)) {
        return parent.id;
    }
    return id;
}
function findParentInTree(shape, id) {
    if (shape.kind !== "group")
        return undefined;
    for (const c of shape.children) {
        if (c.id === id)
            return shape;
        const f = findParentInTree(c, id);
        if (f)
            return f;
    }
    return undefined;
}
/**
 * 从外到内返回 id 的祖先 group（不含自身）。空数组 = 顶层 shape。
 * 行内文本 overlay / 选中框需要把这些 group 的 rotation/flip 叠到叶子 bbox 上，
 * 才和 renderer 父 <g> 变换后的画面重合。
 */
export function findShapeAncestors(slide, id) {
    for (const layer of slide.layers) {
        for (const s of layer.shapes) {
            const path = ancestorPath(s, id, []);
            if (path)
                return path;
        }
    }
    return [];
}
function ancestorPath(shape, id, acc) {
    if (shape.id === id)
        return acc;
    if (shape.kind !== "group")
        return undefined;
    const next = [...acc, shape];
    for (const c of shape.children) {
        const found = ancestorPath(c, id, next);
        if (found)
            return found;
    }
    return undefined;
}
