import type { EditCommand, Presentation } from "@sliiu/present-core";
import { normalizeProofingLangId, PROOFING_LANG_META_KEY, setProofingLanguageMeta } from "@sliiu/present-core";

export class SetProofingLanguageCmd implements EditCommand {
  readonly label = "Set proofing language";

  constructor(
    private langId: string,
    private prev?: string,
  ) {}

  apply(pres: Presentation): void {
    if (this.prev === undefined) {
      this.prev = normalizeProofingLangId(pres.meta?.[PROOFING_LANG_META_KEY]);
    }
    setProofingLanguageMeta(pres, this.langId);
  }

  revert(pres: Presentation): void {
    setProofingLanguageMeta(pres, this.prev);
  }
}
