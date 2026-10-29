import { type Presentation } from "@sliiu/present-core";
import { z } from "zod";
import type { DocumentPort } from "../kernel/port.js";
export declare const ChangeProposalSchema: z.ZodObject<{
    summary: z.ZodDefault<z.ZodString>;
    edits: z.ZodDefault<z.ZodArray<z.ZodObject<{
        slideIndex: z.ZodNumber;
        title: z.ZodDefault<z.ZodString>;
        body: z.ZodDefault<z.ZodString>;
        notes: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>>;
    adds: z.ZodDefault<z.ZodArray<z.ZodObject<{
        title: z.ZodDefault<z.ZodString>;
        body: z.ZodDefault<z.ZodString>;
        notes: z.ZodDefault<z.ZodString>;
    }, z.core.$strip>>>;
    deletes: z.ZodDefault<z.ZodArray<z.ZodNumber>>;
}, z.core.$strip>;
export type ChangeProposal = z.infer<typeof ChangeProposalSchema>;
export declare function digestSlides(pres: Presentation): string;
export declare function changeProposalSystemPrompt(): string;
export declare function changeProposalUserPrompt(instruction: string, digest: string, sourceMaterial: string): string;
export declare function applyChangeProposal(port: DocumentPort, proposal: ChangeProposal): Promise<void>;
