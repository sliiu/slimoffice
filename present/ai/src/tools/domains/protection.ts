// 演示文稿保护（标记为最终版 / 限制编辑），与编辑器「审阅 → 保护」同一条命令。
// 不返回 passwordHash。带密码的 restricted 会写入 Office 原生 modifyVerifier，
// PowerPoint 可用同一密码解锁；无密码时主要在本编辑器里拦编辑。

import { z } from "zod";
import type { Presentation } from "@ppt/core";
import {
  getPresentationProtection,
  isPresentationEditingBlocked,
  protectionRequiresPassword,
  summarizeOfficeModifyVerifier,
  buildOfficeModifyVerifier,
  assertCanUnprotect,
  isUnprotectFailedError,
} from "@ppt/core";
import { SetPresentationProtectionCmd } from "@ppt/editor/commands";
import { defineTool, ok, err } from "../types";

function protectionSnapshot(pres: Presentation) {
  const current = getPresentationProtection(pres);
  const office = summarizeOfficeModifyVerifier(pres.modifyVerifier);
  return {
    protected: current !== undefined,
    kind: current?.kind ?? null,
    setAt: current?.setAt ?? null,
    passwordRequired: current ? protectionRequiresPassword(current, pres.modifyVerifier) : false,
    editingBlocked: isPresentationEditingBlocked(pres),
    officeNative: office ? { algorithm: office.algorithm, spinCount: office.spinCount } : null,
  };
}

export const protectionTools = [
  defineTool({
    name: "listProtectionStatus",
    description:
      "Read presentation protection (mark as final / restrict editing). Returns kind, whether a password is required to unprotect, and Office-native modifyVerifier summary when present. Does not return hashes or passwords. Call before protectPresentation / unprotectPresentation. While protected, other edit tools are blocked in the editor until unprotectPresentation succeeds.",
    inputSchema: z.object({}),
    tags: ["read"],
    execute: (rt) => ok(protectionSnapshot(rt.getPres())),
  }),

  defineTool({
    name: "protectPresentation",
    description: [
      "Protect the presentation so further edits are blocked until unprotectPresentation.",
      "kind=final: mark as final (read-only, no password).",
      "kind=restricted: restrict editing; optional password writes an Office-native modifyVerifier so PowerPoint can unlock with the same password.",
      "If already protected, call unprotectPresentation first.",
      "This is web-editor enforcement plus optional Office write protection — not full PPTX encryption.",
      "Never echo the password back. Ripple: other mutate tools fail until the deck is unprotected.",
    ].join(" "),
    inputSchema: z.object({
      kind: z.enum(["final", "restricted"]).describe("final = mark as final (read-only). restricted = restrict editing."),
      password: z
        .string()
        .min(1)
        .optional()
        .describe("Optional. Only used with kind=restricted. Written as Office modifyVerifier, not returned."),
    }),
    tags: ["mutate"],
    execute: async (rt, { kind, password }) => {
      const pres = rt.getPres();
      if (getPresentationProtection(pres)) {
        return err("Presentation is already protected. Call unprotectPresentation first (password required if passwordRequired is true).");
      }
      if (kind === "final" && password) {
        return err("kind=final does not take a password. Use kind=restricted to set a password, or omit password.");
      }
      const trimmed = password?.trim() ?? "";
      const officeModifyVerifier =
        kind === "restricted" && trimmed ? await buildOfficeModifyVerifier(trimmed) : undefined;
      const res = rt.apply(
        new SetPresentationProtectionCmd(
          { kind, setAt: Date.now() },
          undefined,
          officeModifyVerifier,
        ),
      );
      if (!res.ok) return res;
      return ok({
        applied: true,
        passwordSet: Boolean(officeModifyVerifier),
        status: protectionSnapshot(rt.getPres()),
      });
    },
  }),

  defineTool({
    name: "unprotectPresentation",
    description:
      "Remove presentation protection. If listProtectionStatus.passwordRequired is true, password must match (SlimPPT hash or Office modifyVerifier). Other edit tools stay blocked until this succeeds. Does not return the password.",
    inputSchema: z.object({
      password: z.string().optional().describe("Required when passwordRequired is true. Compared against the stored verifier; never stored or returned."),
    }),
    tags: ["mutate"],
    execute: async (rt, { password }) => {
      try {
        await assertCanUnprotect(rt.getPres(), password);
      } catch (e) {
        if (isUnprotectFailedError(e)) return err(e.message);
        throw e;
      }
      const res = rt.apply(new SetPresentationProtectionCmd(undefined));
      if (!res.ok) return res;
      return ok({ applied: true, status: protectionSnapshot(rt.getPres()) });
    },
  }),
];
