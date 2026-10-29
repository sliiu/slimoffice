"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetMasterTxStylesCmd = exports.SetPlaceholderTypeCmd = exports.DuplicateMasterCmd = exports.RenameLayoutCmd = exports.DeleteLayoutCmd = exports.AddLayoutCmd = exports.SetSlideLayoutRefCmd = void 0;
// 阶段 2.2：母版/版式编辑专属命令。所有命令都直接 mutate `pres.masters[]`，
// 编辑器在执行后必须对所有引用了该 master/layout 的 slide 调
// recomputeSlideInheritance（parser 包提供）来刷新占位符 inherited 字段，
// 否则改完 master 但 slide 看不到更新。
//
// 命名约定：`__source` / 非可枚举 partPath 不在命令里改动，serializer 阶段会
// 按"有 partPath 就 patch 原 XML，没有就走 new part 路径"自动处理。
// ---- Slide 切换 layout ----
class SetSlideLayoutRefCmd {
    slideIdx;
    next;
    label = "Switch Layout";
    prev;
    constructor(slideIdx, next) {
        this.slideIdx = slideIdx;
        this.next = next;
    }
    apply(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        this.prev = slide.layoutRef ? { ...slide.layoutRef } : undefined;
        slide.layoutRef = this.next ? { ...this.next } : undefined;
    }
    revert(pres) {
        const slide = pres.slides[this.slideIdx];
        if (!slide)
            return;
        slide.layoutRef = this.prev ? { ...this.prev } : undefined;
    }
}
exports.SetSlideLayoutRefCmd = SetSlideLayoutRefCmd;
// ---- Layout 增删改 ----
// 在指定 master 下新增一个空白 layout。模板取参考 layout（或空 layout）。
// undo 必须保存被插入的 layout 引用，以便 redo 完整恢复同一对象（保住 __source 等
// 非可枚举字段）。
class AddLayoutCmd {
    masterId;
    spec;
    label = "Add Layout";
    inserted;
    constructor(masterId, spec) {
        this.masterId = masterId;
        this.spec = spec;
    }
    apply(pres) {
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master)
            return;
        if (!master.layouts)
            master.layouts = [];
        // 阶段 2.2：parser 解析后 layouts[] 已经按 OOXML sldLayoutIdLst 顺序排列；
        // 这里默认 push 到末尾，让 serializer 在 sldLayoutIdLst 上追加。
        //
        // 引用稳定：首轮 apply 构造 layout 对象并保存；redo（再次 apply）必须复用
        // 同一个对象，否则其它命令（例如紧随的 RenameLayoutCmd / DeleteLayoutCmd）
        // 在 undo 栈里持有的引用会失效，并且 layout 上挂的 __source / partPath
        // 等非可枚举元数据也会丢失。
        const existing = this.inserted?.layout;
        const layout = existing ?? {
            id: this.spec.id,
            name: this.spec.name,
            type: this.spec.type,
            shapes: this.spec.shapes ? this.spec.shapes.map(deepClone) : [],
            background: this.spec.background,
            hf: this.spec.hf,
        };
        const pos = this.inserted?.pos ?? this.spec.pos ?? master.layouts.length;
        master.layouts.splice(pos, 0, layout);
        this.inserted = { layout, pos };
    }
    revert(pres) {
        if (!this.inserted)
            return;
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master?.layouts)
            return;
        const idx = master.layouts.findIndex((l) => l === this.inserted.layout);
        if (idx >= 0)
            master.layouts.splice(idx, 1);
    }
}
exports.AddLayoutCmd = AddLayoutCmd;
class DeleteLayoutCmd {
    masterId;
    layoutId;
    label = "Delete Layout";
    removed;
    constructor(masterId, layoutId) {
        this.masterId = masterId;
        this.layoutId = layoutId;
    }
    apply(pres) {
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master?.layouts)
            return;
        // 安全检查：拒绝删除当前仍被任何 slide 引用的 layout（OOXML spec 允许，但 UX 上易丢内容）。
        const inUse = pres.slides.some((s) => s.layoutRef?.masterId === this.masterId && s.layoutRef.layoutId === this.layoutId);
        if (inUse) {
            console.warn(`[master-cmd] DeleteLayoutCmd refused: layout "${this.layoutId}" is referenced by at least one slide. Re-layout slides first.`);
            return;
        }
        const idx = master.layouts.findIndex((l) => l.id === this.layoutId);
        if (idx < 0)
            return;
        this.removed = { layout: master.layouts[idx], pos: idx };
        master.layouts.splice(idx, 1);
    }
    revert(pres) {
        if (!this.removed)
            return;
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master?.layouts)
            return;
        master.layouts.splice(this.removed.pos, 0, this.removed.layout);
    }
}
exports.DeleteLayoutCmd = DeleteLayoutCmd;
class RenameLayoutCmd {
    masterId;
    layoutId;
    nextName;
    label = "Rename Layout";
    prev;
    constructor(masterId, layoutId, nextName) {
        this.masterId = masterId;
        this.layoutId = layoutId;
        this.nextName = nextName;
    }
    apply(pres) {
        const layout = findLayout(pres, this.masterId, this.layoutId);
        if (!layout)
            return;
        this.prev = layout.name;
        layout.name = this.nextName;
    }
    revert(pres) {
        const layout = findLayout(pres, this.masterId, this.layoutId);
        if (!layout || this.prev === undefined)
            return;
        layout.name = this.prev;
    }
}
exports.RenameLayoutCmd = RenameLayoutCmd;
// ---- Master 整树复制 ----
//
// 复制一份完整的 master + 所有 layout，赋新 id。undo 删除即可。
class DuplicateMasterCmd {
    masterId;
    newId;
    label = "Duplicate Master";
    inserted;
    constructor(masterId, newId) {
        this.masterId = masterId;
        this.newId = newId;
    }
    apply(pres) {
        if (!pres.masters)
            return;
        // 引用稳定：首轮 apply 克隆并 cache；redo 必须插回同一对象。
        let cloned = this.inserted?.master;
        let pos = this.inserted?.pos;
        if (!cloned || pos === undefined) {
            const src = pres.masters.find((m) => m.id === this.masterId);
            if (!src)
                return;
            const srcIdx = pres.masters.findIndex((m) => m.id === this.masterId);
            cloned = {
                id: this.newId,
                name: `${src.name} (Copy)`,
                background: src.background ? deepClone(src.background) : undefined,
                shapes: src.shapes.map(deepClone),
                clrMap: src.clrMap ? { ...src.clrMap } : undefined,
                hf: src.hf ? { ...src.hf } : undefined,
                preserve: src.preserve,
                txStyles: src.txStyles ? deepClone(src.txStyles) : undefined,
                layouts: (src.layouts ?? []).map((l) => ({
                    id: `${this.newId}__${l.id}`,
                    name: l.name,
                    type: l.type,
                    matchingName: l.matchingName,
                    preserve: l.preserve,
                    background: l.background ? deepClone(l.background) : undefined,
                    shapes: l.shapes.map(deepClone),
                    hf: l.hf ? { ...l.hf } : undefined,
                })),
            };
            pos = srcIdx + 1;
        }
        // 注意：不复制 __source —— 复制后的 master 应该当 "新部件"，serializer 必须给它分配新 partPath
        // 并写入 [Content_Types].xml、presentation.xml/sldMasterIdLst。阶段 2.3 实装。
        pres.masters.splice(pos, 0, cloned);
        this.inserted = { master: cloned, pos };
    }
    revert(pres) {
        if (!pres.masters || !this.inserted)
            return;
        const idx = pres.masters.findIndex((m) => m === this.inserted.master);
        if (idx >= 0)
            pres.masters.splice(idx, 1);
    }
}
exports.DuplicateMasterCmd = DuplicateMasterCmd;
// ---- Placeholder 类型转换 ----
//
// 修改 master/layout 上某个 placeholder shape 的 phType（title / body / pic / chart ...）。
// 同步刷新 slide 上继承自该 placeholder 的 shape：阶段 2.2 把刷新交给调用方
// （editor.ts execCommand 后统一 recomputeSlideInheritance），命令本身只改本地状态。
class SetPlaceholderTypeCmd {
    masterId;
    layoutId;
    shapeId;
    nextType;
    nextIdx;
    label = "Set Placeholder Type";
    prev;
    constructor(masterId, layoutId, shapeId, nextType, 
    /** OOXML 中 placeholder idx 是字符串属性（"0".."10"），保持原类型避免转换失误。 */
    nextIdx) {
        this.masterId = masterId;
        this.layoutId = layoutId;
        this.shapeId = shapeId;
        this.nextType = nextType;
        this.nextIdx = nextIdx;
    }
    apply(pres) {
        const target = this.findShape(pres);
        if (!target)
            return;
        this.prev = { type: target.placeholder?.type, idx: target.placeholder?.idx };
        target.placeholder = {
            ...(target.placeholder ?? {}),
            type: this.nextType,
            idx: this.nextIdx !== undefined ? String(this.nextIdx) : target.placeholder?.idx,
        };
    }
    revert(pres) {
        const target = this.findShape(pres);
        if (!target || !this.prev)
            return;
        if (this.prev.type === undefined) {
            delete target.placeholder;
        }
        else {
            target.placeholder = { ...(target.placeholder ?? {}), type: this.prev.type, idx: this.prev.idx };
        }
    }
    findShape(pres) {
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master)
            return undefined;
        const container = this.layoutId
            ? master.layouts?.find((l) => l.id === this.layoutId)?.shapes
            : master.shapes;
        if (!container)
            return undefined;
        return findInShapes(container, this.shapeId);
    }
}
exports.SetPlaceholderTypeCmd = SetPlaceholderTypeCmd;
class SetMasterTxStylesCmd {
    masterId;
    scope;
    level;
    patch;
    label = "Set Master Text Styles";
    prev;
    constructor(masterId, scope, level, patch) {
        this.masterId = masterId;
        this.scope = scope;
        this.level = level;
        this.patch = patch;
    }
    apply(pres) {
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master)
            return;
        this.prev = master.txStyles ? deepClone(master.txStyles) : undefined;
        const next = master.txStyles ? deepClone(master.txStyles) : {};
        const arr = (next[this.scope] = next[this.scope] ? [...next[this.scope]] : []);
        const cur = arr[this.level] ?? {};
        arr[this.level] = {
            pPr: { ...(cur.pPr ?? {}), ...(this.patch.pPr ?? {}) },
            rPr: { ...(cur.rPr ?? {}), ...(this.patch.rPr ?? {}) },
            bullet: this.patch.bullet ?? cur.bullet,
        };
        master.txStyles = next;
    }
    revert(pres) {
        const master = pres.masters?.find((m) => m.id === this.masterId);
        if (!master)
            return;
        master.txStyles = this.prev ? deepClone(this.prev) : undefined;
    }
}
exports.SetMasterTxStylesCmd = SetMasterTxStylesCmd;
function findLayout(pres, masterId, layoutId) {
    return pres.masters?.find((m) => m.id === masterId)?.layouts?.find((l) => l.id === layoutId);
}
function findInShapes(shapes, id) {
    for (const s of shapes) {
        if (s.id === id)
            return s;
        if (s.kind === "group") {
            const f = findInShapes(s.children, id);
            if (f)
                return f;
        }
    }
    return undefined;
}
function deepClone(v) {
    if (typeof structuredClone === "function")
        return structuredClone(v);
    return JSON.parse(JSON.stringify(v));
}
