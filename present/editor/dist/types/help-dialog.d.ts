export interface HelpLinks {
    docsUrl?: string;
    feedbackUrl?: string;
    trainingUrl?: string;
    termsUrl?: string;
    privacyUrl?: string;
}
export declare function openHelpDialog(doc: Document, links?: HelpLinks): void;
export declare function openExternalHelpLink(url: string | undefined, doc: Document, missingKey: "help.missingFeedback" | "help.missingTraining"): void;
