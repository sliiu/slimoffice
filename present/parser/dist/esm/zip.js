import { unzipSync, strFromU8 } from "fflate";
const MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const MAX_ENTRIES = 20_000;
const MAX_RATIO = 100;
const RATIO_MIN_BYTES = 1_000_000;
export class ZipBombError extends Error {
    constructor() {
        super("ZIP_TOO_LARGE");
        this.name = "ZipBombError";
    }
}
export async function loadArchive(input) {
    const u8 = input instanceof Uint8Array
        ? input
        : input instanceof ArrayBuffer
            ? new Uint8Array(input)
            : new Uint8Array(await input.arrayBuffer());
    let count = 0;
    let total = 0;
    const entries = unzipSync(u8, {
        filter(file) {
            count += 1;
            total += file.originalSize;
            if (count > MAX_ENTRIES || total > MAX_UNCOMPRESSED) {
                throw new ZipBombError();
            }
            if (file.size > 0 &&
                file.originalSize > RATIO_MIN_BYTES &&
                file.originalSize / file.size > MAX_RATIO) {
                throw new ZipBombError();
            }
            return true;
        },
    });
    const files = new Map();
    for (const [name, data] of Object.entries(entries)) {
        files.set(normalize(name), data);
    }
    return {
        files,
        getText: (p) => {
            const b = files.get(normalize(p));
            return b ? strFromU8(b) : undefined;
        },
        getBytes: (p) => files.get(normalize(p)),
        has: (p) => files.has(normalize(p)),
        list: (prefix) => {
            const ps = prefix ? normalize(prefix) : "";
            const out = [];
            for (const k of files.keys())
                if (k.startsWith(ps))
                    out.push(k);
            return out;
        },
    };
}
function normalize(p) {
    let s = p.replace(/\\/g, "/");
    if (s.startsWith("/"))
        s = s.slice(1);
    return s;
}
export function joinPath(base, target) {
    if (target.startsWith("/"))
        return target.slice(1);
    if (/^https?:/i.test(target))
        return target;
    const baseDir = base.includes("/") ? base.slice(0, base.lastIndexOf("/")) : "";
    const parts = (baseDir ? baseDir.split("/") : []).concat(target.split("/"));
    const out = [];
    for (const part of parts) {
        if (part === "" || part === ".")
            continue;
        if (part === "..")
            out.pop();
        else
            out.push(part);
    }
    return out.join("/");
}
