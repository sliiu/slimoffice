---
name: slimppt-local
description: Edit a local .pptx with the same tools as SlimPPT's deck MCP. Use when the user wants to read, change, or save a PowerPoint file on disk.
---

# SlimPPT local decks

Install this skill from the public Slim Office repository:

```bash
npx skills add sliiu/slimoffice --skill slimppt-local
```

That copies these instructions into the agent. It does not start a server.

## What to do

Edit `.pptx` and `.pptm` files in one folder. `deckId` is the file name, such as `talk.pptx`.

1. `list_presentations`
2. `open_presentation` with that `deckId`
3. Edit with the tools from `createPptMcpServer` (`@sliiu/present-ai/mcp-server`)
4. `save_presentation` before opening another file

Saving writes that `.pptx`. The file is the export. One deck stays open. `close_presentation` drops unsaved edits.

`generateAndApplyTheme`, `generateAndApplyMotionScheme`, `generateImage`, and `fillImagePlaceholders` read `AI_API_KEY`, the image-provider variables, `UNSPLASH_KEY`, and `PEXELS_KEY` in the server process. A missing key returns not configured.

## Start the server

From a checkout of https://github.com/sliiu/slimoffice, when `present/ai/src/mcp/server/stdio.ts` is present:

```bash
SLIMPPT_ROOT=/path/to/decks pnpm --dir present/ai exec tsx src/mcp/server/stdio.ts
```

`SLIMPPT_ROOT` is the folder of deck files. It defaults to the current directory.

Cursor MCP config:

```json
{
  "mcpServers": {
    "slimppt-local": {
      "command": "pnpm",
      "args": ["--dir", "/absolute/path/to/slimoffice/present/ai", "exec", "tsx", "src/mcp/server/stdio.ts"],
      "env": { "SLIMPPT_ROOT": "/path/to/decks" }
    }
  }
}
```

`@sliiu/present-ai@0.1.1` exposes `createPptMcpServer` and does not include this folder launcher. The launcher arrives in slimoffice when the present tree is published again.
