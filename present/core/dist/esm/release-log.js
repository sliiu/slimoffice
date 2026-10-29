export function logAppRelease(appId, version) {
    const id = appId.trim() || "app";
    const ver = (version ?? "").trim().replace(/^v/i, "") || "dev";
    console.info(`[${id}] v${ver}`);
}
