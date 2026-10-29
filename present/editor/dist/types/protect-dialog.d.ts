import type { ModifyVerifier, Presentation, PresentationProtection } from "@sliiu/present-core";
export declare function openProtectDialog(doc: Document, pres: Presentation, onApply: (next: PresentationProtection | undefined, officeModifyVerifier?: ModifyVerifier) => void): void;
