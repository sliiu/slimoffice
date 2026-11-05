import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, it } from "node:test";
import { InstallConfigError, installLocalAgent, repoRootFromHere, skillMarkdownPath } from "./install.js";

const SKILL = "---\nname: slimppt-local\n---\n\n# local\n";

async function home(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "slimppt-install-"));
}

describe("install local agent", () => {
  it("writes the skill and mcp config only for agents already present", async () => {
    const dir = await home();
    await mkdir(path.join(dir, ".cursor"));
    await mkdir(path.join(dir, ".claude"));
    await writeFile(
      path.join(dir, ".cursor", "mcp.json"),
      `${JSON.stringify({ mcpServers: { other: { command: "echo" } } }, null, 2)}\n`,
    );

    const report = await installLocalAgent({
      home: dir,
      repoRoot: "/repo",
      decksRoot: "/decks",
      skillMarkdown: SKILL,
    });

    assert.deepEqual(
      report.skills.map((s) => s.agent).sort(),
      ["Claude Code", "Cursor"],
    );
    assert.equal(await readFile(path.join(dir, ".cursor/skills/slimppt-local/SKILL.md"), "utf8"), SKILL);
    assert.equal(await readFile(path.join(dir, ".claude/skills/slimppt-local/SKILL.md"), "utf8"), SKILL);
    assert.equal(existsSync(path.join(dir, ".copilot")), false);

    const cursor = JSON.parse(await readFile(path.join(dir, ".cursor/mcp.json"), "utf8")) as {
      mcpServers: Record<string, { command: string; args: string[]; env: { SLIMPPT_ROOT: string } }>;
    };
    assert.equal(cursor.mcpServers.other?.command, "echo");
    assert.equal(cursor.mcpServers["slimppt-local"]?.command, "pnpm");
    assert.deepEqual(cursor.mcpServers["slimppt-local"]?.args.slice(0, 3), ["--dir", "/repo", "exec"]);
    assert.equal(cursor.mcpServers["slimppt-local"]?.env.SLIMPPT_ROOT, "/decks");

    const claude = JSON.parse(await readFile(path.join(dir, ".claude.json"), "utf8")) as {
      mcpServers: Record<string, { command: string }>;
    };
    assert.equal(claude.mcpServers["slimppt-local"]?.command, "pnpm");

    const again = await installLocalAgent({
      home: dir,
      repoRoot: "/repo",
      decksRoot: "/decks",
      skillMarkdown: SKILL,
    });
    assert.equal(again.skills.every((s) => s.status === "unchanged"), true);
    assert.equal(again.mcp.every((s) => s.status === "unchanged"), true);
  });

  it("installs one named agent even when its directory is missing", async () => {
    const dir = await home();
    const report = await installLocalAgent({
      home: dir,
      repoRoot: "/repo",
      decksRoot: "/decks",
      agent: "opencode",
      skillMarkdown: SKILL,
    });
    assert.equal(report.skills.length, 1);
    assert.equal(report.mcp.length, 1);
    const cfg = JSON.parse(await readFile(path.join(dir, ".config/opencode/opencode.json"), "utf8")) as {
      mcp: Record<string, { type: string; command: string[]; environment: { SLIMPPT_ROOT: string } }>;
    };
    assert.equal(cfg.mcp["slimppt-local"]?.type, "local");
    assert.equal(cfg.mcp["slimppt-local"]?.command[0], "pnpm");
    assert.equal(cfg.mcp["slimppt-local"]?.environment.SLIMPPT_ROOT, "/decks");
  });

  it("leaves an invalid mcp config untouched", async () => {
    const dir = await home();
    const file = path.join(dir, ".cursor/mcp.json");
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, "{ this is not json");
    await assert.rejects(
      () =>
        installLocalAgent({
          home: dir,
          repoRoot: "/repo",
          decksRoot: "/decks",
          agent: "cursor",
          skillMarkdown: SKILL,
        }),
      (e: unknown) => e instanceof InstallConfigError && /not valid JSON/.test(e.message),
    );
    assert.equal(await readFile(file, "utf8"), "{ this is not json");
  });

  it("finds the repo root and the npx skills catalog file", async () => {
    const root = repoRootFromHere();
    assert.equal(existsSync(path.join(root, "pnpm-workspace.yaml")), true);
    const skill = await readFile(skillMarkdownPath(), "utf8");
    assert.match(skill, /^---\nname: slimppt-local\n/);
    assert.equal(skillMarkdownPath(), path.join(root, "skills/slimppt-local/SKILL.md"));
  });
});
