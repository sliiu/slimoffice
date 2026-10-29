"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SetProofingLanguageCmd = void 0;
const core_1 = require("@sliiu/present-core");
class SetProofingLanguageCmd {
    langId;
    prev;
    label = "Set proofing language";
    constructor(langId, prev) {
        this.langId = langId;
        this.prev = prev;
    }
    apply(pres) {
        if (this.prev === undefined) {
            this.prev = (0, core_1.normalizeProofingLangId)(pres.meta?.[core_1.PROOFING_LANG_META_KEY]);
        }
        (0, core_1.setProofingLanguageMeta)(pres, this.langId);
    }
    revert(pres) {
        (0, core_1.setProofingLanguageMeta)(pres, this.prev);
    }
}
exports.SetProofingLanguageCmd = SetProofingLanguageCmd;
