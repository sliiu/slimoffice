import type { ModifyVerifier, Presentation } from "./slide.js";
export declare const PROTECTION_META_KEY = "protection";
/** presentation tags part 中 SlimPPT 保护元数据键名。 */
export declare const PROTECTION_META_TAG = "SlimPPT.Protection.v1";
export type PresentationProtectionKind = "final" | "restricted";
export interface PresentationProtection {
    kind: PresentationProtectionKind;
    /** Unix ms when protection was applied. */
    setAt: number;
    /** SHA-256 hex digest (restricted + password only). */
    passwordHash?: string;
}
export declare function getPresentationProtection(pres: Presentation): PresentationProtection | undefined;
export declare function setPresentationProtectionMeta(pres: Presentation, protection: PresentationProtection | undefined): void;
/** 是否应阻止新的编辑命令（final / restricted 均只读）。 */
export declare function isPresentationEditingBlocked(pres: Presentation): boolean;
export declare function isProtectionCommandLabel(label: string): boolean;
/** 当前演示文稿是否允许执行该编辑命令（保护态下仅保护命令可通过）。 */
export declare function canApplyEditCommand(pres: Presentation, cmd: {
    label: string;
}): boolean;
/** `CommandStack.execute` / 编辑器包装在保护态下拒绝 mutation 时抛出。 */
export declare class EditingBlockedError extends Error {
    readonly code: "EDITING_BLOCKED";
    constructor(message?: string);
}
export declare function isEditingBlockedError(e: unknown): e is EditingBlockedError;
export type UnprotectFailureReason = "not_protected" | "password_required" | "incorrect_password";
/** 取消保护失败（未保护 / 缺密码 / 密码错误）。与 EditingBlockedError 一样可供 UI 与 AI 分支处理。 */
export declare class UnprotectFailedError extends Error {
    readonly reason: UnprotectFailureReason;
    readonly code: "UNPROTECT_FAILED";
    constructor(reason: UnprotectFailureReason, message?: string);
}
export declare function isUnprotectFailedError(e: unknown): e is UnprotectFailedError;
/** 取消保护前的共用校验：缺密码或密码错误时抛 UnprotectFailedError。 */
export declare function assertCanUnprotect(pres: Presentation, password?: string): Promise<void>;
export declare function hashProtectionPassword(password: string): Promise<string>;
export declare function verifyProtectionPassword(protection: PresentationProtection, password: string, modifyVerifier?: ModifyVerifier): Promise<boolean>;
/** Whether the user must supply a password to clear protection. */
export declare function protectionRequiresPassword(protection: PresentationProtection, modifyVerifier?: ModifyVerifier): boolean;
/** 序列化保护状态（非 OOXML 原生字段，经 tags 侧车 round-trip）。 */
export declare function buildProtectionMeta(pres: Presentation): string | undefined;
export declare function applyProtectionMeta(pres: Presentation, raw: string | undefined): void;
