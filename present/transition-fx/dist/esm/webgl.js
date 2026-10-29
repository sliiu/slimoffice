import * as fx2d from "./2d.js";
import * as fx3d from "./3d.js";
import { snapshotElement } from "./snapshot.js";
import { ms } from "./util.js";
function compile(gl, type, src) {
    const sh = gl.createShader(type);
    if (!sh)
        return null;
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        gl.deleteShader(sh);
        return null;
    }
    return sh;
}
function program(gl, vs, fs) {
    const v = compile(gl, gl.VERTEX_SHADER, vs);
    const f = compile(gl, gl.FRAGMENT_SHADER, fs);
    if (!v || !f)
        return null;
    const p = gl.createProgram();
    if (!p)
        return null;
    gl.attachShader(p, v);
    gl.attachShader(p, f);
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        gl.deleteProgram(p);
        return null;
    }
    return p;
}
function uploadTexture(gl, canvas) {
    const tex = gl.createTexture();
    if (!tex)
        return null;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    try {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    }
    catch {
        // 画布被跨域资源弄脏时浏览器抛 SecurityError。删掉纹理，让切换改走 CSS。
        gl.deleteTexture(tex);
        return null;
    }
    return tex;
}
const VS = `attribute vec2 aPos; varying vec2 vUv; void main(){ vUv = aPos * 0.5 + 0.5; gl_Position = vec4(aPos, 0.0, 1.0); }`;
const FS_PAGE_CURL = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
const float MIN_AMOUNT = -0.16;
const float MAX_AMOUNT = 1.5;
float amount() { return uProgress * (MAX_AMOUNT - MIN_AMOUNT) + MIN_AMOUNT; }
const float PI = 3.141592653589793;
const float scale = 512.0;
const float sharpness = 3.0;

float cylinder(float r) {
  float amt = amount();
  return atan(r, 1.0 - amt);
}

void main() {
  vec2 uv = vUv;
  float a = amount();
  float dist = (uv.x - 1.0) * (uv.x - 1.0) + (uv.y - 1.0) * (uv.y - 1.0);
  vec2 fromCoord = uv;
  vec4 colorFrom = texture2D(uFrom, fromCoord);
  vec4 colorTo = texture2D(uTo, uv);
  float radius = 0.1 + a * 0.4;
  vec2 center = vec2(1.0 - a, 1.0 - a);
  float d = length(uv - center);
  float curl = smoothstep(radius, radius + 0.05, d);
  vec4 res = mix(colorTo, colorFrom, curl);
  // Shadow under the curl
  float shadow = smoothstep(radius - 0.08, radius, d) * (1.0 - smoothstep(radius, radius + 0.04, d));
  res.rgb *= 1.0 - 0.35 * shadow * (1.0 - uProgress);
  gl_FragColor = res;
}`;
const FS_CUBE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
uniform float uDir;
void main() {
  float p = uProgress;
  vec2 uv = vUv;
  float face = uv.x + (uDir > 0.0 ? -p : p);
  if (face < 0.0 || face > 1.0) {
    vec2 to = vec2(face < 0.0 ? face + 1.0 : face - 1.0, uv.y);
    gl_FragColor = texture2D(uTo, to);
  } else {
    gl_FragColor = texture2D(uFrom, vec2(face, uv.y));
  }
}`;
const FS_DISSOLVE = `
precision highp float;
varying vec2 vUv;
uniform sampler2D uFrom;
uniform sampler2D uTo;
uniform float uProgress;
float rand(vec2 co){ return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453); }
void main(){
  float n = rand(vUv);
  gl_FragColor = (n < uProgress) ? texture2D(uTo, vUv) : texture2D(uFrom, vUv);
}`;
async function runWebGLTransition(ctx, fragment, uniforms = () => undefined) {
    const w = ctx.stageSize.w;
    const h = ctx.stageSize.h;
    const cache = new Map();
    const [from, to] = await Promise.all([
        snapshotElement(ctx.ghost, w, h, cache),
        snapshotElement(ctx.stage, w, h, cache),
    ]);
    if (!from || !to)
        return false;
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    Object.assign(canvas.style, {
        position: "absolute",
        left: ctx.stage.style.left || `${ctx.stage.offsetLeft}px`,
        top: ctx.stage.style.top || `${ctx.stage.offsetTop}px`,
        width: ctx.stage.style.width || `${w}px`,
        height: ctx.stage.style.height || `${h}px`,
        transform: ctx.stage.style.transform || "",
        transformOrigin: ctx.stage.style.transformOrigin || "center center",
        zIndex: "3",
        pointerEvents: "none",
    });
    const ghostVis = ctx.ghost.style.visibility;
    const stageVis = ctx.stage.style.visibility;
    let gl = null;
    let succeeded = false;
    ctx.stage.parentElement?.appendChild(canvas);
    try {
        gl = canvas.getContext("webgl", { premultipliedAlpha: true });
        if (!gl)
            return false;
        const prog = program(gl, VS, fragment);
        if (!prog)
            return false;
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
        const tFrom = uploadTexture(gl, from.canvas);
        const tTo = uploadTexture(gl, to.canvas);
        if (!tFrom || !tTo)
            return false;
        gl.useProgram(prog);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, tFrom);
        gl.uniform1i(gl.getUniformLocation(prog, "uFrom"), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, tTo);
        gl.uniform1i(gl.getUniformLocation(prog, "uTo"), 1);
        const uP = gl.getUniformLocation(prog, "uProgress");
        uniforms(gl, prog);
        ctx.ghost.style.visibility = "hidden";
        ctx.stage.style.visibility = "hidden";
        const duration = ms(ctx);
        const start = performance.now();
        const glCtx = gl;
        await new Promise((resolve) => {
            const step = () => {
                try {
                    const t = Math.min(1, (performance.now() - start) / Math.max(1, duration));
                    glCtx.viewport(0, 0, canvas.width, canvas.height);
                    glCtx.clearColor(0, 0, 0, 0);
                    glCtx.clear(glCtx.COLOR_BUFFER_BIT);
                    glCtx.uniform1f(uP, t);
                    glCtx.drawArrays(glCtx.TRIANGLE_STRIP, 0, 4);
                    if (t < 1)
                        requestAnimationFrame(step);
                    else
                        resolve();
                }
                catch {
                    resolve();
                }
            };
            requestAnimationFrame(step);
        });
        succeeded = true;
        return true;
    }
    catch {
        return false;
    }
    finally {
        canvas.remove();
        ctx.stage.style.visibility = stageVis;
        if (!succeeded)
            ctx.ghost.style.visibility = ghostVis;
        gl?.getExtension("WEBGL_lose_context")?.loseContext();
    }
}
export const pageCurlWebGL = async (ctx) => {
    const ok = await runWebGLTransition(ctx, FS_PAGE_CURL);
    if (!ok)
        await fx3d.pageCurl(ctx);
};
export const cubeWebGL = async (ctx) => {
    const dir = String(ctx.params.dir ?? "left");
    const ok = await runWebGLTransition(ctx, FS_CUBE, (gl, p) => {
        gl.uniform1f(gl.getUniformLocation(p, "uDir"), dir === "left" || dir === "up" ? 1 : -1);
    });
    if (!ok)
        await fx3d.cube(ctx);
};
export const boxWebGL = (ctx) => fx3d.box(ctx);
export const dissolveWebGL = async (ctx) => {
    const ok = await runWebGLTransition(ctx, FS_DISSOLVE);
    if (!ok)
        await fx2d.dissolve(ctx);
};
