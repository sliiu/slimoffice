// [TURN SCOPE] 焦点锁：把"当前编辑器焦点"渲染成一段硬约束的 system 消息。
//
// 设计要点：
//   - 措辞硬：MUST / FORBIDDEN / NEVER —— 大量模型对软词（"default to"）会
//     解读成"建议默认值但可以扩展"，于是用户 @ 了一张 slide 模型却把整个 deck
//     都改了。这里强约束 + 反例 + 越界惩罚来压制这种行为。
//   - 两种状态：有焦点 → 给出 ALLOWED list；无焦点 → 显式告知"未指定，不准批改"，
//     避免模型把"什么都没说"当成"deck-wide"的默认。
//   - 仅当 turn 进行中存在：ChatEngine 每轮现算并拼进 system 参数，不入 messages 历史。
//   - 软约束之外还有硬兜底：tools/guard.ts 在工具适配层直接拒绝越界 shapeId。

import type { DocumentPort } from "../kernel/port";

export function formatTurnScope(port: DocumentPort): string {
  const slideIndices = port.getFocusedSlideIndices();
  const selectedIds = port.getSelectedShapeIds();

  const lines: string[] = ["[TURN SCOPE — this is a hard constraint, not a suggestion]"];

  if (slideIndices.length === 0 && selectedIds.length === 0) {
    // 无焦点：明确告知"没有默认范围"，模型必须问 / 必须用 user 文字里出现的具体目标
    // —— 而不是默默把整个 deck 当作 default。
    lines.push(
      "- No slide or shape is selected by the user.",
      '- ALLOWED scope: only objects EXPLICITLY named in this turn\'s user message (e.g. "slide 3", "the cover", "all slides").',
      '- FORBIDDEN: applying any change deck-wide unless the user message contains an explicit scope word like "all" / "every" / "whole deck" / "entire presentation". If the user request is ambiguous about scope, ASK "which slide(s) should this apply to?" instead of guessing.',
    );
    return lines.join("\n");
  }

  if (slideIndices.length === 1) {
    lines.push(
      `- ALLOWED slide indices (0-based): [${slideIndices[0]}] — exactly 1 slide.`,
      `- For any slide-level mutation (setSlideBackground, addAnimation, applyTheme-like operations) you MUST target slideIdx=${slideIndices[0]}. Calls targeting any other slideIdx in this turn are FORBIDDEN.`,
    );
  } else if (slideIndices.length > 1) {
    lines.push(
      `- ALLOWED slide indices (0-based): [${slideIndices.join(", ")}] — exactly ${slideIndices.length} slides.`,
      `- For slide-level mutations you MUST call the tool once for EACH listed index. Calls targeting any other slideIdx are FORBIDDEN.`,
    );
  }

  if (selectedIds.length === 1) {
    lines.push(
      `- ALLOWED shape ids: ["${selectedIds[0]}"] — exactly 1 shape.`,
      `- For any shape-level mutation (setShapeOpacity, setShapeFillColor, setShapeTextStyle, moveShape, resizeShape, deleteShape, reorderShape, fonts_apply, …) you MUST pass shapeId="${selectedIds[0]}". Do NOT call listShapesOnSlide on OTHER slides to discover sibling shapes — the user has pinned exactly ONE shape on ONE slide.`,
      `- CRITICAL: even if this shape has a GENERIC NAME that recurs across the deck (e.g. "BG overlay", "Title", "Cover image", master decoration prefixed dec_*), DO NOT iterate that named pattern across other slides. The user clicked ONE instance — they want that instance edited, not the deck-wide pattern. Editing all instances will silently overwrite work on slides the user didn't pin, and a tool-layer guard will reject those calls with an error anyway.`,
    );
  } else if (selectedIds.length > 1) {
    lines.push(
      `- ALLOWED shape ids (${selectedIds.length} items): [${selectedIds.map((id) => `"${id}"`).join(", ")}].`,
      `- For shape-level mutations you MUST iterate over EXACTLY these ids — one tool call per id. Do NOT call listShapesOnSlide; do NOT touch any other shape on the slide. The tool layer will reject shapeIds outside this list.`,
    );
  } else {
    lines.push(
      "- No shape is selected, but slides are pinned. For shape-level edits, only modify shapes BELONGING to the allowed slides above; call listShapesOnSlide(slideIdx) on those slides only.",
    );
  }

  lines.push(
    "",
    'Override rule: the user can expand scope WITHIN THIS TURN by saying "all slides" / "every slide" / "whole deck" / "every shape" / naming a different slide index explicitly. Without such words, treat the scope above as a HARD lock.',
    'Even with override words, the SHAPE-level guard still applies when shapes are pinned — to truly edit shapes deck-wide, the user must first DESELECT the pinned shape, or you must call a deck-wide tool (applyTheme / fillImagePlaceholders / applyMainstreamAnimations without slideIdx). If you cannot satisfy the deck-wide intent within this turn, finish the in-scope edit and surface the limitation in your recap ("已改了选中的那一个；若要全 deck 一致，请先在画布里取消选中再发一次").',
    "Why this matters: violating scope (touching slides/shapes the user didn't pin) silently destroys their other work; they will undo your changes and lose trust.",
  );
  return lines.join("\n");
}
