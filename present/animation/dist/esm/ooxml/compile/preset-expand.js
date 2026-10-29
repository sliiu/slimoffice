// 阶段 A3：把 timing 树中"仅有 cTn.presetID 而 cBhvr 子节点缺失"的占位 preset 容器
// 用 PresetTemplate 子树替换。预处理 pass 在 compileTiming 入口执行，对 PowerPoint
// 出品的完整 PPT 无副作用（其 preset 容器都已完整展开 cBhvr）；仅对编辑器/序列化器
// 写出的"简化 preset 占位"（只写 presetID，由 player 展开）生效。
//
// 替换规则：
//   1. 节点 kind 必须是 par/seq/excl（preset 容器都是这些）
//   2. cTn.presetID 已设置，且 cTn.presetClass ∈ {entr,exit,emph,path}
//   3. childTnLst 为空，或只有可见性 set + 透明度 anim（编辑器占位）
//   4. 找到对应 PresetTemplate → 用 expandPresetTemplate 替换当前节点的 childTnLst
// 已经带位移 / 滤镜 / 缩放的 PowerPoint 子树不替换。
//
// 容器展开之后，仍可能剩下「行为叶子自己带 presetID、但 attrNameLst 是空的」。
// 这种叶子以前落到 compilePresetTracks 的硬编码关键帧。这里把它换成模板子树的
// 内层 childTnLst，让后面的 compile 走真实的 timing / 滤镜 / 运动路径。
// 找不到模板时保留叶子，compilePresetTracks 继续当安全网。
import { presetChildrenAreOpacityPlaceholder } from "./helpers.js";
import { expandPresetTemplate, findPresetTemplate } from "../presets-template/index.js";
import { getCTn, getChildren, getTgtEl, isBehavior, isContainer, isMedia, } from "../types.js";
export function expandPresetPlaceholders(root) {
    walkAndExpand(root, undefined);
    return root;
}
function walkAndExpand(node, inheritedTgt) {
    if (!isContainer(node))
        return;
    const cTn = getCTn(node);
    // 容器自身没 tgtEl，沿父链向下传第一个出现的 spTgt.spid 作为占位 preset 的目标兜底。
    const childList = cTn.childTnLst;
    const shouldExpand = cTn.presetClass &&
        cTn.presetID !== undefined &&
        (cTn.presetClass === "entr" ||
            cTn.presetClass === "exit" ||
            cTn.presetClass === "emph" ||
            cTn.presetClass === "path") &&
        (!childList || childList.length === 0 || presetChildrenAreOpacityPlaceholder(node));
    if (shouldExpand) {
        // 占位 preset 没有 cBhvr 子树，目标推断顺序：
        //   1. 自定义字段 cTn._tgtSpid（编辑器/序列化器写入的 hint）
        //   2. 父链上最近一次出现的 spTgt.spid
        //   3. 自身子树（罕见——占位容器本身没 cBhvr，但有时父子链上有 set 节点带 spTgt）
        const candidateTgt = cTn._tgtSpid;
        const fromHint = typeof candidateTgt === "string" ? candidateTgt : undefined;
        const tgtSpid = fromHint ?? inheritedTgt?.spTgt?.spid ?? findFirstSpTgt(node);
        if (tgtSpid) {
            const tpl = findPresetTemplate(cTn.presetClass, cTn.presetID);
            if (tpl) {
                const expanded = expandPresetTemplate(tpl, {
                    tgtSpid,
                    presetSubtype: cTn.presetSubtype,
                    durMs: typeof cTn.dur === "number" ? cTn.dur : undefined,
                    delayMs: typeof cTn.delay === "number" ? cTn.delay : undefined,
                });
                // 展开结果是完整 clickEffect 子树；把它的内层 childTnLst 复制到当前容器，
                // 保留当前容器自身的 nodeType/triggers 不变。
                const expandedCTn = getCTn(expanded);
                if (expandedCTn.childTnLst) {
                    cTn.childTnLst = expandedCTn.childTnLst;
                }
            }
        }
    }
    replaceChannellessLeaves(node);
    // §19.5.9 递归把当前容器或子节点找到的最近一个 spTgt 透传给后代占位 preset。
    const myInheritedTgt = inheritedTgt ?? findFirstChildSpTgt(node);
    for (const c of getChildren(node)) {
        walkAndExpand(c, myInheritedTgt);
    }
}
// 在子树中找第一个带 spTgt.spid 的 behavior/media，用于推断占位 preset 的目标。
function findFirstSpTgt(node) {
    if (isBehavior(node) || isMedia(node)) {
        return getTgtEl(node)?.spTgt?.spid;
    }
    if (isContainer(node)) {
        for (const c of getChildren(node)) {
            const id = findFirstSpTgt(c);
            if (id)
                return id;
        }
    }
    return undefined;
}
function replaceChannellessLeaves(node) {
    const cTn = getCTn(node);
    const list = cTn.childTnLst;
    if (!list || list.length === 0)
        return;
    const next = [];
    let changed = false;
    for (const child of list) {
        const expanded = expandChannellessLeaf(child);
        if (expanded) {
            next.push(...expanded);
            changed = true;
        }
        else {
            next.push(child);
        }
    }
    if (changed)
        cTn.childTnLst = next;
}
// anim/set 只有 presetID、没有 attrNameLst 时，通道编译拿不到属性。
// 换成模板内层子树（不含模板根上的 clickEffect），父容器自己的 nodeType 保留。
function expandChannellessLeaf(node) {
    if (node.kind !== "anim" && node.kind !== "set")
        return undefined;
    const cTn = node.cBhvr.ctn;
    const cls = cTn.presetClass;
    const id = cTn.presetID;
    if (id === undefined || !cls)
        return undefined;
    if (cls !== "entr" && cls !== "exit" && cls !== "emph" && cls !== "path")
        return undefined;
    const names = node.cBhvr.attrNameLst;
    if (names && names.length > 0)
        return undefined;
    const tgtSpid = node.cBhvr.tgtEl?.spTgt?.spid;
    if (!tgtSpid)
        return undefined;
    const tpl = findPresetTemplate(cls, id);
    if (!tpl)
        return undefined;
    const expanded = expandPresetTemplate(tpl, {
        tgtSpid,
        presetSubtype: cTn.presetSubtype,
        durMs: typeof cTn.dur === "number" ? cTn.dur : undefined,
        delayMs: typeof cTn.delay === "number" ? cTn.delay : undefined,
    });
    const kids = getCTn(expanded).childTnLst;
    if (!kids || kids.length === 0)
        return undefined;
    return kids;
}
function findFirstChildSpTgt(container) {
    for (const c of getChildren(container)) {
        if (isBehavior(c) || isMedia(c)) {
            const t = getTgtEl(c);
            if (t?.spTgt?.spid)
                return t;
        }
    }
    return undefined;
}
