/**
 * Device expanders — ppt-master's "everyday device menu" compiled to code.
 * The author only names the device and its data; geometry, type roles,
 * spacing, radius, and paint roles come from the VisualSystem. Output is
 * plain primitives (text / surface / bar / ellipse / rule / line / icon / shape)
 * so snap, reflect, paint, emit, and the editor treat them like anything else.
 */
import type { FilledEl } from "./ir.js";
import { type VisualSystem } from "./visual-system.js";
/** Expand one device element into primitives inside its (already snapped) bbox. */
export declare function expandDevice(devEl: FilledEl, sys: VisualSystem): FilledEl[];
