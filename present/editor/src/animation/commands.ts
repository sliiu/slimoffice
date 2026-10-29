// 动画编辑命令 — 走 CommandStack 的 EditCommand 接口。
// 实现策略：每个命令在 apply 时直接修改 slide.ooxmlTiming（深拷贝前后差异以便 revert）。

import type { EditCommand, Presentation, Slide } from "@ppt/core";
import {
  ensureTiming,
  insertEffect,
  moveEffect,
  removeEffect,
  setEffectProperty,
  copyShapeAnimations,
  type EffectPath,
  type EffectTrigger,
  type InsertEffectArgs,
} from "./store";
import type { ooxml } from "@ppt/animation";

function slideAt(pres: Presentation, idx: number): Slide | undefined {
  return pres.slides[idx];
}

function cloneTiming(timing: ooxml.OoxmlTiming | undefined): ooxml.OoxmlTiming | undefined {
  if (!timing) return undefined;
  return JSON.parse(JSON.stringify(timing)) as ooxml.OoxmlTiming;
}

export class AddAnimEffectCmd implements EditCommand {
  readonly label = "Add Animation";
  private before: ooxml.OoxmlTiming | undefined;
  constructor(private slideIdx: number, private args: InsertEffectArgs) {}

  apply(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    this.before = cloneTiming(slide.ooxmlTiming);
    const timing = ensureTiming(slide);
    insertEffect(timing, this.args);
  }

  revert(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
  }
}

export class RemoveAnimEffectCmd implements EditCommand {
  readonly label = "Remove Animation";
  private before: ooxml.OoxmlTiming | undefined;
  constructor(private slideIdx: number, private path: EffectPath) {}

  apply(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide || !slide.ooxmlTiming) return;
    this.before = cloneTiming(slide.ooxmlTiming);
    removeEffect(slide.ooxmlTiming, this.path);
  }

  revert(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
  }
}

export class MoveAnimEffectCmd implements EditCommand {
  readonly label = "Reorder Animation";
  private before: ooxml.OoxmlTiming | undefined;
  constructor(
    private slideIdx: number,
    private path: EffectPath,
    private newIndex: number,
  ) {}

  apply(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide || !slide.ooxmlTiming) return;
    this.before = cloneTiming(slide.ooxmlTiming);
    moveEffect(slide.ooxmlTiming, this.path, this.newIndex);
  }

  revert(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
  }
}

export class SetAnimEffectPropCmd implements EditCommand {
  readonly label = "Update Animation";
  private before: ooxml.OoxmlTiming | undefined;
  constructor(
    private slideIdx: number,
    private path: EffectPath,
    private patch: Parameters<typeof setEffectProperty>[2],
  ) {}

  apply(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide || !slide.ooxmlTiming) return;
    this.before = cloneTiming(slide.ooxmlTiming);
    setEffectProperty(slide.ooxmlTiming, this.path, this.patch);
  }

  revert(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
  }
}

export class SetAnimTriggerCmd extends SetAnimEffectPropCmd {
  constructor(slideIdx: number, path: EffectPath, trigger: EffectTrigger) {
    super(slideIdx, path, { trigger });
  }
}

export class CopyShapeAnimationsCmd implements EditCommand {
  readonly label = "Animation painter";
  private before: ooxml.OoxmlTiming | undefined;

  constructor(
    private slideIdx: number,
    private sourceShapeId: string,
    private targetShapeId: string,
  ) {}

  apply(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    this.before = cloneTiming(slide.ooxmlTiming);
    const timing = ensureTiming(slide);
    copyShapeAnimations(timing, this.sourceShapeId, this.targetShapeId);
  }

  revert(pres: Presentation): void {
    const slide = slideAt(pres, this.slideIdx);
    if (!slide) return;
    slide.ooxmlTiming = this.before ? cloneTiming(this.before) : undefined;
  }
}
