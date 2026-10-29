English | [中文](./README.zh-CN.md)

# Slim Office

The present tree lives in `present/`. Open a `.pptx`, edit and present it in the browser, then write `.pptx`, HTML, PDF, or PNG.

## Install

| Task | Package |
|---|---|
| Read a `.pptx` | `@sliiu/present-parser` |
| Write a `.pptx` | `@sliiu/present-serializer` |
| Present, or export HTML / PDF / PNG | `@sliiu/present-player` |
| Edit | `@sliiu/present-editor` |
| Playback plugins | `@sliiu/present-plugin-sdk` |
| Call a model with your own key | `@sliiu/present-ai` |

Install player to present. editor also installs text recognition, OpenCV, and math rendering.

## Import

Each entry has types, ESM, and CJS.

```ts
import { parsePptx } from "@sliiu/present-parser";
import { writePptx } from "@sliiu/present-serializer";
import { mount } from "@sliiu/present-player";
import { mountEditor } from "@sliiu/present-editor";

const pres = await parsePptx(await file.arrayBuffer());
mount(stage, pres);
mountEditor(editor, pres);
const pptx = writePptx(pres);
```

```js
const { parsePptx } = require("@sliiu/present-parser");
```

Common subpaths:

| Path | Use |
|---|---|
| `@sliiu/present-player/export` | `buildHtml`, `buildHtmlBundle` |
| `@sliiu/present-player/pdf` | PDF page size |
| `@sliiu/present-player/iife` | The browser file |
| `@sliiu/present-serializer/source-json` | The original package as JSON |
| `@sliiu/present-editor/commands` | Editor commands |
| `@sliiu/present-ai/config` | Your own model settings |
| `@sliiu/present-ui/tokens.css` | UI variables |
| `@sliiu/present-plugin-sdk/iife` | The plugin file |

The second argument to `buildHtml` is the text of `dist/player.iife.js`.

## Present in a page

Load `dist/player.iife.js` with a script tag. The global is `PPTPlayer`. `mount` takes a parsed presentation, not a `.pptx` file.

```html
<script src="node_modules/@sliiu/present-player/dist/player.iife.js"></script>
<script>
  PPTPlayer.mount(document.querySelector("#stage"), presentation);
</script>
```

The plugin file is `dist/plugin-sdk.iife.js`, global `PPTPluginSDK`. The player script already includes `PPTPlayer.definePlugin`.

## Packages

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
| `@sliiu/present-editor` | The editing surface |
| `@sliiu/present-ai` | Call a model with your own key |

Install, import, and HTML playback are in the docs: [Open source](https://docs.slimppt.com/guide/open-source).

Accounts, online sharing, online storage, live broadcast, collaboration, and the hosted model are outside these packages.

Video export loads `@ffmpeg/core` from unpkg in the browser. That build is GPL-2.0-or-later and is outside the commercial contract. Other third-party licenses are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

License: [AGPL-3.0-or-later](LICENSE). Copyright holder: Sliiu Inc, see [COPYRIGHT](COPYRIGHT). A closed-source embed requires a commercial license. See [COMMERCIAL.md](COMMERCIAL.md).
