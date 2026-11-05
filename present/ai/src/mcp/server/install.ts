// 把本地文稿 MCP 装进已经存在的 Agent。
// 技能文件进该 Agent 的 skills 目录；MCP 配置只写我们知道格式的那几个客户端。
// 不创建「这个 Agent 没装过」的家目录。显式 --agent 时即使检测目录不存在也写入。
//
//   pnpm exec tsx packages/ai/src/mcp/server/install.ts --decks /path/to/decks
//   pnpm exec tsx packages/ai/src/mcp/server/install.ts --agent cursor

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SERVER_NAME = "slimppt-local";

export class InstallConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallConfigError";
  }
}

interface McpTarget {
  /** 相对家目录。 */
  file: string;
  key: "mcpServers" | "mcp";
  shape: "stdio" | "opencode";
}

interface AgentTarget {
  aliases: string[];
  name: string;
  /** 相对家目录。目录存在才算检测到。 */
  detect: string;
  /** 相对家目录。技能写成 <skill>/slimppt-local/SKILL.md。 */
  skill?: string;
  mcp?: McpTarget;
}

const AGENTS: AgentTarget[] = [
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

export interface InstallRequest {
  /** 用户家目录。测试传入临时目录。 */
  home: string;
  /** SlimPPT 仓库根，pnpm --dir 用它找到 tsx。 */
  repoRoot: string;
  /** 本地 .pptx 所在目录，写入 SLIMPPT_ROOT。 */
  decksRoot: string;
  /** 只装这一个 Agent（别名）。缺省则装所有已检测到的。 */
  agent?: string;
  skillMarkdown?: string;
}

export interface InstallWrite {
  agent: string;
  path: string;
  status: "installed" | "unchanged";
}

export interface InstallReport {
  skills: InstallWrite[];
  mcp: InstallWrite[];
}

export function repoRootFromHere(here = fileURLToPath(new URL(".", import.meta.url))): string {
  const root = path.resolve(here, "../../../../..");
  if (!existsSync(path.join(root, "pnpm-workspace.yaml"))) {
    throw new InstallConfigError(`SlimPPT repo root not found from ${here}`);
  }
  return root;
}

export function skillMarkdownPath(here = fileURLToPath(new URL(".", import.meta.url))): string {
  return path.resolve(here, "../../../../../skills/slimppt-local/SKILL.md");
}

export async function installLocalAgent(req: InstallRequest): Promise<InstallReport> {
  const home = path.resolve(req.home);
  const repoRoot = path.resolve(req.repoRoot);
  const decksRoot = path.resolve(req.decksRoot);
  const skillMarkdown = req.skillMarkdown ?? (await readFile(skillMarkdownPath(), "utf8"));
  const targets = selectAgents(req.agent).filter((agent) => req.agent || existsSync(underHome(home, agent.detect)));
  const entry = mcpEntry(repoRoot, decksRoot);
  const planned: Array<{ agent: string; kind: "skill" | "mcp"; file: string; body: string }> = [];
  for (const agent of targets) {
    if (agent.skill) {
      planned.push({
        agent: agent.name,
        kind: "skill",
        file: path.join(underHome(home, agent.skill), SERVER_NAME, "SKILL.md"),
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
  const report: InstallReport = { skills: [], mcp: [] };
  for (const item of planned) {
    const status = await writeIfChanged(item.file, item.body);
    const row = { agent: item.agent, path: item.file, status };
    if (item.kind === "skill") report.skills.push(row);
    else report.mcp.push(row);
  }
  return report;
}

export function selectAgents(agent: string | undefined): AgentTarget[] {
  if (!agent) return AGENTS;
  const key = agent.toLowerCase();
  const found = AGENTS.filter((a) => a.aliases.includes(key));
  if (found.length === 0) {
    throw new InstallConfigError(`Unknown agent "${agent}". Known: ${AGENTS.flatMap((a) => a.aliases).join(", ")}`);
  }
  return found;
}

function underHome(home: string, rel: string): string {
  return path.join(home, ...rel.split("/").filter((part) => part.length > 0));
}

function mcpEntry(repoRoot: string, decksRoot: string): Record<string, unknown> {
  const args = ["--dir", repoRoot, "exec", "tsx", "packages/ai/src/mcp/server/stdio.ts"];
  return {
    command: "pnpm",
    args,
    env: { SLIMPPT_ROOT: decksRoot },
  };
}

async function mergeMcpFile(file: string, target: McpTarget, stdio: Record<string, unknown>): Promise<string> {
  let root: Record<string, unknown> = {};
  if (existsSync(file)) {
    const raw = await readFile(file, "utf8");
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new InstallConfigError(`${file} is not a JSON object`);
      }
      root = { ...(parsed as Record<string, unknown>) };
    } catch (e) {
      if (e instanceof InstallConfigError) throw e;
      throw new InstallConfigError(`${file} is not valid JSON. Leave it unchanged and fix it before installing.`);
    }
  }
  const current = root[target.key];
  const servers: Record<string, unknown> =
    current && typeof current === "object" && !Array.isArray(current) ? { ...(current as Record<string, unknown>) } : {};
  servers[SERVER_NAME] = target.shape === "opencode" ? openCodeEntry(stdio) : stdio;
  root[target.key] = servers;
  return `${JSON.stringify(root, null, 2)}\n`;
}

function openCodeEntry(stdio: Record<string, unknown>): Record<string, unknown> {
  const args = stdio.args as string[];
  return {
    type: "local",
    command: ["pnpm", ...args],
    environment: stdio.env,
  };
}

async function writeIfChanged(file: string, next: string): Promise<"installed" | "unchanged"> {
  if (existsSync(file)) {
    const current = await readFile(file, "utf8");
    if (current === next) return "unchanged";
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, next);
  return "installed";
}

function parseArgs(argv: string[]): { decks?: string; home?: string; agent?: string } {
  const out: { decks?: string; home?: string; agent?: string } = {};
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--decks" && value) {
      out.decks = value;
      i++;
    } else if (flag === "--home" && value) {
      out.home = value;
      i++;
    } else if (flag === "--agent" && value) {
      out.agent = value;
      i++;
    } else if (flag === "--help" || flag === "-h") {
      console.log("pnpm exec tsx packages/ai/src/mcp/server/install.ts [--decks DIR] [--agent NAME]");
      process.exit(0);
    } else {
      throw new InstallConfigError(`Unknown argument "${flag}".`);
    }
  }
  return out;
}

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const args = parseArgs(process.argv.slice(2));
  const decks = args.decks ?? process.env.SLIMPPT_ROOT ?? process.cwd();
  installLocalAgent({
    home: args.home ?? homedir(),
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
    .catch((err: unknown) => {
      console.error(err instanceof Error ? err.message : err);
      process.exitCode = 1;
    });
}
