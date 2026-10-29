"use strict";
// Capability 管理工具：让模型自助发现 / 开关 MCP 能力与 Skills。
//
// 这四个工具**永远直接注册在内置工具集里**（不走能力开关）—— 避免"要开 MCP
// 才能开 MCP"的死锁。chat 组装层保证它们最后合并、绝不被 MCP 同名工具 shadow。
//
// 工作模式：
//   - list_capabilities      → 只读；模型先调，看到 enabled / ready / missing
//   - set_capability_enabled → session 写 chip Map（下一 turn 生效）；persistent 写 localStorage
//   - suggest_open_settings  → 切 Settings tab；缺 API key 时模型用它引导用户
//   - read_skill             → 渐进披露：按需读某个 skill 全文（不改开关）
Object.defineProperty(exports, "__esModule", { value: true });
exports.capabilityTools = void 0;
const zod_1 = require("zod");
const types_1 = require("../types");
const registry_1 = require("../../mcp/client/registry");
const registry_2 = require("../../skills/registry");
exports.capabilityTools = [
    (0, types_1.defineTool)({
        name: "list_capabilities",
        description: [
            "List all available MCP servers and Skills with current enabled state, ready state, missing config and stage info.",
            "Call this FIRST before answering 'why is feature X not working' or suggesting a capability change.",
            "Use the returned ids verbatim with `set_capability_enabled` / `suggest_open_settings`.",
        ].join(" "),
        inputSchema: zod_1.z.object({}),
        tags: ["read", "capability"],
        execute: (rt) => {
            const mcpList = (0, registry_1.listServers)(rt.getConfig());
            const skillList = (0, registry_2.listSkills)(rt.hostSkillStore);
            return {
                ok: true,
                mcp: mcpList.map((v) => {
                    const sessionOverride = rt.getMcpSessionOverride?.(v.id) ?? null;
                    const effectiveEnabled = sessionOverride ?? v.enabled;
                    return {
                        id: v.id,
                        name: v.name,
                        description: v.description,
                        enabled: effectiveEnabled,
                        persistedEnabled: v.enabled,
                        sessionOverride,
                        ready: v.ready,
                        missing: v.missing,
                        chatOnly: v.chatOnly,
                        privacySensitive: v.privacySensitive,
                    };
                }),
                skills: skillList.map((v) => ({
                    id: v.id,
                    name: v.name,
                    description: v.description,
                    stage: v.stage,
                    source: v.source,
                    enabled: v.enabled,
                })),
                notes: [
                    "MCP tools become available the next turn after enabling (session or persistent). Tell user to repeat their request when you enable an MCP.",
                    "Skills only support scope='persistent'; they affect the next generation/chat turn automatically.",
                    "If a skill's description looks relevant but it is disabled (or its content isn't in your context), call `read_skill({ id })` to read its full body on demand — no need to enable it first.",
                    "If a tool you need is in missing[] of a not-ready MCP, do NOT ask the user to paste keys — call `suggest_open_settings({ fields: missing, reason })`.",
                ],
            };
        },
    }),
    (0, types_1.defineTool)({
        name: "set_capability_enabled",
        description: [
            "Enable or disable an MCP server or Skill.",
            "Default scope='session' (chip-style override; effect on NEXT turn; cleared when user clears chat).",
            "Use scope='persistent' ONLY when the user explicitly asks ('以后都...', 'permanent', 'always').",
            "Privacy-sensitive MCPs (chat_history) may trigger a user confirmation regardless of scope.",
            "Returns `requiresResend=true` when you should ask the user to repeat their request so new tools become callable.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            kind: zod_1.z.enum(["mcp", "skill"]).describe("Which registry. Skills don't support session scope."),
            id: zod_1.z.string().describe("Use the exact id from list_capabilities."),
            enabled: zod_1.z.boolean(),
            scope: zod_1.z
                .enum(["session", "persistent"])
                .optional()
                .describe("Default 'session' for MCP; ignored for skill (always persistent)."),
        }),
        tags: ["capability"],
        execute: (rt, { kind, id, enabled, scope }) => {
            const effScope = scope ?? (kind === "skill" ? "persistent" : "session");
            if (kind === "mcp") {
                const view = (0, registry_1.getServerView)(id, rt.getConfig());
                if (!view) {
                    return { ok: false, error: `MCP "${id}" not found. Use list_capabilities to see available ids.` };
                }
                if (enabled && !view.ready) {
                    return {
                        ok: false,
                        error: `MCP "${id}" is not ready — missing config: ${view.missing.join(", ")}`,
                        suggestTool: "suggest_open_settings",
                        missingFields: view.missing,
                    };
                }
                if (effScope === "session") {
                    if (!rt.setMcpSessionOverride) {
                        return {
                            ok: false,
                            error: "Host does not support session scope. Retry with scope='persistent' if user explicitly asked, or just tell the user to enable from the AI panel.",
                        };
                    }
                    rt.setMcpSessionOverride(id, enabled);
                    return {
                        ok: true,
                        kind: "mcp",
                        id,
                        enabled,
                        scope: "session",
                        requiresResend: true,
                        message: `${view.name} ${enabled ? "enabled" : "disabled"} for this session. Tools become available the next turn — ask the user to repeat their request.`,
                    };
                }
                // persistent
                const previousEnabled = view.enabled;
                (0, registry_1.setEnabled)(id, enabled);
                rt.onCapabilityChanged?.({
                    kind: "mcp",
                    id,
                    name: view.name,
                    enabled,
                    scope: "persistent",
                    previousEnabled,
                });
                return {
                    ok: true,
                    kind: "mcp",
                    id,
                    enabled,
                    scope: "persistent",
                    requiresResend: true,
                    privacySensitive: view.privacySensitive,
                    message: `${view.name} ${enabled ? "enabled" : "disabled"} permanently. ${view.privacySensitive ? "(Privacy-sensitive — host will ask the user to confirm.) " : ""}Tools become available the next turn.`,
                };
            }
            // kind === "skill"
            const skillView = (0, registry_2.getSkill)(id, rt.hostSkillStore);
            if (!skillView) {
                return { ok: false, error: `Skill "${id}" not found. Use list_capabilities to see available ids.` };
            }
            if (effScope === "session") {
                return {
                    ok: false,
                    error: "Skills only support scope='persistent'. Skills affect every following generation/chat anyway; pick persistent or do nothing.",
                };
            }
            const previousEnabled = skillView.enabled;
            (0, registry_2.setSkillEnabled)(id, enabled);
            rt.onCapabilityChanged?.({
                kind: "skill",
                id,
                name: skillView.name,
                enabled,
                scope: "persistent",
                previousEnabled,
            });
            return {
                ok: true,
                kind: "skill",
                id,
                enabled,
                scope: "persistent",
                message: `Skill "${skillView.name}" ${enabled ? "enabled" : "disabled"}. Takes effect on the next generation / chat turn.`,
            };
        },
    }),
    (0, types_1.defineTool)({
        name: "suggest_open_settings",
        description: [
            "Ask the host UI to open the AI Settings tab and highlight specific fields (e.g. unsplashKey, pexelsKey, apiKey).",
            "Use this when a capability is not ready due to missing configuration — never ask the user to paste secrets into chat.",
            "Always pair with a short, human-friendly `reason` (in the user's language) explaining why.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            fields: zod_1.z
                .array(zod_1.z.string())
                .min(1)
                .describe("Field names from `missing` of list_capabilities (or known fields: apiKey, baseURL, imageApiKey, unsplashKey, pexelsKey)."),
            reason: zod_1.z.string().min(1).max(200).describe("Short, user-facing explanation (mirror user's language)."),
        }),
        tags: ["capability"],
        execute: (rt, { fields, reason }) => {
            if (rt.onOpenSettings) {
                try {
                    rt.onOpenSettings(fields, reason);
                    return {
                        ok: true,
                        opened: true,
                        fields,
                        message: `Asked host to open Settings tab and highlight: ${fields.join(", ")}`,
                    };
                }
                catch (e) {
                    console.warn("[suggest_open_settings] host hook threw", e);
                }
            }
            return {
                ok: true,
                opened: false,
                fields,
                message: `Host does not implement onOpenSettings — instruct the user to open the AI Settings tab manually and fill: ${fields.join(", ")}`,
            };
        },
    }),
    // 渐进披露：list_capabilities 只给 name/description；模型判断某个 skill 相关但
    // 内容不在 prompt 里（disabled / 32KB 预算被截断 / stage 不匹配）时，用它按需读全文。
    (0, types_1.defineTool)({
        name: "read_skill",
        description: [
            "Read the full markdown body of a Skill by id (enabled or disabled).",
            "Use when list_capabilities shows a skill whose description looks relevant to the current request",
            "but its content is not in your context (disabled, stage-mismatched, or truncated by the 32KB injection budget).",
            "Read-only: it does NOT enable the skill. Follow the returned guidance for this turn;",
            "call `set_capability_enabled` only if the user wants it active for future turns.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            id: zod_1.z.string().describe("Skill id from list_capabilities."),
        }),
        tags: ["read", "capability"],
        execute: (rt, { id }) => {
            const skillView = (0, registry_2.getSkill)(id, rt.hostSkillStore);
            if (!skillView) {
                return { ok: false, error: `Skill "${id}" not found. Use list_capabilities to see available ids.` };
            }
            return {
                ok: true,
                id: skillView.id,
                name: skillView.name,
                description: skillView.description,
                stage: skillView.stage,
                source: skillView.source,
                enabled: skillView.enabled,
                body: skillView.body,
            };
        },
    }),
];
