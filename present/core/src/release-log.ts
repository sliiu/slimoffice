export function logAppRelease(appId: string, version?: string | null): void {
  const id = appId.trim() || "app";
  const ver = (version ?? "").trim().replace(/^v/i, "") || "dev";
  console.info(`[${id}] v${ver}`);
}
