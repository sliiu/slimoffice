export function defineEditorPlugin(plugin) {
    if (!plugin.id)
        throw new Error("defineEditorPlugin: plugin.id is required");
    if (typeof plugin.activate !== "function") {
        throw new Error("defineEditorPlugin: plugin.activate is required");
    }
    return plugin;
}
export function withEditorPluginErrorBoundary(plugin) {
    return {
        ...plugin,
        async activate(ctx) {
            try {
                return await plugin.activate(ctx);
            }
            catch (e) {
                console.error(`[ppt-editor] plugin '${plugin.id}' activate failed`, e);
            }
        },
    };
}
