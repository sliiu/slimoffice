export declare class InstallConfigError extends Error {
    constructor(message: string);
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
export declare function repoRootFromHere(here?: string): string;
export declare function skillMarkdownPath(here?: string): string;
export declare function installLocalAgent(req: InstallRequest): Promise<InstallReport>;
export declare function selectAgents(agent: string | undefined): AgentTarget[];
export {};
