const ORIGIN_KEY = "__origin";
const DIRTY_KEY = "__dirty";
function defineHidden(obj, key, value) {
    Object.defineProperty(obj, key, {
        value,
        enumerable: false,
        configurable: true,
        writable: true,
    });
}
// 读取 shape / run 的 origin 基线。无则 undefined（from-scratch / 缓存恢复后）。
export function getOrigin(obj) {
    if (!obj || typeof obj !== "object")
        return undefined;
    return obj[ORIGIN_KEY];
}
// 合并写入 origin（非可枚举）。多次调用会浅合并（fill / stroke / opacity / ... 互不覆盖）。
export function setOrigin(obj, patch) {
    const cur = obj[ORIGIN_KEY];
    defineHidden(obj, ORIGIN_KEY, { ...(cur ?? {}), ...patch });
}
// 把 source 上的 origin 整体拷到 target（用于继承 / fontRef 合并等会丢非可枚举字段的 spread 场景）。
export function preserveOrigin(target, source) {
    const o = getOrigin(source);
    if (o !== undefined)
        defineHidden(target, ORIGIN_KEY, o);
    return target;
}
// 标记某对象（shape / slide）的字段被命令改过。
export function markDirty(obj, field) {
    let set = obj[DIRTY_KEY];
    if (!(set instanceof Set)) {
        set = new Set();
        defineHidden(obj, DIRTY_KEY, set);
    }
    set.add(field);
}
export function getDirty(obj) {
    if (!obj || typeof obj !== "object")
        return undefined;
    const set = obj[DIRTY_KEY];
    return set instanceof Set ? set : undefined;
}
export function isDirty(obj, field) {
    const set = getDirty(obj);
    return set ? set.has(field) : false;
}
export function clearDirty(obj, field) {
    const set = getDirty(obj);
    if (!set)
        return;
    if (field === undefined)
        set.clear();
    else
        set.delete(field);
}
