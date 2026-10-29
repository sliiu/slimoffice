# 第三方许可证

公开包自有代码的版权人是 Sliiu Inc，使用 AGPL-3.0-or-later，全文是同目录的 `AGPL-3.0.txt`。版权行见 `COPYRIGHT`。下面这些库不是 SlimPPT 写的，许可证保持原样。版本是整理这份声明时锁文件里的版本。

各依赖包自带的 `LICENSE` 随 npm 安装保留。这里记下标识，以及不能被商业授权盖住的那几份。

## 不能并进商业授权

`mtx-decompressor@1.6.0`（`@ppt/parser`）是 MPL-2.0，作者 ChristopherVR。全文是 `MPL-2.0.txt`。只约束这个库的文件，可以和闭源程序放在一起，不能改成专有许可。

`@ffmpeg/ffmpeg@0.12.15` 和 `@ffmpeg/util@0.12.2` 是 MIT，作者 Jerome Wu。编辑器在 `packages/editor/src/video-export.ts` 里另从 `https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm` 加载内核。`0.12.6` 的 npm 元数据写着 MIT。该 WebAssembly 的构建串包含 libx264、libx265 和 libmp3lame，实际是 GPL-2.0-or-later。GPL-2.0 全文是 `GPL-2.0.txt`；“or later” 也可以选用 GNU GPL 3.0。商业授权不含这段内核。

## Apache-2.0

全文是 `Apache-2.0.txt`。可以放进 AGPL 程序，文件本身仍是 Apache-2.0。

| 包 | 版本 | 版权声明 |
|---|---|---|
| `ai`、`@ai-sdk/anthropic`、`@ai-sdk/google`、`@ai-sdk/mcp`、`@ai-sdk/openai`、`@ai-sdk/openai-compatible`，以及它们带上的 `@ai-sdk/gateway`、`@ai-sdk/provider`、`@ai-sdk/provider-utils`、`@vercel/oidc` | 见附录 | Copyright 2023 Vercel, Inc. |
| `@paddleocr/paddleocr-js` | 0.4.2 | PaddlePaddle Authors |
| `@techstark/opencv-js` | 4.10.0-release.1 | Apache-2.0 |
| `tesseract.js`、`tesseract.js-core` | 7.0.0 | Apache-2.0 |
| `emf-converter` | 4.8.0 | ChristopherVR |

## 字体

`katex@0.18.9` 的代码是 MIT，Copyright (c) 2013-2020 Khan Academy and other contributors。随包的字体文件是 SIL OFL 1.1，全文是 `OFL-1.1.txt`。字体不能改许可，可以随软件分发；用这些字体排出来的幻灯片不因此变成 OFL。

主题只引用 Google Fonts 的 CSS，字体文件不打进包。

网站壳自带的那份字体许可证是另一份 OFL，不进公开包。

## 其余直接依赖

| 包 | 版本 | 许可证 | 版权声明 |
|---|---|---|---|
| `fast-xml-parser` | 5.11.1 | MIT | Copyright (c) 2017 Amit Kumar Gupta |
| `fflate` | 0.8.3 | MIT | Copyright (c) 2026 Arjun Barrett |
| `three` | 0.186.0 | MIT | Copyright © 2010-2026 three.js authors |
| `zod` | 4.6.5 | MIT | Copyright (c) 2025 Colin McDonnell |
| `@modelcontextprotocol/sdk` | 1.30.1 | MIT | Copyright (c) 2024 Anthropic, PBC |
| `lucide` | 1.48.0 | ISC | Copyright (c) 2026 Lucide Icons and Contributors。其中来自 Feather 的图标另为 MIT，Copyright (c) 2013-present Cole Bemis |
| `clipper-lib` | 6.4.2 | Boost-1.0 | Copyright Angus Johnson 2010-2017。使用、修改和分发遵循 Boost Software License 1.0 |
| `js-yaml` | 4.3.2 | MIT | Copyright (C) 2011-2015 by Vitaly Puzrin |
| `onnxruntime-web`、`onnxruntime-common` | 1.30.0 | MIT | 版权声明以包内 LICENSE 为准 |

`@modelcontextprotocol/sdk` 会带上 `express`、`hono` 这些服务端库。它们随 `@ppt/ai` 安装，许可证见附录，不因此把网关算进公开包。

`json-schema@0.4.0` 是 AFL-2.1 或 BSD-3-Clause。这里取 BSD-3-Clause。

## 不在这份声明里

网关及其依赖、`tests/pptx-viewer` 依赖的 `pptx-react-viewer`（Apache-2.0）、构建工具（`lightningcss`、`sharp`、`axe-core`、Sentry 命令行）。这些不进公开包。

## 附录：公开包生产依赖

`animation`、`core`、`parser`、`serializer`、`three-bake`、`renderer`、`transition-fx`、`plugin-sdk`、`themes`、`ui`、`player`、`editor`、`ai` 的生产依赖，含传递依赖。不含 `@ppt/*` 自身，不含上面那份另行加载的 `@ffmpeg/core`。

| 包 | 版本 | 许可证 |
|---|---|---|
| `@ai-sdk/anthropic` | 4.0.62 | `Apache-2.0` |
| `@ai-sdk/gateway` | 4.0.91 | `Apache-2.0` |
| `@ai-sdk/google` | 4.0.79 | `Apache-2.0` |
| `@ai-sdk/mcp` | 2.0.57 | `Apache-2.0` |
| `@ai-sdk/openai` | 4.0.74 | `Apache-2.0` |
| `@ai-sdk/openai-compatible` | 3.0.55 | `Apache-2.0` |
| `@ai-sdk/provider` | 4.0.18 | `Apache-2.0` |
| `@ai-sdk/provider-utils` | 5.0.47 | `Apache-2.0` |
| `@exodus/bytes` | 1.16.0 | `MIT` |
| `@ffmpeg/ffmpeg` | 0.12.15 | `MIT` |
| `@ffmpeg/types` | 0.12.4 | `MIT` |
| `@ffmpeg/util` | 0.12.2 | `MIT` |
| `@hono/node-server` | 2.1.1 | `MIT` |
| `@modelcontextprotocol/sdk` | 1.30.1 | `MIT` |
| `@nodable/entities` | 3.0.0 | `MIT` |
| `@paddleocr/paddleocr-js` | 0.4.2 | `Apache-2.0` |
| `@protobufjs/aspromise` | 1.1.2 | `BSD-3-Clause` |
| `@protobufjs/base64` | 1.1.2 | `BSD-3-Clause` |
| `@protobufjs/codegen` | 2.0.5 | `BSD-3-Clause` |
| `@protobufjs/eventemitter` | 1.1.1 | `BSD-3-Clause` |
| `@protobufjs/fetch` | 1.1.1 | `BSD-3-Clause` |
| `@protobufjs/float` | 1.0.2 | `BSD-3-Clause` |
| `@protobufjs/path` | 1.1.2 | `BSD-3-Clause` |
| `@protobufjs/pool` | 1.1.0 | `BSD-3-Clause` |
| `@protobufjs/utf8` | 1.1.2 | `BSD-3-Clause` |
| `@standard-schema/spec` | 1.1.0 | `MIT` |
| `@techstark/opencv-js` | 4.10.0-release.1 | `Apache-2.0` |
| `@types/node` | 26.6.2 | `MIT` |
| `@vercel/oidc` | 3.2.0 | `Apache-2.0` |
| `@workflow/serde` | 4.1.0 | `Apache-2.0` |
| `accepts` | 2.0.0 | `MIT` |
| `ai` | 7.0.113 | `Apache-2.0` |
| `ajv` | 8.20.0 | `MIT` |
| `ajv-formats` | 3.0.1 | `MIT` |
| `anynum` | 1.0.1 | `MIT` |
| `argparse` | 2.0.1 | `Python-2.0` |
| `bmp-js` | 0.1.0 | `MIT` |
| `body-parser` | 2.3.0 | `MIT` |
| `bytes` | 3.1.2 | `MIT` |
| `call-bind-apply-helpers` | 1.0.2 | `MIT` |
| `call-bound` | 1.0.4 | `MIT` |
| `clipper-lib` | 6.4.2 | `BSL`（Boost-1.0） |
| `commander` | 15.0.0 | `MIT` |
| `content-disposition` | 1.1.0 | `MIT` |
| `content-type` | 1.0.5 | `MIT` |
| `cookie` | 1.1.1 | `MIT` |
| `cookie-signature` | 1.2.2 | `MIT` |
| `cors` | 2.8.6 | `MIT` |
| `cross-spawn` | 7.0.6 | `MIT` |
| `debug` | 4.4.3 | `MIT` |
| `depd` | 2.0.0 | `MIT` |
| `dunder-proto` | 1.0.1 | `MIT` |
| `ee-first` | 1.1.1 | `MIT` |
| `emf-converter` | 4.8.0 | `Apache-2.0` |
| `encodeurl` | 2.0.0 | `MIT` |
| `es-define-property` | 1.0.1 | `MIT` |
| `es-errors` | 1.3.0 | `MIT` |
| `es-object-atoms` | 1.1.2 | `MIT` |
| `escape-html` | 1.0.3 | `MIT` |
| `etag` | 1.8.1 | `MIT` |
| `eventsource` | 3.0.7 | `MIT` |
| `eventsource-parser` | 3.1.1 | `MIT` |
| `express` | 5.2.1 | `MIT` |
| `express-rate-limit` | 8.7.0 | `MIT` |
| `fast-deep-equal` | 3.1.3 | `MIT` |
| `fast-uri` | 3.1.8 | `BSD-3-Clause` |
| `fast-xml-builder` | 1.3.1 | `MIT` |
| `fast-xml-parser` | 5.11.1 | `MIT` |
| `fflate` | 0.8.3 | `MIT` |
| `finalhandler` | 2.1.1 | `MIT` |
| `flatbuffers` | 25.9.23 | `Apache-2.0` |
| `forwarded` | 0.2.0 | `MIT` |
| `fresh` | 2.0.0 | `MIT` |
| `function-bind` | 1.1.2 | `MIT` |
| `get-intrinsic` | 1.3.0 | `MIT` |
| `get-proto` | 1.0.1 | `MIT` |
| `gopd` | 1.2.0 | `MIT` |
| `guid-typescript` | 1.0.9 | `ISC` |
| `has-symbols` | 1.1.0 | `MIT` |
| `hasown` | 2.0.4 | `MIT` |
| `hono` | 4.13.9 | `MIT` |
| `http-errors` | 2.0.1 | `MIT` |
| `iconv-lite` | 0.7.3 | `MIT` |
| `idb-keyval` | 6.3.0 | `Apache-2.0` |
| `inherits` | 2.0.4 | `ISC` |
| `ip-address` | 10.7.2 | `MIT` |
| `ipaddr.js` | 1.9.1 | `MIT` |
| `is-promise` | 4.0.0 | `MIT` |
| `is-unsafe` | 2.0.2 | `MIT` |
| `is-url` | 1.2.4 | `MIT` |
| `isexe` | 2.0.0 | `ISC` |
| `jose` | 6.2.12 | `MIT` |
| `js-yaml` | 4.3.2 | `MIT` |
| `json-schema` | 0.4.0 | `BSD-3-Clause`（双许可，取这一支） |
| `json-schema-traverse` | 1.0.0 | `MIT` |
| `json-schema-typed` | 8.0.2 | `BSD-2-Clause` |
| `katex` | 0.18.9 | `MIT` |
| `long` | 5.3.2 | `Apache-2.0` |
| `lucide` | 1.48.0 | `ISC` |
| `math-intrinsics` | 1.1.0 | `MIT` |
| `media-typer` | 1.1.1 | `MIT` |
| `merge-descriptors` | 2.0.0 | `MIT` |
| `mime-db` | 1.54.0 | `MIT` |
| `mime-types` | 3.0.2 | `MIT` |
| `ms` | 2.1.3 | `MIT` |
| `mtx-decompressor` | 1.6.0 | `MPL-2.0` |
| `negotiator` | 1.1.0 | `MIT` |
| `node-fetch` | 2.7.0 | `MIT` |
| `object-assign` | 4.1.1 | `MIT` |
| `object-inspect` | 1.13.4 | `MIT` |
| `on-finished` | 2.4.1 | `MIT` |
| `once` | 1.4.0 | `ISC` |
| `onnxruntime-common` | 1.30.0 | `MIT` |
| `onnxruntime-web` | 1.30.0 | `MIT` |
| `opencollective-postinstall` | 2.0.3 | `MIT` |
| `parseurl` | 1.3.3 | `MIT` |
| `path-expression-matcher` | 1.6.2 | `MIT` |
| `path-key` | 3.1.1 | `MIT` |
| `path-to-regexp` | 8.4.2 | `MIT` |
| `pkce-challenge` | 5.0.1 | `MIT` |
| `platform` | 1.3.6 | `MIT` |
| `protobufjs` | 7.6.6 | `BSD-3-Clause` |
| `proxy-addr` | 2.0.8 | `MIT` |
| `punycode` | 2.3.1 | `MIT` |
| `qs` | 6.16.0 | `BSD-3-Clause` |
| `range-parser` | 1.3.0 | `MIT` |
| `raw-body` | 3.0.2 | `MIT` |
| `regenerator-runtime` | 0.13.11 | `MIT` |
| `require-from-string` | 2.0.2 | `MIT` |
| `router` | 2.2.0 | `MIT` |
| `safer-buffer` | 2.1.2 | `MIT` |
| `send` | 1.2.1 | `MIT` |
| `serve-static` | 2.2.1 | `MIT` |
| `setprototypeof` | 1.2.0 | `ISC` |
| `shebang-command` | 2.0.0 | `MIT` |
| `shebang-regex` | 3.0.0 | `MIT` |
| `side-channel` | 1.1.1 | `MIT` |
| `side-channel-list` | 1.0.1 | `MIT` |
| `side-channel-map` | 1.0.1 | `MIT` |
| `side-channel-weakmap` | 1.0.2 | `MIT` |
| `statuses` | 2.0.2 | `MIT` |
| `strnum` | 2.4.2 | `MIT` |
| `tesseract.js` | 7.0.0 | `Apache-2.0` |
| `tesseract.js-core` | 7.0.0 | `Apache-2.0` |
| `three` | 0.186.0 | `MIT` |
| `toidentifier` | 1.0.1 | `MIT` |
| `tr46` | 6.0.0 | `MIT` |
| `type-is` | 2.1.0 | `MIT` |
| `undici` | 7.29.0 | `MIT` |
| `undici-types` | 8.9.0 | `MIT` |
| `unpipe` | 1.0.0 | `MIT` |
| `vary` | 1.1.2 | `MIT` |
| `wasm-feature-detect` | 1.9.0 | `Apache-2.0` |
| `webidl-conversions` | 8.0.1 | `BSD-2-Clause` |
| `whatwg-url` | 17.1.2 | `MIT` |
| `which` | 2.0.2 | `ISC` |
| `wrappy` | 1.0.2 | `ISC` |
| `xml-naming` | 0.3.0 | `MIT` |
| `zlibjs` | 0.3.1 | `MIT` |
| `zod` | 4.6.5 | `MIT` |
| `zod-to-json-schema` | 3.25.2 | `ISC` |
