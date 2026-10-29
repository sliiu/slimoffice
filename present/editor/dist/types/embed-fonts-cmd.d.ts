import type { EditCommand, EmbeddedFont, Presentation, PresentationOptions } from "@sliiu/present-core";
export declare class EmbedFontsCmd implements EditCommand {
    private readonly additions;
    private readonly optionsPatch;
    private readonly removeFamilies;
    readonly label: string;
    private prevFonts?;
    private prevOptions?;
    constructor(additions: EmbeddedFont[], optionsPatch?: Partial<PresentationOptions>, removeFamilies?: string[]);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
