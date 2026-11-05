---
name: slimppt-local
description: Edit a local .pptx with the same tools as SlimPPT's online deck MCP. Use when the user wants to read, change, or save a PowerPoint file on disk.
---

# SlimPPT local decks

This server edits `.pptx` and `.pptm` files in one folder. The tool names match the online deck MCP. Saving writes the `.pptx` file. That file is the export.

## Install

```bash
npx skills add sliiu/slimoffice --skill slimppt-local
npm install @sliiu/present-ai
```

That copies this file into the agent skill directory. It does not start the server. The server is the installed package, not the TypeScript sources in this repository. `@sliiu/present-ai@0.1.1` does not include this file. It ships as the `./mcp-local` export from `0.1.2`.

## Start

`SLIMPPT_ROOT` is the folder of deck files. It defaults to the current directory. Only `.pptx` and `.pptm` files in that one folder are visible. `deckId` is the file name, such as `talk.pptx`.

```bash
SLIMPPT_ROOT=/path/to/decks node node_modules/@sliiu/present-ai/dist/esm/mcp/server/stdio.js
```

Cursor MCP config. Replace both paths.

```json
{
  "mcpServers": {
    "slimppt-local": {
      "command": "node",
      "args": ["/absolute/path/to/node_modules/@sliiu/present-ai/dist/esm/mcp/server/stdio.js"],
      "env": { "SLIMPPT_ROOT": "/path/to/decks" }
    }
  }
}
```

`render_slide` is not part of this package. It is registered only in a SlimPPT checkout where the player build and playwright are present.

## Order

1. `list_presentations`
2. `open_presentation` with `deckId`
3. Edit with the same tools as the online deck MCP
4. `save_presentation` before opening another file

One deck stays open. `close_presentation` drops unsaved edits. There is no separate export tool.

## New deck from a topic

Call `generate_presentation` with `topic` and a new file name as `deckId` (for example `ai-km.pptx`). It runs SlimPPT's own generator: outline, per-page layout, layout gates, repair, and, when the model can see images, a visual review that re-lays the worst pages. The result opens in the session unsaved. Use it instead of building a deck with `createSlide` and shape tools. Those give a plain layout with no design system. Generation takes one to a few minutes and spends the configured model's quota.

Pass what the user said as `notes` (tone, brand color, page numbers, must-include facts). Pass their source text as `sourceMaterial` so numbers come from it rather than from the model.

## Look before you save

After generating or editing, check the pages you touched:

- Empty blocks: a quarter of the page holding nothing under a short row of items. Grow the carrier or close the gap.
- A column split by a void: a title at the top and its copy far below in the same column.
- One or two characters alone on a heading's last line. Shorten the heading or widen its box.
- The same figures twice: KPI tiles and a chart of the same numbers. Keep one carrier.
- Text over text, text past the page edge, low-contrast text on a photo.
- Decoration that says nothing ("4 steps total" next to four steps), and numbers with no source.

Fix with the edit tools, then `save_presentation`.

`generate_presentation`, `generateAndApplyTheme`, `generateAndApplyMotionScheme`, `generateImage`, and `fillImagePlaceholders` read `AI_API_KEY`, the image-provider variables, `UNSPLASH_KEY`, and `PEXELS_KEY` in the server process. A missing key returns not configured.
