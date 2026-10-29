import { normalizeProofingLangId, PROOFING_LANG_META_KEY, setProofingLanguageMeta } from "@sliiu/present-core";
export class SetProofingLanguageCmd {
    langId;
    prev;
    label = "Set proofing language";
    constructor(langId, prev) {
        this.langId = langId;
        this.prev = prev;
    }
    apply(pres) {
        if (this.prev === undefined) {
            this.prev = normalizeProofingLangId(pres.meta?.[PROOFING_LANG_META_KEY]);
        }
        setProofingLanguageMeta(pres, this.langId);
    }
    revert(pres) {
        setProofingLanguageMeta(pres, this.prev);
    }
}
