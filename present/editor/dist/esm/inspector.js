import { bindCombobox } from "@sliiu/present-ui";
import { DEFAULT_FONT_PT, fontPxFromPt, ptToPx, pxToPt } from "./font-size.js";
import { mediaTrimBounds, clampMediaTime, attachMediaTrimPlayback } from "@sliiu/present-core";
import { FlipShapeCmd, InsertTableColumnCmd, InsertTableRowCmd, MergeTableCellsCmd, UnmergeTableCellsCmd, RemoveTableColumnCmd, RemoveTableRowCmd, SetBackgroundTargetCmd, SetFillCmd, SetCropFrameCmd, SetMediaPropsCmd, UpdateMediaSrcCmd, SetShapeBboxCmd, SetShapeLockedCmd, SetShapeOpacityCmd, SetShapeRotationCmd, SetShapeVisibleCmd, SetStrokeCmd, SetShapeEffectsCmd, SetShape3DCmd, SetTextStyleCmd, SetTextBodyCmd, SetTextAlignCmd, SetPresetAdjCmd, SetParagraphRtlCmd, SetParagraphCjkCmd, SetParagraphSpacingCmd, textRowOrderPatch, textRowOrderRtl, isWordArtStackedVert, slideTarget, } from "./commands.js";
import { BACKGROUND_SEL_ID, findParentGroup, findShape, findShapeWithLayer, isMasterCopyLayer } from "./selection.js";
import { t } from "./i18n/index.js";
import { bindFontFamilyCombobox } from "./font-list.js";
import { mkLucideIconButton, svgIcon } from "./icons.js";
import { CHECK_CLASS, COLOR_SWATCH_CLASS, CONTROL_INPUT_CLASS, RANGE_INPUT_CLASS } from "./ui-style.js";
import { chartInspectorSection } from "./chart-inspector.js";
import { paintedTextColor } from "./live-color.js";
import { cropHost, imageFrame, readCrop, setCropEdge, ZERO_CROP } from "./crop-frame.js";
import { runAtCharRanges } from "./text-char-style.js";
import { appendPaintEditor } from "./paint-editor-ui.js";
import { AddSmartArtItemCmd, RemoveSmartArtItemCmd, SetSmartArtLayoutCmd, UpdateSmartArtItemsCmd, MoveSmartArtItemCmd, SetSmartArtItemLevelCmd, DuplicateSmartArtItemCmd, ClearSmartArtPicturesCmd, } from "./smartart-commands.js";
import { SHAPE_EFFECT_PRESETS } from "./shape-effect-presets.js";
import { extractSmartArtItems, parseSmartArtItemLines, serializeSmartArtItemsText, smartArtLayoutSupportsPictures, SMARTART_LAYOUT_KINDS, } from "@sliiu/present-core";
import { downloadOleEmbed, formatByteSize, oleEmbedByteSize, dataUrlByteSize, isOleEmbedOverLimit, UpdateOleEmbedCmd, SetOleShowAsIconCmd } from "./ole-cmd.js";
import { UpdateModel3DGlbCmd } from "./model3d-cmd.js";
import { loadModel3DFromFile, model3DDataUrlByteSize } from "./model3d-load.js";
import { formatRecordingDuration } from "./video-export.js";
import { filterLayoutsToWhitelist } from "./slide-layout-whitelist.js";
import { copyTextToClipboard, formatMediaTrimSummary, isLargeMediaBytes, mediaMimeLabel, parseDataUrlMime, shouldConfirmLargeInsertBytes, smartArtPictureCount, } from "./insert-meta.js";
// ECMA-376 §20.1.10.49 ST_PresetLineDashVal — UI 中只暴露主流几款。
// 用 getter 方式而非常量，让 t() 在调用时刻读当前 locale。
function dashOptions() {
    return [
        ["solid", t("inspector.dash.solid")],
        ["dash", t("inspector.dash.dash")],
        ["dot", t("inspector.dash.dot")],
        ["dashDot", t("inspector.dash.dashDot")],
        ["lgDash", t("inspector.dash.lgDash")],
        ["lgDashDot", t("inspector.dash.lgDashDot")],
    ];
}
export function mountInspector(parent, opts) {
    const doc = parent.ownerDocument;
    const el = doc.createElement("div");
    el.className = "ppt-inspector ppt-scroll";
    // 让 inspector 在 flex 列容器里能自适应撑满（max-height:100% + flex 1）。
    // 旧实现写死 max-height:60% 是为了和 animPanel 50/50 共存；现在 rightPanel 改成 tab
    // 切换后，inspector 不再与 animPanel 同时显示，应该尽量占满父容器。
    el.style.cssText = [
        "flex:1 1 auto",
        "min-height:0",
        "overflow:auto",
        "background:var(--editor-panel,#191919)",
        "color:var(--foreground)",
        "font:12px/1.4 system-ui,sans-serif",
        "padding:14px 14px",
        "display:none",
    ].join(";");
    parent.appendChild(el);
    // mediaSection 在 media 元素上挂了 timeupdate / play / pause / loadedmetadata
    // 监听器；refresh 会重建整个 inspector DOM（连带丢弃旧 row），但 <video> / <audio>
    // 是舞台上的元素，不会被销毁——必须显式解绑监听器，避免叠加导致回调被反复触发。
    // 注意：必须在 selection.subscribe 之前声明——SelectionStore.subscribe 会立刻
    // 触发一次 fn(ids)，refresh() 内部会读 detachMedia；若先 subscribe 再声明会触发 TDZ
    // （Cannot access 'detachMedia' before initialization）。
    let detachMediaListeners = null;
    const detachMedia = () => {
        if (detachMediaListeners) {
            detachMediaListeners();
            detachMediaListeners = null;
        }
    };
    const comboCleanups = [];
    const detachCombos = () => {
        for (const fn of comboCleanups.splice(0))
            fn();
    };
    // 同理：activeSlide 也必须在 selection.subscribe 之前声明。subscribe 会立刻触发
    // 一次 fn() → refresh() 内部读 activeSlide()，若先 subscribe 再声明会 TDZ
    // （Cannot access 'activeSlide' before initialization）。
    const activeSlide = () => opts.getActiveSlide?.() ?? opts.pres.slides[opts.currentSlide()];
    // paint 编辑器在每次 refresh 时整体重建，fallbackSolid 也跟着重算。用户把填充切到
    // none 之后 target.fill 就是 undefined，再切回 solid 只能拿到写死的兜底白 —— 刚选的
    // 颜色白丢。这份记忆活在 mount 作用域里跨 refresh 存活；每次看到真实 solid 值都回写，
    // 换选中对象时才不会把上一个 shape 的颜色串过来。
    // 同 detachMedia / activeSlide：必须声明在 selection.subscribe 之前，否则 subscribe
    // 立刻触发的那次 refresh 会撞 TDZ。
    const lastSolidPick = { fill: "#ffffff", background: "#ffffff" };
    const rememberSolid = (slot, paint) => {
        if (paint?.kind === "solid")
            lastSolidPick[slot] = paint.color;
        return lastSolidPick[slot];
    };
    // 一次拖动或一次打字收成一步撤销。开始标记只记第一次，结束可重复调用。
    let liveMark = null;
    const liveStart = () => {
        if (liveMark == null)
            liveMark = opts.stack.size();
    };
    const liveEnd = () => {
        opts.commitLivePreview?.();
        if (liveMark == null)
            return;
        const mark = liveMark;
        liveMark = null;
        opts.stack.coalesceSince(mark, opts.stack.info().undoLabel ?? "Edit");
    };
    let selectionRefreshRaf = 0;
    const unsub = opts.selection.subscribe(() => {
        // 右侧栏收起或不在「属性」tab 时，整块面板 display:none —— 跳过重建。
        if (!parent.offsetParent)
            return;
        const win = parent.ownerDocument.defaultView;
        if (!win?.requestAnimationFrame) {
            refresh();
            return;
        }
        if (selectionRefreshRaf)
            return;
        selectionRefreshRaf = win.requestAnimationFrame(() => {
            selectionRefreshRaf = 0;
            refresh();
        });
    });
    function refresh() {
        // 任何刷新都先解绑老 media 监听器；当前 selection 若仍是 media，会在
        // mediaSection 内重新挂回。
        detachMedia();
        detachCombos();
        const ids = [...opts.selection.values];
        // 无选中 或 选中背景哨兵 → 显示"背景 / 幻灯片"编辑面板（PowerPoint 在未选中
        // shape 时格式窗格也显示背景）。这样"点空白选中背景"和"什么都没选"都能改背景。
        if (ids.length === 0 || (ids.length === 1 && ids[0] === BACKGROUND_SEL_ID)) {
            el.style.display = "block";
            el.innerHTML = "";
            const slide = activeSlide();
            el.appendChild(header(t("inspector.group.slide")));
            if (slide)
                el.appendChild(slideGroup(slide));
            return;
        }
        el.style.display = "block";
        const slide = activeSlide();
        if (!slide)
            return;
        if (ids.length > 1) {
            el.innerHTML = "";
            el.appendChild(header(t("inspector.multi", { n: ids.length })));
            el.appendChild(arrangeGroup());
            return;
        }
        const id = ids[0];
        const found = findShapeWithLayer(slide, id);
        const shape = found?.shape;
        if (!shape) {
            el.style.display = "none";
            return;
        }
        // master/layout 副本是只读副本：渲染需要它们贴底，但所有编辑都会被 commands.ts
        // 拦截。inspector 这里给一个醒目 banner 提示用户切到母版视图（阶段 2 真正实装）。
        const inMasterCopy = !!found && isMasterCopyLayer(found.layer);
        // ── 表格上下文识别 ─────────────────────────────────────────────────────
        // 两种"表格相关"的 selection：
        //  - tableGroupSelected：直接选中带 tableMeta 的 group → Inspector 改属性时
        //    SetFillCmd 等命令会通过 tableCellsOf(...) 应用到全部 cell。
        //  - tableCellSelected：deep-select 到某个 cell → 属性只改这一 cell；同时
        //    Inspector 仍要展示行列操作面板（作用于 parent group），并提供"选中整张
        //    表格"快捷键回到 group selection。
        const isTableGroup = shape.kind === "group" && !!shape.tableMeta;
        const isSmartArtGroup = shape.kind === "group" && !!shape.smartArtMeta;
        let parentTableGroup = null;
        let parentSmartArtGroup = null;
        let cellRowCol = null;
        if (shape.cellMeta) {
            const parent = findParentGroup(slide, id);
            if (parent?.tableMeta) {
                parentTableGroup = parent;
                const idx = parent.children.findIndex((c) => c.id === id);
                if (idx >= 0 && parent.tableMeta.cols > 0) {
                    cellRowCol = {
                        row: Math.floor(idx / parent.tableMeta.cols),
                        col: idx % parent.tableMeta.cols,
                    };
                }
            }
            else if (parent?.smartArtMeta) {
                parentSmartArtGroup = parent;
            }
        }
        else if (shape.kind === "text") {
            const parent = findParentGroup(slide, id);
            if (parent?.smartArtMeta)
                parentSmartArtGroup = parent;
        }
        const isTableCell = !!parentTableGroup;
        el.innerHTML = "";
        el.appendChild(header(isTableCell
            ? t("inspector.tableCellHeader", { row: (cellRowCol?.row ?? 0) + 1, col: (cellRowCol?.col ?? 0) + 1 })
            : `${shape.name || shape.kind} · ${shape.kind}`));
        if (inMasterCopy) {
            el.appendChild(readonlyBanner(found.layer.id));
        }
        el.appendChild(metaSection(shape, id));
        // cell 的 bbox 受表格布局约束，不应单独平移/缩放/旋转（会破坏整表对齐）；
        // 隐藏 transformSection 比留下输入框诱使用户误操作更安全 —— 想调位置请选整表。
        if (!isTableCell) {
            el.appendChild(transformSection(shape, id));
        }
        const textShape = pickInspectorTextShape(shape);
        const ranges = opts.editingTextRanges?.(id);
        const rangedRun = textShape && ranges ? runAtCharRanges(textShape.paragraphs, ranges) : undefined;
        const text = rangedRun ?? pickTextRun(shape);
        if (text || textShape) {
            const textGroup = groupWrap(t("inspector.group.text"));
            if (text) {
                textGroup.appendChild(textSection(text, (patch) => {
                    const onlyColor = patch.color !== undefined && Object.keys(patch).length === 1;
                    if (liveMark != null && onlyColor && opts.previewTextColor?.(id, patch.color))
                        return;
                    opts.stack.execute(new SetTextStyleCmd(opts.currentSlide(), id, patch, opts.editingTextRanges?.(id)));
                }, { nest: true }));
            }
            if (textShape) {
                textGroup.appendChild(paragraphSection(textShape, id, { nest: true }));
                textGroup.appendChild(textBodySection(textShape, id));
            }
            el.appendChild(textGroup);
        }
        const target = pickFirstStyleShape(shape);
        if (target) {
            const look = groupWrap(t("inspector.group.appearance"));
            look.appendChild(fillSection(target, (next) => {
                if (liveMark != null && opts.previewFill?.(id, next))
                    return;
                opts.stack.execute(new SetFillCmd(opts.currentSlide(), id, next));
            }));
            look.appendChild(strokeSection(target, (next) => {
                opts.stack.execute(new SetStrokeCmd(opts.currentSlide(), id, next));
            }));
            const radius = radiusSection(shape, id);
            if (radius)
                look.appendChild(radius);
            look.appendChild(effectsSection(shape, id));
            el.appendChild(look);
        }
        el.appendChild(arrangeGroup());
        el.appendChild(shape3DSection(shape, id));
        if (shape.kind === "video" || shape.kind === "audio") {
            el.appendChild(mediaSection(shape, id, (patch) => {
                opts.stack.execute(new SetMediaPropsCmd(opts.currentSlide(), id, patch));
            }));
        }
        if (shape.kind === "chart") {
            el.appendChild(chartInspectorSection(doc, shape, opts.currentSlide(), id, opts.stack, () => refresh()));
        }
        if (cropHost(shape)) {
            el.appendChild(imageCropSection(shape, id));
        }
        if (shape.kind === "ole") {
            el.appendChild(oleSection(shape, id));
        }
        if (shape.kind === "model3d") {
            el.appendChild(model3dSection(shape, id));
        }
        if (isTableCell && parentTableGroup) {
            el.appendChild(tableSection(parentTableGroup, parentTableGroup.id, { cellMode: true, cellRowCol }));
        }
        else if (isTableGroup) {
            el.appendChild(tableSection(shape, id, { cellMode: false, cellRowCol: null }));
        }
        else if (isSmartArtGroup) {
            el.appendChild(smartArtSection(shape, id));
        }
        else if (parentSmartArtGroup) {
            el.appendChild(smartArtSection(parentSmartArtGroup, parentSmartArtGroup.id, { childMode: true }));
        }
    }
    function smartArtSection(group, groupId, mode = {}) {
        const wrap = sectionWrap(t("inspector.section.smartArt"));
        const layout = group.smartArtMeta?.layout ?? "list";
        const summary = doc.createElement("div");
        summary.textContent = t("inspector.smartArt.layout", { layout: t(`dialog.smartArt.layout.${layout}`) });
        summary.style.cssText = "color:var(--foreground);margin-bottom:6px";
        wrap.appendChild(summary);
        const items = extractSmartArtItems(group);
        const count = doc.createElement("div");
        const pictureCount = smartArtLayoutSupportsPictures(layout) ? smartArtPictureCount(items) : 0;
        count.textContent =
            pictureCount > 0
                ? t("inspector.smartArt.itemsWithPictures", { n: items.length, p: pictureCount })
                : t("inspector.smartArt.items", { n: items.length });
        count.style.cssText = "color:var(--muted-foreground);font-size:11px;margin-bottom:6px";
        wrap.appendChild(count);
        if (mode.childMode) {
            const back = mkActionBtn(t("inspector.smartArt.selectGroup"), () => opts.selection.set([groupId]));
            wrap.appendChild(back);
        }
        const layoutLabel = (l) => t(`dialog.smartArt.layout.${l}`);
        const layoutInput = doc.createElement("input");
        layoutInput.className = CONTROL_INPUT_CLASS;
        layoutInput.placeholder = t("inspector.smartArt.filterLayouts");
        layoutInput.value = layout;
        const layoutCombo = bindCombobox(layoutInput, {
            allowCustom: false,
            options: SMARTART_LAYOUT_KINDS.map((l) => ({ value: l, label: layoutLabel(l) })),
            onChange: (next) => {
                if (next === layout)
                    return;
                opts.stack.execute(new SetSmartArtLayoutCmd(opts.currentSlide(), groupId, next, layout, extractSmartArtItems(group)));
                refresh();
            },
        });
        layoutCombo.el.style.cssText = "width:100%;margin-bottom:8px";
        comboCleanups.push(layoutCombo.destroy);
        wrap.appendChild(layoutCombo.el);
        const bulkHead = doc.createElement("div");
        bulkHead.textContent = t("inspector.smartArt.bulkText");
        bulkHead.style.cssText = "font-size:11px;color:var(--muted-foreground);margin:0 0 4px";
        wrap.appendChild(bulkHead);
        const bulkTa = doc.createElement("textarea");
        bulkTa.rows = 4;
        bulkTa.value = serializeSmartArtItemsText(items);
        bulkTa.className = CONTROL_INPUT_CLASS;
        bulkTa.style.cssText = "width:100%;font-size:11px;resize:vertical;margin-bottom:6px";
        wrap.appendChild(bulkTa);
        const bulkApply = mkActionBtn(t("inspector.smartArt.applyBulkText"), () => {
            const current = extractSmartArtItems(group);
            const next = parseSmartArtItemLines(bulkTa.value, current);
            if (!next.length)
                return;
            opts.stack.execute(new UpdateSmartArtItemsCmd(opts.currentSlide(), groupId, next, current));
            refresh();
        });
        bulkApply.style.marginBottom = "8px";
        wrap.appendChild(bulkApply);
        const copyItemsBtn = mkActionBtn(t("inspector.smartArt.copyItems"), () => {
            void copyTextToClipboard(serializeSmartArtItemsText(extractSmartArtItems(group)));
        });
        copyItemsBtn.style.marginBottom = "8px";
        wrap.appendChild(copyItemsBtn);
        if (smartArtLayoutSupportsPictures(layout) && pictureCount > 0) {
            const clearPicsBtn = mkActionBtn(t("inspector.smartArt.clearAllPictures"), () => {
                opts.stack.execute(new ClearSmartArtPicturesCmd(opts.currentSlide(), groupId, extractSmartArtItems(group)));
                refresh();
            });
            clearPicsBtn.style.marginBottom = "8px";
            wrap.appendChild(clearPicsBtn);
        }
        const listWrap = doc.createElement("div");
        listWrap.style.cssText = "display:flex;flex-direction:column;gap:4px;margin-bottom:8px;max-height:160px;overflow:auto";
        const renderItemList = () => {
            listWrap.replaceChildren();
            const current = extractSmartArtItems(group);
            current.forEach((item, i) => {
                const row = doc.createElement("div");
                row.style.cssText = "display:flex;gap:4px;align-items:center";
                const inp = doc.createElement("input");
                inp.type = "text";
                inp.value = item.text;
                inp.className = CONTROL_INPUT_CLASS;
                inp.style.cssText = "flex:1;min-width:0;font-size:11px";
                inp.addEventListener("change", () => {
                    const next = extractSmartArtItems(group);
                    if (next[i])
                        next[i].text = inp.value;
                    opts.stack.execute(new UpdateSmartArtItemsCmd(opts.currentSlide(), groupId, next, current));
                    refresh();
                });
                row.appendChild(inp);
                if (smartArtLayoutSupportsPictures(layout)) {
                    const picBtn = mkActionBtn(item.imageSrc ? "🖼" : "📷", () => {
                        const fileInput = doc.createElement("input");
                        fileInput.type = "file";
                        fileInput.accept = "image/*";
                        fileInput.style.display = "none";
                        fileInput.addEventListener("change", () => {
                            const file = fileInput.files?.[0];
                            fileInput.remove();
                            if (!file)
                                return;
                            const reader = new FileReader();
                            reader.onload = () => {
                                const src = String(reader.result ?? "");
                                if (!src.startsWith("data:"))
                                    return;
                                const next = extractSmartArtItems(group);
                                if (next[i])
                                    next[i].imageSrc = src;
                                opts.stack.execute(new UpdateSmartArtItemsCmd(opts.currentSlide(), groupId, next, current));
                                refresh();
                            };
                            reader.readAsDataURL(file);
                        });
                        doc.body.appendChild(fileInput);
                        fileInput.click();
                    });
                    picBtn.title = t("inspector.smartArt.setPicture");
                    picBtn.style.minWidth = "26px";
                    picBtn.style.padding = "2px 4px";
                    row.appendChild(picBtn);
                    if (item.imageSrc) {
                        const clearPic = mkActionBtn("✕", () => {
                            const next = extractSmartArtItems(group);
                            if (next[i])
                                delete next[i].imageSrc;
                            opts.stack.execute(new UpdateSmartArtItemsCmd(opts.currentSlide(), groupId, next, current));
                            refresh();
                        });
                        clearPic.title = t("inspector.smartArt.clearPicture");
                        clearPic.style.minWidth = "22px";
                        clearPic.style.padding = "2px 4px";
                        row.appendChild(clearPic);
                    }
                }
                if (layout === "hierarchy") {
                    const lvl = doc.createElement("span");
                    lvl.textContent = `L${item.lvl ?? 0}`;
                    lvl.style.cssText = "font-size:10px;color:var(--muted-foreground);min-width:18px";
                    row.appendChild(lvl);
                    const demote = mkActionBtn("−", () => {
                        opts.stack.execute(new SetSmartArtItemLevelCmd(opts.currentSlide(), groupId, i, -1, current));
                        refresh();
                    });
                    demote.style.minWidth = "22px";
                    demote.style.padding = "2px 4px";
                    const promote = mkActionBtn("+", () => {
                        opts.stack.execute(new SetSmartArtItemLevelCmd(opts.currentSlide(), groupId, i, 1, current));
                        refresh();
                    });
                    promote.style.minWidth = "22px";
                    promote.style.padding = "2px 4px";
                    row.append(demote, promote);
                }
                const up = mkActionBtn("↑", () => {
                    opts.stack.execute(new MoveSmartArtItemCmd(opts.currentSlide(), groupId, i, -1, current));
                    refresh();
                });
                up.style.minWidth = "22px";
                up.style.padding = "2px 4px";
                up.disabled = i === 0;
                const down = mkActionBtn("↓", () => {
                    opts.stack.execute(new MoveSmartArtItemCmd(opts.currentSlide(), groupId, i, 1, current));
                    refresh();
                });
                down.style.minWidth = "22px";
                down.style.padding = "2px 4px";
                down.disabled = i === current.length - 1;
                const dup = mkActionBtn("⧉", () => {
                    opts.stack.execute(new DuplicateSmartArtItemCmd(opts.currentSlide(), groupId, i, current));
                    refresh();
                });
                dup.title = t("inspector.smartArt.duplicateItem");
                dup.style.minWidth = "22px";
                dup.style.padding = "2px 4px";
                const del = mkActionBtn("×", () => {
                    if (current.length <= 1)
                        return;
                    opts.stack.execute(new RemoveSmartArtItemCmd(opts.currentSlide(), groupId, current, i));
                    refresh();
                });
                del.style.minWidth = "22px";
                del.style.padding = "2px 4px";
                row.append(up, down, dup, del);
                listWrap.appendChild(row);
            });
        };
        renderItemList();
        wrap.appendChild(listWrap);
        const rowBtns = doc.createElement("div");
        rowBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
        rowBtns.appendChild(mkActionBtn(t("inspector.smartArt.addItem"), () => {
            opts.stack.execute(new AddSmartArtItemCmd(opts.currentSlide(), groupId, extractSmartArtItems(group)));
            refresh();
        }));
        rowBtns.appendChild(mkActionBtn(t("inspector.smartArt.removeItem"), () => {
            opts.stack.execute(new RemoveSmartArtItemCmd(opts.currentSlide(), groupId, extractSmartArtItems(group)));
            refresh();
        }));
        wrap.appendChild(rowBtns);
        const hint = doc.createElement("div");
        hint.textContent = t("inspector.smartArt.hint");
        hint.style.cssText = "color:var(--muted-foreground);font-size:10px;margin-top:6px;line-height:1.3";
        wrap.appendChild(hint);
        return wrap;
    }
    function oleSection(shape, shapeId) {
        const wrap = sectionWrap(t("inspector.section.ole"));
        const lines = [];
        if (shape.typeLabel)
            lines.push(`${t("inspector.ole.type")}: ${shape.typeLabel}`);
        if (shape.progId)
            lines.push(`${t("inspector.ole.progId")}: ${shape.progId}`);
        if (shape.embedFileName)
            lines.push(`${t("inspector.ole.fileName")}: ${shape.embedFileName}`);
        const bytes = oleEmbedByteSize(shape.embedSrc);
        if (bytes != null) {
            const sizeLine = `${t("inspector.ole.size")}: ${formatByteSize(bytes)}`;
            lines.push(isOleEmbedOverLimit(bytes) ? `${sizeLine} (${t("inspector.ole.largeWarning")})` : sizeLine);
        }
        const mime = mediaMimeLabel(parseDataUrlMime(shape.embedSrc));
        if (mime)
            lines.push(`${t("inspector.media.mime")}: ${mime}`);
        if (shape.previewSrc)
            lines.push(`${t("inspector.ole.preview")}: ${t("inspector.yes")}`);
        const info = doc.createElement("div");
        info.style.cssText = "font-size:11px;line-height:1.5;color:var(--muted-foreground);white-space:pre-wrap";
        info.textContent = lines.join("\n");
        wrap.appendChild(info);
        const iconRow = doc.createElement("label");
        iconRow.style.cssText = "display:flex;align-items:center;gap:8px;font-size:12px;margin-top:8px;cursor:pointer";
        const iconCb = doc.createElement("input");
        iconCb.type = "checkbox";
        iconCb.className = CHECK_CLASS;
        iconCb.checked = shape.showAsIcon !== false;
        iconCb.addEventListener("change", () => {
            opts.stack.execute(new SetOleShowAsIconCmd(opts.currentSlide(), shapeId, iconCb.checked));
            refresh();
        });
        const iconText = doc.createElement("span");
        iconText.textContent = t("inspector.ole.showAsIcon");
        iconRow.append(iconCb, iconText);
        wrap.appendChild(iconRow);
        const hint = doc.createElement("p");
        hint.style.cssText = "margin:8px 0 0;font-size:11px;color:var(--muted-foreground)";
        hint.textContent = t("inspector.ole.hint");
        wrap.appendChild(hint);
        const btnRow = doc.createElement("div");
        btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
        if (shape.embedSrc) {
            btnRow.appendChild(mkActionBtn(t("inspector.ole.download"), () => {
                downloadOleEmbed(doc, shape);
            }));
        }
        const replaceBtn = mkActionBtn(t("inspector.ole.replace"), () => {
            const inp = doc.createElement("input");
            inp.type = "file";
            inp.accept = ".xlsx,.xls,.docx,.doc,.pptx,.ppt,.pdf,.bin,application/*";
            inp.addEventListener("change", () => {
                const file = inp.files?.[0];
                inp.remove();
                if (!file)
                    return;
                const reader = new FileReader();
                reader.onload = () => {
                    const embedSrc = String(reader.result ?? "");
                    if (!embedSrc.startsWith("data:"))
                        return;
                    const bytes = oleEmbedByteSize(embedSrc);
                    const apply = () => {
                        opts.stack.execute(new UpdateOleEmbedCmd(opts.currentSlide(), shapeId, file.name, embedSrc));
                        refresh();
                    };
                    if (bytes != null && isOleEmbedOverLimit(bytes) && !window.confirm(t("inspector.ole.largeReplaceConfirm"))) {
                        return;
                    }
                    apply();
                };
                reader.readAsDataURL(file);
            });
            doc.body.appendChild(inp);
            inp.click();
        });
        btnRow.appendChild(replaceBtn);
        wrap.appendChild(btnRow);
        return wrap;
    }
    function model3dSection(shape, shapeId) {
        const wrap = sectionWrap(t("inspector.section.model3d"));
        const lines = [];
        if (shape.objectName || shape.name) {
            lines.push(`${t("inspector.model3d.name")}: ${shape.objectName ?? shape.name}`);
        }
        const bytes = model3DDataUrlByteSize(shape.glbSrc);
        if (bytes != null) {
            const sizeLine = `${t("inspector.model3d.size")}: ${formatByteSize(bytes)}`;
            lines.push(isLargeMediaBytes(bytes) ? `${sizeLine} (${t("inspector.media.largeWarning")})` : sizeLine);
        }
        const mime = mediaMimeLabel(parseDataUrlMime(shape.glbSrc));
        if (mime)
            lines.push(`${t("inspector.media.mime")}: ${mime}`);
        const info = doc.createElement("div");
        info.style.cssText = "font-size:11px;line-height:1.5;color:var(--muted-foreground);white-space:pre-wrap";
        info.textContent = lines.join("\n") || t("inspector.model3d.noMeta");
        wrap.appendChild(info);
        const btnRow = doc.createElement("div");
        btnRow.style.cssText = "display:flex;flex-wrap:wrap;gap:6px;margin-top:8px";
        const replace = mkActionBtn(t("inspector.model3d.replace"), () => {
            const inp = doc.createElement("input");
            inp.type = "file";
            inp.accept = ".glb,.gltf,model/gltf-binary,model/gltf+json";
            inp.addEventListener("change", () => {
                const file = inp.files?.[0];
                inp.remove();
                if (!file)
                    return;
                void loadModel3DFromFile(file).then((loaded) => {
                    const bytes = model3DDataUrlByteSize(loaded.glbSrc);
                    const apply = () => {
                        opts.stack.execute(new UpdateModel3DGlbCmd(opts.currentSlide(), shapeId, loaded.glbSrc, loaded.label));
                        refresh();
                    };
                    if (shouldConfirmLargeInsertBytes(bytes, "model3d") && !window.confirm(t("inspector.model3d.largeReplaceConfirm"))) {
                        return;
                    }
                    apply();
                });
            });
            doc.body.appendChild(inp);
            inp.click();
        });
        btnRow.appendChild(replace);
        wrap.appendChild(btnRow);
        const hint = doc.createElement("p");
        hint.style.cssText = "margin:8px 0 0;font-size:11px;color:var(--muted-foreground)";
        hint.textContent = t("inspector.model3d.hint");
        wrap.appendChild(hint);
        return wrap;
    }
    // 表格操作面板：当 selection 是带 tableMeta 的 group 时显示。
    // 提供"+ Row / - Row / + Col / - Col"四个动作，全部走 InsertTableRow/Col 等命令，
    // 自动 undoable。
    //
    // tableMode：
    //  - cellMode=false：selection 是 table group。属性改变（fill / stroke / text 等）
    //    自动应用到全部 cell（SetFillCmd 等命令在 commands.ts 内部对 tableMeta group
    //    走 multi-cell 路径）；面板顶部显示 "应用到全表" 提示。
    //  - cellMode=true：selection 是表格内某个 cell（deep-select 后）。属性改变只
    //    应用到该 cell；面板顶部显示 cell 行列位置 + "选中整张表格" 按钮，便于用户
    //    回到表格 selection 做整体调整。
    function tableSection(group, groupId, mode) {
        const wrap = sectionWrap(t("inspector.section.table"));
        const meta = group.tableMeta ?? { rows: 1, cols: 1 };
        if (mode.cellMode && mode.cellRowCol) {
            const cur = doc.createElement("div");
            cur.textContent = t("inspector.table.cellPos", { row: mode.cellRowCol.row + 1, col: mode.cellRowCol.col + 1 });
            cur.style.cssText = "color:var(--foreground);margin-bottom:6px";
            wrap.appendChild(cur);
            const scopeHint = doc.createElement("div");
            scopeHint.textContent = t("inspector.table.scopeCell");
            scopeHint.style.cssText = "color:var(--warning);font-size:10px;margin-bottom:6px;line-height:1.3";
            wrap.appendChild(scopeHint);
            const back = mkActionBtn(t("inspector.table.selectAll"), () => {
                opts.selection.set([groupId]);
            });
            wrap.appendChild(back);
            const mergeBtns = doc.createElement("div");
            mergeBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin:6px 0 4px";
            const row = mode.cellRowCol.row;
            const col = mode.cellRowCol.col;
            mergeBtns.appendChild(mkActionBtn(t("inspector.table.mergeRight"), () => {
                if (col >= meta.cols - 1)
                    return;
                opts.stack.execute(new MergeTableCellsCmd(opts.currentSlide(), groupId, row, col, row, col + 1));
            }));
            mergeBtns.appendChild(mkActionBtn(t("inspector.table.mergeDown"), () => {
                if (row >= meta.rows - 1)
                    return;
                opts.stack.execute(new MergeTableCellsCmd(opts.currentSlide(), groupId, row, col, row + 1, col));
            }));
            mergeBtns.appendChild(mkActionBtn(t("inspector.table.unmerge"), () => {
                opts.stack.execute(new UnmergeTableCellsCmd(opts.currentSlide(), groupId, row, col));
            }));
            wrap.appendChild(mergeBtns);
        }
        else {
            const summary = doc.createElement("div");
            summary.textContent = t("inspector.table.dim", { rows: meta.rows, cols: meta.cols });
            summary.style.cssText = "color:var(--foreground);margin-bottom:6px";
            wrap.appendChild(summary);
            const scopeHint = doc.createElement("div");
            scopeHint.textContent = t("inspector.table.scopeAll");
            scopeHint.style.cssText = "color:var(--success);font-size:10px;margin-bottom:6px;line-height:1.3";
            wrap.appendChild(scopeHint);
        }
        const rowBtns = doc.createElement("div");
        rowBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin:6px 0 4px";
        rowBtns.appendChild(mkActionBtn(t("inspector.table.addRow"), () => {
            opts.stack.execute(new InsertTableRowCmd(opts.currentSlide(), groupId, meta.rows - 1));
        }));
        rowBtns.appendChild(mkActionBtn(t("inspector.table.removeRow"), () => {
            opts.stack.execute(new RemoveTableRowCmd(opts.currentSlide(), groupId, meta.rows - 1));
        }));
        wrap.appendChild(rowBtns);
        const colBtns = doc.createElement("div");
        colBtns.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
        colBtns.appendChild(mkActionBtn(t("inspector.table.addCol"), () => {
            opts.stack.execute(new InsertTableColumnCmd(opts.currentSlide(), groupId, meta.cols - 1));
        }));
        colBtns.appendChild(mkActionBtn(t("inspector.table.removeCol"), () => {
            opts.stack.execute(new RemoveTableColumnCmd(opts.currentSlide(), groupId, meta.cols - 1));
        }));
        wrap.appendChild(colBtns);
        const hint = doc.createElement("div");
        hint.textContent = t("inspector.table.hint");
        hint.style.cssText = "color:var(--muted-foreground);font-size:10px;margin-top:6px;line-height:1.3";
        wrap.appendChild(hint);
        return wrap;
    }
    // 裁剪窗口：滑块改一条边时，画面矩形不动，外框跟着收放。
    function imageCropSection(shape, id) {
        const wrap = sectionWrap(t("inspector.section.crop"));
        const slideIdx = opts.currentSlide();
        const current = () => {
            const slide = activeSlide();
            return (slide ? findShape(slide, id) : undefined) ?? shape;
        };
        const applyFrame = (window, crop) => {
            opts.settleCropSession?.();
            opts.stack.execute(new SetCropFrameCmd(slideIdx, id, window, crop));
        };
        const cropNow = readCrop(current());
        const mkEdge = (label, key) => {
            const control = rangeInput(cropNow[key], (v) => {
                const live = current();
                const next = setCropEdge(live.bbox, readCrop(live), key, v);
                applyFrame(next.window, next.crop);
            }, -0.5, 0.9, 0.01, { showValue: true, format: (v) => `${Math.round(v * 100)}%` });
            const slider = control.querySelector("input");
            slider?.addEventListener("pointerdown", () => liveStart());
            slider?.addEventListener("pointerup", () => liveEnd());
            slider?.addEventListener("change", () => liveEnd());
            wrap.appendChild(row(label, control));
        };
        mkEdge(t("inspector.crop.left"), "l");
        mkEdge(t("inspector.crop.top"), "t");
        mkEdge(t("inspector.crop.right"), "r");
        mkEdge(t("inspector.crop.bottom"), "b");
        const btnRow = doc.createElement("div");
        btnRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-top:6px";
        btnRow.appendChild(mkActionBtn(t("inspector.crop.reset"), () => {
            const live = current();
            applyFrame(imageFrame(live.bbox, readCrop(live)), { ...ZERO_CROP });
        }));
        wrap.appendChild(btnRow);
        const hint = doc.createElement("div");
        hint.textContent = t("inspector.crop.hint");
        hint.style.cssText = "color:var(--muted-foreground);font-size:10px;margin-top:6px;line-height:1.3";
        wrap.appendChild(hint);
        return wrap;
    }
    function mkActionBtn(label, onClick) {
        const b = doc.createElement("button");
        b.textContent = label;
        b.style.cssText = [
            "background:var(--card)",
            "color:var(--foreground)",
            "border:1px solid var(--border)",
            "border-radius:4px",
            "padding:4px 10px",
            "cursor:pointer",
            "font:inherit",
        ].join(";");
        b.addEventListener("mouseenter", () => (b.style.background = "var(--secondary)"));
        b.addEventListener("mouseleave", () => (b.style.background = "var(--card)"));
        b.addEventListener("click", onClick);
        return b;
    }
    function header(text) {
        const h = doc.createElement("div");
        h.textContent = text;
        h.style.cssText = "font-weight:600;font-size:13px;margin-bottom:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        return h;
    }
    // master/layout 副本只读 banner —— 阶段 1 用静态提示语，阶段 2 替换为"切到母版视图"按钮。
    function readonlyBanner(layerId) {
        const wrap = doc.createElement("div");
        wrap.style.cssText = [
            "margin:0 0 8px 0",
            "padding:8px 10px",
            "background:color-mix(in srgb, var(--warning) 14%, transparent)",
            "border:1px solid color-mix(in srgb, var(--warning) 40%, transparent)",
            "border-radius:4px",
            "color:var(--warning)",
            "font-size:12px",
            "line-height:1.4",
        ].join(";");
        const key = layerId === "layout" ? "inspector.readonly.layout" : "inspector.readonly.master";
        wrap.textContent = t(key);
        return wrap;
    }
    function sectionWrap(title) {
        const wrap = doc.createElement("div");
        wrap.style.cssText = "margin-top:8px;padding-top:8px;border-top:1px solid var(--border)";
        const t = doc.createElement("div");
        t.textContent = title;
        t.style.cssText = "color:var(--muted-foreground);font-size:11px;text-transform:uppercase;margin-bottom:4px";
        wrap.appendChild(t);
        return wrap;
    }
    function groupWrap(title) {
        const wrap = doc.createElement("div");
        wrap.className = "ppt-inspector-group";
        wrap.style.cssText = "margin-top:14px;padding-top:10px;border-top:1px solid var(--border)";
        const h = doc.createElement("div");
        h.textContent = title;
        h.style.cssText = "color:var(--foreground);font-size:12px;font-weight:600;letter-spacing:0.02em;margin-bottom:8px";
        wrap.appendChild(h);
        return wrap;
    }
    function mkMiniBtn(label, fn) {
        const b = doc.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.style.cssText =
            "background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:3px;padding:4px 6px;cursor:pointer;font:inherit";
        b.addEventListener("click", fn);
        return b;
    }
    function slideGroup(slide) {
        const wrap = groupWrap(t("inspector.group.slide"));
        const layouts = filterLayoutsToWhitelist(opts.listLayouts?.() ?? []);
        if (layouts.length && opts.applyLayout) {
            const sel = doc.createElement("select");
            sel.className = CONTROL_INPUT_CLASS;
            sel.style.cssText = "flex:1;min-width:0";
            const current = slide.layoutRef?.layoutId;
            for (const entry of layouts) {
                const opt = doc.createElement("option");
                opt.value = `${entry.masterId}\t${entry.layoutId}`;
                opt.textContent = entry.name;
                if (entry.layoutId === current)
                    opt.selected = true;
                sel.appendChild(opt);
            }
            sel.addEventListener("change", () => {
                const [masterId, layoutId] = sel.value.split("\t");
                const entry = layouts.find((l) => l.masterId === masterId && l.layoutId === layoutId);
                if (entry)
                    opts.applyLayout?.(entry);
            });
            wrap.appendChild(row(t("inspector.slide.layout"), sel));
        }
        const colors = opts.pres.theme?.colors;
        if (colors && Object.keys(colors).length) {
            const swatches = doc.createElement("div");
            swatches.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;flex:1";
            const keys = ["dk1", "lt1", "dk2", "lt2", "accent1", "accent2", "accent3", "accent4", "accent5", "accent6", "bg1", "text1"];
            const seen = new Set();
            for (const key of [...keys, ...Object.keys(colors)]) {
                const hex = colors[key];
                if (!hex || seen.has(key) || !/^#?[0-9a-f]{3,8}$/i.test(hex))
                    continue;
                seen.add(key);
                const chip = doc.createElement("span");
                chip.className = "ppt-color-theme-chip";
                chip.title = `${key} ${hex}`;
                chip.style.cssText = `width:16px;height:16px;border-radius:3px;background:${hex};border:1px solid var(--border);flex-shrink:0;pointer-events:none`;
                swatches.appendChild(chip);
                if (seen.size >= 12)
                    break;
            }
            wrap.appendChild(row(t("inspector.slide.colorTheme"), swatches));
        }
        const variants = opts.listThemeVariants?.() ?? [];
        if (variants.length && opts.applyThemeVariant) {
            const rowEl = doc.createElement("div");
            rowEl.style.cssText = "display:flex;flex-wrap:wrap;gap:4px;margin:4px 0";
            for (const v of variants) {
                const b = mkMiniBtn(v.label, () => opts.applyThemeVariant?.(v.id));
                b.style.borderLeft = `3px solid ${v.swatch}`;
                rowEl.appendChild(b);
            }
            wrap.appendChild(rowEl);
        }
        if (opts.openThemeGallery) {
            wrap.appendChild(mkMiniBtn(t("inspector.slide.themeGallery"), () => opts.openThemeGallery?.()));
        }
        wrap.appendChild(backgroundSection(slide));
        return wrap;
    }
    function arrangeGroup() {
        const wrap = groupWrap(t("inspector.group.arrange"));
        // 标签在上、图标在下，一行不折。72px 文字标签加文字按钮会在约 244px 内容区里折行。
        const strip = (label, buttons) => {
            const block = doc.createElement("div");
            block.style.cssText = "margin:6px 0 8px";
            const cap = doc.createElement("div");
            cap.textContent = label;
            cap.style.cssText = "color:var(--muted-foreground);font-size:11px;line-height:1.2;margin-bottom:4px";
            const rowEl = doc.createElement("div");
            rowEl.style.cssText = "display:flex;flex-wrap:nowrap;gap:4px;align-items:center";
            for (const b of buttons) {
                b.type = "button";
                b.style.width = "28px";
                b.style.height = "28px";
                b.style.minWidth = "28px";
                b.style.padding = "0";
                b.style.flex = "0 0 28px";
                b.style.boxSizing = "border-box";
                rowEl.appendChild(b);
            }
            block.append(cap, rowEl);
            return block;
        };
        if (opts.bringFront || opts.sendBack || opts.bringForward || opts.sendBackward) {
            const btns = [];
            if (opts.bringFront)
                btns.push(iconBtn("arrow-up-to-line", t("inspector.arrange.front"), () => opts.bringFront?.()));
            if (opts.bringForward)
                btns.push(iconBtn("arrow-up", t("inspector.arrange.forward"), () => opts.bringForward?.()));
            if (opts.sendBackward)
                btns.push(iconBtn("arrow-down", t("inspector.arrange.backward"), () => opts.sendBackward?.()));
            if (opts.sendBack)
                btns.push(iconBtn("arrow-down-to-line", t("inspector.arrange.back"), () => opts.sendBack?.()));
            wrap.appendChild(strip(t("inspector.field.zOrder"), btns));
        }
        if (opts.alignSelection) {
            wrap.appendChild(strip(t("inspector.field.align"), [
                svgIconBtn("alignLeft", t("inspector.arrange.left"), () => opts.alignSelection?.("left")),
                svgIconBtn("alignCenterH", t("inspector.arrange.center"), () => opts.alignSelection?.("centerH")),
                svgIconBtn("alignRight", t("inspector.arrange.right"), () => opts.alignSelection?.("right")),
                svgIconBtn("alignTop", t("inspector.arrange.top"), () => opts.alignSelection?.("top")),
                svgIconBtn("alignCenterV", t("inspector.arrange.middle"), () => opts.alignSelection?.("centerV")),
                svgIconBtn("alignBottom", t("inspector.arrange.bottom"), () => opts.alignSelection?.("bottom")),
            ]));
        }
        if (opts.distributeSelection) {
            wrap.appendChild(strip(t("inspector.field.distribute"), [
                svgIconBtn("distributeH", t("inspector.arrange.distributeH"), () => opts.distributeSelection?.("h")),
                svgIconBtn("distributeV", t("inspector.arrange.distributeV"), () => opts.distributeSelection?.("v")),
            ]));
        }
        return wrap;
    }
    function radiusSection(shape, id) {
        if (shape.kind !== "path" || !shape.presetType)
            return null;
        if (!/round/i.test(shape.presetType))
            return null;
        const adj = { ...(shape.presetAdj ?? {}) };
        const key = adj.adj !== undefined ? "adj" : adj.adj1 !== undefined ? "adj1" : "adj";
        const cur = adj[key] ?? 16667;
        const wrap = sectionWrap(t("inspector.field.radius"));
        wrap.appendChild(row(t("inspector.field.radius"), numberInput(Math.round(cur / 1000), (v) => {
            opts.stack.execute(new SetPresetAdjCmd(opts.currentSlide(), id, { ...adj, [key]: Math.max(0, v) * 1000 }));
        }, 1)));
        return wrap;
    }
    function row(label, ...controls) {
        const r = doc.createElement("div");
        r.style.cssText = "display:flex;align-items:center;gap:6px;margin:4px 0;flex-wrap:wrap";
        const l = doc.createElement("label");
        l.textContent = label;
        l.style.cssText = "width:72px;color:var(--muted-foreground);flex-shrink:0";
        r.appendChild(l);
        for (const c of controls)
            r.appendChild(c);
        return r;
    }
    function colorInput(value, onChange, slot) {
        const i = doc.createElement("input");
        i.type = "color";
        i.value = normalizeColor(value);
        i.className = COLOR_SWATCH_CLASS;
        i.style.cssText = "width:36px";
        if (slot)
            i.dataset.liveColor = slot;
        i.addEventListener("pointerdown", () => liveStart());
        i.addEventListener("input", () => onChange(i.value));
        i.addEventListener("change", () => liveEnd());
        i.addEventListener("blur", () => liveEnd());
        return i;
    }
    function checkbox(label, checked, onChange) {
        const l = doc.createElement("label");
        l.style.cssText = "display:inline-flex;align-items:center;gap:4px;cursor:pointer";
        const i = doc.createElement("input");
        i.type = "checkbox";
        i.className = CHECK_CLASS;
        i.checked = checked;
        i.addEventListener("change", () => onChange(i.checked));
        l.appendChild(i);
        const t = doc.createTextNode(label);
        l.appendChild(t);
        return l;
    }
    function numberInput(value, onChange, step = 1, width = 60) {
        const i = doc.createElement("input");
        i.type = "number";
        i.value = formatNum(value);
        i.step = String(step);
        i.className = CONTROL_INPUT_CLASS;
        i.style.cssText = `width:${width}px`;
        i.addEventListener("focus", () => liveStart());
        i.addEventListener("input", () => {
            const raw = i.value.trim();
            if (raw === "" || raw === "-" || raw === "." || raw === "-.")
                return;
            const n = Number(raw);
            if (Number.isFinite(n))
                onChange(n);
        });
        i.addEventListener("blur", () => liveEnd());
        return i;
    }
    function rangeInput(value, onChange, min = 0, max = 1, step = 0.01, extra) {
        const i = doc.createElement("input");
        i.type = "range";
        i.min = String(min);
        i.max = String(max);
        i.step = String(step);
        i.value = String(value);
        i.className = RANGE_INPUT_CLASS;
        i.style.cssText = "flex:1;min-width:80px";
        const showValue = extra?.showValue ?? true;
        // 0..1 区间默认按百分比展示（透明度/音量），其余按原始数值（如亮度 -0.5..0.5）。
        const fmt = extra?.format ?? ((v) => (min === 0 && max === 1 ? `${Math.round(v * 100)}%` : formatNum(v)));
        if (!showValue) {
            i.addEventListener("input", () => onChange(Number(i.value)));
            return i;
        }
        const wrap = doc.createElement("div");
        wrap.style.cssText = "display:flex;align-items:center;gap:6px;flex:1;min-width:120px";
        const badge = doc.createElement("span");
        badge.textContent = fmt(value);
        badge.style.cssText = "min-width:36px;text-align:right;color:var(--muted-foreground);font:11px/1 ui-monospace,monospace;font-variant-numeric:tabular-nums";
        i.addEventListener("input", () => {
            const v = Number(i.value);
            badge.textContent = fmt(v);
            onChange(v);
        });
        wrap.append(i, badge);
        return wrap;
    }
    // 角度选择器：8 个方向预设按钮 + 滑杆 + 数值，三者联动。比单纯数字输入更直观，
    // 用于线性渐变方向（0=→ L→R，90=↓ T→B，与 ppt-design-rules §2 的角度约定一致）。
    function angleField(value, onChange) {
        const wrap = doc.createElement("div");
        wrap.style.cssText = "display:flex;flex-direction:column;gap:5px;flex:1;min-width:150px";
        const dirs = [
            [0, "\u2192"], [45, "\u2198"], [90, "\u2193"], [135, "\u2199"],
            [180, "\u2190"], [225, "\u2196"], [270, "\u2191"], [315, "\u2197"],
        ];
        let cur = ((value % 360) + 360) % 360;
        const presetRow = doc.createElement("div");
        presetRow.style.cssText = "display:flex;gap:2px;flex-wrap:wrap";
        const btns = [];
        const slider = doc.createElement("input");
        slider.type = "range";
        slider.min = "0";
        slider.max = "360";
        slider.step = "5";
        slider.className = RANGE_INPUT_CLASS;
        slider.style.cssText = "flex:1;min-width:90px";
        const num = doc.createElement("input");
        num.type = "number";
        num.min = "0";
        num.max = "360";
        num.step = "5";
        num.className = CONTROL_INPUT_CLASS;
        num.style.cssText = "width:54px";
        const paint = () => {
            slider.value = String(cur);
            num.value = String(Math.round(cur));
            for (const { deg, el } of btns) {
                const on = deg === Math.round(cur) % 360;
                el.style.background = on ? "var(--border)" : "var(--card)";
                el.style.borderColor = on ? "var(--primary)" : "var(--border)";
            }
        };
        const setVal = (deg, fire) => {
            cur = ((Math.round(deg) % 360) + 360) % 360;
            paint();
            if (fire)
                onChange(cur);
        };
        for (const [deg, arrow] of dirs) {
            const b = doc.createElement("button");
            b.textContent = arrow;
            b.title = `${deg}\u00b0`;
            b.style.cssText = "width:24px;height:22px;background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:3px;cursor:pointer;font:14px/1 system-ui,sans-serif;display:inline-flex;align-items:center;justify-content:center";
            b.addEventListener("click", () => setVal(deg, true));
            btns.push({ deg, el: b });
            presetRow.appendChild(b);
        }
        slider.addEventListener("pointerdown", () => liveStart());
        slider.addEventListener("input", () => setVal(Number(slider.value), true));
        slider.addEventListener("change", () => liveEnd());
        slider.addEventListener("blur", () => liveEnd());
        num.addEventListener("focus", () => liveStart());
        num.addEventListener("input", () => {
            const raw = num.value.trim();
            if (raw === "" || raw === "-" || raw === ".")
                return;
            const n = Number(raw);
            if (Number.isFinite(n))
                setVal(n, true);
            else
                paint();
        });
        num.addEventListener("blur", () => liveEnd());
        const sliderRow = doc.createElement("div");
        sliderRow.style.cssText = "display:flex;align-items:center;gap:6px";
        sliderRow.append(slider, num);
        wrap.append(presetRow, sliderRow);
        paint();
        return wrap;
    }
    function selectInput(items, value, onChange) {
        const s = doc.createElement("select");
        s.className = CONTROL_INPUT_CLASS;
        s.style.cssText = "flex:1;min-width:0";
        for (const [v, lbl] of items) {
            const o = doc.createElement("option");
            o.value = v;
            o.textContent = lbl;
            s.appendChild(o);
        }
        s.value = value;
        s.addEventListener("change", () => onChange(s.value));
        return s;
    }
    function iconBtn(iconName, title, onClick) {
        const b = mkLucideIconButton(doc, iconName, "", title, 14);
        b.style.cssText =
            "background:var(--card);color:var(--foreground);border:1px solid var(--border);border-radius:3px;padding:4px 6px;cursor:pointer;font:inherit;line-height:1;display:inline-flex;align-items:center;justify-content:center";
        b.addEventListener("mouseenter", () => (b.style.background = "var(--border)"));
        b.addEventListener("mouseleave", () => (b.style.background = "var(--card)"));
        b.addEventListener("click", onClick);
        return b;
    }
    // 与 ribbon "格式" tab 的 mkIconBtn 视觉一致 —— 用同一个 SVG icon 库 + 同一组
    // hover/border 表现，保证"翻转 / 旋转 / 对齐"在工具栏和右侧属性面板里看上去
    // 是同一类操作。否则属性面板用 Unicode "⇋" / "⇵" 跳过字体回退会变得歪歪扭扭，
    // 和 ribbon 里整齐的矢量图标完全两副面孔。
    function svgIconBtn(name, title, onClick) {
        const b = doc.createElement("button");
        b.title = title;
        if (title)
            b.setAttribute("aria-label", title);
        b.style.cssText = [
            "background:var(--card)",
            "color:var(--foreground)",
            "border:1px solid var(--border)",
            "border-radius:3px",
            "padding:2px 6px",
            "cursor:pointer",
            "font:inherit",
            "line-height:1",
            "display:inline-flex",
            "align-items:center",
            "justify-content:center",
            "min-width:24px",
            "height:22px",
        ].join(";");
        b.appendChild(svgIcon(doc, name, 14));
        b.addEventListener("mouseenter", () => (b.style.background = "var(--border)"));
        b.addEventListener("mouseleave", () => (b.style.background = "var(--card)"));
        b.addEventListener("click", onClick);
        return b;
    }
    function metaSection(shape, id) {
        const wrap = sectionWrap(t("inspector.section.properties"));
        const lockedLab = checkbox(t("inspector.field.lock"), !!shape.locked, (on) => {
            opts.stack.execute(new SetShapeLockedCmd(opts.currentSlide(), id, on));
        });
        const visLab = checkbox(t("inspector.field.visible"), shape.visible !== false, (on) => {
            opts.stack.execute(new SetShapeVisibleCmd(opts.currentSlide(), id, on));
        });
        wrap.appendChild(row(t("inspector.field.state"), lockedLab, visLab));
        return wrap;
    }
    function transformSection(shape, id) {
        const wrap = sectionWrap(t("inspector.section.positionSize"));
        const slideIdx = opts.currentSlide();
        const xInput = numberInput(shape.bbox.x, (v) => {
            opts.stack.execute(new SetShapeBboxCmd(slideIdx, id, { ...shape.bbox, x: v }));
        }, 1, 70);
        const yInput = numberInput(shape.bbox.y, (v) => {
            opts.stack.execute(new SetShapeBboxCmd(slideIdx, id, { ...shape.bbox, y: v }));
        }, 1, 70);
        wrap.appendChild(row(t("inspector.field.xy"), xInput, yInput));
        const wInput = numberInput(shape.bbox.w, (v) => {
            opts.stack.execute(new SetShapeBboxCmd(slideIdx, id, { ...shape.bbox, w: Math.max(1, v) }));
        }, 1, 70);
        const hInput = numberInput(shape.bbox.h, (v) => {
            opts.stack.execute(new SetShapeBboxCmd(slideIdx, id, { ...shape.bbox, h: Math.max(1, v) }));
        }, 1, 70);
        wrap.appendChild(row(t("inspector.field.wh"), wInput, hInput));
        const rotInput = numberInput(shape.transform?.rotation ?? 0, (v) => {
            opts.stack.execute(new SetShapeRotationCmd(slideIdx, id, ((v % 360) + 360) % 360));
        }, 1, 70);
        rotInput.title = t("inspector.rotateTitle");
        const flipH = svgIconBtn("flipH", t("inspector.flipH"), () => {
            opts.stack.execute(new FlipShapeCmd(slideIdx, id, "h"));
        });
        const flipV = svgIconBtn("flipV", t("inspector.flipV"), () => {
            opts.stack.execute(new FlipShapeCmd(slideIdx, id, "v"));
        });
        wrap.appendChild(row(t("inspector.field.rotate"), rotInput, flipH, flipV));
        // 仅在 OOXML 没有 fill/stroke alpha 通道的 shape kind 上暴露 shape.opacity 滑杆，
        // 与 PowerPoint "形状选项 → 填充与线条 → 透明度" UI 模型对齐：
        //   - 几何 / 文本 / 连接线：透明度走 fill.alpha / stroke.paint.alpha（fillSection 已有）
        //   - 图片 / 视频 / 音频：OOXML 通过 <a:alphaModFix> 表达 → 保留 shape.opacity 滑杆
        //   - group：OOXML 没有原生 opacity；serializer 把祖先 group 链的 opacity 递归乘进
        //     子 sp / pic 的 fill / stroke / blip alpha（groupToXml 与 round-trip 路径均如此）
        //   - table / chart：同样没有原生 opacity，且导出不烘焙 —— 仅作运行时 fade 调试
        // 这样避免"位置/大小 opacity + 填充 opacity"两条独立通道相乘、保存后又被折叠的混乱。
        if (shapeOpacityIsPrimary(shape.kind)) {
            const opNum = numberInput(shape.opacity ?? 1, (v) => {
                const clamped = Math.max(0, Math.min(1, v));
                opts.stack.execute(new SetShapeOpacityCmd(slideIdx, id, clamped));
            }, 0.1, 60);
            const opRange = rangeInput(shape.opacity ?? 1, (v) => {
                opNum.value = formatNum(v);
                opts.stack.execute(new SetShapeOpacityCmd(slideIdx, id, v));
            }, 0, 1, 0.01, { showValue: false });
            wrap.appendChild(row(t("inspector.field.opacity"), opNum, opRange));
        }
        return wrap;
    }
    /**
     * 判断该 shape kind 上的 transparency 是否应该通过 `shape.opacity` 表达
     * （而不是通过 fill/stroke 上的 paint alpha）。
     *
     * 与 PowerPoint UI / OOXML 持久化语义对齐：
     *   - "image / video / audio" → OOXML 用 `<a:alphaModFix>` 表达，无 fill 字段，
     *      所以编辑器只能写 shape.opacity，serializer 再翻成 alphaModFix。
     *   - "group / table / chart" → OOXML 没有 opacity 概念，但 renderer 仍把
     *      shape.opacity 包成 <g opacity>，保留滑杆便于动画 / 临时半透明。
     *   - 其它 fillable shape（rect/ellipse/path/polygon/line/text/cxnSp）→
     *      透明度走 fillSection 的 alpha 滑杆，与 PowerPoint UI 完全一致。
     */
    function shapeOpacityIsPrimary(kind) {
        switch (kind) {
            case "image":
            case "video":
            case "audio":
            case "group":
            case "table":
            case "chart":
                return true;
            default:
                return false;
        }
    }
    function pickImageFile(onPicked) {
        const inp = doc.createElement("input");
        inp.type = "file";
        inp.accept = "image/*";
        inp.addEventListener("change", () => {
            const f = inp.files?.[0];
            if (!f)
                return;
            const reader = new FileReader();
            reader.onload = () => onPicked(String(reader.result));
            reader.readAsDataURL(f);
        });
        inp.click();
    }
    // 背景 / 形状填充共用编辑器（见 paint-editor-ui.ts）。
    function backgroundSection(slide) {
        const wrap = sectionWrap(t("inspector.section.background"));
        const bg = slide.background;
        const liveBg = () => activeSlide()?.background ?? bg;
        appendPaintEditor(doc, wrap, {
            getPaint: liveBg,
            apply: (next) => {
                rememberSolid("background", next);
                const tgt = opts.getBackgroundTarget?.() ?? slideTarget(opts.currentSlide());
                opts.stack.execute(new SetBackgroundTargetCmd(tgt, next));
            },
            modes: ["none", "solid", "linear", "radial", "image", "pattern"],
            fallbackSolid: rememberSolid("background", bg),
            newImageAlpha: 0.55,
            onTypeChange: refresh,
            onGestureStart: liveStart,
            onGestureEnd: liveEnd,
        });
        return wrap;
    }
    function fillSection(target, set) {
        const wrap = sectionWrap(t("inspector.section.fill"));
        if (target.fill?.kind === "groupFill") {
            const hint = doc.createElement("span");
            hint.textContent = t("inspector.paint.groupFill");
            hint.style.cssText = "color:var(--muted-foreground);font-size:12px";
            wrap.appendChild(row(t("inspector.field.type"), hint));
            return wrap;
        }
        appendPaintEditor(doc, wrap, {
            getPaint: () => target.fill,
            apply: (next) => {
                rememberSolid("fill", next);
                set(next);
            },
            modes: ["none", "solid", "linear", "radial", "image", "pattern"],
            fallbackSolid: rememberSolid("fill", target.fill),
            liveSlot: "fill",
            onTypeChange: refresh,
            onGestureStart: liveStart,
            onGestureEnd: liveEnd,
        });
        return wrap;
    }
    function strokeSection(target, set) {
        const wrap = sectionWrap(t("inspector.section.stroke"));
        let lastColor = target.stroke?.paint.kind === "solid" ? target.stroke.paint.color : "#000000";
        let lastAlpha = target.stroke?.paint.kind === "solid" ? target.stroke.paint.alpha : undefined;
        let lastWidth = target.stroke?.width ?? 1;
        let lastDash = (target.stroke?.dashPreset ?? "solid");
        const initialEnabled = !!target.stroke;
        const solidPaint = (color, alpha) => {
            const p = { kind: "solid", color };
            if (alpha !== undefined && alpha < 1)
                p.alpha = alpha;
            return p;
        };
        wrap.appendChild(row(t("inspector.field.color"), colorInput(lastColor, (v) => {
            lastColor = v;
            const cur = target.stroke;
            set({
                paint: solidPaint(v, lastAlpha),
                width: cur?.width ?? lastWidth,
                dashPreset: cur?.dashPreset ?? lastDash,
                dash: cur?.dash ?? (lastDash !== "solid" ? dashPresetToArr(lastDash) : undefined),
                cap: cur?.cap,
            });
        }), checkbox(t("inspector.field.on"), initialEnabled, (on) => {
            if (on) {
                const cur = target.stroke;
                set({
                    paint: cur?.paint ?? solidPaint(lastColor, lastAlpha),
                    width: cur?.width ?? lastWidth,
                    dashPreset: cur?.dashPreset ?? (lastDash !== "solid" ? lastDash : undefined),
                    dash: cur?.dash ?? (lastDash !== "solid" ? dashPresetToArr(lastDash) : undefined),
                    cap: cur?.cap,
                });
            }
            else {
                set(undefined);
            }
        })));
        wrap.appendChild(row(t("inspector.field.width"), numberInput(lastWidth, (v) => {
            const w = Math.max(0, v);
            lastWidth = w;
            const cur = target.stroke;
            if (!cur) {
                // 没启用 stroke 时直接调宽度更符合"想加边框"的预期，自动启用并沿用上次颜色 / dash。
                set({
                    paint: { kind: "solid", color: lastColor },
                    width: w,
                    dashPreset: lastDash !== "solid" ? lastDash : undefined,
                    dash: lastDash !== "solid" ? dashPresetToArr(lastDash) : undefined,
                });
            }
            else {
                set({ ...cur, width: w });
            }
        }, 0.5)));
        wrap.appendChild(row(t("inspector.field.dash"), selectInput(dashOptions(), lastDash, (v) => {
            lastDash = v;
            const cur = target.stroke;
            if (!cur) {
                set({
                    paint: { kind: "solid", color: lastColor },
                    width: lastWidth,
                    dashPreset: v,
                    dash: dashPresetToArr(v),
                });
            }
            else {
                set({ ...cur, dashPreset: v, dash: dashPresetToArr(v) });
            }
        })));
        // 描边透明度：仅对 solid paint 暴露（与 PowerPoint "线条 → 透明度" 对齐）。
        // OOXML 写到 `<a:ln><a:solidFill><a:srgbClr><a:alpha val=N/></...>`，serializer 已支持。
        if (target.stroke?.paint?.kind === "solid") {
            const alpha = target.stroke.paint.alpha ?? 1;
            wrap.appendChild(row(t("inspector.field.opacity"), rangeInput(alpha, (v) => {
                const a = Math.max(0, Math.min(1, v));
                lastAlpha = a < 1 ? a : undefined;
                const cur = target.stroke;
                if (!cur)
                    return;
                set({ ...cur, paint: solidPaint(cur.paint.kind === "solid" ? cur.paint.color : lastColor, lastAlpha) });
            })));
        }
        return wrap;
    }
    function effectsSection(target, shapeId) {
        const wrap = sectionWrap(t("inspector.section.effects"));
        const sel = doc.createElement("select");
        sel.className = CONTROL_INPUT_CLASS;
        sel.style.cssText = "width:100%;margin-bottom:6px";
        for (const preset of SHAPE_EFFECT_PRESETS) {
            const opt = doc.createElement("option");
            opt.value = preset.id;
            opt.textContent = t(preset.labelKey);
            sel.appendChild(opt);
        }
        sel.addEventListener("change", () => {
            const preset = SHAPE_EFFECT_PRESETS.find((p) => p.id === sel.value);
            if (!preset)
                return;
            opts.stack.execute(new SetShapeEffectsCmd(opts.currentSlide(), shapeId, preset.patch));
            refresh();
        });
        wrap.appendChild(row(t("inspector.field.effectPreset"), sel));
        const summary = doc.createElement("div");
        summary.style.cssText = "font-size:11px;color:var(--muted-foreground);margin-bottom:6px";
        const parts = [];
        if (target.shadow || target.effects?.some((e) => e.kind === "outer" || e.kind === "inner")) {
            parts.push(t("inspector.effects.hasShadow"));
        }
        if (target.effects?.some((e) => e.kind === "glow"))
            parts.push(t("inspector.effects.hasGlow"));
        if (target.effects?.some((e) => e.kind === "softEdge"))
            parts.push(t("inspector.effects.hasSoftEdge"));
        if (target.effects?.some((e) => e.kind === "reflection"))
            parts.push(t("inspector.effects.hasReflection"));
        summary.textContent = parts.length > 0 ? parts.join(" · ") : t("inspector.effects.none");
        wrap.appendChild(summary);
        const clearBtn = mkActionBtn(t("inspector.effects.clear"), () => {
            opts.stack.execute(new SetShapeEffectsCmd(opts.currentSlide(), shapeId, {
                shadow: null,
                glow: null,
                softEdge: null,
                reflection: null,
            }));
            refresh();
        });
        wrap.appendChild(clearBtn);
        return wrap;
    }
    function shape3DSection(target, shapeId) {
        const wrap = sectionWrap(t("inspector.section.shape3d"));
        const extrusion = target.meta3D?.sp3d?.extrusionH ?? 0;
        wrap.appendChild(row(t("inspector.field.extrusionH"), rangeInput(extrusion, (v) => {
            const h = Math.max(0, Math.round(v));
            opts.stack.execute(new SetShape3DCmd(opts.currentSlide(), shapeId, { extrusionH: h }));
            refresh();
        }, 0, 120, 1, { format: (v) => String(Math.round(v)) })));
        const camSel = doc.createElement("select");
        camSel.className = CONTROL_INPUT_CLASS;
        camSel.style.cssText = "width:100%";
        const cameras = [
            { id: "orthographicFront", label: t("inspector.shape3d.camera.orthographicFront") },
            { id: "perspectiveFront", label: t("inspector.shape3d.camera.perspectiveFront") },
            { id: "perspectiveRelaxedModerately", label: t("inspector.shape3d.camera.perspectiveRelaxed") },
            { id: "isometricTopUp", label: t("inspector.shape3d.camera.isometricTopUp") },
        ];
        for (const c of cameras) {
            const opt = doc.createElement("option");
            opt.value = c.id;
            opt.textContent = c.label;
            if (target.meta3D?.scene3d?.camera?.prst === c.id)
                opt.selected = true;
            camSel.appendChild(opt);
        }
        camSel.addEventListener("change", () => {
            opts.stack.execute(new SetShape3DCmd(opts.currentSlide(), shapeId, { cameraPrst: camSel.value }));
            refresh();
        });
        wrap.appendChild(row(t("inspector.field.camera"), camSel));
        if (target.meta3D) {
            const clearBtn = mkActionBtn(t("inspector.shape3d.clear"), () => {
                opts.stack.execute(new SetShape3DCmd(opts.currentSlide(), shapeId, { clear: true }));
                refresh();
            });
            wrap.appendChild(clearBtn);
        }
        return wrap;
    }
    function mediaSection(shape, id, set) {
        const isVideo = shape.kind === "video";
        const mediaShape = shape;
        const wrap = sectionWrap(isVideo ? t("inspector.section.videoPlayback") : t("inspector.section.audioPlayback"));
        const props = mediaShape;
        const metaLines = [];
        const dur = props.duration;
        if (dur != null && Number.isFinite(dur) && dur > 0) {
            metaLines.push(`${t("inspector.media.duration")}: ${formatRecordingDuration(dur)}`);
        }
        const trimSummary = formatMediaTrimSummary(props.trim, dur);
        if (trimSummary)
            metaLines.push(`${t("inspector.media.trimRange")}: ${trimSummary}`);
        const srcBytes = dataUrlByteSize(props.src);
        if (srcBytes != null) {
            const sizeLine = `${t("inspector.media.fileSize")}: ${formatByteSize(srcBytes)}`;
            metaLines.push(isLargeMediaBytes(srcBytes) ? `${sizeLine} (${t("inspector.media.largeWarning")})` : sizeLine);
        }
        const mime = mediaMimeLabel(parseDataUrlMime(props.src));
        if (mime)
            metaLines.push(`${t("inspector.media.mime")}: ${mime}`);
        if (metaLines.length) {
            const meta = doc.createElement("div");
            meta.style.cssText = "font-size:11px;color:var(--muted-foreground);margin-bottom:8px;line-height:1.45";
            meta.textContent = metaLines.join("\n");
            wrap.appendChild(meta);
        }
        const copyRow = doc.createElement("div");
        copyRow.style.cssText = "margin-bottom:8px";
        copyRow.appendChild(mkActionBtn(t("inspector.media.replace"), () => {
            const inp = doc.createElement("input");
            inp.type = "file";
            inp.accept = isVideo ? "video/*" : "audio/*";
            inp.addEventListener("change", () => {
                const file = inp.files?.[0];
                inp.remove();
                if (!file)
                    return;
                const reader = new FileReader();
                reader.onload = () => {
                    const src = String(reader.result ?? "");
                    if (!src.startsWith("data:"))
                        return;
                    const bytes = dataUrlByteSize(src);
                    const apply = (duration) => {
                        opts.stack.execute(new UpdateMediaSrcCmd(opts.currentSlide(), id, src, duration));
                        refresh();
                    };
                    const run = () => {
                        if (isVideo) {
                            const v = doc.createElement("video");
                            v.preload = "metadata";
                            v.onloadedmetadata = () => apply(Number.isFinite(v.duration) ? v.duration : undefined);
                            v.onerror = () => apply();
                            v.src = src;
                        }
                        else {
                            const a = doc.createElement("audio");
                            a.preload = "metadata";
                            a.onloadedmetadata = () => apply(Number.isFinite(a.duration) ? a.duration : undefined);
                            a.onerror = () => apply();
                            a.src = src;
                        }
                    };
                    if (shouldConfirmLargeInsertBytes(bytes, "media") && !window.confirm(t("inspector.media.largeReplaceConfirm"))) {
                        return;
                    }
                    run();
                };
                reader.readAsDataURL(file);
            });
            doc.body.appendChild(inp);
            inp.click();
        }));
        wrap.appendChild(copyRow);
        const media = opts.getMediaEl?.(id) ?? null;
        const totalDur = () => {
            if (media && Number.isFinite(media.duration) && media.duration > 0)
                return media.duration;
            if (props.duration !== undefined && Number.isFinite(props.duration) && props.duration > 0) {
                return props.duration;
            }
            return 0;
        };
        const trimBounds = () => mediaTrimBounds(props.trim, totalDur() || undefined);
        const applyTrim = (next) => {
            if (!next)
                set({ trim: undefined });
            else
                set({ trim: next });
        };
        // ── 顶部一行：Play / Pause / Stop
        const playBtn = iconBtn("play", t("inspector.media.play"), () => {
            if (!media)
                return;
            const { start } = trimBounds();
            if (media.currentTime < start || media.currentTime >= trimBounds().end) {
                try {
                    media.currentTime = start;
                }
                catch {
                    /* ignore */
                }
            }
            void media.play();
        });
        const pauseBtn = iconBtn("pause", t("inspector.media.pause"), () => media?.pause());
        const stopBtn = iconBtn("square", t("inspector.media.stop"), () => {
            if (!media)
                return;
            media.pause();
            try {
                media.currentTime = trimBounds().start;
            }
            catch {
                /* ignore */
            }
        });
        wrap.appendChild(row(t("inspector.field.preview"), playBtn, pauseBtn, stopBtn));
        if (!media) {
            const hint = doc.createElement("div");
            hint.style.cssText = "color:var(--muted-foreground);font-size:11px;margin:4px 0";
            hint.textContent = t("inspector.media.notLoaded");
            wrap.appendChild(hint);
        }
        // ── 进度条 + 时间显示（映射到 trim 区间）
        const timeLabel = doc.createElement("span");
        timeLabel.style.cssText = "color:var(--muted-foreground);font-size:11px;min-width:90px;text-align:right";
        timeLabel.textContent = "0:00 / 0:00";
        const seek = doc.createElement("input");
        seek.type = "range";
        seek.min = "0";
        seek.max = "1000";
        seek.step = "1";
        seek.value = "0";
        seek.className = RANGE_INPUT_CLASS;
        seek.style.cssText = "flex:1;min-width:80px";
        let seeking = false;
        seek.addEventListener("input", () => {
            if (!media)
                return;
            const { start, end } = trimBounds();
            const span = Math.max(0.001, end - start);
            seeking = true;
            media.currentTime = start + (Number(seek.value) / 1000) * span;
        });
        seek.addEventListener("change", () => {
            seeking = false;
        });
        wrap.appendChild(row(t("inspector.field.time"), seek, timeLabel));
        // 当前播放状态实时反映到 ▶/⏸ 按钮颜色（让用户看出当前是否在播）。
        const reflectPlayState = () => {
            const playing = !!media && !media.paused && !media.ended;
            playBtn.style.background = playing ? "var(--primary)" : "var(--card)";
            pauseBtn.style.background = playing ? "var(--card)" : "var(--primary)";
        };
        const updateTime = () => {
            if (!media)
                return;
            const { start, end } = trimBounds();
            const span = Math.max(0.001, end - start);
            const cur = clampMediaTime(media.currentTime, props.trim, totalDur() || undefined);
            timeLabel.textContent = `${formatTime(cur - start)} / ${formatTime(span)}`;
            if (!seeking) {
                seek.value = String(Math.round(((cur - start) / span) * 1000));
            }
        };
        let detachTrim = null;
        if (media) {
            media.addEventListener("timeupdate", updateTime);
            media.addEventListener("loadedmetadata", updateTime);
            media.addEventListener("play", reflectPlayState);
            media.addEventListener("pause", reflectPlayState);
            media.addEventListener("ended", reflectPlayState);
            updateTime();
            reflectPlayState();
            detachTrim = attachMediaTrimPlayback(media, props.trim, totalDur() || undefined, !!props.loop);
            detachMediaListeners = () => {
                media.removeEventListener("timeupdate", updateTime);
                media.removeEventListener("loadedmetadata", updateTime);
                media.removeEventListener("play", reflectPlayState);
                media.removeEventListener("pause", reflectPlayState);
                media.removeEventListener("ended", reflectPlayState);
                detachTrim?.();
            };
        }
        // ── 音量（同时写入 shape.volume，让放映时也用同样的音量）。
        const volRange = rangeInput(props.volume ?? 1, (v) => {
            if (media)
                media.volume = v;
            set({ volume: v });
        }, 0, 1, 0.05);
        wrap.appendChild(row(t("inspector.field.volume"), volRange));
        // ── 行为开关：会通过 SetMediaPropsCmd 持久化到 shape，serializer 写回 OOXML。
        const loopBox = checkbox(t("inspector.field.loop"), !!props.loop, (on) => {
            if (media)
                media.loop = on;
            set({ loop: on });
        });
        const autoBox = checkbox(t("inspector.field.autoplay"), !!props.autoplay, (on) => {
            set({ autoplay: on });
        });
        const muteBox = checkbox(t("inspector.field.mute"), !!props.muted, (on) => {
            if (media)
                media.muted = on;
            set({ muted: on });
        });
        wrap.appendChild(row(t("inspector.field.options"), loopBox, autoBox, muteBox));
        // ── Trim（入点 / 出点）
        const trimWrap = sectionWrap(t("inspector.section.trim"));
        const trimStart = numberInput(props.trim?.start ?? 0, (v) => {
            applyTrim({ start: Math.max(0, v), end: props.trim?.end });
        }, 0.1);
        const trimEnd = numberInput(props.trim?.end ?? (totalDur() || 0), (v) => {
            applyTrim({ start: props.trim?.start, end: Math.max(0, v) });
        }, 0.1);
        trimWrap.appendChild(row(t("inspector.trim.start"), trimStart));
        trimWrap.appendChild(row(t("inspector.trim.end"), trimEnd));
        const trimBtnRow = doc.createElement("div");
        trimBtnRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap;margin-top:4px";
        trimBtnRow.appendChild(mkActionBtn(t("inspector.trim.setStart"), () => {
            if (!media)
                return;
            applyTrim({ start: media.currentTime, end: props.trim?.end });
        }));
        trimBtnRow.appendChild(mkActionBtn(t("inspector.trim.setEnd"), () => {
            if (!media)
                return;
            applyTrim({ start: props.trim?.start, end: media.currentTime });
        }));
        trimBtnRow.appendChild(mkActionBtn(t("inspector.trim.reset"), () => applyTrim(undefined)));
        trimWrap.appendChild(trimBtnRow);
        const trimHint = doc.createElement("div");
        trimHint.textContent = t("inspector.trim.hint");
        trimHint.style.cssText = "color:var(--muted-foreground);font-size:10px;margin-top:6px;line-height:1.3";
        trimWrap.appendChild(trimHint);
        wrap.appendChild(trimWrap);
        // ── Poster（仅 video）
        if (isVideo) {
            const video = shape;
            const posterWrap = sectionWrap(t("inspector.section.poster"));
            if (video.poster) {
                const thumb = doc.createElement("img");
                thumb.src = video.poster;
                thumb.alt = "";
                thumb.style.cssText =
                    "display:block;max-width:100%;max-height:80px;object-fit:contain;border-radius:4px;border:1px solid var(--border);margin-bottom:6px;background:#000";
                posterWrap.appendChild(thumb);
            }
            const posterBtnRow = doc.createElement("div");
            posterBtnRow.style.cssText = "display:flex;gap:4px;flex-wrap:wrap";
            posterBtnRow.appendChild(mkActionBtn(t("inspector.poster.choose"), () => {
                pickImageFile((src) => set({ poster: src }));
            }));
            if (media && media instanceof HTMLVideoElement) {
                posterBtnRow.appendChild(mkActionBtn(t("inspector.poster.capture"), () => {
                    const data = captureVideoFrame(media);
                    if (data)
                        set({ poster: data });
                }));
            }
            if (video.poster) {
                posterBtnRow.appendChild(mkActionBtn(t("inspector.poster.clear"), () => set({ poster: undefined })));
            }
            posterWrap.appendChild(posterBtnRow);
            wrap.appendChild(posterWrap);
        }
        return wrap;
    }
    function captureVideoFrame(video) {
        const w = video.videoWidth || 320;
        const h = video.videoHeight || 180;
        if (w <= 0 || h <= 0)
            return null;
        const canvas = doc.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx)
            return null;
        try {
            ctx.drawImage(video, 0, 0, w, h);
            return canvas.toDataURL("image/jpeg", 0.85);
        }
        catch {
            return null;
        }
    }
    function textBodySection(text, shapeId) {
        const wrap = sectionWrap(t("inspector.section.textBox"));
        const applyBody = (patch) => {
            opts.stack.execute(new SetTextBodyCmd(opts.currentSlide(), shapeId, patch));
        };
        const curVert = text.vert ?? "horz";
        const stackedVal = isWordArtStackedVert(curVert) ? curVert : "wordArtVertRtl";
        const orientValue = isWordArtStackedVert(curVert) ? stackedVal : curVert;
        wrap.appendChild(row(t("inspector.textBox.orientation"), selectInput([
            ["horz", t("ribbon.textDir.horz")],
            ["vert", t("ribbon.textDir.vert")],
            ["vert270", t("ribbon.textDir.vert270")],
            ["eaVert", t("ribbon.textDir.eaVert")],
            [stackedVal, t("ribbon.textDir.wordArtVert")],
            ["mongolianVert", t("ribbon.textDir.mongolian")],
        ], orientValue, (v) => {
            if (v === "horz")
                applyBody({ vert: null });
            else if (isWordArtStackedVert(v)) {
                applyBody({ vert: isWordArtStackedVert(curVert) ? curVert : "wordArtVertRtl" });
            }
            else {
                applyBody({ vert: v });
            }
        })));
        wrap.appendChild(row(t("inspector.textBox.rowOrder"), selectInput([
            ["ltr", t("inspector.textBox.rowOrderLtr")],
            ["rtl", t("inspector.textBox.rowOrderRtl")],
        ], textRowOrderRtl(text) ? "rtl" : "ltr", (v) => applyBody(textRowOrderPatch(text, v === "rtl")))));
        wrap.appendChild(row(t("inspector.textBox.vAlign"), selectInput([
            ["top", t("inspector.textBox.vAlignTop")],
            ["middle", t("inspector.textBox.vAlignMiddle")],
            ["bottom", t("inspector.textBox.vAlignBottom")],
        ], text.vAlign ?? "top", (v) => applyBody({ vAlign: v }))));
        wrap.appendChild(row(t("inspector.textBox.wrap"), checkbox(t("inspector.textBox.wrapOn"), text.wrap !== false, (on) => applyBody({ wrap: on }))));
        wrap.appendChild(row(t("inspector.textBox.autoFit"), selectInput([
            ["none", t("inspector.textBox.autoFitNone")],
            ["normAutofit", t("inspector.textBox.autoFitShrink")],
            ["spAutoFit", t("inspector.textBox.autoFitShape")],
        ], text.autoFit?.kind ?? "none", (v) => applyBody({ autoFit: v }))));
        wrap.appendChild(row(t("inspector.textBox.columns"), selectInput([
            ["1", "1"],
            ["2", "2"],
            ["3", "3"],
            ["4", "4"],
            ["5", "5"],
            ["6", "6"],
        ], String(text.numCol ?? 1), (v) => {
            const n = Number(v);
            applyBody({ numCol: n <= 1 ? null : n });
        })));
        wrap.appendChild(row(t("inspector.textBox.colGap"), numberInput(text.spcCol ?? 0, (v) => applyBody({ spcCol: v <= 0 ? null : v }), 0.5)));
        const insets = {
            l: text.insets?.l ?? 9.6,
            t: text.insets?.t ?? 4.8,
            r: text.insets?.r ?? 9.6,
            b: text.insets?.b ?? 4.8,
        };
        wrap.appendChild(row(t("inspector.textBox.insets"), numberInput(insets.l, (v) => applyBody({ insets: { ...insets, l: v } }), 0.5, 48), numberInput(insets.t, (v) => applyBody({ insets: { ...insets, t: v } }), 0.5, 48), numberInput(insets.r, (v) => applyBody({ insets: { ...insets, r: v } }), 0.5, 48), numberInput(insets.b, (v) => applyBody({ insets: { ...insets, b: v } }), 0.5, 48)));
        wrap.appendChild(row(t("inspector.textBox.overflowH"), selectInput([
            ["overflow", t("inspector.textBox.overflowOverflow")],
            ["clip", t("inspector.textBox.overflowClip")],
            ["ellipsis", t("inspector.textBox.overflowEllipsis")],
        ], text.horzOverflow ?? "overflow", (v) => applyBody({ horzOverflow: v === "overflow" ? null : v }))));
        wrap.appendChild(row(t("inspector.textBox.overflowV"), selectInput([
            ["overflow", t("inspector.textBox.overflowOverflow")],
            ["clip", t("inspector.textBox.overflowClip")],
            ["ellipsis", t("inspector.textBox.overflowEllipsis")],
        ], text.vertOverflow ?? "overflow", (v) => applyBody({ vertOverflow: v === "overflow" ? null : v }))));
        wrap.appendChild(row(t("inspector.textBox.more"), checkbox(t("inspector.textBox.upright"), !!text.upright, (on) => applyBody({ upright: on ? true : null })), checkbox(t("inspector.textBox.anchorCtr"), !!text.anchorCtr, (on) => applyBody({ anchorCtr: on ? true : null }))));
        return wrap;
    }
    function paragraphSection(text, shapeId, flags = {}) {
        const wrap = flags.nest ? doc.createElement("div") : sectionWrap(t("inspector.section.paragraph"));
        const p = text.paragraphs[0];
        const slideIdx = opts.currentSlide();
        wrap.appendChild(row(t("inspector.paragraph.align"), selectInput([
            ["start", t("ribbon.align.left")],
            ["middle", t("ribbon.align.center")],
            ["end", t("ribbon.align.right")],
            ["justify", t("ribbon.align.justify")],
        ], p?.align ?? "start", (v) => opts.stack.execute(new SetTextAlignCmd(slideIdx, shapeId, v)))));
        wrap.appendChild(row(t("inspector.paragraph.lineSpacing"), selectInput([
            ["", t("ribbon.paragraph.lineSpacing.default")],
            ["1", "1.0"],
            ["1.15", "1.15"],
            ["1.5", "1.5"],
            ["2", "2.0"],
        ], p?.lineHeight != null ? String(p.lineHeight) : "", (v) => {
            opts.stack.execute(new SetParagraphSpacingCmd(slideIdx, shapeId, v
                ? { lineHeight: Number(v) }
                : { lineHeight: null, lineHeightPx: null }));
        })));
        wrap.appendChild(row(t("inspector.paragraph.spaceBefore"), numberInput(p?.spaceBeforePx ?? 0, (v) => {
            opts.stack.execute(new SetParagraphSpacingCmd(slideIdx, shapeId, { spaceBeforePx: v <= 0 ? null : v }));
        }, 0.5)));
        wrap.appendChild(row(t("inspector.paragraph.spaceAfter"), numberInput(p?.spaceAfterPx ?? 0, (v) => {
            opts.stack.execute(new SetParagraphSpacingCmd(slideIdx, shapeId, { spaceAfterPx: v <= 0 ? null : v }));
        }, 0.5)));
        wrap.appendChild(row(t("inspector.paragraph.indent"), numberInput(p?.indent ?? 0, (v) => {
            opts.stack.execute(new SetParagraphSpacingCmd(slideIdx, shapeId, { indent: v === 0 ? null : v }));
        }, 1)));
        wrap.appendChild(row(t("inspector.paragraph.marginLeft"), numberInput(p?.marginLeft ?? 0, (v) => {
            opts.stack.execute(new SetParagraphSpacingCmd(slideIdx, shapeId, { marginLeft: v <= 0 ? null : v }));
        }, 1)));
        wrap.appendChild(row(t("inspector.paragraph.marginRight"), numberInput(p?.marginRight ?? 0, (v) => {
            opts.stack.execute(new SetParagraphSpacingCmd(slideIdx, shapeId, { marginRight: v <= 0 ? null : v }));
        }, 1)));
        wrap.appendChild(row(t("inspector.paragraph.direction"), selectInput([
            ["ltr", t("ribbon.textDir.ltr")],
            ["rtl", t("ribbon.textDir.rtl")],
        ], p?.rtl ? "rtl" : "ltr", (v) => opts.stack.execute(new SetParagraphRtlCmd(slideIdx, shapeId, v === "rtl")))));
        wrap.appendChild(row(t("inspector.paragraph.cjk"), checkbox("", !!(p?.eaLnBrk || p?.hangingPunct), (on) => {
            opts.stack.execute(new SetParagraphCjkCmd(slideIdx, shapeId, on));
        })));
        return wrap;
    }
    function textSection(run, patch, flags = {}) {
        const wrap = flags.nest ? doc.createElement("div") : sectionWrap(t("inspector.group.text"));
        const fontInput = doc.createElement("input");
        fontInput.type = "text";
        fontInput.value = run.fontFamily ?? "";
        fontInput.placeholder = t("inspector.fontFamilyPlaceholder");
        fontInput.className = CONTROL_INPUT_CLASS;
        const fontCombo = bindFontFamilyCombobox(fontInput, (v) => patch({ fontFamily: v || undefined }));
        fontCombo.el.style.cssText = "flex:1;min-width:0";
        comboCleanups.push(fontCombo.destroy);
        wrap.appendChild(row(t("inspector.field.font"), fontCombo.el));
        wrap.appendChild(row(t("inspector.field.size"), numberInput(pxToPt(run.fontSize ?? ptToPx(DEFAULT_FONT_PT)), (v) => patch({ fontSize: fontPxFromPt(v) }), 0.5)));
        wrap.appendChild(row(t("inspector.field.color"), colorInput(paintedTextColor(run) ?? "#000000", (v) => patch({ color: v }), "text")));
        const bold = checkbox(t("inspector.field.bold"), isBold(run.fontWeight), (on) => patch({ fontWeight: on ? 700 : 400 }));
        const ital = checkbox(t("inspector.field.italic"), !!run.italic, (on) => patch({ italic: on }));
        const und = checkbox(t("inspector.field.underline"), !!run.underline, (on) => patch({ underline: on }));
        const strikeOn = !!run.strikethrough && run.strikethrough !== "none";
        const strike = checkbox(t("inspector.field.strikethrough"), strikeOn, (on) => patch({ strikethrough: on ? "single" : "none" }));
        wrap.appendChild(row(t("inspector.field.style"), bold, ital, und, strike));
        wrap.appendChild(row(t("inspector.field.letterSpacing"), numberInput(run.letterSpacing ?? 0, (v) => patch({ letterSpacing: v === 0 ? null : v }), 0.1)));
        return wrap;
    }
    refresh();
    return {
        el,
        refresh,
        destroy() {
            detachMedia();
            detachCombos();
            unsub();
            el.remove();
        },
    };
}
function formatTime(sec) {
    if (!Number.isFinite(sec) || sec < 0)
        sec = 0;
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, "0")}`;
}
function isBold(w) {
    if (w === undefined)
        return false;
    if (typeof w === "number")
        return w >= 600;
    return w === "bold" || w === "bolder";
}
function pickFirstStyleShape(s) {
    if (s.kind === "group") {
        const children = s.children;
        for (const c of children) {
            if (!c.id.endsWith("_base"))
                continue;
            // multiPath autoshape：_base 是 group，stroke 落在 `_pNs` split path、
            // fill 落在 `_pNf` split path 上（见 commands.ts 的 multiPathSplitChildren
            // 注释）。这里"代表性地"取第一个 split path 的 fill / stroke 给面板显示，
            // 否则面板会拿到 _base group 自身（无 fill/stroke 字段），出现「形状有
            // stroke 但属性面板看不见」的现象（quicktour slide9 Down Ribbon /
            // Vertical Scroll 即是该 bug 的典型表现）。
            //
            // 用 getter 而非快照：strokeSection 的 handler 会在 user 连改"颜色 + 宽
            // 度"时多次读 target.stroke 来重组新 stroke（{ ...cur, width: w }）。如
            // 果 target.stroke 是构造时拍的快照，第二次改时还是读到改之前的颜色，
            // 把上一次的颜色变更覆盖回去。这里走 getter，每次都重新读 fillRep /
            // strokeRep（live ref），SetStroke/FillCmd 写入 _pN[fs] 后 inspector 自动
            // 拿到新值。
            if (c.kind === "group" && c.children && c.children.some((g) => /_p\d+[fs]$/.test(g.id))) {
                const baseChildren = c.children;
                return {
                    get fill() {
                        return baseChildren.find((g) => /_p\d+f$/.test(g.id))?.fill;
                    },
                    get stroke() {
                        return baseChildren.find((g) => /_p\d+s$/.test(g.id))?.stroke;
                    },
                };
            }
            return c;
        }
        return children[0];
    }
    return s;
}
function pickInspectorTextShape(s) {
    if (s.kind === "text")
        return s;
    if (s.kind === "group") {
        for (const c of s.children) {
            const found = pickInspectorTextShape(c);
            if (found)
                return found;
        }
    }
    return undefined;
}
function pickTextRun(s) {
    if (s.kind === "text" && s.paragraphs?.[0]) {
        const r = s.paragraphs[0].runs[0];
        if (r)
            return r;
    }
    if (s.kind === "group") {
        const children = s.children;
        for (const c of children) {
            const r = pickTextRun(c);
            if (r)
                return r;
        }
    }
    return undefined;
}
function normalizeColor(c) {
    if (/^#[0-9a-f]{6}$/i.test(c))
        return c;
    if (/^#[0-9a-f]{8}$/i.test(c))
        return c.slice(0, 7);
    if (/^#[0-9a-f]{3}$/i.test(c))
        return "#" + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
    return "#000000";
}
function formatNum(n) {
    if (Number.isInteger(n))
        return String(n);
    return n.toFixed(2).replace(/\.?0+$/, "");
}
// 把 dash preset 映射到 SVG stroke-dasharray 倍数（相对 stroke-width）。
// 数值参考 ECMA-376 §20.1.10.49 + PowerPoint 渲染默认。
function dashPresetToArr(preset) {
    switch (preset) {
        case "solid":
            return undefined;
        case "dot":
        case "sysDot":
            return [1, 2];
        case "dash":
        case "sysDash":
            return [4, 3];
        case "lgDash":
            return [8, 3];
        case "dashDot":
        case "sysDashDot":
            return [4, 3, 1, 3];
        case "lgDashDot":
            return [8, 3, 1, 3];
        case "lgDashDotDot":
            return [8, 3, 1, 3, 1, 3];
        case "sysDashDotDot":
            return [4, 3, 1, 3, 1, 3];
        default:
            return undefined;
    }
}
