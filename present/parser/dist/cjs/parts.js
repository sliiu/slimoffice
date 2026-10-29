"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadRels = loadRels;
exports.loadContentTypes = loadContentTypes;
exports.findPresentationPath = findPresentationPath;
exports.loadXmlPart = loadXmlPart;
const zip_1 = require("./zip");
const xml_1 = require("./xml");
function loadRels(archive, partPath) {
    const dir = partPath.includes("/") ? partPath.slice(0, partPath.lastIndexOf("/")) : "";
    const file = partPath.includes("/") ? partPath.slice(partPath.lastIndexOf("/") + 1) : partPath;
    const relsPath = (dir ? dir + "/" : "") + "_rels/" + file + ".rels";
    const list = [];
    const byId = new Map();
    const text = archive.getText(relsPath);
    if (text) {
        const xml = (0, xml_1.parseXml)(text);
        const rels = xml.Relationships ?? {};
        for (const r of (0, xml_1.arr)(rels.Relationship)) {
            const rel = {
                id: (0, xml_1.attr)(r, "Id") ?? "",
                type: (0, xml_1.attr)(r, "Type") ?? "",
                target: (0, xml_1.attr)(r, "Target") ?? "",
                targetMode: (0, xml_1.attr)(r, "TargetMode"),
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
            return (0, zip_1.joinPath)(partPath, r.target);
        },
    };
}
function loadContentTypes(archive) {
    const defaults = new Map();
    const overrides = new Map();
    const text = archive.getText("[Content_Types].xml");
    if (text) {
        const xml = (0, xml_1.parseXml)(text);
        const types = xml.Types ?? {};
        for (const d of (0, xml_1.arr)(types.Default)) {
            const ext = (0, xml_1.attr)(d, "Extension");
            const ct = (0, xml_1.attr)(d, "ContentType");
            if (ext && ct)
                defaults.set(ext.toLowerCase(), ct);
        }
        for (const o of (0, xml_1.arr)(types.Override)) {
            let part = (0, xml_1.attr)(o, "PartName") ?? "";
            const ct = (0, xml_1.attr)(o, "ContentType");
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
function findPresentationPath(archive) {
    const rootRels = archive.getText("_rels/.rels");
    if (rootRels) {
        const xml = (0, xml_1.parseXml)(rootRels);
        for (const r of (0, xml_1.arr)(xml.Relationships?.Relationship)) {
            const type = (0, xml_1.attr)(r, "Type") ?? "";
            if (/\/officeDocument$/.test(type)) {
                let t = (0, xml_1.attr)(r, "Target") ?? "";
                if (t.startsWith("/"))
                    t = t.slice(1);
                return t;
            }
        }
    }
    return "ppt/presentation.xml";
}
function loadXmlPart(archive, path) {
    const text = archive.getText(path);
    return text ? (0, xml_1.parseXml)(text) : undefined;
}
