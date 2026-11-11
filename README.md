<div align="center">

# Slim Office

Open a `.pptx` you already have. Edit and present it in the browser, then write the file back.

Documents and spreadsheets are planned. This repository ships the presentation part.

**[Editor](https://edit.slimppt.com)** · **[Docs](https://docs.slimppt.com/guide/getting-started)** · **[Open source](https://docs.slimppt.com/guide/open-source)**

English · [中文](./README.zh-CN.md)

<br>

<img src="./editor.png" width="900" alt="The Slim Office desktop app after opening a presentation.">

</div>

## Is this for you?

These packages open a `.pptx`, change it, present it, and write `.pptx`, HTML, PDF, PNG, or video.

- **Present** a deck in your own page.
- **Edit** the file, or export a video.
- **Let an agent** change `.pptx` files in one folder. Saving writes the file.

If the [editor](https://edit.slimppt.com) is enough, you do not need these packages. Accounts, online sharing, online storage, live broadcast, collaboration, and the hosted model stay there.

## Quick start

**1 · Install** the three packages that read, present, and write.

```sh
npm install @sliiu/present-parser @sliiu/present-player @sliiu/present-serializer
```

`@sliiu/present-player` is enough when you already have a parsed presentation. `@sliiu/present-editor` adds the editing surface and video export.

**2 · Read and present. 3 · Write it back.**

```ts
import { parsePptx } from "@sliiu/present-parser";
import { writePptx } from "@sliiu/present-serializer";
import { mount } from "@sliiu/present-player";

const pres = await parsePptx(await file.arrayBuffer());
mount(stage, pres);
const pptx = writePptx(pres);
```

Each entry has types, ESM, and CJS.

## What it does

### Present

`mount` takes a parsed presentation, not a `.pptx` file. In a page, load `dist/player.iife.js`. The global is `PPTPlayer`.

```html
<script src="node_modules/@sliiu/present-player/dist/player.iife.js"></script>
<script>
  PPTPlayer.mount(document.querySelector("#stage"), presentation);
</script>
```

HTML, PDF, and PNG come from the same package. The plugin file is `dist/plugin-sdk.iife.js`, global `PPTPluginSDK`. The player script already includes `PPTPlayer.definePlugin`.

### Edit

```ts
import { mountEditor } from "@sliiu/present-editor";

mountEditor(editor, pres);
```

editor also installs video export (ffmpeg.wasm), text recognition, OpenCV, and math rendering.

The desktop app is in `desktop/`. It opens files on this computer. The file home lists recent files; a presentation opens in the editor.

![The Slim Office desktop app on the file home.](./file-home.png)

### Generate

`@sliiu/present-ai` calls a model with your own key. Name Ink Board or Folio and that look holds for the whole generation: porcelain paper and near-black ink, or cool white with International Klein Blue.

### Local decks

An agent edits `.pptx` and `.pptm` files in one folder with the same tools as the online deck. Saving writes the file. That file is the export.

```bash
npx skills add sliiu/slimoffice --skill slimppt-local
npm install @sliiu/present-ai
```

Start the server with `node` on `@sliiu/present-ai`'s `dist/esm/mcp/server/stdio.js`. That file is the `./mcp-local` export from version 0.1.2. `SLIMPPT_ROOT` is the folder of deck files. The skill file has the MCP config.

## Packages

| Task | Package |
|---|---|
| Read a `.pptx` | `@sliiu/present-parser` |
| Write a `.pptx` | `@sliiu/present-serializer` |
| Present, or export HTML / PDF / PNG | `@sliiu/present-player` |
| Edit, or export a video | `@sliiu/present-editor` |
| Playback plugins | `@sliiu/present-plugin-sdk` |
| Call a model with your own key | `@sliiu/present-ai` |

`@sliiu/present-player` and `@sliiu/present-editor` install the packages they depend on. Install one of these on its own when you call that layer directly.

| Package | Role |
|---|---|
| `@sliiu/present-animation` | Timing and easing for on-slide animation |
| `@sliiu/present-core` | Slides, shapes, and color |
| `@sliiu/present-parser` | Read `.pptx` |
| `@sliiu/present-serializer` | Write `.pptx` |
| `@sliiu/present-three-bake` | Prepare 3D shapes for the renderer |
| `@sliiu/present-renderer` | Draw a slide to SVG, Canvas, or WebGL |
| `@sliiu/present-transition-fx` | Slide transitions and Morph |
| `@sliiu/present-plugin-sdk` | Playback plugins |
| `@sliiu/present-themes` | Themes, palettes, and decoration |
| `@sliiu/present-ui` | UI variables and controls. The stylesheet is `tokens.css` |
| `@sliiu/present-player` | Present, and export HTML / PDF / PNG |
| `@sliiu/present-editor` | The editing surface, and video export with narration and the lecture camera |
| `@sliiu/present-ai` | Call a model with your own key |

Common subpaths:

| Path | Use |
|---|---|
| `@sliiu/present-player/export` | `buildHtml`, `buildHtmlBundle` |
| `@sliiu/present-player/browser-screenshot` | PNG of a slide via a local headless Chrome, when there is no DOM |
| `@sliiu/present-player/pdf` | PDF page size |
| `@sliiu/present-player/iife` | The browser file |
| `@sliiu/present-serializer/source-json` | The original package as JSON |
| `@sliiu/present-editor/commands` | Editor commands |
| `@sliiu/present-ai/config` | Your own model settings |
| `@sliiu/present-ai/mcp-local` | Local decks. The file is `dist/esm/mcp/server/stdio.js` |
| `@sliiu/present-ui/tokens.css` | UI variables |
| `@sliiu/present-plugin-sdk/iife` | The plugin file |

The second argument to `buildHtml` is the text of `dist/player.iife.js`.

## License

Video export loads `@ffmpeg/core` from unpkg in the browser. That build is GPL-2.0-or-later and is outside the commercial contract. Other third-party licenses are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

License: [AGPL-3.0-or-later](LICENSE). Copyright holder: Sliiu Inc, see [COPYRIGHT](COPYRIGHT). A closed-source embed requires a commercial license. See [COMMERCIAL.md](COMMERCIAL.md).
