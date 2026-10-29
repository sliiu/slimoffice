import type { Presentation } from "@ppt/core";
import { recomputeSlideInheritance } from "@ppt/parser";
import type { EditorContext } from "./editor";

/** 母版 / 版式编辑后，刷新引用该 master（及可选 layout）的全部 slide 占位符继承。 */
export function recomputeSlidesForMasterEdit(
  pres: Presentation,
  ctx: Extract<EditorContext, { kind: "master" }>,
): number {
  let count = 0;
  for (let i = 0; i < pres.slides.length; i++) {
    const ref = pres.slides[i]?.layoutRef;
    if (!ref || ref.masterId !== ctx.masterId) continue;
    if (ctx.layoutId && ref.layoutId !== ctx.layoutId) continue;
    if (recomputeSlideInheritance(pres, i)) count++;
  }
  return count;
}
