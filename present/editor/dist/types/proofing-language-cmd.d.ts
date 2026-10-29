import type { EditCommand, Presentation } from "@sliiu/present-core";
export declare class SetProofingLanguageCmd implements EditCommand {
    private langId;
    private prev?;
    readonly label = "Set proofing language";
    constructor(langId: string, prev?: string | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
