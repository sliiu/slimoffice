// 录制放映开始前：可以选择打开摄像头，并选择麦克风。打开摄像头时再选哪一只。
import { bindEditorModal, showDialog } from "./dialog.js";
import { t } from "./i18n/index.js";
import { DIALOG_INPUT_CSS } from "./ui-style.js";
function deviceField(doc, text) {
    const block = doc.createElement("div");
    block.style.cssText = "display:flex;flex-direction:column;gap:4px";
    const label = doc.createElement("label");
    label.style.cssText = "color:var(--muted-foreground)";
    label.textContent = text;
    const sel = doc.createElement("select");
    sel.style.cssText = "width:100%;box-sizing:border-box;" + DIALOG_INPUT_CSS;
    block.append(label, sel);
    return { block, label, sel };
}
function stopStream(stream) {
    stream?.getTracks().forEach((tr) => tr.stop());
}
/** 已经能读到名字、或权限已是允许/拒绝时，不再为了列设备而打开那一路。 */
export function captureProbeNeeded(devices, perm) {
    const need = (kind, state) => {
        if (state === "granted" || state === "denied")
            return false;
        const list = devices.filter((d) => d.kind === kind);
        return !list.some((d) => d.label);
    };
    return { mic: need("audioinput", perm.microphone), camera: need("videoinput", perm.camera) };
}
async function permissionState(name) {
    const permissions = navigator.permissions;
    if (!permissions?.query)
        return "unknown";
    try {
        const status = await permissions.query({ name: name });
        return status.state;
    }
    catch {
        return "unknown";
    }
}
/** 列出麦克风和摄像头。某一路传 false 时不为了名单去打开它。 */
export async function listCaptureDevices(ask) {
    const wantMic = ask?.mic !== false;
    const wantCamera = ask?.camera !== false;
    const md = navigator.mediaDevices;
    if (!md?.enumerateDevices || !md.getUserMedia)
        return { mics: [], cameras: [], cameraOk: false };
    let devices = await md.enumerateDevices().catch(() => []);
    const need = captureProbeNeeded(devices, {
        microphone: wantMic ? await permissionState("microphone") : "denied",
        camera: wantCamera ? await permissionState("camera") : "denied",
    });
    let cameraOk = wantCamera && devices.some((d) => d.kind === "videoinput" && !!(d.label || d.deviceId));
    if (need.mic || need.camera) {
        let stream = null;
        try {
            stream = await md.getUserMedia({ audio: need.mic, video: need.camera });
            if (need.camera)
                cameraOk = stream.getVideoTracks().length > 0;
        }
        catch {
            cameraOk = false;
            if (need.mic) {
                try {
                    stream = await md.getUserMedia({ audio: true });
                }
                catch {
                    stopStream(stream);
                    stream = null;
                }
            }
        }
        stopStream(stream);
        devices = await md.enumerateDevices().catch(() => devices);
    }
    return {
        mics: wantMic ? devices.filter((d) => d.kind === "audioinput") : [],
        cameras: wantCamera ? devices.filter((d) => d.kind === "videoinput") : [],
        cameraOk,
    };
}
function fillSelect(sel, devices, unnamed) {
    sel.replaceChildren();
    devices.forEach((d, i) => {
        const opt = sel.ownerDocument.createElement("option");
        opt.value = d.deviceId;
        opt.textContent = d.label || unnamed(i + 1);
        sel.appendChild(opt);
    });
    if (devices.length === 0) {
        const opt = sel.ownerDocument.createElement("option");
        opt.value = "";
        opt.textContent = unnamed(1);
        sel.appendChild(opt);
    }
}
export function openLectureDeviceDialog(doc) {
    return showDialog(doc, {
        title: t("lecture.devices.title"),
        okLabel: t("lecture.devices.start"),
        okEnabled: false,
        width: 420,
        buildBody: (body, ctx) => {
            const stack = doc.createElement("div");
            stack.style.cssText = "display:flex;flex-direction:column;gap:12px";
            const camRow = doc.createElement("label");
            camRow.style.cssText = "display:flex;align-items:center;gap:8px";
            const camOn = doc.createElement("input");
            camOn.type = "checkbox";
            camOn.checked = true;
            camRow.append(camOn, doc.createTextNode(t("lecture.devices.camera")));
            const cam = deviceField(doc, t("lecture.devices.cameraPick"));
            const mic = deviceField(doc, t("lecture.devices.mic"));
            const { label: camLabel, sel: camSel } = cam;
            const { sel: micSel } = mic;
            const err = doc.createElement("p");
            err.style.cssText = "color:var(--destructive);margin:10px 0 0";
            stack.append(camRow, cam.block, mic.block);
            body.append(stack, err);
            const syncCam = () => {
                const on = camOn.checked && !camOn.disabled;
                camSel.disabled = !on;
                camLabel.style.opacity = on ? "1" : "0.45";
            };
            camOn.addEventListener("change", syncCam);
            void listCaptureDevices().then((found) => {
                fillSelect(micSel, found.mics, (n) => t("lecture.devices.unnamedMic", { n }));
                fillSelect(camSel, found.cameras, (n) => t("lecture.devices.unnamedCamera", { n }));
                if (!found.cameraOk) {
                    camOn.checked = false;
                    camOn.disabled = true;
                }
                syncCam();
                if (found.mics.length === 0 && micSel.value === "" && !navigator.mediaDevices?.getUserMedia) {
                    err.textContent = t("lecture.devices.noMic");
                    ctx.setOkEnabled(false);
                    return;
                }
                ctx.setOkEnabled(true);
            });
            return () => {
                const audioDeviceId = micSel.value;
                if (!navigator.mediaDevices?.getUserMedia)
                    return null;
                return {
                    audioDeviceId,
                    videoDeviceId: camOn.checked && !camOn.disabled ? camSel.value : null,
                };
            };
        },
    });
}
/**
 * 一停止就出现，盖在随后打开的编辑器上。保存完成后再换成结果。
 * 结束录制的那下 Esc 松开之前，不会把这层关掉。
 */
export function openLectureSaveNotice(doc) {
    const overlay = doc.createElement("div");
    overlay.dataset.pptDialog = "1";
    overlay.style.cssText = [
        "position:fixed",
        "inset:0",
        "background:var(--overlay-backdrop, rgba(0,0,0,0.65))",
        "z-index:calc(var(--z-overlay, 1500) + 2)",
        "display:flex",
        "align-items:center",
        "justify-content:center",
        "font:12px system-ui,sans-serif",
    ].join(";");
    const panel = doc.createElement("div");
    panel.style.cssText = [
        "background:var(--popover)",
        "color:var(--popover-foreground)",
        "border:1px solid var(--border)",
        "border-radius:var(--radius-modal, 12px)",
        "box-shadow:var(--shadow-lg)",
        "width:min(440px,92vw)",
        "display:flex",
        "flex-direction:column",
    ].join(";");
    const title = doc.createElement("div");
    title.style.cssText = "padding:10px 14px;border-bottom:1px solid var(--border);font-size:13px;font-weight:600";
    title.textContent = t("lecture.done.saving");
    const body = doc.createElement("div");
    body.style.cssText = "padding:14px;line-height:1.5";
    const main = doc.createElement("p");
    main.style.margin = "0";
    main.textContent = t("lecture.done.savingBody");
    body.append(main);
    const footer = doc.createElement("div");
    footer.style.cssText = "display:flex;justify-content:flex-end;padding:10px 14px;border-top:1px solid var(--border)";
    panel.append(title, body, footer);
    overlay.append(panel);
    doc.body.appendChild(overlay);
    let allowEsc = false;
    const onKeyUp = (e) => {
        if (e.key === "Escape")
            allowEsc = true;
    };
    doc.addEventListener("keyup", onKeyUp);
    let closed = false;
    let release = () => { };
    let resolveDone = () => { };
    const done = new Promise((resolve) => {
        resolveDone = resolve;
    });
    const close = () => {
        if (closed)
            return;
        closed = true;
        release();
        doc.removeEventListener("keyup", onKeyUp);
        overlay.remove();
        resolveDone();
    };
    const showFinal = (heading, text, extra) => {
        title.textContent = heading;
        main.textContent = text;
        body.replaceChildren(main);
        if (extra) {
            const more = doc.createElement("p");
            more.style.cssText = "margin:8px 0 0;color:var(--muted-foreground)";
            more.textContent = extra;
            body.append(more);
        }
        const ok = doc.createElement("button");
        ok.type = "button";
        ok.textContent = t("lecture.done.ok");
        ok.style.cssText =
            "background:var(--primary);color:var(--primary-foreground);border:1px solid var(--primary);border-radius:var(--radius-md);padding:6px 16px;cursor:pointer;font:inherit;font-weight:500";
        ok.addEventListener("click", close);
        footer.replaceChildren(ok);
        release = bindEditorModal({
            doc,
            overlay,
            panel,
            onCancel: close,
            onSubmit: () => {
                close();
                return true;
            },
            closeButton: false,
            escapeDismiss: () => allowEsc,
            backdropDismiss: () => false,
        }).release;
        return done;
    };
    return {
        saved(result) {
            if (!result || result.slides < 1)
                return showFinal(t("lecture.done.emptyTitle"), t("lecture.done.empty"));
            return showFinal(t("lecture.done.title"), t("lecture.done.body", { slides: result.slides }), result.withCamera ? undefined : t("lecture.done.noCamera"));
        },
        failed(message) {
            return showFinal(t("lecture.done.failedTitle"), t("lecture.done.failed", { msg: message }));
        },
    };
}
