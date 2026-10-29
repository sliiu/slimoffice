import type { EditCommand, Presentation, ShowProperties, ViewGuides } from "@ppt/core";

function cloneJson<T>(v: T | undefined): T | undefined {
  return v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as T);
}

/** Replace `pres.viewGuides` (undoable). */
export class SetViewGuidesCmd implements EditCommand {
  readonly label = "View guides";
  private prev?: ViewGuides;
  private captured = false;

  constructor(private next: ViewGuides | undefined) {}

  apply(pres: Presentation): void {
    if (!this.captured) {
      this.prev = cloneJson(pres.viewGuides);
      this.captured = true;
    }
    pres.viewGuides = cloneJson(this.next);
  }

  revert(pres: Presentation): void {
    pres.viewGuides = cloneJson(this.prev);
  }
}

/** Replace `pres.showPr` (undoable) — ECMA-376 `p:showPr` slideshow settings. */
export class SetShowPropertiesCmd implements EditCommand {
  readonly label = "Show settings";
  private prev?: ShowProperties;
  private captured = false;

  constructor(private next: ShowProperties | undefined) {}

  apply(pres: Presentation): void {
    if (!this.captured) {
      this.prev = cloneJson(pres.showPr);
      this.captured = true;
    }
    pres.showPr = cloneJson(this.next);
  }

  revert(pres: Presentation): void {
    pres.showPr = cloneJson(this.prev);
  }
}
