import type { PluginLiveAPI } from "@ppt/plugin-sdk";

export interface PluginLiveInbound {
  pluginId: string;
  data: unknown;
  from: string;
}

export interface PluginLiveTransport {
  selfId: string;
  send(pluginId: string, data: unknown, snap?: boolean): void;
}

export function createPluginLiveHub(): {
  apiFor(pluginId: string): PluginLiveAPI;
  attach(transport: PluginLiveTransport | null): void;
  receive(msg: PluginLiveInbound): void;
} {
  const listeners = new Map<string, Set<(data: unknown, meta: { from: string }) => void>>();
  const attachListeners = new Set<(attached: boolean) => void>();
  let transport: PluginLiveTransport | null = null;

  const fire = (pluginId: string, data: unknown, from: string): void => {
    const set = listeners.get(pluginId);
    if (!set) return;
    for (const fn of [...set]) {
      try {
        fn(data, { from });
      } catch (e) {
        console.error(`[ppt-player] plugin live listener '${pluginId}' threw`, e);
      }
    }
  };

  return {
    apiFor(pluginId: string): PluginLiveAPI {
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
        } catch (e) {
          console.error("[ppt-player] plugin live onAttach threw", e);
        }
      }
    },
    receive(msg) {
      if (!msg?.pluginId || typeof msg.pluginId !== "string") return;
      if (transport && msg.from && msg.from === transport.selfId) return;
      fire(msg.pluginId, msg.data, String(msg.from || ""));
    },
  };
}
