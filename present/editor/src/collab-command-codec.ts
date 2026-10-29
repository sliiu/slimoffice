import type {
  BulletDef,
  ChartDef,
  DeckComment,
  DeckSection,
  ViewGuides,
  ShowProperties,
  EditCommand,
  EmbeddedFont,
  HeaderFooter,
  ModifyVerifier,
  HyperlinkRef,
  Paint,
  Presentation,
  Rect,
  PresentationOptions,
  PresentationProtection,
  Shape,
  ShapeCxnEnd,
  Slide,
  SlideLayoutRef,
  SlideSize,
  SlideTransition,
  SmartArtItem,
  SmartArtLayoutKind,
  TextParagraph,
} from "@ppt/core";
import { rebuildSmartArtChildren } from "@ppt/core";
import {
  ApplyCustomThemeCmd,
  ApplyThemeCmd,
  type ApplyCustomThemeOpts,
  type ApplyThemeOpts,
  type ThemeDef,
} from "@ppt/themes";
import {
  AddLayoutCmd,
  DeleteLayoutCmd,
  DuplicateMasterCmd,
  RenameLayoutCmd,
  SetMasterTxStylesCmd,
  SetPlaceholderTypeCmd,
  SetSlideLayoutRefCmd,
  type LevelStylePatch,
  type TxStyleScope,
} from "./master-commands";
import {
  AddAnimEffectCmd,
  CopyShapeAnimationsCmd,
  MoveAnimEffectCmd,
  RemoveAnimEffectCmd,
  SetAnimEffectPropCmd,
} from "./animation/commands";
import {
  AddCommentCmd,
  DeleteCommentCmd,
  EditCommentCmd,
  ResolveCommentCmd,
  ResolveSlideCommentsCmd,
  SetCommentAnchorCmd,
} from "./comment-commands";
import {
  AddShapeCmd,
  DuplicateShapeCmd,
  AlignShapesCmd,
  ApplyFormatCmd,
  DeleteShapeCmd,
  DistributeShapesCmd,
  EditTextCmd,
  FlipShapeCmd,
  GroupShapesCmd,
  InsertTableColumnCmd,
  InsertTableRowCmd,
  MergeTableCellsCmd,
  MoveShapeCmd,
  RemoveTableColumnCmd,
  RemoveTableRowCmd,
  SetTableCellStyleCmd,
  UnmergeTableCellsCmd,
  ReorderShapeCmd,
  ResizeShapeCmd,
  ChangeTextCaseCmd,
  ClearTextFormattingCmd,
  SetChartDefCmd,
  SetFillCmd,
  SetImageCropCmd,
  SetCropFrameCmd,
  SetImageDescrCmd,
  ReplaceImageSrcCmd,
  SetShapeHyperlinkCmd,
  SetLineEndpointsCmd,
  SetMediaPropsCmd,
  SetParagraphBulletCmd,
  SetParagraphCjkCmd,
  SetParagraphRtlCmd,
  SetParagraphSpacingCmd,
  SetParagraphsCmd,
  SetPathConnectorEndsCmd,
  SetPolygonPointsCmd,
  SetPresetAdjCmd,
  SetRichTextCmd,
  SetShape3DCmd,
  SetShapeBboxCmd,
  SetShapeEffectsCmd,
  SetShapeLockedCmd,
  SetShapeOpacityCmd,
  SetShapeRotationCmd,
  SetShapeVisibleCmd,
  SetBackgroundTargetCmd,
  SetSlideBackgroundCmd,
  SetSlideHfCmd,
  SetSlideSizeCmd,
  SetSlideNotesCmd,
  SetSlideShowCmd,
  SetSlideTransitionCmd,
  SetStrokeCmd,
  SetTextAlignCmd,
  SetTextBodyCmd,
  SetTextStyleCmd,
  UngroupShapesCmd,
  UpdateMediaSrcCmd,
  type FormatSnapshot,
  type MediaPropsPatch,
  type ParagraphSpacingPatch,
  type RichParagraph,
  type Shape3DPatch,
  type ShapeEffectsPatch,
  type TableCellStylePatch,
  type TextBodyPatch,
  type TextCaseMode,
  type EditTarget,
  type TextStylePatch,
} from "./commands";
import {
  DeleteSlideCmd,
  DeleteSlidesCmd,
  DuplicateSlideCmd,
  InsertSlideCmd,
  MoveSlideCmd,
} from "./slide-commands";
import { ApplySlideLayoutCmd, ResetSlideToLayoutCmd } from "./slide-layout-commands";
import { InsertModel3DCmd, UpdateModel3DGlbCmd } from "./model3d-cmd";
import { InsertOleCmd, SetOleShowAsIconCmd, UpdateOleEmbedCmd } from "./ole-cmd";
import { InsertWebEmbedCmd } from "./web-embed-cmd";
import { EmbedFontsCmd } from "./embed-fonts-cmd";
import { ClearInkOnSlideCmd } from "./ink-commands";
import { SetPresentationProtectionCmd } from "./protection-cmd";
import { SetProofingLanguageCmd } from "./proofing-language-cmd";
import { ApplyThemeVariantCmd } from "./theme-variant-cmd";
import type { ThemeVariantId } from "./theme-variants";
import { SetDeckSectionsCmd } from "./section-commands";
import { SetViewGuidesCmd, SetShowPropertiesCmd } from "./view-show-commands";
import { findShape } from "./selection";
import {
  AddSmartArtItemCmd,
  ClearSmartArtPicturesCmd,
  ConvertToSmartArtCmd,
  DuplicateSmartArtItemCmd,
  MoveSmartArtItemCmd,
  RebuildSmartArtCmd,
  RemoveSmartArtItemCmd,
  SetSmartArtItemLevelCmd,
  SetSmartArtLayoutCmd,
  UpdateSmartArtItemsCmd,
} from "./smartart-commands";

export interface CollabCommandWire {
  type: string;
  payload: unknown;
}

type AnyCmd = EditCommand & Record<string, unknown>;

type ImageCropRect = { l: number; t: number; r: number; b: number };
type ConnectorGlue = { startCxn?: ShapeCxnEnd | null; endCxn?: ShapeCxnEnd | null };
type LineEndpoints = { x1: number; y1: number; x2: number; y2: number };

function readField<T>(cmd: EditCommand, key: string): T | undefined {
  const v = (cmd as AnyCmd)[key];
  return v as T | undefined;
}

function isBatch(cmd: EditCommand): cmd is EditCommand & { cmds: EditCommand[] } {
  const cmds = readField<EditCommand[]>(cmd, "cmds");
  return Array.isArray(cmds) && cmds.length > 0;
}

function unionBbox(boxes: Rect[]): Rect {
  if (!boxes.length) return { x: 0, y: 0, w: 0, h: 0 };
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

class RemoteBatchCmd implements EditCommand {
  readonly label: string;
  constructor(
    label: string,
    private readonly children: EditCommand[],
  ) {
    this.label = label;
  }
  apply(pres: Presentation): void {
    for (const c of this.children) c.apply(pres);
  }
  revert(pres: Presentation): void {
    for (let i = this.children.length - 1; i >= 0; i--) this.children[i]!.revert(pres);
  }
}

/** Remote group: uses the originating client's groupId so both sides stay aligned. */
class WireGroupShapesCmd implements EditCommand {
  readonly label = "Group";
  constructor(
    private readonly slideIdx: number,
    private readonly layerIdx: number,
    private readonly positions: number[],
    private readonly shapes: Shape[],
    private readonly groupId: string,
  ) {}

  apply(pres: Presentation): void {
    const layer = pres.slides[this.slideIdx]?.layers[this.layerIdx];
    if (!layer) return;
    const arr = layer.shapes;
    const ids = new Set(this.shapes.map((s) => s.id));
    for (let i = arr.length - 1; i >= 0; i--) {
      if (ids.has(arr[i]!.id)) arr.splice(i, 1);
    }
    const bbox = unionBbox(this.shapes.map((s) => s.bbox));
    const group: Shape = {
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
    } as Shape;
    arr.splice(Math.min(...this.positions), 0, group);
  }

  revert(_pres: Presentation): void {
    // remote-only apply path
  }
}

class WireDeleteCommentsCmd implements EditCommand {
  readonly label = "Delete comment";
  constructor(private readonly snapshots: DeckComment[]) {}

  apply(pres: Presentation): void {
    if (!pres.comments?.length) return;
    const ids = new Set(this.snapshots.map((c) => c.id));
    pres.comments = pres.comments.filter((c) => !ids.has(c.id));
    if (!pres.comments.length) pres.comments = undefined;
  }

  revert(_pres: Presentation): void {
    // remote-only apply path
  }
}

function getSmartArtGroup(pres: Presentation, slideIdx: number, groupId: string) {
  const slide = pres.slides[slideIdx];
  if (!slide) return null;
  const sh = findShape(slide, groupId);
  if (!sh || sh.kind !== "group" || !sh.smartArtMeta) return null;
  return sh;
}

/** Remote SmartArt rebuild: applies absolute item list (+ optional layout). */
class WireRebuildSmartArtCmd implements EditCommand {
  readonly label = "Update diagram";
  constructor(
    private readonly slideIdx: number,
    private readonly groupId: string,
    private readonly items: SmartArtItem[],
    private readonly layout?: SmartArtLayoutKind,
  ) {}

  apply(pres: Presentation): void {
    const g = getSmartArtGroup(pres, this.slideIdx, this.groupId);
    if (!g) return;
    if (this.layout) g.smartArtMeta = { layout: this.layout };
    rebuildSmartArtChildren(g, this.items, g.smartArtMeta?.layout);
  }

  revert(_pres: Presentation): void {
    // remote-only apply path
  }
}

/** Remote convert: splices the originating client's SmartArt group (stable groupId). */
class WireConvertSmartArtCmd implements EditCommand {
  readonly label = "Convert to diagram";
  constructor(
    private readonly slideIdx: number,
    private readonly layerIdx: number,
    private readonly index: number,
    private readonly group: Shape,
    private readonly removedShapeId?: string,
  ) {}

  apply(pres: Presentation): void {
    const layer = pres.slides[this.slideIdx]?.layers[this.layerIdx];
    if (!layer) return;
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

  revert(_pres: Presentation): void {
    // remote-only apply path
  }
}

export function serializeCollabCommand(cmd: EditCommand): CollabCommandWire | null {
  if (isBatch(cmd)) {
    const children: CollabCommandWire[] = [];
    for (const child of cmd.cmds) {
      const wire = serializeCollabCommand(child);
      if (!wire) return null;
      children.push(wire);
    }
    return { type: "batch", payload: { label: cmd.label, children } };
  }

  if (cmd instanceof MoveShapeCmd) {
    return {
      type: "moveShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        dx: readField<number>(cmd, "dx"),
        dy: readField<number>(cmd, "dy"),
      },
    };
  }
  if (cmd instanceof ResizeShapeCmd) {
    return {
      type: "resizeShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<Rect>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetShapeBboxCmd) {
    return {
      type: "setShapeBbox",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<Rect>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof EditTextCmd) {
    return {
      type: "editText",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        nextParagraphs: readField<string[]>(cmd, "nextParagraphs"),
      },
    };
  }
  if (cmd instanceof SetRichTextCmd) {
    return {
      type: "setRichText",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        nextParagraphs: readField<RichParagraph[]>(cmd, "nextParagraphs"),
      },
    };
  }
  if (cmd instanceof SetParagraphsCmd) {
    return {
      type: "setParagraphs",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        nextParagraphs: readField<TextParagraph[]>(cmd, "nextParagraphs"),
      },
    };
  }
  if (cmd instanceof SetTextStyleCmd) {
    return {
      type: "setTextStyle",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        patch: readField<TextStylePatch>(cmd, "patch"),
        ranges: readField(cmd, "ranges"),
      },
    };
  }
  if (cmd instanceof DeleteShapeCmd) {
    return {
      type: "deleteShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        target: readField(cmd, "target"),
      },
    };
  }
  if (cmd instanceof AddShapeCmd) {
    return {
      type: "addShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        layerIdx: readField<number>(cmd, "layerIdx"),
        shape: readField<Shape>(cmd, "shape"),
        target: readField(cmd, "target"),
      },
    };
  }
  if (cmd instanceof DuplicateShapeCmd) {
    return {
      type: "duplicateShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        dx: readField<number>(cmd, "dx") ?? 16,
        dy: readField<number>(cmd, "dy") ?? 16,
        newId: readField<string>(cmd, "newId"),
      },
    };
  }
  if (
    cmd instanceof InsertOleCmd ||
    cmd instanceof InsertModel3DCmd ||
    cmd instanceof InsertWebEmbedCmd
  ) {
    return {
      type: "addShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        layerIdx: readField<number>(cmd, "layerIdx"),
        shape: cmd.shape,
      },
    };
  }
  if (cmd instanceof ReorderShapeCmd) {
    return {
      type: "reorderShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        direction: readField<string>(cmd, "direction"),
        target: readField(cmd, "target"),
      },
    };
  }
  if (cmd instanceof GroupShapesCmd) {
    const snapshot = readField<{
      layerIdx: number;
      positions: number[];
      shapes: Shape[];
      groupId: string;
    }>(cmd, "snapshot");
    if (!snapshot) return null;
    return {
      type: "groupShapes",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        ...snapshot,
      },
    };
  }
  if (cmd instanceof UngroupShapesCmd) {
    return {
      type: "ungroupShapes",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
      },
    };
  }
  if (cmd instanceof AlignShapesCmd) {
    return {
      type: "alignShapes",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        ids: readField<string[]>(cmd, "ids"),
        mode: readField<string>(cmd, "mode"),
      },
    };
  }
  if (cmd instanceof DistributeShapesCmd) {
    return {
      type: "distributeShapes",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        ids: readField<string[]>(cmd, "ids"),
        axis: readField<string>(cmd, "axis"),
      },
    };
  }
  if (cmd instanceof SetFillCmd) {
    return {
      type: "setFill",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<Paint | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetStrokeCmd) {
    return {
      type: "setStroke",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetShapeRotationCmd) {
    return {
      type: "setShapeRotation",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<number>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetShapeOpacityCmd) {
    return {
      type: "setShapeOpacity",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<number>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof FlipShapeCmd) {
    return {
      type: "flipShape",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        axis: readField<string>(cmd, "axis"),
      },
    };
  }
  if (cmd instanceof ApplyFormatCmd) {
    return {
      type: "applyFormat",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        snapshot: readField<FormatSnapshot>(cmd, "snapshot"),
      },
    };
  }
  if (cmd instanceof SetSlideBackgroundCmd) {
    return {
      type: "setSlideBackground",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<Paint | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetSlideNotesCmd) {
    return {
      type: "setSlideNotes",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<string | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetSlideTransitionCmd) {
    return {
      type: "setSlideTransition",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<SlideTransition | undefined>(cmd, "next"),
        applyAll: readField<boolean>(cmd, "applyAll"),
      },
    };
  }
  if (cmd instanceof AddAnimEffectCmd) {
    return {
      type: "addAnimEffect",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        args: readField(cmd, "args"),
      },
    };
  }
  if (cmd instanceof RemoveAnimEffectCmd) {
    return {
      type: "removeAnimEffect",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        path: readField(cmd, "path"),
      },
    };
  }
  if (cmd instanceof MoveAnimEffectCmd) {
    return {
      type: "moveAnimEffect",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        path: readField(cmd, "path"),
        newIndex: readField<number>(cmd, "newIndex"),
      },
    };
  }
  if (cmd instanceof SetAnimEffectPropCmd) {
    return {
      type: "setAnimEffectProp",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        path: readField(cmd, "path"),
        patch: readField(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof AddCommentCmd) {
    return {
      type: "addComment",
      payload: { comment: readField<DeckComment>(cmd, "comment") },
    };
  }
  if (cmd instanceof EditCommentCmd) {
    return {
      type: "editComment",
      payload: {
        commentId: readField<string>(cmd, "commentId"),
        nextText: readField<string>(cmd, "nextText"),
      },
    };
  }
  if (cmd instanceof ResolveCommentCmd) {
    return {
      type: "resolveComment",
      payload: {
        commentId: readField<string>(cmd, "commentId"),
        resolved: readField<boolean>(cmd, "resolved"),
      },
    };
  }
  if (cmd instanceof DeleteCommentCmd) {
    return {
      type: "deleteComment",
      payload: {
        snapshots: readField<DeckComment[]>(cmd, "snapshots"),
      },
    };
  }
  if (cmd instanceof InsertSlideCmd) {
    return {
      type: "insertSlide",
      payload: {
        idx: readField<number>(cmd, "idx"),
        slide: readField<Slide>(cmd, "slide"),
      },
    };
  }
  if (cmd instanceof DeleteSlideCmd) {
    return {
      type: "deleteSlide",
      payload: { idx: readField<number>(cmd, "idx") },
    };
  }
  if (cmd instanceof DeleteSlidesCmd) {
    return {
      type: "deleteSlides",
      payload: { indices: readField<number[]>(cmd, "indices") },
    };
  }
  if (cmd instanceof MoveSlideCmd) {
    return {
      type: "moveSlide",
      payload: {
        from: readField<number>(cmd, "from"),
        to: readField<number>(cmd, "to"),
      },
    };
  }
  if (cmd instanceof DuplicateSlideCmd) {
    return {
      type: "duplicateSlide",
      payload: { idx: readField<number>(cmd, "idx") },
    };
  }

  if (cmd instanceof UpdateSmartArtItemsCmd || cmd instanceof RebuildSmartArtCmd) {
    return {
      type: "rebuildSmartArt",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        items: readField<SmartArtItem[]>(cmd, "nextItems"),
        layout:
          cmd instanceof RebuildSmartArtCmd
            ? readField<SmartArtLayoutKind>(cmd, "nextLayout")
            : undefined,
      },
    };
  }
  if (cmd instanceof SetSmartArtLayoutCmd) {
    return {
      type: "rebuildSmartArt",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        items: readField<SmartArtItem[]>(cmd, "itemsSnapshot"),
        layout: readField<SmartArtLayoutKind>(cmd, "layout"),
      },
    };
  }
  if (cmd instanceof AddSmartArtItemCmd) {
    return {
      type: "addSmartArtItem",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        snapshot: readField<SmartArtItem[]>(cmd, "snapshot"),
      },
    };
  }
  if (cmd instanceof RemoveSmartArtItemCmd) {
    return {
      type: "removeSmartArtItem",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        snapshot: readField<SmartArtItem[]>(cmd, "snapshot"),
        itemIndex: readField<number>(cmd, "itemIndex"),
      },
    };
  }
  if (cmd instanceof MoveSmartArtItemCmd) {
    return {
      type: "moveSmartArtItem",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        itemIndex: readField<number>(cmd, "itemIndex"),
        direction: readField<-1 | 1>(cmd, "direction"),
        snapshot: readField<SmartArtItem[]>(cmd, "snapshot"),
      },
    };
  }
  if (cmd instanceof SetSmartArtItemLevelCmd) {
    return {
      type: "setSmartArtItemLevel",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        itemIndex: readField<number>(cmd, "itemIndex"),
        delta: readField<-1 | 1>(cmd, "delta"),
        snapshot: readField<SmartArtItem[]>(cmd, "snapshot"),
      },
    };
  }
  if (cmd instanceof ConvertToSmartArtCmd) {
    const inserted = readField<{ layerIdx: number; index: number; group: Shape }>(cmd, "inserted");
    if (!inserted) return null;
    return {
      type: "convertToSmartArt",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        removedShapeId: readField<string>(cmd, "shapeId"),
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
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        afterRow: readField<number>(cmd, "afterRow"),
      },
    };
  }
  if (cmd instanceof InsertTableColumnCmd) {
    return {
      type: "insertTableColumn",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        afterCol: readField<number>(cmd, "afterCol"),
      },
    };
  }
  if (cmd instanceof RemoveTableRowCmd) {
    return {
      type: "removeTableRow",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        rowIdx: readField<number>(cmd, "rowIdx"),
      },
    };
  }
  if (cmd instanceof RemoveTableColumnCmd) {
    return {
      type: "removeTableColumn",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        colIdx: readField<number>(cmd, "colIdx"),
      },
    };
  }
  if (cmd instanceof MergeTableCellsCmd) {
    return {
      type: "mergeTableCells",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        startRow: readField<number>(cmd, "startRow"),
        startCol: readField<number>(cmd, "startCol"),
        endRow: readField<number>(cmd, "endRow"),
        endCol: readField<number>(cmd, "endCol"),
      },
    };
  }
  if (cmd instanceof UnmergeTableCellsCmd) {
    return {
      type: "unmergeTableCells",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        row: readField<number>(cmd, "row"),
        col: readField<number>(cmd, "col"),
      },
    };
  }
  if (cmd instanceof SetTableCellStyleCmd) {
    return {
      type: "setTableCellStyle",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        row: readField<number>(cmd, "row"),
        col: readField<number>(cmd, "col"),
        patch: readField<TableCellStylePatch>(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof SetChartDefCmd) {
    return {
      type: "setChartDef",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<ChartDef>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetCropFrameCmd) {
    return {
      type: "setCropFrame",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        nextBbox: readField<Rect>(cmd, "nextBbox"),
        nextCrop: readField<ImageCropRect>(cmd, "nextCrop"),
      },
    };
  }
  if (cmd instanceof SetImageCropCmd) {
    return {
      type: "setImageCrop",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        crop: readField<ImageCropRect | null>(cmd, "crop") ?? null,
      },
    };
  }
  if (cmd instanceof SetCommentAnchorCmd) {
    return {
      type: "setCommentAnchor",
      payload: {
        commentId: readField<string>(cmd, "commentId"),
        next: readField<{ x: number; y: number }>(cmd, "next"),
        prev: readField<{ x?: number; y?: number }>(cmd, "prev"),
      },
    };
  }
  if (cmd instanceof ApplySlideLayoutCmd) {
    return {
      type: "applySlideLayout",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<SlideLayoutRef>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof ResetSlideToLayoutCmd) {
    return {
      type: "resetSlideToLayout",
      payload: { slideIdx: readField<number>(cmd, "slideIdx") },
    };
  }
  if (cmd instanceof SetShapeLockedCmd) {
    return {
      type: "setShapeLocked",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        locked: readField<boolean>(cmd, "locked"),
      },
    };
  }
  if (cmd instanceof SetShapeVisibleCmd) {
    return {
      type: "setShapeVisible",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        visible: readField<boolean>(cmd, "visible"),
      },
    };
  }
  if (cmd instanceof SetLineEndpointsCmd) {
    return {
      type: "setLineEndpoints",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        endpoints: readField<LineEndpoints>(cmd, "endpoints"),
        bbox: readField<Rect>(cmd, "bbox"),
        glue: readField<ConnectorGlue>(cmd, "glue"),
      },
    };
  }
  if (cmd instanceof SetPathConnectorEndsCmd) {
    return {
      type: "setPathConnectorEnds",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        bbox: readField<Rect>(cmd, "bbox"),
        scaleX: readField<number>(cmd, "scaleX"),
        scaleY: readField<number>(cmd, "scaleY"),
        glue: readField<ConnectorGlue>(cmd, "glue"),
      },
    };
  }

  if (cmd instanceof ReplaceImageSrcCmd) {
    const icon = readField<{ svgSrc: string; descr: string }>(cmd, "icon");
    return {
      type: "replaceImageSrc",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        src: readField<string>(cmd, "src"),
        natural: readField<{ w: number; h: number } | undefined>(cmd, "natural") ?? null,
        ...(icon ? { svgSrc: icon.svgSrc, descr: icon.descr } : {}),
      },
    };
  }
  if (cmd instanceof SetImageDescrCmd) {
    return {
      type: "setImageDescr",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        descr: readField<string>(cmd, "descr"),
      },
    };
  }
  if (cmd instanceof SetShapeHyperlinkCmd) {
    return {
      type: "setShapeHyperlink",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<HyperlinkRef | undefined>(cmd, "next") ?? null,
        slot: readField<string>(cmd, "slot") ?? "click",
      },
    };
  }
  if (cmd instanceof SetMediaPropsCmd) {
    return {
      type: "setMediaProps",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        patch: readField<MediaPropsPatch>(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof UpdateMediaSrcCmd) {
    return {
      type: "updateMediaSrc",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        nextSrc: readField<string>(cmd, "nextSrc"),
        nextDuration: readField<number>(cmd, "nextDuration"),
      },
    };
  }
  if (cmd instanceof UpdateOleEmbedCmd) {
    return {
      type: "updateOleEmbed",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        shapeId: readField<string>(cmd, "shapeId"),
        fileName: readField<string>(cmd, "fileName"),
        embedSrc: readField<string>(cmd, "embedSrc"),
      },
    };
  }
  if (cmd instanceof SetOleShowAsIconCmd) {
    return {
      type: "setOleShowAsIcon",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        shapeId: readField<string>(cmd, "shapeId"),
        showAsIcon: readField<boolean>(cmd, "showAsIcon"),
      },
    };
  }
  if (cmd instanceof UpdateModel3DGlbCmd) {
    return {
      type: "updateModel3DGlb",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        shapeId: readField<string>(cmd, "shapeId"),
        glbSrc: readField<string>(cmd, "glbSrc"),
        newName: readField<string>(cmd, "newName"),
      },
    };
  }
  if (cmd instanceof SetShapeEffectsCmd) {
    return {
      type: "setShapeEffects",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        patch: readField<ShapeEffectsPatch>(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof SetShape3DCmd) {
    return {
      type: "setShape3D",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        patch: readField<Shape3DPatch>(cmd, "patch"),
      },
    };
  }

  if (cmd instanceof SetTextAlignCmd) {
    return {
      type: "setTextAlign",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        align: readField<TextParagraph["align"]>(cmd, "align"),
      },
    };
  }
  if (cmd instanceof SetParagraphBulletCmd) {
    return {
      type: "setParagraphBullet",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        next: readField<BulletDef | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetParagraphRtlCmd) {
    return {
      type: "setParagraphRtl",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        rtl: readField<boolean>(cmd, "rtl"),
      },
    };
  }
  if (cmd instanceof SetParagraphCjkCmd) {
    return {
      type: "setParagraphCjk",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        enabled: readField<boolean>(cmd, "enabled"),
      },
    };
  }
  if (cmd instanceof SetParagraphSpacingCmd) {
    return {
      type: "setParagraphSpacing",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        patch: readField<ParagraphSpacingPatch>(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof ChangeTextCaseCmd) {
    return {
      type: "changeTextCase",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        mode: readField<TextCaseMode>(cmd, "mode"),
      },
    };
  }
  if (cmd instanceof ClearTextFormattingCmd) {
    return {
      type: "clearTextFormatting",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
      },
    };
  }
  if (cmd instanceof SetTextBodyCmd) {
    return {
      type: "setTextBody",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        patch: readField<TextBodyPatch>(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof SetPolygonPointsCmd) {
    return {
      type: "setPolygonPoints",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        points: readField<Array<[number, number]>>(cmd, "points"),
        bbox: readField<Rect>(cmd, "bbox"),
      },
    };
  }
  if (cmd instanceof SetPresetAdjCmd) {
    return {
      type: "setPresetAdj",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        id: readField<string>(cmd, "id"),
        nextAdj: readField<Record<string, number>>(cmd, "nextAdj"),
      },
    };
  }
  if (cmd instanceof SetSlideShowCmd) {
    return {
      type: "setSlideShow",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<boolean>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetSlideHfCmd) {
    return {
      type: "setSlideHf",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<HeaderFooter | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetDeckSectionsCmd) {
    return {
      type: "setDeckSections",
      payload: { next: readField<DeckSection[]>(cmd, "next") },
    };
  }
  if (cmd instanceof SetViewGuidesCmd) {
    return {
      type: "setViewGuides",
      payload: { next: readField<ViewGuides | undefined>(cmd, "next") },
    };
  }
  if (cmd instanceof SetShowPropertiesCmd) {
    return {
      type: "setShowProperties",
      payload: { next: readField<ShowProperties | undefined>(cmd, "next") },
    };
  }
  if (cmd instanceof DuplicateSmartArtItemCmd) {
    return {
      type: "duplicateSmartArtItem",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        itemIndex: readField<number>(cmd, "itemIndex"),
        snapshot: readField<SmartArtItem[]>(cmd, "snapshot"),
      },
    };
  }
  if (cmd instanceof ClearSmartArtPicturesCmd) {
    return {
      type: "clearSmartArtPictures",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        groupId: readField<string>(cmd, "groupId"),
        snapshot: readField<SmartArtItem[]>(cmd, "snapshot"),
      },
    };
  }
  if (cmd instanceof CopyShapeAnimationsCmd) {
    return {
      type: "copyShapeAnimations",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        sourceShapeId: readField<string>(cmd, "sourceShapeId"),
        targetShapeId: readField<string>(cmd, "targetShapeId"),
      },
    };
  }
  if (cmd instanceof ClearInkOnSlideCmd) {
    return {
      type: "clearInkOnSlide",
      payload: { slideIdx: readField<number>(cmd, "slideIdx") },
    };
  }
  if (cmd instanceof ApplyThemeCmd) {
    return {
      type: "applyTheme",
      payload: {
        themeId: readField<string>(cmd, "themeId"),
        opts: readField<ApplyThemeOpts>(cmd, "opts") ?? {},
      },
    };
  }
  if (cmd instanceof ApplyCustomThemeCmd) {
    return {
      type: "applyCustomTheme",
      payload: {
        theme: readField<ThemeDef>(cmd, "theme"),
        opts: readField<ApplyCustomThemeOpts>(cmd, "opts") ?? {},
      },
    };
  }
  if (cmd instanceof SetSlideLayoutRefCmd) {
    return {
      type: "setSlideLayoutRef",
      payload: {
        slideIdx: readField<number>(cmd, "slideIdx"),
        next: readField<{ masterId: string; layoutId: string } | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof AddLayoutCmd) {
    return {
      type: "addLayout",
      payload: {
        masterId: readField<string>(cmd, "masterId"),
        spec: readField<ConstructorParameters<typeof AddLayoutCmd>[1]>(cmd, "spec"),
      },
    };
  }
  if (cmd instanceof DeleteLayoutCmd) {
    return {
      type: "deleteLayout",
      payload: {
        masterId: readField<string>(cmd, "masterId"),
        layoutId: readField<string>(cmd, "layoutId"),
      },
    };
  }
  if (cmd instanceof RenameLayoutCmd) {
    return {
      type: "renameLayout",
      payload: {
        masterId: readField<string>(cmd, "masterId"),
        layoutId: readField<string>(cmd, "layoutId"),
        nextName: readField<string>(cmd, "nextName"),
      },
    };
  }
  if (cmd instanceof DuplicateMasterCmd) {
    return {
      type: "duplicateMaster",
      payload: {
        masterId: readField<string>(cmd, "masterId"),
        newId: readField<string>(cmd, "newId"),
      },
    };
  }
  if (cmd instanceof SetPlaceholderTypeCmd) {
    return {
      type: "setPlaceholderType",
      payload: {
        masterId: readField<string>(cmd, "masterId"),
        layoutId: readField<string | undefined>(cmd, "layoutId"),
        shapeId: readField<string>(cmd, "shapeId"),
        nextType: readField<string>(cmd, "nextType"),
        nextIdx: readField<string | number | undefined>(cmd, "nextIdx"),
      },
    };
  }
  if (cmd instanceof SetMasterTxStylesCmd) {
    return {
      type: "setMasterTxStyles",
      payload: {
        masterId: readField<string>(cmd, "masterId"),
        scope: readField<TxStyleScope>(cmd, "scope"),
        level: readField<number>(cmd, "level"),
        patch: readField<LevelStylePatch>(cmd, "patch"),
      },
    };
  }
  if (cmd instanceof SetSlideSizeCmd) {
    return {
      type: "setSlideSize",
      payload: { next: readField<SlideSize>(cmd, "next") },
    };
  }
  if (cmd instanceof SetBackgroundTargetCmd) {
    return {
      type: "setBackgroundTarget",
      payload: {
        target: readField<EditTarget>(cmd, "target"),
        next: readField<Paint | undefined>(cmd, "next"),
      },
    };
  }
  if (cmd instanceof SetProofingLanguageCmd) {
    return {
      type: "setProofingLanguage",
      payload: { langId: readField<string>(cmd, "langId") },
    };
  }
  if (cmd instanceof ApplyThemeVariantCmd) {
    return {
      type: "applyThemeVariant",
      payload: { variant: readField<ThemeVariantId>(cmd, "variant") },
    };
  }
  if (cmd instanceof SetPresentationProtectionCmd) {
    return {
      type: "setPresentationProtection",
      payload: {
        next: readField<PresentationProtection | undefined>(cmd, "next"),
        officeModifyVerifier: readField<ModifyVerifier | undefined>(cmd, "officeModifyVerifier"),
      },
    };
  }
  if (cmd instanceof EmbedFontsCmd) {
    return {
      type: "embedFonts",
      payload: {
        additions: readField<EmbeddedFont[]>(cmd, "additions") ?? [],
        optionsPatch: readField<Partial<PresentationOptions>>(cmd, "optionsPatch") ?? {},
        removeFamilies: readField<string[]>(cmd, "removeFamilies") ?? [],
      },
    };
  }
  if (cmd instanceof ResolveSlideCommentsCmd) {
    return {
      type: "resolveSlideComments",
      payload: {
        slideIndex: readField<number>(cmd, "slideIndex"),
        resolved: readField<boolean>(cmd, "resolved") ?? false,
      },
    };
  }

  return null;
}

export function deserializeCollabCommand(wire: CollabCommandWire): EditCommand | null {
  const p = wire.payload as Record<string, unknown>;
  switch (wire.type) {
    case "batch": {
      const children = (p.children as CollabCommandWire[] | undefined) ?? [];
      const cmds: EditCommand[] = [];
      for (const child of children) {
        const cmd = deserializeCollabCommand(child);
        if (!cmd) return null;
        cmds.push(cmd);
      }
      if (!cmds.length) return null;
      return new RemoteBatchCmd(String(p.label ?? "Batch"), cmds);
    }
    case "moveShape":
      return new MoveShapeCmd(
        Number(p.slideIdx),
        String(p.id),
        Number(p.dx),
        Number(p.dy),
      );
    case "resizeShape":
      return new ResizeShapeCmd(Number(p.slideIdx), String(p.id), p.next as Rect);
    case "setShapeBbox":
      return new SetShapeBboxCmd(Number(p.slideIdx), String(p.id), p.next as Rect);
    case "editText":
      return new EditTextCmd(Number(p.slideIdx), String(p.id), (p.nextParagraphs as string[]) ?? []);
    case "setRichText":
      return new SetRichTextCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.nextParagraphs as RichParagraph[]) ?? [],
      );
    case "setParagraphs":
      return new SetParagraphsCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.nextParagraphs as TextParagraph[]) ?? [],
      );
    case "setTextStyle":
      return new SetTextStyleCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.patch as TextStylePatch) ?? {},
        Array.isArray(p.ranges) ? p.ranges as import("./text-char-style").TextCharRange[] : undefined,
      );
    case "deleteShape":
      return new DeleteShapeCmd(Number(p.slideIdx), String(p.id), p.target as never);
    case "addShape":
      return new AddShapeCmd(
        Number(p.slideIdx),
        Number(p.layerIdx),
        p.shape as Shape,
        p.target as never,
      );
    case "duplicateShape":
      return new DuplicateShapeCmd(
        Number(p.slideIdx),
        String(p.id),
        Number(p.dx ?? 16),
        Number(p.dy ?? 16),
        p.newId ? String(p.newId) : undefined,
      );
    case "reorderShape":
      return new ReorderShapeCmd(
        Number(p.slideIdx),
        String(p.id),
        p.direction as "front" | "back" | "forward" | "backward",
        p.target as never,
      );
    case "groupShapes":
      return new WireGroupShapesCmd(
        Number(p.slideIdx),
        Number(p.layerIdx),
        (p.positions as number[]) ?? [],
        (p.shapes as Shape[]) ?? [],
        String(p.groupId),
      );
    case "ungroupShapes":
      return new UngroupShapesCmd(Number(p.slideIdx), String(p.id));
    case "alignShapes":
      return new AlignShapesCmd(
        Number(p.slideIdx),
        (p.ids as string[]) ?? [],
        p.mode as never,
      );
    case "distributeShapes":
      return new DistributeShapesCmd(
        Number(p.slideIdx),
        (p.ids as string[]) ?? [],
        p.axis as "h" | "v",
      );
    case "setFill":
      return new SetFillCmd(Number(p.slideIdx), String(p.id), p.next as Paint | undefined);
    case "setStroke":
      return new SetStrokeCmd(Number(p.slideIdx), String(p.id), p.next as never);
    case "setShapeRotation":
      return new SetShapeRotationCmd(Number(p.slideIdx), String(p.id), Number(p.next));
    case "setShapeOpacity":
      return new SetShapeOpacityCmd(Number(p.slideIdx), String(p.id), Number(p.next));
    case "flipShape":
      return new FlipShapeCmd(Number(p.slideIdx), String(p.id), p.axis as "h" | "v");
    case "applyFormat":
      return new ApplyFormatCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.snapshot as FormatSnapshot) ?? {},
      );
    case "setSlideBackground":
      return new SetSlideBackgroundCmd(Number(p.slideIdx), p.next as Paint | undefined);
    case "setSlideNotes":
      return new SetSlideNotesCmd(Number(p.slideIdx), p.next as string | undefined);
    case "setSlideTransition":
      return new SetSlideTransitionCmd(
        Number(p.slideIdx),
        p.next as SlideTransition | undefined,
        Boolean(p.applyAll),
      );
    case "addAnimEffect":
      return new AddAnimEffectCmd(Number(p.slideIdx), p.args as never);
    case "removeAnimEffect":
      return new RemoveAnimEffectCmd(Number(p.slideIdx), p.path as never);
    case "moveAnimEffect":
      return new MoveAnimEffectCmd(Number(p.slideIdx), p.path as never, Number(p.newIndex));
    case "setAnimEffectProp":
      return new SetAnimEffectPropCmd(Number(p.slideIdx), p.path as never, p.patch as never);
    case "addComment": {
      const comment = p.comment as DeckComment | undefined;
      if (!comment) return null;
      return new AddCommentCmd(comment);
    }
    case "editComment":
      return new EditCommentCmd(String(p.commentId), String(p.nextText), "");
    case "resolveComment":
      return new ResolveCommentCmd(String(p.commentId), Boolean(p.resolved), !p.resolved);
    case "deleteComment": {
      const snapshots = (p.snapshots as DeckComment[] | undefined) ?? [];
      if (!snapshots.length) return null;
      return new WireDeleteCommentsCmd(snapshots);
    }
    case "insertSlide":
      return new InsertSlideCmd(Number(p.idx), p.slide as Slide);
    case "deleteSlide":
      return new DeleteSlideCmd(Number(p.idx));
    case "deleteSlides":
      return new DeleteSlidesCmd((p.indices as number[]) ?? []);
    case "moveSlide":
      return new MoveSlideCmd(Number(p.from), Number(p.to));
    case "duplicateSlide":
      return new DuplicateSlideCmd(Number(p.idx));
    case "rebuildSmartArt": {
      const items = (p.items as SmartArtItem[] | undefined) ?? [];
      const layout = p.layout as SmartArtLayoutKind | undefined;
      return new WireRebuildSmartArtCmd(
        Number(p.slideIdx),
        String(p.groupId),
        items,
        layout,
      );
    }
    case "addSmartArtItem":
      return new AddSmartArtItemCmd(
        Number(p.slideIdx),
        String(p.groupId),
        (p.snapshot as SmartArtItem[]) ?? [],
      );
    case "removeSmartArtItem":
      return new RemoveSmartArtItemCmd(
        Number(p.slideIdx),
        String(p.groupId),
        (p.snapshot as SmartArtItem[]) ?? [],
        p.itemIndex !== undefined ? Number(p.itemIndex) : undefined,
      );
    case "moveSmartArtItem":
      return new MoveSmartArtItemCmd(
        Number(p.slideIdx),
        String(p.groupId),
        Number(p.itemIndex),
        Number(p.direction) as -1 | 1,
        (p.snapshot as SmartArtItem[]) ?? [],
      );
    case "setSmartArtItemLevel":
      return new SetSmartArtItemLevelCmd(
        Number(p.slideIdx),
        String(p.groupId),
        Number(p.itemIndex),
        Number(p.delta) as -1 | 1,
        (p.snapshot as SmartArtItem[]) ?? [],
      );
    case "convertToSmartArt":
      return new WireConvertSmartArtCmd(
        Number(p.slideIdx),
        Number(p.layerIdx),
        Number(p.index),
        p.group as Shape,
        p.removedShapeId ? String(p.removedShapeId) : undefined,
      );
    case "insertTableRow":
      return new InsertTableRowCmd(Number(p.slideIdx), String(p.groupId), Number(p.afterRow));
    case "insertTableColumn":
      return new InsertTableColumnCmd(Number(p.slideIdx), String(p.groupId), Number(p.afterCol));
    case "removeTableRow":
      return new RemoveTableRowCmd(Number(p.slideIdx), String(p.groupId), Number(p.rowIdx));
    case "removeTableColumn":
      return new RemoveTableColumnCmd(Number(p.slideIdx), String(p.groupId), Number(p.colIdx));
    case "mergeTableCells":
      return new MergeTableCellsCmd(
        Number(p.slideIdx),
        String(p.groupId),
        Number(p.startRow),
        Number(p.startCol),
        Number(p.endRow),
        Number(p.endCol),
      );
    case "unmergeTableCells":
      return new UnmergeTableCellsCmd(Number(p.slideIdx), String(p.groupId), Number(p.row), Number(p.col));
    case "setTableCellStyle":
      return new SetTableCellStyleCmd(
        Number(p.slideIdx),
        String(p.groupId),
        Number(p.row),
        Number(p.col),
        (p.patch as TableCellStylePatch) ?? {},
      );
    case "setChartDef":
      return new SetChartDefCmd(Number(p.slideIdx), String(p.id), p.next as ChartDef);
    case "setCropFrame": {
      const nextBbox = p.nextBbox as Rect | undefined;
      const nextCrop = p.nextCrop as ImageCropRect | undefined;
      if (!nextBbox || !nextCrop) return null;
      return new SetCropFrameCmd(Number(p.slideIdx), String(p.id), nextBbox, nextCrop);
    }
    case "setImageCrop":
      return new SetImageCropCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.crop as ImageCropRect | null) ?? null,
      );
    case "setCommentAnchor": {
      const next = p.next as { x: number; y: number } | undefined;
      if (!next) return null;
      return new SetCommentAnchorCmd(
        String(p.commentId),
        next,
        (p.prev as { x?: number; y?: number }) ?? {},
      );
    }
    case "applySlideLayout": {
      const next = p.next as SlideLayoutRef | undefined;
      if (!next?.masterId || !next?.layoutId) return null;
      return new ApplySlideLayoutCmd(Number(p.slideIdx), next);
    }
    case "resetSlideToLayout":
      return new ResetSlideToLayoutCmd(Number(p.slideIdx));
    case "setShapeLocked":
      return new SetShapeLockedCmd(Number(p.slideIdx), String(p.id), Boolean(p.locked));
    case "setShapeVisible":
      return new SetShapeVisibleCmd(Number(p.slideIdx), String(p.id), Boolean(p.visible));
    case "setLineEndpoints": {
      const endpoints = p.endpoints as LineEndpoints | undefined;
      const bbox = p.bbox as Rect | undefined;
      if (!endpoints || !bbox) return null;
      return new SetLineEndpointsCmd(
        Number(p.slideIdx),
        String(p.id),
        endpoints,
        bbox,
        p.glue as ConnectorGlue | undefined,
      );
    }
    case "setPathConnectorEnds": {
      const bbox = p.bbox as Rect | undefined;
      if (!bbox) return null;
      return new SetPathConnectorEndsCmd(
        Number(p.slideIdx),
        String(p.id),
        bbox,
        Number(p.scaleX),
        Number(p.scaleY),
        p.glue as ConnectorGlue | undefined,
      );
    }
    case "replaceImageSrc": {
      const natural = p.natural as { w?: number; h?: number } | null | undefined;
      const size =
        natural && typeof natural.w === "number" && typeof natural.h === "number"
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
      const next = p.next as HyperlinkRef | null | undefined;
      const slot = p.slot === "hover" ? "hover" : "click";
      return new SetShapeHyperlinkCmd(
        Number(p.slideIdx),
        String(p.id),
        next ?? undefined,
        slot,
      );
    }
    case "setMediaProps":
      return new SetMediaPropsCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.patch as MediaPropsPatch) ?? {},
      );
    case "updateMediaSrc":
      return new UpdateMediaSrcCmd(
        Number(p.slideIdx),
        String(p.id),
        String(p.nextSrc ?? ""),
        p.nextDuration !== undefined ? Number(p.nextDuration) : undefined,
      );
    case "updateOleEmbed":
      return new UpdateOleEmbedCmd(
        Number(p.slideIdx),
        String(p.shapeId),
        String(p.fileName ?? ""),
        String(p.embedSrc ?? ""),
      );
    case "setOleShowAsIcon":
      return new SetOleShowAsIconCmd(
        Number(p.slideIdx),
        String(p.shapeId),
        Boolean(p.showAsIcon),
      );
    case "updateModel3DGlb":
      return new UpdateModel3DGlbCmd(
        Number(p.slideIdx),
        String(p.shapeId),
        String(p.glbSrc ?? ""),
        p.newName ? String(p.newName) : undefined,
      );
    case "setShapeEffects":
      return new SetShapeEffectsCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.patch as ShapeEffectsPatch) ?? {},
      );
    case "setShape3D":
      return new SetShape3DCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.patch as Shape3DPatch) ?? {},
      );
    case "setTextAlign":
      return new SetTextAlignCmd(
        Number(p.slideIdx),
        String(p.id),
        p.align as TextParagraph["align"],
      );
    case "setParagraphBullet":
      return new SetParagraphBulletCmd(
        Number(p.slideIdx),
        String(p.id),
        p.next as BulletDef | undefined,
      );
    case "setParagraphRtl":
      return new SetParagraphRtlCmd(Number(p.slideIdx), String(p.id), Boolean(p.rtl));
    case "setParagraphCjk":
      return new SetParagraphCjkCmd(Number(p.slideIdx), String(p.id), Boolean(p.enabled));
    case "setParagraphSpacing":
      return new SetParagraphSpacingCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.patch as ParagraphSpacingPatch) ?? {},
      );
    case "changeTextCase":
      return new ChangeTextCaseCmd(
        Number(p.slideIdx),
        String(p.id),
        p.mode as TextCaseMode,
      );
    case "clearTextFormatting":
      return new ClearTextFormattingCmd(Number(p.slideIdx), String(p.id));
    case "setTextBody":
      return new SetTextBodyCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.patch as TextBodyPatch) ?? {},
      );
    case "setPolygonPoints":
      return new SetPolygonPointsCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.points as Array<[number, number]>) ?? [],
        (p.bbox as Rect) ?? { x: 0, y: 0, w: 0, h: 0 },
      );
    case "setPresetAdj":
      return new SetPresetAdjCmd(
        Number(p.slideIdx),
        String(p.id),
        (p.nextAdj as Record<string, number>) ?? {},
      );
    case "setSlideShow":
      return new SetSlideShowCmd(Number(p.slideIdx), Boolean(p.next));
    case "setSlideHf":
      return new SetSlideHfCmd(Number(p.slideIdx), p.next as HeaderFooter | undefined);
    case "setDeckSections":
      return new SetDeckSectionsCmd((p.next as DeckSection[]) ?? []);
    case "setViewGuides":
      return new SetViewGuidesCmd(p.next as ViewGuides | undefined);
    case "setShowProperties":
      return new SetShowPropertiesCmd(p.next as ShowProperties | undefined);
    case "duplicateSmartArtItem":
      return new DuplicateSmartArtItemCmd(
        Number(p.slideIdx),
        String(p.groupId),
        Number(p.itemIndex),
        (p.snapshot as SmartArtItem[]) ?? [],
      );
    case "clearSmartArtPictures":
      return new ClearSmartArtPicturesCmd(
        Number(p.slideIdx),
        String(p.groupId),
        (p.snapshot as SmartArtItem[]) ?? [],
      );
    case "copyShapeAnimations":
      return new CopyShapeAnimationsCmd(
        Number(p.slideIdx),
        String(p.sourceShapeId),
        String(p.targetShapeId),
      );
    case "clearInkOnSlide":
      return new ClearInkOnSlideCmd(Number(p.slideIdx));
    case "applyTheme":
      return new ApplyThemeCmd(String(p.themeId ?? ""), (p.opts as ApplyThemeOpts) ?? {});
    case "applyCustomTheme": {
      const theme = p.theme as ThemeDef | undefined;
      if (!theme) return null;
      return new ApplyCustomThemeCmd(theme, (p.opts as ApplyCustomThemeOpts) ?? {});
    }
    case "setSlideLayoutRef":
      return new SetSlideLayoutRefCmd(
        Number(p.slideIdx),
        p.next as { masterId: string; layoutId: string } | undefined,
      );
    case "addLayout": {
      const spec = p.spec as ConstructorParameters<typeof AddLayoutCmd>[1] | undefined;
      if (!spec) return null;
      return new AddLayoutCmd(String(p.masterId ?? ""), spec);
    }
    case "deleteLayout":
      return new DeleteLayoutCmd(String(p.masterId ?? ""), String(p.layoutId ?? ""));
    case "renameLayout":
      return new RenameLayoutCmd(
        String(p.masterId ?? ""),
        String(p.layoutId ?? ""),
        String(p.nextName ?? ""),
      );
    case "duplicateMaster":
      return new DuplicateMasterCmd(String(p.masterId ?? ""), String(p.newId ?? ""));
    case "setPlaceholderType":
      return new SetPlaceholderTypeCmd(
        String(p.masterId ?? ""),
        p.layoutId === undefined ? undefined : String(p.layoutId),
        String(p.shapeId ?? ""),
        String(p.nextType ?? ""),
        p.nextIdx as string | number | undefined,
      );
    case "setMasterTxStyles":
      return new SetMasterTxStylesCmd(
        String(p.masterId ?? ""),
        (p.scope as TxStyleScope) ?? "body",
        Number(p.level ?? 0),
        (p.patch as LevelStylePatch) ?? {},
      );
    case "setSlideSize": {
      const next = p.next as SlideSize | undefined;
      if (!next || typeof next.width !== "number" || typeof next.height !== "number") return null;
      return new SetSlideSizeCmd(next);
    }
    case "setBackgroundTarget": {
      const target = p.target as EditTarget | undefined;
      if (!target || typeof target !== "object" || !("kind" in target)) return null;
      return new SetBackgroundTargetCmd(target, p.next as Paint | undefined);
    }
    case "setProofingLanguage":
      return new SetProofingLanguageCmd(String(p.langId ?? ""));
    case "applyThemeVariant": {
      const variant = p.variant;
      if (variant !== "subtle" && variant !== "bold" && variant !== "warm" && variant !== "cool") return null;
      return new ApplyThemeVariantCmd(variant);
    }
    case "setPresentationProtection":
      return new SetPresentationProtectionCmd(
        p.next as PresentationProtection | undefined,
        undefined,
        p.officeModifyVerifier as ModifyVerifier | undefined,
      );
    case "embedFonts":
      return new EmbedFontsCmd(
        (p.additions as EmbeddedFont[]) ?? [],
        (p.optionsPatch as Partial<PresentationOptions>) ?? {},
        (p.removeFamilies as string[]) ?? [],
      );
    case "resolveSlideComments":
      return new ResolveSlideCommentsCmd(Number(p.slideIndex ?? 0), Boolean(p.resolved));
    default:
      return null;
  }
}
