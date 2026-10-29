/**
 * Declarative preset-effect table types.
 *
 * Each entry maps a (presetClass, presetID, [presetSubtype]) tuple from
 * ECMA-376 PresentationML to a list of behavior channels that drive the
 * scene node directly. The compiler in presets/compile.ts instantiates
 * the channels with concrete numbers (distance, direction, etc.) from
 * the target shape's bbox and the slide size.
 *
 * Value expressions in keyframes accept:
 *   numbers, or strings using $dx/$dy (unit direction),
 *   $dist (default = slide width or height depending on axis),
 *   $bboxW/$bboxH (target bbox size).
 * Times in kf[].t are normalized [0..1] (multiplied by duration at compile).
 */
export {};
