"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTransition = getTransition;
exports.listTransitions = listTransitions;
exports.registerTransition = registerTransition;
exports.runTransition = runTransition;
const fx2d = __importStar(require("./2d"));
const fx3d = __importStar(require("./3d"));
const fxGl = __importStar(require("./webgl"));
const morph_1 = require("./morph");
const registry = new Map();
function register(name, fn) {
    registry.set(name, fn);
}
register("cut", fx2d.cut);
register("fade", fx2d.fade);
register("push", fx2d.push);
register("cover", fx2d.cover);
register("uncover", fx2d.uncover);
register("wipe", fx2d.wipe);
register("split", fx2d.split);
register("zoom", fx2d.zoom);
register("blinds", fx2d.blinds);
register("checker", fx2d.checker);
register("randomBar", fx2d.randomBar);
register("dissolve", fxGl.dissolveWebGL);
register("newsflash", fx2d.newsflash);
register("wheel", fx2d.wheel);
register("wheelReverse", fx2d.wheelReverse);
register("circle", fx2d.circle);
register("diamond", fx2d.diamond);
register("plus", fx2d.plus);
register("comb", fx2d.comb);
register("strips", fx2d.strips);
register("wedge", fx2d.wedge);
register("fall", fx2d.fall);
register("reveal", fx2d.reveal);
register("flash", fx2d.flash);
register("random", fx2d.random);
register("glitter", fx2d.glitter);
register("honeycomb", fx2d.honeycomb);
register("fracture", fx2d.fracture);
register("shred", fx2d.shred);
register("prestige", fx2d.prestige);
register("prism", fx3d.prism);
register("cube", fxGl.cubeWebGL);
register("box", fxGl.boxWebGL);
register("gallery", fx3d.gallery);
register("orbit", fx3d.orbit);
register("conveyor", fx3d.conveyor);
register("doors", fx3d.doors);
register("window", fx3d.window);
register("pageCurl", fxGl.pageCurlWebGL);
register("pageCurlSingle", fx3d.pageCurlSingle);
register("wind", fx3d.wind);
register("crush", fx3d.crush);
register("pageCurlCss", fx3d.pageCurl);
register("airplane", fx3d.airplane);
register("origami", fx3d.origami);
register("flythrough", fx3d.flythrough);
register("rotate", fx3d.rotate);
register("ferris", fx3d.ferris);
register("peelOff", fx3d.peelOff);
register("curtains", fx3d.curtains);
register("drape", fx3d.drape);
register("ripple", fx3d.ripple);
register("warp", fx3d.warp);
register("vortex", fx3d.vortex);
register("flip", fx3d.flip);
register("switch", fx3d.switchFx);
register("morph", morph_1.morph);
function getTransition(kind) {
    return registry.get(kind);
}
function listTransitions() {
    return [...registry.keys()];
}
function registerTransition(kind, fn) {
    register(kind, fn);
}
async function runTransition(ghost, stage, transition) {
    if (transition.kind === "cut" || transition.duration <= 0)
        return;
    const fn = registry.get(transition.kind) ?? registry.get("fade");
    if (!fn)
        return;
    const rect = stage.getBoundingClientRect();
    const ctx = {
        ghost,
        stage,
        duration: transition.duration,
        params: transition.params ?? {},
        transition,
        stageSize: { w: rect.width, h: rect.height },
    };
    await fn(ctx);
}
