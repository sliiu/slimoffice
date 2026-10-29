import * as THREE from "three";

export interface LightRigSpec {
  ambient: number;
  lights: Array<{ color: number; intensity: number; pos: [number, number, number] }>;
}

const RIG_PRESETS: Record<string, LightRigSpec> = {
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

export function applyLightRig(
  scene: THREE.Scene,
  rigName: string | undefined,
  dir: string | undefined,
): void {
  const spec = RIG_PRESETS[rigName ?? "threePt"] ?? RIG_PRESETS.threePt!;
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

function dirToYaw(dir: string | undefined): number {
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

function rotateXZ(p: [number, number, number], yaw: number): [number, number, number] {
  const cos = Math.cos(yaw);
  const sin = Math.sin(yaw);
  return [p[0] * cos - p[2] * sin, p[1], p[0] * sin + p[2] * cos];
}
