"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createPluginLiveHub = createPluginLiveHub;
function createPluginLiveHub() {
    const listeners = new Map();
    const attachListeners = new Set();
    let transport = null;
    const fire = (pluginId, data, from) => {
        const set = listeners.get(pluginId);
        if (!set)
            return;
        for (const fn of [...set]) {
            try {
                fn(data, { from });
            }
            catch (e) {
                console.error(`[ppt-player] plugin live listener '${pluginId}' threw`, e);
            }
        }
    };
    return {
        apiFor(pluginId) {
            return {
                attached: () => transport != null,
                send(data, opts) {
                    transport?.send(pluginId, data, opts?.snap === true);
                },
                on(fn) {
                    let set = listeners.get(pluginId);
                    if (!set) {
                        set = new Set();
                        listeners.set(pluginId, set);
                    }
                    set.add(fn);
                    return () => {
                        listeners.get(pluginId)?.delete(fn);
                    };
                },
                onAttach(fn) {
                    attachListeners.add(fn);
                    return () => {
                        attachListeners.delete(fn);
                    };
                },
            };
        },
        attach(next) {
            transport = next;
            const on = next != null;
            for (const fn of [...attachListeners]) {
                try {
                    fn(on);
                }
                catch (e) {
                    console.error("[ppt-player] plugin live onAttach threw", e);
                }
            }
        },
        receive(msg) {
            if (!msg?.pluginId || typeof msg.pluginId !== "string")
                return;
            if (transport && msg.from && msg.from === transport.selfId)
                return;
            fire(msg.pluginId, msg.data, String(msg.from || ""));
        },
    };
}
