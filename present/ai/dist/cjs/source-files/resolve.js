"use strict";
// 发送前决定哪些文件走字节、哪些要先问过再抽文字。
Object.defineProperty(exports, "__esModule", { value: true });
exports.SourceDegradeDeclined = void 0;
exports.resolveSourceDelivery = resolveSourceDelivery;
exports.materialFromParts = materialFromParts;
const extract_1 = require("./extract");
const kinds_1 = require("./kinds");
const support_1 = require("./support");
class SourceDegradeDeclined extends Error {
    constructor() {
        super("degrade declined");
        this.name = "SourceDegradeDeclined";
    }
}
exports.SourceDegradeDeclined = SourceDegradeDeclined;
async function resolveSourceDelivery(text, files, ask) {
    const unknown = files.filter((f) => (0, kinds_1.classifySourceFile)(f.name, f.mediaType) === "unknown");
    if (unknown.length) {
        throw new extract_1.SourceFileError(unknown.map((f) => f.name).join(", "));
    }
    const unreadImages = files.filter((file) => (0, kinds_1.classifySourceFile)(file.name, file.mediaType) === "image" && (0, support_1.byteRouteFor)(text, "image") === "degrade");
    if (unreadImages.length) {
        throw new extract_1.SourceFileError(unreadImages.map((file) => `${file.name} 打不开：当前模型读不了图像`).join(", "));
    }
    const degrade = [];
    const parts = [];
    for (const file of files) {
        const kind = (0, kinds_1.classifySourceFile)(file.name, file.mediaType);
        const route = (0, support_1.byteRouteFor)(text, kind);
        if (route === "degrade")
            degrade.push(file);
        else {
            parts.push({
                name: file.name,
                mediaType: (0, kinds_1.mediaTypeForKind)(kind, file.mediaType, file.name),
                bytes: file.bytes,
                route,
            });
        }
    }
    if (degrade.length && !(await ask(degrade.map((f) => f.name)))) {
        throw new SourceDegradeDeclined();
    }
    const chunks = degrade.map((file) => `# ${file.name}\n${(0, extract_1.extractSourceText)(file)}`);
    return { material: chunks.join("\n\n"), parts };
}
function materialFromParts(parts) {
    return parts.map((file) => `# ${file.name}\n${(0, extract_1.extractSourceText)({ name: file.name, mediaType: file.mediaType, bytes: file.bytes })}`).join("\n\n");
}
