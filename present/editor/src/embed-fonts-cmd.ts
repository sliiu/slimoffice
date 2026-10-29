import type { EditCommand, EmbeddedFont, Presentation, PresentationOptions } from "@ppt/core";
import { mergeEmbeddedFonts, removeEmbeddedFontFamilies } from "@ppt/core";

export class EmbedFontsCmd implements EditCommand {
  readonly label: string;
  private prevFonts?: EmbeddedFont[];
  private prevOptions?: PresentationOptions;

  constructor(
    private readonly additions: EmbeddedFont[],
    private readonly optionsPatch: Partial<PresentationOptions> = { embedTrueTypeFonts: true },
    private readonly removeFamilies: string[] = [],
  ) {
    this.label =
      additions.length === 1
        ? `Embed font "${additions[0]!.family}"`
        : additions.length
          ? `Embed ${additions.length} fonts`
          : "Update embedded fonts";
  }

  apply(pres: Presentation): void {
    this.prevFonts = pres.fonts ? [...pres.fonts] : undefined;
    this.prevOptions = pres.options ? { ...pres.options } : undefined;
    const base = this.removeFamilies.length
      ? removeEmbeddedFontFamilies(pres.fonts, this.removeFamilies)
      : pres.fonts;
    pres.fonts = mergeEmbeddedFonts(base, this.additions);
    pres.options = { ...pres.options, ...this.optionsPatch };
  }

  revert(pres: Presentation): void {
    pres.fonts = this.prevFonts;
    pres.options = this.prevOptions;
  }
}
