"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.logAppRelease = logAppRelease;
function logAppRelease(appId, version) {
    const id = appId.trim() || "app";
    const ver = (version ?? "").trim().replace(/^v/i, "") || "dev";
    console.info(`[${id}] v${ver}`);
}
