"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetPresentationProtectionCmd = void 0;
const core_1 = require("@sliiu/present-core");
class SetPresentationProtectionCmd {
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
            this.prev = (0, core_1.getPresentationProtection)(pres);
            this.prevMv = (0, core_1.cloneModifyVerifier)(pres.modifyVerifier);
        }
        (0, core_1.setPresentationProtectionMeta)(pres, this.next);
        (0, core_1.syncModifyVerifierWithProtection)(pres, this.next, this.officeModifyVerifier);
    }
    revert(pres) {
        (0, core_1.setPresentationProtectionMeta)(pres, this.prev);
        pres.modifyVerifier = (0, core_1.cloneModifyVerifier)(this.prevMv);
    }
}
exports.SetPresentationProtectionCmd = SetPresentationProtectionCmd;
