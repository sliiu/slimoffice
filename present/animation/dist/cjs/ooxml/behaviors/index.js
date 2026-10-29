"use strict";
// 行为节点编译器注册表。
// 每个 `kind` 对应一个编译函数。compileLeaf 通过 switch 调度，
// 这里集中导出便于阶段 A 引入新的预设展开器后统一替换。
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileMedia = exports.compileCmd = exports.compileAnimScale = exports.compileAnimRot = exports.compileAnimMotion = exports.compileAnimEffect = exports.compileAnimClr = exports.compileAnim = exports.compileSet = void 0;
var set_1 = require("./set");
Object.defineProperty(exports, "compileSet", { enumerable: true, get: function () { return set_1.compileSet; } });
var anim_1 = require("./anim");
Object.defineProperty(exports, "compileAnim", { enumerable: true, get: function () { return anim_1.compileAnim; } });
var anim_clr_1 = require("./anim-clr");
Object.defineProperty(exports, "compileAnimClr", { enumerable: true, get: function () { return anim_clr_1.compileAnimClr; } });
var anim_effect_1 = require("./anim-effect");
Object.defineProperty(exports, "compileAnimEffect", { enumerable: true, get: function () { return anim_effect_1.compileAnimEffect; } });
var anim_motion_1 = require("./anim-motion");
Object.defineProperty(exports, "compileAnimMotion", { enumerable: true, get: function () { return anim_motion_1.compileAnimMotion; } });
var anim_rot_1 = require("./anim-rot");
Object.defineProperty(exports, "compileAnimRot", { enumerable: true, get: function () { return anim_rot_1.compileAnimRot; } });
var anim_scale_1 = require("./anim-scale");
Object.defineProperty(exports, "compileAnimScale", { enumerable: true, get: function () { return anim_scale_1.compileAnimScale; } });
var cmd_1 = require("./cmd");
Object.defineProperty(exports, "compileCmd", { enumerable: true, get: function () { return cmd_1.compileCmd; } });
var media_1 = require("./media");
Object.defineProperty(exports, "compileMedia", { enumerable: true, get: function () { return media_1.compileMedia; } });
