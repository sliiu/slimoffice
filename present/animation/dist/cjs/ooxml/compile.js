"use strict";
// Backwards-compatible barrel: the original monolithic ~970-line compile.ts has been
// split under ./compile/ + ./behaviors/. Existing `import "./compile"` resolves here
// (TypeScript prefers compile.ts over compile/index.ts), and all previously exported
// names are re-exported below.
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildTnIndex = exports.compileTiming = void 0;
var index_1 = require("./compile/index");
Object.defineProperty(exports, "compileTiming", { enumerable: true, get: function () { return index_1.compileTiming; } });
Object.defineProperty(exports, "buildTnIndex", { enumerable: true, get: function () { return index_1.buildTnIndex; } });
