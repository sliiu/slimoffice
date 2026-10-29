[English](./README.md) | 中文

# Slim Office

演示部分在 `present/`。用它打开 `.pptx`，在浏览器里编辑和放映，再写出 `.pptx`、HTML、PDF 或 PNG。

许可证是 [AGPL-3.0-or-later](LICENSE)。版权人是 Sliiu Inc，见 [COPYRIGHT](COPYRIGHT)。闭源嵌入需要商业授权，见 [COMMERCIAL.md](COMMERCIAL.md)。

## 安装

| 要做的事 | 包 |
|---|---|
| 读 `.pptx` | `@sliiu/present-parser` |
| 写 `.pptx` | `@sliiu/present-serializer` |
| 放映，或导出 HTML / PDF / PNG | `@sliiu/present-player` |
| 编辑 | `@sliiu/present-editor` |
| 放映插件 | `@sliiu/present-plugin-sdk` |
| 自备密钥调用模型 | `@sliiu/present-ai` |

只放映时安装 player。editor 会带上文字识别、OpenCV 和公式渲染。

## 引入

每个入口都带类型、ESM 和 CJS。

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

常用子路径：

| 路径 | 用途 |
|---|---|
| `@sliiu/present-player/export` | `buildHtml`、`buildHtmlBundle` |
| `@sliiu/present-player/pdf` | PDF 页尺寸 |
| `@sliiu/present-player/iife` | 浏览器单文件 |
| `@sliiu/present-serializer/source-json` | 原始压缩包的 JSON 形式 |
| `@sliiu/present-editor/commands` | 编辑命令 |
| `@sliiu/present-ai/config` | 自备密钥的配置 |
| `@sliiu/present-ui/tokens.css` | 界面变量 |
| `@sliiu/present-plugin-sdk/iife` | 插件单文件 |

`buildHtml` 的第二个参数是 player 的脚本正文，用 `dist/player.iife.js` 里的文本。

## 页面里放映

`dist/player.iife.js` 用普通 script 引入，全局名是 `PPTPlayer`。`mount` 接收的是已经解析好的演示文稿，不是 `.pptx` 文件本身。

```html
<script src="node_modules/@sliiu/present-player/dist/player.iife.js"></script>
<script>
  PPTPlayer.mount(document.querySelector("#stage"), presentation);
</script>
```

插件单文件是 `dist/plugin-sdk.iife.js`，全局名 `PPTPluginSDK`。放映脚本里已经有 `PPTPlayer.definePlugin`。

## 包

`@sliiu/present-player` 和 `@sliiu/present-editor` 会装上它们依赖的包。要直接调用某一层时，再单独安装。

| 包 | 作用 |
|---|---|
| `@sliiu/present-animation` | 页内动画的时间线和缓动 |
| `@sliiu/present-core` | 幻灯片、形状和颜色的数据结构 |
| `@sliiu/present-parser` | 读 `.pptx` |
| `@sliiu/present-serializer` | 写 `.pptx` |
| `@sliiu/present-three-bake` | 把立体形状准备成渲染器用的场景 |
| `@sliiu/present-renderer` | 把幻灯片画到 SVG、Canvas 或 WebGL |
| `@sliiu/present-transition-fx` | 翻页切换和 Morph |
| `@sliiu/present-plugin-sdk` | 放映插件 |
| `@sliiu/present-themes` | 主题、配色和装饰 |
| `@sliiu/present-ui` | 界面变量和控件。样式文件是 `tokens.css` |
| `@sliiu/present-player` | 放映，以及 HTML / PDF / PNG |
| `@sliiu/present-editor` | 编辑界面 |
| `@sliiu/present-ai` | 自备密钥调用模型 |

安装、引入和 HTML 放映见文档站的[开源版本](https://docs.slimppt.com/zh-cn/guide/open-source)。

账号、在线分享、在线存储、直播放映、协作和系统模型不在这些包里。

视频导出在浏览器里从 unpkg 加载 `@ffmpeg/core`。这段是 GPL-2.0-or-later，不在商业授权里。其余第三方库见 [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md)。
