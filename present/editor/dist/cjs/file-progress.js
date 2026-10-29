"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.showFileProgress = showFileProgress;
exports.setFileProgress = setFileProgress;
exports.hideFileProgress = hideFileProgress;
exports.readAsDataURL = readAsDataURL;
exports.readAsArrayBuffer = readAsArrayBuffer;
const file_kind_1 = require("./file-kind");
const STYLE_ID = "ppt-file-progress-style";
let root = null;
let labelEl = null;
let barEl = null;
let baseLabel = "";
let placeTimer = 0;
function ensureStyle(doc) {
    if (doc.getElementById(STYLE_ID))
        return;
    const style = doc.createElement("style");
    style.id = STYLE_ID;
    style.textContent = `
.ppt-file-progress[hidden] { display: none !important; }
.ppt-file-progress {
  position: fixed;
  z-index: calc(var(--z-overlay, 1500) + 2);
  pointer-events: none;
  padding: 10px 12px 12px;
  border-radius: 10px;
  background: var(--card, #1c1c1c);
  color: var(--card-foreground, #fafafa);
  box-shadow: var(--shadow-lg, 0 8px 30px rgba(0, 0, 0, 0.18));
  border: 1px solid var(--border, #3a3a3a);
}
.ppt-file-progress__label {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: -0.01em;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ppt-file-progress__track {
  height: 4px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--foreground, #fff) 12%, transparent);
  overflow: hidden;
  position: relative;
}
.ppt-file-progress__bar {
  height: 100%;
  width: 0%;
  border-radius: inherit;
  background: var(--primary, #0070f3);
  transition: width 80ms ease-out;
}
.ppt-file-progress__bar.is-indeterminate {
  width: 36%;
  animation: ppt-file-progress-slide 1s ease-in-out infinite;
}
@keyframes ppt-file-progress-slide {
  from { transform: translateX(-110%); }
  to { transform: translateX(280%); }
}
@media (prefers-reduced-motion: reduce) {
  .ppt-file-progress__bar { transition: none; }
  .ppt-file-progress__bar.is-indeterminate { animation: none; width: 100%; opacity: 0.7; }
}
`;
    doc.head.appendChild(style);
}
function place(doc) {
    if (!root)
        return;
    const stage = doc.querySelector(".ppt-stage-wrap");
    if (!(stage instanceof HTMLElement)) {
        root.style.left = "50%";
        root.style.top = "auto";
        root.style.bottom = "56px";
        root.style.width = "280px";
        root.style.transform = "translateX(-50%)";
        return;
    }
    const rect = stage.getBoundingClientRect();
    const width = Math.max(180, Math.min(320, rect.width - 32));
    root.style.width = `${width}px`;
    root.style.left = `${rect.left + rect.width / 2}px`;
    root.style.top = `${Math.max(rect.top + 28, rect.bottom - 20)}px`;
    root.style.bottom = "auto";
    root.style.transform = "translate(-50%, -100%)";
}
function ensure(doc) {
    ensureStyle(doc);
    if (root && root.ownerDocument === doc)
        return;
    root = doc.createElement("div");
    root.className = "ppt-file-progress";
    root.hidden = true;
    root.setAttribute("role", "progressbar");
    root.setAttribute("aria-valuemin", "0");
    root.setAttribute("aria-valuemax", "100");
    labelEl = doc.createElement("div");
    labelEl.className = "ppt-file-progress__label";
    const track = doc.createElement("div");
    track.className = "ppt-file-progress__track";
    barEl = doc.createElement("div");
    barEl.className = "ppt-file-progress__bar";
    track.appendChild(barEl);
    root.append(labelEl, track);
    doc.body.appendChild(root);
}
function showFileProgress(doc, label) {
    ensure(doc);
    baseLabel = label;
    if (labelEl)
        labelEl.textContent = label;
    setFileProgress(0);
    if (root) {
        root.hidden = false;
        place(doc);
    }
    if (placeTimer)
        clearInterval(placeTimer);
    placeTimer = window.setInterval(() => place(doc), 200);
}
function setFileProgress(ratio) {
    if (!root || !barEl || !labelEl)
        return;
    const known = Number.isFinite(ratio);
    const clamped = known ? Math.min(1, Math.max(0, ratio)) : 0;
    barEl.classList.toggle("is-indeterminate", !known);
    barEl.style.width = known ? `${clamped * 100}%` : "";
    labelEl.textContent = (0, file_kind_1.progressLabel)(baseLabel, ratio);
    if (known)
        root.setAttribute("aria-valuenow", String(Math.round(clamped * 100)));
    else
        root.removeAttribute("aria-valuenow");
}
function hideFileProgress() {
    if (placeTimer) {
        clearInterval(placeTimer);
        placeTimer = 0;
    }
    if (!root)
        return;
    root.hidden = true;
    root.removeAttribute("aria-valuenow");
}
function readAsDataURL(file, onProgress) {
    return readBlob(file, "dataURL", onProgress).then((result) => String(result));
}
function readAsArrayBuffer(file, onProgress) {
    return readBlob(file, "arrayBuffer", onProgress).then((result) => result);
}
function readBlob(file, as, onProgress) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onprogress = (event) => {
            if (!onProgress)
                return;
            if (event.lengthComputable && event.total > 0)
                onProgress(Math.min(1, event.loaded / event.total));
            else
                onProgress(Number.NaN);
        };
        reader.onload = () => {
            onProgress?.(1);
            resolve(reader.result);
        };
        reader.onerror = () => reject(reader.error ?? new Error("read failed"));
        if (as === "dataURL")
            reader.readAsDataURL(file);
        else
            reader.readAsArrayBuffer(file);
    });
}
