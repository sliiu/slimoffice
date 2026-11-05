"use strict";
// 把本地文稿 MCP 装进已经存在的 Agent。
// 技能文件进该 Agent 的 skills 目录；MCP 配置只写我们知道格式的那几个客户端。
// 不创建「这个 Agent 没装过」的家目录。显式 --agent 时即使检测目录不存在也写入。
//
//   pnpm exec tsx packages/ai/src/mcp/server/install.ts --decks /path/to/decks
//   pnpm exec tsx packages/ai/src/mcp/server/install.ts --agent cursor
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.InstallConfigError = void 0;
exports.repoRootFromHere = repoRootFromHere;
exports.skillMarkdownPath = skillMarkdownPath;
exports.installLocalAgent = installLocalAgent;
exports.selectAgents = selectAgents;
const promises_1 = require("node:fs/promises");
const node_fs_1 = require("node:fs");
const node_os_1 = require("node:os");
const node_path_1 = __importDefault(require("node:path"));
const node_url_1 = require("node:url");
const SERVER_NAME = "slimppt-local";
class InstallConfigError extends Error {
    constructor(message) {
        super(message);
        this.name = "InstallConfigError";
    }
}
exports.InstallConfigError = InstallConfigError;
const AGENTS = [
    { aliases: ["claude", "claude-code"], name: "Claude Code", detect: ".claude", skill: ".claude/skills", mcp: { file: ".claude.json", key: "mcpServers", shape: "stdio" } },
    { aliases: ["cursor"], name: "Cursor", detect: ".cursor", skill: ".cursor/skills", mcp: { file: ".cursor/mcp.json", key: "mcpServers", shape: "stdio" } },
    { aliases: ["copilot", "github-copilot"], name: "GitHub Copilot", detect: ".copilot", skill: ".copilot/skills" },
    { aliases: ["vscode"], name: "VS Code", detect: ".vscode", mcp: { file: ".vscode/mcp.json", key: "mcpServers", shape: "stdio" } },
    { aliases: ["codex", "openai-codex"], name: "Codex CLI", detect: ".agents", skill: ".agents/skills" },
    { aliases: ["windsurf"], name: "Windsurf", detect: ".windsurf", skill: ".windsurf/skills" },
    { aliases: ["pi", "pi-agent"], name: "Pi", detect: ".pi", skill: ".pi/agent/skills" },
    { aliases: ["minimax", "minimax-cli"], name: "MiniMax CLI", detect: ".minimax", skill: ".minimax/skills" },
    { aliases: ["opencode"], name: "OpenCode", detect: ".config/opencode", skill: ".config/opencode/skills", mcp: { file: ".config/opencode/opencode.json", key: "mcp", shape: "opencode" } },
    { aliases: ["hermes", "hermes-agent"], name: "Hermes Agent", detect: ".hermes", skill: ".hermes/skills" },
    { aliases: ["openclaw"], name: "OpenClaw", detect: ".openclaw", skill: ".openclaw/skills" },
    { aliases: ["nanobot"], name: "NanoBot", detect: ".nanobot/workspace", skill: ".nanobot/workspace/skills" },
    { aliases: ["zeroclaw"], name: "ZeroClaw", detect: ".zeroclaw/workspace", skill: ".zeroclaw/workspace/skills" },
    { aliases: ["dsh", "deepseek-harness"], name: "DeepSeek Harness", detect: ".dsh", skill: ".dsh/skills" },
];
function repoRootFromHere(here = (0, node_url_1.fileURLToPath)(new URL(".", (require("node:url").pathToFileURL(__filename).href)))) {
    const root = node_path_1.default.resolve(here, "../../../../..");
    if (!(0, node_fs_1.existsSync)(node_path_1.default.join(root, "pnpm-workspace.yaml"))) {
        throw new InstallConfigError(`SlimPPT repo root not found from ${here}`);
    }
    return root;
}
function skillMarkdownPath(here = (0, node_url_1.fileURLToPath)(new URL(".", (require("node:url").pathToFileURL(__filename).href)))) {
    return node_path_1.default.resolve(here, "../../../../../skills/slimppt-local/SKILL.md");
}
async function installLocalAgent(req) {
    const home = node_path_1.default.resolve(req.home);
    const repoRoot = node_path_1.default.resolve(req.repoRoot);
    const decksRoot = node_path_1.default.resolve(req.decksRoot);
    const skillMarkdown = req.skillMarkdown ?? (await (0, promises_1.readFile)(skillMarkdownPath(), "utf8"));
    const targets = selectAgents(req.agent).filter((agent) => req.agent || (0, node_fs_1.existsSync)(underHome(home, agent.detect)));
    const entry = mcpEntry(repoRoot, decksRoot);
    const planned = [];
    for (const agent of targets) {
        if (agent.skill) {
            planned.push({
                agent: agent.name,
                kind: "skill",
                file: node_path_1.default.join(underHome(home, agent.skill), SERVER_NAME, "SKILL.md"),
                body: skillMarkdown,
            });
        }
        if (agent.mcp) {
            planned.push({
                agent: agent.name,
                kind: "mcp",
                file: underHome(home, agent.mcp.file),
                body: await mergeMcpFile(underHome(home, agent.mcp.file), agent.mcp, entry),
            });
        }
    }
    const report = { skills: [], mcp: [] };
    for (const item of planned) {
        const status = await writeIfChanged(item.file, item.body);
        const row = { agent: item.agent, path: item.file, status };
        if (item.kind === "skill")
            report.skills.push(row);
        else
            report.mcp.push(row);
    }
    return report;
}
function selectAgents(agent) {
    if (!agent)
        return AGENTS;
    const key = agent.toLowerCase();
    const found = AGENTS.filter((a) => a.aliases.includes(key));
    if (found.length === 0) {
        throw new InstallConfigError(`Unknown agent "${agent}". Known: ${AGENTS.flatMap((a) => a.aliases).join(", ")}`);
    }
    return found;
}
function underHome(home, rel) {
    return node_path_1.default.join(home, ...rel.split("/").filter((part) => part.length > 0));
}
function mcpEntry(repoRoot, decksRoot) {
    const args = ["--dir", repoRoot, "exec", "tsx", "packages/ai/src/mcp/server/stdio.ts"];
    return {
        command: "pnpm",
        args,
        env: { SLIMPPT_ROOT: decksRoot },
    };
}
async function mergeMcpFile(file, target, stdio) {
    let root = {};
    if ((0, node_fs_1.existsSync)(file)) {
        const raw = await (0, promises_1.readFile)(file, "utf8");
        try {
            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
                throw new InstallConfigError(`${file} is not a JSON object`);
            }
            root = { ...parsed };
        }
        catch (e) {
            if (e instanceof InstallConfigError)
                throw e;
            throw new InstallConfigError(`${file} is not valid JSON. Leave it unchanged and fix it before installing.`);
        }
    }
    const current = root[target.key];
    const servers = current && typeof current === "object" && !Array.isArray(current) ? { ...current } : {};
    servers[SERVER_NAME] = target.shape === "opencode" ? openCodeEntry(stdio) : stdio;
    root[target.key] = servers;
    return `${JSON.stringify(root, null, 2)}\n`;
}
function openCodeEntry(stdio) {
    const args = stdio.args;
    return {
        type: "local",
        command: ["pnpm", ...args],
        environment: stdio.env,
    };
}
async function writeIfChanged(file, next) {
    if ((0, node_fs_1.existsSync)(file)) {
        const current = await (0, promises_1.readFile)(file, "utf8");
        if (current === next)
            return "unchanged";
    }
    await (0, promises_1.mkdir)(node_path_1.default.dirname(file), { recursive: true });
    await (0, promises_1.writeFile)(file, next);
    return "installed";
}
function parseArgs(argv) {
    const out = {};
    for (let i = 0; i < argv.length; i++) {
        const flag = argv[i];
        const value = argv[i + 1];
        if (flag === "--decks" && value) {
            out.decks = value;
            i++;
        }
        else if (flag === "--home" && value) {
            out.home = value;
            i++;
        }
        else if (flag === "--agent" && value) {
            out.agent = value;
            i++;
        }
        else if (flag === "--help" || flag === "-h") {
            console.log("pnpm exec tsx packages/ai/src/mcp/server/install.ts [--decks DIR] [--agent NAME]");
            process.exit(0);
        }
        else {
            throw new InstallConfigError(`Unknown argument "${flag}".`);
        }
    }
    return out;
}
const isDirectRun = process.argv[1] && node_path_1.default.resolve(process.argv[1]) === (0, node_url_1.fileURLToPath)((require("node:url").pathToFileURL(__filename).href));
if (isDirectRun) {
    const args = parseArgs(process.argv.slice(2));
    const decks = args.decks ?? process.env.SLIMPPT_ROOT ?? process.cwd();
    installLocalAgent({
        home: args.home ?? (0, node_os_1.homedir)(),
        repoRoot: repoRootFromHere(),
        decksRoot: decks,
        ...(args.agent ? { agent: args.agent } : {}),
    })
        .then((report) => {
        const lines = [...report.skills, ...report.mcp];
        if (lines.length === 0) {
            console.error("No supported agent directories detected.");
            process.exitCode = 1;
            return;
        }
        for (const line of lines) {
            console.log(`${line.status}\t${line.agent}\t${line.path}`);
        }
    })
        .catch((err) => {
        console.error(err instanceof Error ? err.message : err);
        process.exitCode = 1;
    });
}
