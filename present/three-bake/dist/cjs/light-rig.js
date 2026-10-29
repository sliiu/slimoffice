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
exports.applyLightRig = applyLightRig;
const THREE = __importStar(require("three"));
const RIG_PRESETS = {
    threePt: {
        ambient: 0.3,
        lights: [
            { color: 0xffffff, intensity: 0.9, pos: [3, 4, 5] },
            { color: 0xffffff, intensity: 0.45, pos: [-4, 2, 3] },
            { color: 0xffffff, intensity: 0.25, pos: [0, -4, -3] },
        ],
    },
    balanced: {
        ambient: 0.45,
        lights: [
            { color: 0xffffff, intensity: 0.7, pos: [3, 3, 4] },
            { color: 0xffffff, intensity: 0.5, pos: [-3, 3, 4] },
        ],
    },
    soft: {
        ambient: 0.55,
        lights: [{ color: 0xffffff, intensity: 0.55, pos: [2, 4, 4] }],
    },
    harsh: {
        ambient: 0.15,
        lights: [{ color: 0xffffff, intensity: 1.4, pos: [4, 6, 4] }],
    },
    flood: {
        ambient: 0.65,
        lights: [
            { color: 0xffffff, intensity: 0.4, pos: [3, 0, 5] },
            { color: 0xffffff, intensity: 0.4, pos: [-3, 0, 5] },
        ],
    },
    sunset: {
        ambient: 0.3,
        lights: [
            { color: 0xffd9a8, intensity: 1.0, pos: [4, 2, 3] },
            { color: 0x6a8fa6, intensity: 0.3, pos: [-3, 3, 4] },
        ],
    },
    morning: {
        ambient: 0.4,
        lights: [
            { color: 0xfff1d6, intensity: 0.85, pos: [3, 5, 4] },
            { color: 0xffffff, intensity: 0.3, pos: [-3, 2, 2] },
        ],
    },
    freezing: {
        ambient: 0.4,
        lights: [
            { color: 0xd6e7ff, intensity: 0.9, pos: [3, 4, 4] },
            { color: 0xffffff, intensity: 0.4, pos: [-3, 2, 3] },
        ],
    },
    flat: {
        ambient: 0.85,
        lights: [{ color: 0xffffff, intensity: 0.2, pos: [0, 0, 5] }],
    },
    twoPt: {
        ambient: 0.3,
        lights: [
            { color: 0xffffff, intensity: 0.8, pos: [4, 3, 4] },
            { color: 0xffffff, intensity: 0.4, pos: [-4, -1, 3] },
        ],
    },
    glow: {
        ambient: 0.8,
        lights: [{ color: 0xfff8d0, intensity: 0.4, pos: [0, 0, 6] }],
    },
    brightRoom: {
        ambient: 0.7,
        lights: [{ color: 0xffffff, intensity: 0.45, pos: [3, 4, 4] }],
    },
    chilly: {
        ambient: 0.35,
        lights: [
            { color: 0xb8d0ff, intensity: 0.9, pos: [3, 3, 4] },
            { color: 0xffffff, intensity: 0.3, pos: [-3, 1, 2] },
        ],
    },
    contrasting: {
        ambient: 0.2,
        lights: [
            { color: 0xffffff, intensity: 1.2, pos: [4, 5, 4] },
            { color: 0x000000, intensity: 0, pos: [0, 0, 0] },
        ],
    },
};
function applyLightRig(scene, rigName, dir) {
    const spec = RIG_PRESETS[rigName ?? "threePt"] ?? RIG_PRESETS.threePt;
    const amb = new THREE.AmbientLight(0xffffff, spec.ambient);
    scene.add(amb);
    const yaw = dirToYaw(dir);
    for (const l of spec.lights) {
        const light = new THREE.DirectionalLight(l.color, l.intensity);
        const [x, y, z] = rotateXZ(l.pos, yaw);
        light.position.set(x, y, z);
        scene.add(light);
    }
}
function dirToYaw(dir) {
    switch (dir) {
        case "t":
            return 0;
        case "tr":
            return Math.PI / 4;
        case "r":
            return Math.PI / 2;
        case "br":
            return (3 * Math.PI) / 4;
        case "b":
            return Math.PI;
        case "bl":
            return -3 * Math.PI / 4;
        case "l":
            return -Math.PI / 2;
        case "tl":
            return -Math.PI / 4;
        default:
            return 0;
    }
}
function rotateXZ(p, yaw) {
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    return [p[0] * cos - p[2] * sin, p[1], p[0] * sin + p[2] * cos];
}
