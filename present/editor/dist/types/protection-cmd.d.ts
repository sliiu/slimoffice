import type { EditCommand, ModifyVerifier, Presentation, PresentationProtection } from "@sliiu/present-core";
export declare class SetPresentationProtectionCmd implements EditCommand {
    private next;
    private prev?;
    private officeModifyVerifier?;
    readonly label: string;
    private prevMv?;
    constructor(next: PresentationProtection | undefined, prev?: PresentationProtection | undefined, officeModifyVerifier?: ModifyVerifier | undefined);
    apply(pres: Presentation): void;
    revert(pres: Presentation): void;
}
