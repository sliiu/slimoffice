import type { EditCommand, ModifyVerifier, Presentation, PresentationProtection } from "@ppt/core";
import {
  cloneModifyVerifier,
  getPresentationProtection,
  setPresentationProtectionMeta,
  syncModifyVerifierWithProtection,
} from "@ppt/core";

export class SetPresentationProtectionCmd implements EditCommand {
  readonly label: string;
  private prevMv?: ModifyVerifier;

  constructor(
    private next: PresentationProtection | undefined,
    private prev?: PresentationProtection,
    private officeModifyVerifier?: ModifyVerifier,
  ) {
    this.label = next ? "Protect presentation" : "Unprotect presentation";
  }

  apply(pres: Presentation): void {
    if (this.prev === undefined) {
      this.prev = getPresentationProtection(pres);
      this.prevMv = cloneModifyVerifier(pres.modifyVerifier);
    }
    setPresentationProtectionMeta(pres, this.next);
    syncModifyVerifierWithProtection(pres, this.next, this.officeModifyVerifier);
  }

  revert(pres: Presentation): void {
    setPresentationProtectionMeta(pres, this.prev);
    pres.modifyVerifier = cloneModifyVerifier(this.prevMv);
  }
}
