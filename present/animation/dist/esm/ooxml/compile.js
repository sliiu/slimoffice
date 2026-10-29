// Backwards-compatible barrel: the original monolithic ~970-line compile.ts has been
// split under ./compile/ + ./behaviors/. Existing `import "./compile"` resolves here
// (TypeScript prefers compile.ts over compile/index.ts), and all previously exported
// names are re-exported below.
export { compileTiming, buildTnIndex } from "./compile/index.js";
