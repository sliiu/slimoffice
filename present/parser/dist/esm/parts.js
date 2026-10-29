import { joinPath } from "./zip.js";
import { arr, attr, parseXml } from "./xml.js";
export function loadRels(archive, partPath) {
    const dir = partPath.includes("/") ? partPath.slice(0, partPath.lastIndexOf("/")) : "";
    const file = partPath.includes("/") ? partPath.slice(partPath.lastIndexOf("/") + 1) : partPath;
    const relsPath = (dir ? dir + "/" : "") + "_rels/" + file + ".rels";
    const list = [];
    const byId = new Map();
    const text = archive.getText(relsPath);
    if (text) {
        const xml = parseXml(text);
        const rels = xml.Relationships ?? {};
        for (const r of arr(rels.Relationship)) {
            const rel = {
                id: attr(r, "Id") ?? "",
                type: attr(r, "Type") ?? "",
                target: attr(r, "Target") ?? "",
                targetMode: attr(r, "TargetMode"),
            };
            list.push(rel);
            byId.set(rel.id, rel);
        }
    }
    return {
        byId,
        list,
        ownerPath: partPath,
        resolve: (id) => {
            const r = byId.get(id);
            if (!r)
                return undefined;
            if (r.targetMode === "External")
                return r.target;
            return joinPath(partPath, r.target);
        },
    };
}
export function loadContentTypes(archive) {
    const defaults = new Map();
    const overrides = new Map();
    const text = archive.getText("[Content_Types].xml");
    if (text) {
        const xml = parseXml(text);
        const types = xml.Types ?? {};
        for (const d of arr(types.Default)) {
            const ext = attr(d, "Extension");
            const ct = attr(d, "ContentType");
            if (ext && ct)
                defaults.set(ext.toLowerCase(), ct);
        }
        for (const o of arr(types.Override)) {
            let part = attr(o, "PartName") ?? "";
            const ct = attr(o, "ContentType");
            if (part.startsWith("/"))
                part = part.slice(1);
            if (part && ct)
                overrides.set(part, ct);
        }
    }
    return {
        defaults,
        overrides,
        find: (p) => {
            const norm = p.startsWith("/") ? p.slice(1) : p;
            const o = overrides.get(norm);
            if (o)
                return o;
            const dot = norm.lastIndexOf(".");
            if (dot >= 0) {
                const ext = norm.slice(dot + 1).toLowerCase();
                return defaults.get(ext);
            }
            return undefined;
        },
    };
}
export function findPresentationPath(archive) {
    const rootRels = archive.getText("_rels/.rels");
    if (rootRels) {
        const xml = parseXml(rootRels);
        for (const r of arr(xml.Relationships?.Relationship)) {
            const type = attr(r, "Type") ?? "";
            if (/\/officeDocument$/.test(type)) {
                let t = attr(r, "Target") ?? "";
                if (t.startsWith("/"))
                    t = t.slice(1);
                return t;
            }
        }
    }
    return "ppt/presentation.xml";
}
export function loadXmlPart(archive, path) {
    const text = archive.getText(path);
    return text ? parseXml(text) : undefined;
}
