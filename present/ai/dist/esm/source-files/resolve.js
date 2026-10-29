// 发送前决定哪些文件走字节、哪些要先问过再抽文字。
import { extractSourceText, SourceFileError } from "./extract.js";
import { classifySourceFile, mediaTypeForKind, } from "./kinds.js";
import { byteRouteFor } from "./support.js";
export class SourceDegradeDeclined extends Error {
    constructor() {
        super("degrade declined");
        this.name = "SourceDegradeDeclined";
    }
}
export async function resolveSourceDelivery(text, files, ask) {
    const unknown = files.filter((f) => classifySourceFile(f.name, f.mediaType) === "unknown");
    if (unknown.length) {
        throw new SourceFileError(unknown.map((f) => f.name).join(", "));
    }
    const unreadImages = files.filter((file) => classifySourceFile(file.name, file.mediaType) === "image" && byteRouteFor(text, "image") === "degrade");
    if (unreadImages.length) {
        throw new SourceFileError(unreadImages.map((file) => `${file.name} 打不开：当前模型读不了图像`).join(", "));
    }
    const degrade = [];
    const parts = [];
    for (const file of files) {
        const kind = classifySourceFile(file.name, file.mediaType);
        const route = byteRouteFor(text, kind);
        if (route === "degrade")
            degrade.push(file);
        else {
            parts.push({
                name: file.name,
                mediaType: mediaTypeForKind(kind, file.mediaType, file.name),
                bytes: file.bytes,
                route,
            });
        }
    }
    if (degrade.length && !(await ask(degrade.map((f) => f.name)))) {
        throw new SourceDegradeDeclined();
    }
    const chunks = degrade.map((file) => `# ${file.name}\n${extractSourceText(file)}`);
    return { material: chunks.join("\n\n"), parts };
}
export function materialFromParts(parts) {
    return parts.map((file) => `# ${file.name}\n${extractSourceText({ name: file.name, mediaType: file.mediaType, bytes: file.bytes })}`).join("\n\n");
}
