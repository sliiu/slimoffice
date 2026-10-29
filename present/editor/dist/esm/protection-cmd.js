import { cloneModifyVerifier, getPresentationProtection, setPresentationProtectionMeta, syncModifyVerifierWithProtection, } from "@sliiu/present-core";
export class SetPresentationProtectionCmd {
    next;
    prev;
    officeModifyVerifier;
    label;
    prevMv;
    constructor(next, prev, officeModifyVerifier) {
        this.next = next;
        this.prev = prev;
        this.officeModifyVerifier = officeModifyVerifier;
        this.label = next ? "Protect presentation" : "Unprotect presentation";
    }
    apply(pres) {
        if (this.prev === undefined) {
            this.prev = getPresentationProtection(pres);
            this.prevMv = cloneModifyVerifier(pres.modifyVerifier);
        }
        setPresentationProtectionMeta(pres, this.next);
        syncModifyVerifierWithProtection(pres, this.next, this.officeModifyVerifier);
    }
    revert(pres) {
        setPresentationProtectionMeta(pres, this.prev);
        pres.modifyVerifier = cloneModifyVerifier(this.prevMv);
    }
}
