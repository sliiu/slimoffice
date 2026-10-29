import { rebuildSmartArtChildren } from "@sliiu/present-core";
import { ApplyCustomThemeCmd, ApplyThemeCmd, } from "@sliiu/present-themes";
import { AddLayoutCmd, DeleteLayoutCmd, DuplicateMasterCmd, RenameLayoutCmd, SetMasterTxStylesCmd, SetPlaceholderTypeCmd, SetSlideLayoutRefCmd, } from "./master-commands.js";
import { AddAnimEffectCmd, CopyShapeAnimationsCmd, MoveAnimEffectCmd, RemoveAnimEffectCmd, SetAnimEffectPropCmd, } from "./animation/commands.js";
import { AddCommentCmd, DeleteCommentCmd, EditCommentCmd, ResolveCommentCmd, ResolveSlideCommentsCmd, SetCommentAnchorCmd, } from "./comment-commands.js";
import { AddShapeCmd, DuplicateShapeCmd, AlignShapesCmd, ApplyFormatCmd, DeleteShapeCmd, DistributeShapesCmd, EditTextCmd, FlipShapeCmd, GroupShapesCmd, InsertTableColumnCmd, InsertTableRowCmd, MergeTableCellsCmd, MoveShapeCmd, RemoveTableColumnCmd, RemoveTableRowCmd, SetTableCellStyleCmd, UnmergeTableCellsCmd, ReorderShapeCmd, ResizeShapeCmd, ChangeTextCaseCmd, ClearTextFormattingCmd, SetChartDefCmd, SetFillCmd, SetImageCropCmd, SetCropFrameCmd, SetImageDescrCmd, ReplaceImageSrcCmd, SetShapeHyperlinkCmd, SetLineEndpointsCmd, SetMediaPropsCmd, SetParagraphBulletCmd, SetParagraphCjkCmd, SetParagraphRtlCmd, SetParagraphSpacingCmd, SetParagraphsCmd, SetPathConnectorEndsCmd, SetPolygonPointsCmd, SetPresetAdjCmd, SetRichTextCmd, SetShape3DCmd, SetShapeBboxCmd, SetShapeEffectsCmd, SetShapeLockedCmd, SetShapeOpacityCmd, SetShapeRotationCmd, SetShapeVisibleCmd, SetBackgroundTargetCmd, SetSlideBackgroundCmd, SetSlideHfCmd, SetSlideSizeCmd, SetSlideNotesCmd, SetSlideShowCmd, SetSlideTransitionCmd, SetStrokeCmd, SetTextAlignCmd, SetTextBodyCmd, SetTextStyleCmd, UngroupShapesCmd, UpdateMediaSrcCmd, } from "./commands.js";
import { DeleteSlideCmd, DeleteSlidesCmd, DuplicateSlideCmd, InsertSlideCmd, MoveSlideCmd, } from "./slide-commands.js";
import { ApplySlideLayoutCmd, ResetSlideToLayoutCmd } from "./slide-layout-commands.js";
import { InsertModel3DCmd, UpdateModel3DGlbCmd } from "./model3d-cmd.js";
import { InsertOleCmd, SetOleShowAsIconCmd, UpdateOleEmbedCmd } from "./ole-cmd.js";
import { InsertWebEmbedCmd } from "./web-embed-cmd.js";
import { EmbedFontsCmd } from "./embed-fonts-cmd.js";
import { ClearInkOnSlideCmd } from "./ink-commands.js";
import { SetPresentationProtectionCmd } from "./protection-cmd.js";
import { SetProofingLanguageCmd } from "./proofing-language-cmd.js";
import { ApplyThemeVariantCmd } from "./theme-variant-cmd.js";
import { SetDeckSectionsCmd } from "./section-commands.js";
import { SetViewGuidesCmd, SetShowPropertiesCmd } from "./view-show-commands.js";
import { findShape } from "./selection.js";
import { AddSmartArtItemCmd, ClearSmartArtPicturesCmd, ConvertToSmartArtCmd, DuplicateSmartArtItemCmd, MoveSmartArtItemCmd, RebuildSmartArtCmd, RemoveSmartArtItemCmd, SetSmartArtItemLevelCmd, SetSmartArtLayoutCmd, UpdateSmartArtItemsCmd, } from "./smartart-commands.js";
function readField(cmd, key) {
    const v = cmd[key];
    return v;
}
function isBatch(cmd) {
    const cmds = readField(cmd, "cmds");
    return Array.isArray(cmds) && cmds.length > 0;
}
function unionBbox(boxes) {
    if (!boxes.length)
        return { x: 0, y: 0, w: 0, h: 0 };
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const b of boxes) {
        x0 = Math.min(x0, b.x);
        y0 = Math.min(y0, b.y);
        x1 = Math.max(x1, b.x + b.w);
        y1 = Math.max(y1, b.y + b.h);
    }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
class RemoteBatchCmd {
    children;
    label;
    constructor(label, children) {
        this.children = children;
        this.label = label;
    }
    apply(pres) {
        for (const c of this.children)
            c.apply(pres);
    }
    revert(pres) {
        for (let i = this.children.length - 1; i >= 0; i--)
            this.children[i].revert(pres);
    }
}
/** Remote group: uses the originating client's groupId so both sides stay aligned. */
class WireGroupShapesCmd {
    slideIdx;
    layerIdx;
    positions;
    shapes;
    groupId;
    label = "Group";
    constructor(slideIdx, layerIdx, positions, shapes, groupId) {
        this.slideIdx = slideIdx;
        this.layerIdx = layerIdx;
        this.positions = positions;
        this.shapes = shapes;
        this.groupId = groupId;
    }
    apply(pres) {
        const layer = pres.slides[this.slideIdx]?.layers[this.layerIdx];
        if (!layer)
            return;
        const arr = layer.shapes;
        const ids = new Set(this.shapes.map((s) => s.id));
        for (let i = arr.length - 1; i >= 0; i--) {
            if (ids.has(arr[i].id))
                arr.splice(i, 1);
        }
        const bbox = unionBbox(this.shapes.map((s) => s.bbox));
        const group = {
            id: this.groupId,
            name: "Group",
            zIndex: 0,
            visible: true,
            locked: false,
            opacity: 1,
            bbox,
            transform: { tx: 0, ty: 0, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 },
            kind: "group",
            children: this.shapes.map((s) => structuredClone(s)),
        };
        arr.splice(Math.min(...this.positions), 0, group);
    }
    revert(_pres) {
        // remote-only apply path
    }
}
class WireDeleteCommentsCmd {
    snapshots;
    label = "Delete comment";
    constructor(snapshots) {
        this.snapshots = snapshots;
    }
    apply(pres) {
        if (!pres.comments?.length)
            return;
        const ids = new Set(this.snapshots.map((c) => c.id));
        pres.comments = pres.comments.filter((c) => !ids.has(c.id));
        if (!pres.comments.length)
            pres.comments = undefined;
    }
    revert(_pres) {
        // remote-only apply path
    }
}
function getSmartArtGroup(pres, slideIdx, groupId) {
    const slide = pres.slides[slideIdx];
    if (!slide)
        return null;
    const sh = findShape(slide, groupId);
    if (!sh || sh.kind !== "group" || !sh.smartArtMeta)
        return null;
    return sh;
}
/** Remote SmartArt rebuild: applies absolute item list (+ optional layout). */
class WireRebuildSmartArtCmd {
    slideIdx;
    groupId;
    items;
    layout;
    label = "Update diagram";
    constructor(slideIdx, groupId, items, layout) {
        this.slideIdx = slideIdx;
        this.groupId = groupId;
        this.items = items;
        this.layout = layout;
    }
    apply(pres) {
        const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
        if (!g)
            return;
        if (this.layout)
            g.smartArtMeta = { layout: this.layout };
        rebuildSmartArtChildren(g, this.items, g.smartArtMeta?.layout);
    }
    revert(_pres) {
        // remote-only apply path
    }
}
/** Remote convert: splices the originating client's SmartArt group (stable groupId). */
class WireConvertSmartArtCmd {
    slideIdx;
    layerIdx;
    index;
    group;
    removedShapeId;
    label = "Convert to diagram";
    constructor(slideIdx, layerIdx, index, group, removedShapeId) {
        this.slideIdx = slideIdx;
        this.layerIdx = layerIdx;
        this.index = index;
        this.group = group;
        this.removedShapeId = removedShapeId;
    }
    apply(pres) {
        const layer = pres.slides[this.slideIdx]?.layers[this.layerIdx];
        if (!layer)
            return;
        const clone = structuredClone(this.group);
        if (this.removedShapeId) {
            const pos = layer.shapes.findIndex((s) => s.id === this.removedShapeId);
            if (pos >= 0) {
                layer.shapes.splice(pos, 1, clone);
                return;
            }
        }
        const existing = layer.shapes.findIndex((s) => s.id === clone.id);
        if (existing >= 0) {
            layer.shapes[existing] = clone;
            return;
        }
        const at = Math.min(Math.max(0, this.index), layer.shapes.length);
        layer.shapes.splice(at, 0, clone);
    }
    revert(_pres) {
        // remote-only apply path
    }
}
export function serializeCollabCommand(cmd) {
    if (isBatch(cmd)) {
        const children = [];
        for (const child of cmd.cmds) {
            const wire = serializeCollabCommand(child);
            if (!wire)
                return null;
            children.push(wire);
        }
        return { type: "batch", payload: { label: cmd.label, children } };
    }
    if (cmd instanceof MoveShapeCmd) {
        return {
            type: "moveShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                dx: readField(cmd, "dx"),
                dy: readField(cmd, "dy"),
            },
        };
    }
    if (cmd instanceof ResizeShapeCmd) {
        return {
            type: "resizeShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetShapeBboxCmd) {
        return {
            type: "setShapeBbox",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof EditTextCmd) {
        return {
            type: "editText",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                nextParagraphs: readField(cmd, "nextParagraphs"),
            },
        };
    }
    if (cmd instanceof SetRichTextCmd) {
        return {
            type: "setRichText",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                nextParagraphs: readField(cmd, "nextParagraphs"),
            },
        };
    }
    if (cmd instanceof SetParagraphsCmd) {
        return {
            type: "setParagraphs",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                nextParagraphs: readField(cmd, "nextParagraphs"),
            },
        };
    }
    if (cmd instanceof SetTextStyleCmd) {
        return {
            type: "setTextStyle",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                patch: readField(cmd, "patch"),
                ranges: readField(cmd, "ranges"),
            },
        };
    }
    if (cmd instanceof DeleteShapeCmd) {
        return {
            type: "deleteShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                target: readField(cmd, "target"),
            },
        };
    }
    if (cmd instanceof AddShapeCmd) {
        return {
            type: "addShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                layerIdx: readField(cmd, "layerIdx"),
                shape: readField(cmd, "shape"),
                target: readField(cmd, "target"),
            },
        };
    }
    if (cmd instanceof DuplicateShapeCmd) {
        return {
            type: "duplicateShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                dx: readField(cmd, "dx") ?? 16,
                dy: readField(cmd, "dy") ?? 16,
                newId: readField(cmd, "newId"),
            },
        };
    }
    if (cmd instanceof InsertOleCmd ||
        cmd instanceof InsertModel3DCmd ||
        cmd instanceof InsertWebEmbedCmd) {
        return {
            type: "addShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                layerIdx: readField(cmd, "layerIdx"),
                shape: cmd.shape,
            },
        };
    }
    if (cmd instanceof ReorderShapeCmd) {
        return {
            type: "reorderShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                direction: readField(cmd, "direction"),
                target: readField(cmd, "target"),
            },
        };
    }
    if (cmd instanceof GroupShapesCmd) {
        const snapshot = readField(cmd, "snapshot");
        if (!snapshot)
            return null;
        return {
            type: "groupShapes",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                ...snapshot,
            },
        };
    }
    if (cmd instanceof UngroupShapesCmd) {
        return {
            type: "ungroupShapes",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
            },
        };
    }
    if (cmd instanceof AlignShapesCmd) {
        return {
            type: "alignShapes",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                ids: readField(cmd, "ids"),
                mode: readField(cmd, "mode"),
            },
        };
    }
    if (cmd instanceof DistributeShapesCmd) {
        return {
            type: "distributeShapes",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                ids: readField(cmd, "ids"),
                axis: readField(cmd, "axis"),
            },
        };
    }
    if (cmd instanceof SetFillCmd) {
        return {
            type: "setFill",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetStrokeCmd) {
        return {
            type: "setStroke",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetShapeRotationCmd) {
        return {
            type: "setShapeRotation",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetShapeOpacityCmd) {
        return {
            type: "setShapeOpacity",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof FlipShapeCmd) {
        return {
            type: "flipShape",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                axis: readField(cmd, "axis"),
            },
        };
    }
    if (cmd instanceof ApplyFormatCmd) {
        return {
            type: "applyFormat",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                snapshot: readField(cmd, "snapshot"),
            },
        };
    }
    if (cmd instanceof SetSlideBackgroundCmd) {
        return {
            type: "setSlideBackground",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetSlideNotesCmd) {
        return {
            type: "setSlideNotes",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetSlideTransitionCmd) {
        return {
            type: "setSlideTransition",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
                applyAll: readField(cmd, "applyAll"),
            },
        };
    }
    if (cmd instanceof AddAnimEffectCmd) {
        return {
            type: "addAnimEffect",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                args: readField(cmd, "args"),
            },
        };
    }
    if (cmd instanceof RemoveAnimEffectCmd) {
        return {
            type: "removeAnimEffect",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                path: readField(cmd, "path"),
            },
        };
    }
    if (cmd instanceof MoveAnimEffectCmd) {
        return {
            type: "moveAnimEffect",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                path: readField(cmd, "path"),
                newIndex: readField(cmd, "newIndex"),
            },
        };
    }
    if (cmd instanceof SetAnimEffectPropCmd) {
        return {
            type: "setAnimEffectProp",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                path: readField(cmd, "path"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof AddCommentCmd) {
        return {
            type: "addComment",
            payload: { comment: readField(cmd, "comment") },
        };
    }
    if (cmd instanceof EditCommentCmd) {
        return {
            type: "editComment",
            payload: {
                commentId: readField(cmd, "commentId"),
                nextText: readField(cmd, "nextText"),
            },
        };
    }
    if (cmd instanceof ResolveCommentCmd) {
        return {
            type: "resolveComment",
            payload: {
                commentId: readField(cmd, "commentId"),
                resolved: readField(cmd, "resolved"),
            },
        };
    }
    if (cmd instanceof DeleteCommentCmd) {
        return {
            type: "deleteComment",
            payload: {
                snapshots: readField(cmd, "snapshots"),
            },
        };
    }
    if (cmd instanceof InsertSlideCmd) {
        return {
            type: "insertSlide",
            payload: {
                idx: readField(cmd, "idx"),
                slide: readField(cmd, "slide"),
            },
        };
    }
    if (cmd instanceof DeleteSlideCmd) {
        return {
            type: "deleteSlide",
            payload: { idx: readField(cmd, "idx") },
        };
    }
    if (cmd instanceof DeleteSlidesCmd) {
        return {
            type: "deleteSlides",
            payload: { indices: readField(cmd, "indices") },
        };
    }
    if (cmd instanceof MoveSlideCmd) {
        return {
            type: "moveSlide",
            payload: {
                from: readField(cmd, "from"),
                to: readField(cmd, "to"),
            },
        };
    }
    if (cmd instanceof DuplicateSlideCmd) {
        return {
            type: "duplicateSlide",
            payload: { idx: readField(cmd, "idx") },
        };
    }
    if (cmd instanceof UpdateSmartArtItemsCmd || cmd instanceof RebuildSmartArtCmd) {
        return {
            type: "rebuildSmartArt",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                items: readField(cmd, "nextItems"),
                layout: cmd instanceof RebuildSmartArtCmd
                    ? readField(cmd, "nextLayout")
                    : undefined,
            },
        };
    }
    if (cmd instanceof SetSmartArtLayoutCmd) {
        return {
            type: "rebuildSmartArt",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                items: readField(cmd, "itemsSnapshot"),
                layout: readField(cmd, "layout"),
            },
        };
    }
    if (cmd instanceof AddSmartArtItemCmd) {
        return {
            type: "addSmartArtItem",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                snapshot: readField(cmd, "snapshot"),
            },
        };
    }
    if (cmd instanceof RemoveSmartArtItemCmd) {
        return {
            type: "removeSmartArtItem",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                snapshot: readField(cmd, "snapshot"),
                itemIndex: readField(cmd, "itemIndex"),
            },
        };
    }
    if (cmd instanceof MoveSmartArtItemCmd) {
        return {
            type: "moveSmartArtItem",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                itemIndex: readField(cmd, "itemIndex"),
                direction: readField(cmd, "direction"),
                snapshot: readField(cmd, "snapshot"),
            },
        };
    }
    if (cmd instanceof SetSmartArtItemLevelCmd) {
        return {
            type: "setSmartArtItemLevel",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                itemIndex: readField(cmd, "itemIndex"),
                delta: readField(cmd, "delta"),
                snapshot: readField(cmd, "snapshot"),
            },
        };
    }
    if (cmd instanceof ConvertToSmartArtCmd) {
        const inserted = readField(cmd, "inserted");
        if (!inserted)
            return null;
        return {
            type: "convertToSmartArt",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                removedShapeId: readField(cmd, "shapeId"),
                layerIdx: inserted.layerIdx,
                index: inserted.index,
                group: inserted.group,
            },
        };
    }
    if (cmd instanceof InsertTableRowCmd) {
        return {
            type: "insertTableRow",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                afterRow: readField(cmd, "afterRow"),
            },
        };
    }
    if (cmd instanceof InsertTableColumnCmd) {
        return {
            type: "insertTableColumn",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                afterCol: readField(cmd, "afterCol"),
            },
        };
    }
    if (cmd instanceof RemoveTableRowCmd) {
        return {
            type: "removeTableRow",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                rowIdx: readField(cmd, "rowIdx"),
            },
        };
    }
    if (cmd instanceof RemoveTableColumnCmd) {
        return {
            type: "removeTableColumn",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                colIdx: readField(cmd, "colIdx"),
            },
        };
    }
    if (cmd instanceof MergeTableCellsCmd) {
        return {
            type: "mergeTableCells",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                startRow: readField(cmd, "startRow"),
                startCol: readField(cmd, "startCol"),
                endRow: readField(cmd, "endRow"),
                endCol: readField(cmd, "endCol"),
            },
        };
    }
    if (cmd instanceof UnmergeTableCellsCmd) {
        return {
            type: "unmergeTableCells",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                row: readField(cmd, "row"),
                col: readField(cmd, "col"),
            },
        };
    }
    if (cmd instanceof SetTableCellStyleCmd) {
        return {
            type: "setTableCellStyle",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                row: readField(cmd, "row"),
                col: readField(cmd, "col"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof SetChartDefCmd) {
        return {
            type: "setChartDef",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetCropFrameCmd) {
        return {
            type: "setCropFrame",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                nextBbox: readField(cmd, "nextBbox"),
                nextCrop: readField(cmd, "nextCrop"),
            },
        };
    }
    if (cmd instanceof SetImageCropCmd) {
        return {
            type: "setImageCrop",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                crop: readField(cmd, "crop") ?? null,
            },
        };
    }
    if (cmd instanceof SetCommentAnchorCmd) {
        return {
            type: "setCommentAnchor",
            payload: {
                commentId: readField(cmd, "commentId"),
                next: readField(cmd, "next"),
                prev: readField(cmd, "prev"),
            },
        };
    }
    if (cmd instanceof ApplySlideLayoutCmd) {
        return {
            type: "applySlideLayout",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof ResetSlideToLayoutCmd) {
        return {
            type: "resetSlideToLayout",
            payload: { slideIdx: readField(cmd, "slideIdx") },
        };
    }
    if (cmd instanceof SetShapeLockedCmd) {
        return {
            type: "setShapeLocked",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                locked: readField(cmd, "locked"),
            },
        };
    }
    if (cmd instanceof SetShapeVisibleCmd) {
        return {
            type: "setShapeVisible",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                visible: readField(cmd, "visible"),
            },
        };
    }
    if (cmd instanceof SetLineEndpointsCmd) {
        return {
            type: "setLineEndpoints",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                endpoints: readField(cmd, "endpoints"),
                bbox: readField(cmd, "bbox"),
                glue: readField(cmd, "glue"),
            },
        };
    }
    if (cmd instanceof SetPathConnectorEndsCmd) {
        return {
            type: "setPathConnectorEnds",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                bbox: readField(cmd, "bbox"),
                scaleX: readField(cmd, "scaleX"),
                scaleY: readField(cmd, "scaleY"),
                glue: readField(cmd, "glue"),
            },
        };
    }
    if (cmd instanceof ReplaceImageSrcCmd) {
        const icon = readField(cmd, "icon");
        return {
            type: "replaceImageSrc",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                src: readField(cmd, "src"),
                natural: readField(cmd, "natural") ?? null,
                ...(icon ? { svgSrc: icon.svgSrc, descr: icon.descr } : {}),
            },
        };
    }
    if (cmd instanceof SetImageDescrCmd) {
        return {
            type: "setImageDescr",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                descr: readField(cmd, "descr"),
            },
        };
    }
    if (cmd instanceof SetShapeHyperlinkCmd) {
        return {
            type: "setShapeHyperlink",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next") ?? null,
                slot: readField(cmd, "slot") ?? "click",
            },
        };
    }
    if (cmd instanceof SetMediaPropsCmd) {
        return {
            type: "setMediaProps",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof UpdateMediaSrcCmd) {
        return {
            type: "updateMediaSrc",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                nextSrc: readField(cmd, "nextSrc"),
                nextDuration: readField(cmd, "nextDuration"),
            },
        };
    }
    if (cmd instanceof UpdateOleEmbedCmd) {
        return {
            type: "updateOleEmbed",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                shapeId: readField(cmd, "shapeId"),
                fileName: readField(cmd, "fileName"),
                embedSrc: readField(cmd, "embedSrc"),
            },
        };
    }
    if (cmd instanceof SetOleShowAsIconCmd) {
        return {
            type: "setOleShowAsIcon",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                shapeId: readField(cmd, "shapeId"),
                showAsIcon: readField(cmd, "showAsIcon"),
            },
        };
    }
    if (cmd instanceof UpdateModel3DGlbCmd) {
        return {
            type: "updateModel3DGlb",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                shapeId: readField(cmd, "shapeId"),
                glbSrc: readField(cmd, "glbSrc"),
                newName: readField(cmd, "newName"),
            },
        };
    }
    if (cmd instanceof SetShapeEffectsCmd) {
        return {
            type: "setShapeEffects",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof SetShape3DCmd) {
        return {
            type: "setShape3D",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof SetTextAlignCmd) {
        return {
            type: "setTextAlign",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                align: readField(cmd, "align"),
            },
        };
    }
    if (cmd instanceof SetParagraphBulletCmd) {
        return {
            type: "setParagraphBullet",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetParagraphRtlCmd) {
        return {
            type: "setParagraphRtl",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                rtl: readField(cmd, "rtl"),
            },
        };
    }
    if (cmd instanceof SetParagraphCjkCmd) {
        return {
            type: "setParagraphCjk",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                enabled: readField(cmd, "enabled"),
            },
        };
    }
    if (cmd instanceof SetParagraphSpacingCmd) {
        return {
            type: "setParagraphSpacing",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof ChangeTextCaseCmd) {
        return {
            type: "changeTextCase",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                mode: readField(cmd, "mode"),
            },
        };
    }
    if (cmd instanceof ClearTextFormattingCmd) {
        return {
            type: "clearTextFormatting",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
            },
        };
    }
    if (cmd instanceof SetTextBodyCmd) {
        return {
            type: "setTextBody",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof SetPolygonPointsCmd) {
        return {
            type: "setPolygonPoints",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                points: readField(cmd, "points"),
                bbox: readField(cmd, "bbox"),
            },
        };
    }
    if (cmd instanceof SetPresetAdjCmd) {
        return {
            type: "setPresetAdj",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                id: readField(cmd, "id"),
                nextAdj: readField(cmd, "nextAdj"),
            },
        };
    }
    if (cmd instanceof SetSlideShowCmd) {
        return {
            type: "setSlideShow",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetSlideHfCmd) {
        return {
            type: "setSlideHf",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetDeckSectionsCmd) {
        return {
            type: "setDeckSections",
            payload: { next: readField(cmd, "next") },
        };
    }
    if (cmd instanceof SetViewGuidesCmd) {
        return {
            type: "setViewGuides",
            payload: { next: readField(cmd, "next") },
        };
    }
    if (cmd instanceof SetShowPropertiesCmd) {
        return {
            type: "setShowProperties",
            payload: { next: readField(cmd, "next") },
        };
    }
    if (cmd instanceof DuplicateSmartArtItemCmd) {
        return {
            type: "duplicateSmartArtItem",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                itemIndex: readField(cmd, "itemIndex"),
                snapshot: readField(cmd, "snapshot"),
            },
        };
    }
    if (cmd instanceof ClearSmartArtPicturesCmd) {
        return {
            type: "clearSmartArtPictures",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                groupId: readField(cmd, "groupId"),
                snapshot: readField(cmd, "snapshot"),
            },
        };
    }
    if (cmd instanceof CopyShapeAnimationsCmd) {
        return {
            type: "copyShapeAnimations",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                sourceShapeId: readField(cmd, "sourceShapeId"),
                targetShapeId: readField(cmd, "targetShapeId"),
            },
        };
    }
    if (cmd instanceof ClearInkOnSlideCmd) {
        return {
            type: "clearInkOnSlide",
            payload: { slideIdx: readField(cmd, "slideIdx") },
        };
    }
    if (cmd instanceof ApplyThemeCmd) {
        return {
            type: "applyTheme",
            payload: {
                themeId: readField(cmd, "themeId"),
                opts: readField(cmd, "opts") ?? {},
            },
        };
    }
    if (cmd instanceof ApplyCustomThemeCmd) {
        return {
            type: "applyCustomTheme",
            payload: {
                theme: readField(cmd, "theme"),
                opts: readField(cmd, "opts") ?? {},
            },
        };
    }
    if (cmd instanceof SetSlideLayoutRefCmd) {
        return {
            type: "setSlideLayoutRef",
            payload: {
                slideIdx: readField(cmd, "slideIdx"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof AddLayoutCmd) {
        return {
            type: "addLayout",
            payload: {
                masterId: readField(cmd, "masterId"),
                spec: readField(cmd, "spec"),
            },
        };
    }
    if (cmd instanceof DeleteLayoutCmd) {
        return {
            type: "deleteLayout",
            payload: {
                masterId: readField(cmd, "masterId"),
                layoutId: readField(cmd, "layoutId"),
            },
        };
    }
    if (cmd instanceof RenameLayoutCmd) {
        return {
            type: "renameLayout",
            payload: {
                masterId: readField(cmd, "masterId"),
                layoutId: readField(cmd, "layoutId"),
                nextName: readField(cmd, "nextName"),
            },
        };
    }
    if (cmd instanceof DuplicateMasterCmd) {
        return {
            type: "duplicateMaster",
            payload: {
                masterId: readField(cmd, "masterId"),
                newId: readField(cmd, "newId"),
            },
        };
    }
    if (cmd instanceof SetPlaceholderTypeCmd) {
        return {
            type: "setPlaceholderType",
            payload: {
                masterId: readField(cmd, "masterId"),
                layoutId: readField(cmd, "layoutId"),
                shapeId: readField(cmd, "shapeId"),
                nextType: readField(cmd, "nextType"),
                nextIdx: readField(cmd, "nextIdx"),
            },
        };
    }
    if (cmd instanceof SetMasterTxStylesCmd) {
        return {
            type: "setMasterTxStyles",
            payload: {
                masterId: readField(cmd, "masterId"),
                scope: readField(cmd, "scope"),
                level: readField(cmd, "level"),
                patch: readField(cmd, "patch"),
            },
        };
    }
    if (cmd instanceof SetSlideSizeCmd) {
        return {
            type: "setSlideSize",
            payload: { next: readField(cmd, "next") },
        };
    }
    if (cmd instanceof SetBackgroundTargetCmd) {
        return {
            type: "setBackgroundTarget",
            payload: {
                target: readField(cmd, "target"),
                next: readField(cmd, "next"),
            },
        };
    }
    if (cmd instanceof SetProofingLanguageCmd) {
        return {
            type: "setProofingLanguage",
            payload: { langId: readField(cmd, "langId") },
        };
    }
    if (cmd instanceof ApplyThemeVariantCmd) {
        return {
            type: "applyThemeVariant",
            payload: { variant: readField(cmd, "variant") },
        };
    }
    if (cmd instanceof SetPresentationProtectionCmd) {
        return {
            type: "setPresentationProtection",
            payload: {
                next: readField(cmd, "next"),
                officeModifyVerifier: readField(cmd, "officeModifyVerifier"),
            },
        };
    }
    if (cmd instanceof EmbedFontsCmd) {
        return {
            type: "embedFonts",
            payload: {
                additions: readField(cmd, "additions") ?? [],
                optionsPatch: readField(cmd, "optionsPatch") ?? {},
                removeFamilies: readField(cmd, "removeFamilies") ?? [],
            },
        };
    }
    if (cmd instanceof ResolveSlideCommentsCmd) {
        return {
            type: "resolveSlideComments",
            payload: {
                slideIndex: readField(cmd, "slideIndex"),
                resolved: readField(cmd, "resolved") ?? false,
            },
        };
    }
    return null;
}
export function deserializeCollabCommand(wire) {
    const p = wire.payload;
    switch (wire.type) {
        case "batch": {
            const children = p.children ?? [];
            const cmds = [];
            for (const child of children) {
                const cmd = deserializeCollabCommand(child);
                if (!cmd)
                    return null;
                cmds.push(cmd);
            }
            if (!cmds.length)
                return null;
            return new RemoteBatchCmd(String(p.label ?? "Batch"), cmds);
        }
        case "moveShape":
            return new MoveShapeCmd(Number(p.slideIdx), String(p.id), Number(p.dx), Number(p.dy));
        case "resizeShape":
            return new ResizeShapeCmd(Number(p.slideIdx), String(p.id), p.next);
        case "setShapeBbox":
            return new SetShapeBboxCmd(Number(p.slideIdx), String(p.id), p.next);
        case "editText":
            return new EditTextCmd(Number(p.slideIdx), String(p.id), p.nextParagraphs ?? []);
        case "setRichText":
            return new SetRichTextCmd(Number(p.slideIdx), String(p.id), p.nextParagraphs ?? []);
        case "setParagraphs":
            return new SetParagraphsCmd(Number(p.slideIdx), String(p.id), p.nextParagraphs ?? []);
        case "setTextStyle":
            return new SetTextStyleCmd(Number(p.slideIdx), String(p.id), p.patch ?? {}, Array.isArray(p.ranges) ? p.ranges : undefined);
        case "deleteShape":
            return new DeleteShapeCmd(Number(p.slideIdx), String(p.id), p.target);
        case "addShape":
            return new AddShapeCmd(Number(p.slideIdx), Number(p.layerIdx), p.shape, p.target);
        case "duplicateShape":
            return new DuplicateShapeCmd(Number(p.slideIdx), String(p.id), Number(p.dx ?? 16), Number(p.dy ?? 16), p.newId ? String(p.newId) : undefined);
        case "reorderShape":
            return new ReorderShapeCmd(Number(p.slideIdx), String(p.id), p.direction, p.target);
        case "groupShapes":
            return new WireGroupShapesCmd(Number(p.slideIdx), Number(p.layerIdx), p.positions ?? [], p.shapes ?? [], String(p.groupId));
        case "ungroupShapes":
            return new UngroupShapesCmd(Number(p.slideIdx), String(p.id));
        case "alignShapes":
            return new AlignShapesCmd(Number(p.slideIdx), p.ids ?? [], p.mode);
        case "distributeShapes":
            return new DistributeShapesCmd(Number(p.slideIdx), p.ids ?? [], p.axis);
        case "setFill":
            return new SetFillCmd(Number(p.slideIdx), String(p.id), p.next);
        case "setStroke":
            return new SetStrokeCmd(Number(p.slideIdx), String(p.id), p.next);
        case "setShapeRotation":
            return new SetShapeRotationCmd(Number(p.slideIdx), String(p.id), Number(p.next));
        case "setShapeOpacity":
            return new SetShapeOpacityCmd(Number(p.slideIdx), String(p.id), Number(p.next));
        case "flipShape":
            return new FlipShapeCmd(Number(p.slideIdx), String(p.id), p.axis);
        case "applyFormat":
            return new ApplyFormatCmd(Number(p.slideIdx), String(p.id), p.snapshot ?? {});
        case "setSlideBackground":
            return new SetSlideBackgroundCmd(Number(p.slideIdx), p.next);
        case "setSlideNotes":
            return new SetSlideNotesCmd(Number(p.slideIdx), p.next);
        case "setSlideTransition":
            return new SetSlideTransitionCmd(Number(p.slideIdx), p.next, Boolean(p.applyAll));
        case "addAnimEffect":
            return new AddAnimEffectCmd(Number(p.slideIdx), p.args);
        case "removeAnimEffect":
            return new RemoveAnimEffectCmd(Number(p.slideIdx), p.path);
        case "moveAnimEffect":
            return new MoveAnimEffectCmd(Number(p.slideIdx), p.path, Number(p.newIndex));
        case "setAnimEffectProp":
            return new SetAnimEffectPropCmd(Number(p.slideIdx), p.path, p.patch);
        case "addComment": {
            const comment = p.comment;
            if (!comment)
                return null;
            return new AddCommentCmd(comment);
        }
        case "editComment":
            return new EditCommentCmd(String(p.commentId), String(p.nextText), "");
        case "resolveComment":
            return new ResolveCommentCmd(String(p.commentId), Boolean(p.resolved), !p.resolved);
        case "deleteComment": {
            const snapshots = p.snapshots ?? [];
            if (!snapshots.length)
                return null;
            return new WireDeleteCommentsCmd(snapshots);
        }
        case "insertSlide":
            return new InsertSlideCmd(Number(p.idx), p.slide);
        case "deleteSlide":
            return new DeleteSlideCmd(Number(p.idx));
        case "deleteSlides":
            return new DeleteSlidesCmd(p.indices ?? []);
        case "moveSlide":
            return new MoveSlideCmd(Number(p.from), Number(p.to));
        case "duplicateSlide":
            return new DuplicateSlideCmd(Number(p.idx));
        case "rebuildSmartArt": {
            const items = p.items ?? [];
            const layout = p.layout;
            return new WireRebuildSmartArtCmd(Number(p.slideIdx), String(p.groupId), items, layout);
        }
        case "addSmartArtItem":
            return new AddSmartArtItemCmd(Number(p.slideIdx), String(p.groupId), p.snapshot ?? []);
        case "removeSmartArtItem":
            return new RemoveSmartArtItemCmd(Number(p.slideIdx), String(p.groupId), p.snapshot ?? [], p.itemIndex !== undefined ? Number(p.itemIndex) : undefined);
        case "moveSmartArtItem":
            return new MoveSmartArtItemCmd(Number(p.slideIdx), String(p.groupId), Number(p.itemIndex), Number(p.direction), p.snapshot ?? []);
        case "setSmartArtItemLevel":
            return new SetSmartArtItemLevelCmd(Number(p.slideIdx), String(p.groupId), Number(p.itemIndex), Number(p.delta), p.snapshot ?? []);
        case "convertToSmartArt":
            return new WireConvertSmartArtCmd(Number(p.slideIdx), Number(p.layerIdx), Number(p.index), p.group, p.removedShapeId ? String(p.removedShapeId) : undefined);
        case "insertTableRow":
            return new InsertTableRowCmd(Number(p.slideIdx), String(p.groupId), Number(p.afterRow));
        case "insertTableColumn":
            return new InsertTableColumnCmd(Number(p.slideIdx), String(p.groupId), Number(p.afterCol));
        case "removeTableRow":
            return new RemoveTableRowCmd(Number(p.slideIdx), String(p.groupId), Number(p.rowIdx));
        case "removeTableColumn":
            return new RemoveTableColumnCmd(Number(p.slideIdx), String(p.groupId), Number(p.colIdx));
        case "mergeTableCells":
            return new MergeTableCellsCmd(Number(p.slideIdx), String(p.groupId), Number(p.startRow), Number(p.startCol), Number(p.endRow), Number(p.endCol));
        case "unmergeTableCells":
            return new UnmergeTableCellsCmd(Number(p.slideIdx), String(p.groupId), Number(p.row), Number(p.col));
        case "setTableCellStyle":
            return new SetTableCellStyleCmd(Number(p.slideIdx), String(p.groupId), Number(p.row), Number(p.col), p.patch ?? {});
        case "setChartDef":
            return new SetChartDefCmd(Number(p.slideIdx), String(p.id), p.next);
        case "setCropFrame": {
            const nextBbox = p.nextBbox;
            const nextCrop = p.nextCrop;
            if (!nextBbox || !nextCrop)
                return null;
            return new SetCropFrameCmd(Number(p.slideIdx), String(p.id), nextBbox, nextCrop);
        }
        case "setImageCrop":
            return new SetImageCropCmd(Number(p.slideIdx), String(p.id), p.crop ?? null);
        case "setCommentAnchor": {
            const next = p.next;
            if (!next)
                return null;
            return new SetCommentAnchorCmd(String(p.commentId), next, p.prev ?? {});
        }
        case "applySlideLayout": {
            const next = p.next;
            if (!next?.masterId || !next?.layoutId)
                return null;
            return new ApplySlideLayoutCmd(Number(p.slideIdx), next);
        }
        case "resetSlideToLayout":
            return new ResetSlideToLayoutCmd(Number(p.slideIdx));
        case "setShapeLocked":
            return new SetShapeLockedCmd(Number(p.slideIdx), String(p.id), Boolean(p.locked));
        case "setShapeVisible":
            return new SetShapeVisibleCmd(Number(p.slideIdx), String(p.id), Boolean(p.visible));
        case "setLineEndpoints": {
            const endpoints = p.endpoints;
            const bbox = p.bbox;
            if (!endpoints || !bbox)
                return null;
            return new SetLineEndpointsCmd(Number(p.slideIdx), String(p.id), endpoints, bbox, p.glue);
        }
        case "setPathConnectorEnds": {
            const bbox = p.bbox;
            if (!bbox)
                return null;
            return new SetPathConnectorEndsCmd(Number(p.slideIdx), String(p.id), bbox, Number(p.scaleX), Number(p.scaleY), p.glue);
        }
        case "replaceImageSrc": {
            const natural = p.natural;
            const size = natural && typeof natural.w === "number" && typeof natural.h === "number"
                ? { w: natural.w, h: natural.h }
                : undefined;
            const svgSrc = typeof p.svgSrc === "string" ? p.svgSrc : "";
            const descr = typeof p.descr === "string" ? p.descr : "";
            const icon = svgSrc && descr ? { svgSrc, descr } : undefined;
            return new ReplaceImageSrcCmd(Number(p.slideIdx), String(p.id), String(p.src ?? ""), size, icon);
        }
        case "setImageDescr":
            return new SetImageDescrCmd(Number(p.slideIdx), String(p.id), String(p.descr ?? ""));
        case "setShapeHyperlink": {
            const next = p.next;
            const slot = p.slot === "hover" ? "hover" : "click";
            return new SetShapeHyperlinkCmd(Number(p.slideIdx), String(p.id), next ?? undefined, slot);
        }
        case "setMediaProps":
            return new SetMediaPropsCmd(Number(p.slideIdx), String(p.id), p.patch ?? {});
        case "updateMediaSrc":
            return new UpdateMediaSrcCmd(Number(p.slideIdx), String(p.id), String(p.nextSrc ?? ""), p.nextDuration !== undefined ? Number(p.nextDuration) : undefined);
        case "updateOleEmbed":
            return new UpdateOleEmbedCmd(Number(p.slideIdx), String(p.shapeId), String(p.fileName ?? ""), String(p.embedSrc ?? ""));
        case "setOleShowAsIcon":
            return new SetOleShowAsIconCmd(Number(p.slideIdx), String(p.shapeId), Boolean(p.showAsIcon));
        case "updateModel3DGlb":
            return new UpdateModel3DGlbCmd(Number(p.slideIdx), String(p.shapeId), String(p.glbSrc ?? ""), p.newName ? String(p.newName) : undefined);
        case "setShapeEffects":
            return new SetShapeEffectsCmd(Number(p.slideIdx), String(p.id), p.patch ?? {});
        case "setShape3D":
            return new SetShape3DCmd(Number(p.slideIdx), String(p.id), p.patch ?? {});
        case "setTextAlign":
            return new SetTextAlignCmd(Number(p.slideIdx), String(p.id), p.align);
        case "setParagraphBullet":
            return new SetParagraphBulletCmd(Number(p.slideIdx), String(p.id), p.next);
        case "setParagraphRtl":
            return new SetParagraphRtlCmd(Number(p.slideIdx), String(p.id), Boolean(p.rtl));
        case "setParagraphCjk":
            return new SetParagraphCjkCmd(Number(p.slideIdx), String(p.id), Boolean(p.enabled));
        case "setParagraphSpacing":
            return new SetParagraphSpacingCmd(Number(p.slideIdx), String(p.id), p.patch ?? {});
        case "changeTextCase":
            return new ChangeTextCaseCmd(Number(p.slideIdx), String(p.id), p.mode);
        case "clearTextFormatting":
            return new ClearTextFormattingCmd(Number(p.slideIdx), String(p.id));
        case "setTextBody":
            return new SetTextBodyCmd(Number(p.slideIdx), String(p.id), p.patch ?? {});
        case "setPolygonPoints":
            return new SetPolygonPointsCmd(Number(p.slideIdx), String(p.id), p.points ?? [], p.bbox ?? { x: 0, y: 0, w: 0, h: 0 });
        case "setPresetAdj":
            return new SetPresetAdjCmd(Number(p.slideIdx), String(p.id), p.nextAdj ?? {});
        case "setSlideShow":
            return new SetSlideShowCmd(Number(p.slideIdx), Boolean(p.next));
        case "setSlideHf":
            return new SetSlideHfCmd(Number(p.slideIdx), p.next);
        case "setDeckSections":
            return new SetDeckSectionsCmd(p.next ?? []);
        case "setViewGuides":
            return new SetViewGuidesCmd(p.next);
        case "setShowProperties":
            return new SetShowPropertiesCmd(p.next);
        case "duplicateSmartArtItem":
            return new DuplicateSmartArtItemCmd(Number(p.slideIdx), String(p.groupId), Number(p.itemIndex), p.snapshot ?? []);
        case "clearSmartArtPictures":
            return new ClearSmartArtPicturesCmd(Number(p.slideIdx), String(p.groupId), p.snapshot ?? []);
        case "copyShapeAnimations":
            return new CopyShapeAnimationsCmd(Number(p.slideIdx), String(p.sourceShapeId), String(p.targetShapeId));
        case "clearInkOnSlide":
            return new ClearInkOnSlideCmd(Number(p.slideIdx));
        case "applyTheme":
            return new ApplyThemeCmd(String(p.themeId ?? ""), p.opts ?? {});
        case "applyCustomTheme": {
            const theme = p.theme;
            if (!theme)
                return null;
            return new ApplyCustomThemeCmd(theme, p.opts ?? {});
        }
        case "setSlideLayoutRef":
            return new SetSlideLayoutRefCmd(Number(p.slideIdx), p.next);
        case "addLayout": {
            const spec = p.spec;
            if (!spec)
                return null;
            return new AddLayoutCmd(String(p.masterId ?? ""), spec);
        }
        case "deleteLayout":
            return new DeleteLayoutCmd(String(p.masterId ?? ""), String(p.layoutId ?? ""));
        case "renameLayout":
            return new RenameLayoutCmd(String(p.masterId ?? ""), String(p.layoutId ?? ""), String(p.nextName ?? ""));
        case "duplicateMaster":
            return new DuplicateMasterCmd(String(p.masterId ?? ""), String(p.newId ?? ""));
        case "setPlaceholderType":
            return new SetPlaceholderTypeCmd(String(p.masterId ?? ""), p.layoutId === undefined ? undefined : String(p.layoutId), String(p.shapeId ?? ""), String(p.nextType ?? ""), p.nextIdx);
        case "setMasterTxStyles":
            return new SetMasterTxStylesCmd(String(p.masterId ?? ""), p.scope ?? "body", Number(p.level ?? 0), p.patch ?? {});
        case "setSlideSize": {
            const next = p.next;
            if (!next || typeof next.width !== "number" || typeof next.height !== "number")
                return null;
            return new SetSlideSizeCmd(next);
        }
        case "setBackgroundTarget": {
            const target = p.target;
            if (!target || typeof target !== "object" || !("kind" in target))
                return null;
            return new SetBackgroundTargetCmd(target, p.next);
        }
        case "setProofingLanguage":
            return new SetProofingLanguageCmd(String(p.langId ?? ""));
        case "applyThemeVariant": {
            const variant = p.variant;
            if (variant !== "subtle" && variant !== "bold" && variant !== "warm" && variant !== "cool")
                return null;
            return new ApplyThemeVariantCmd(variant);
        }
        case "setPresentationProtection":
            return new SetPresentationProtectionCmd(p.next, undefined, p.officeModifyVerifier);
        case "embedFonts":
            return new EmbedFontsCmd(p.additions ?? [], p.optionsPatch ?? {}, p.removeFamilies ?? []);
        case "resolveSlideComments":
            return new ResolveSlideCommentsCmd(Number(p.slideIndex ?? 0), Boolean(p.resolved));
        default:
            return null;
    }
}
