import type { PluginLiveAPI } from "@sliiu/present-plugin-sdk";
export interface PluginLiveInbound {
    pluginId: string;
    data: unknown;
    from: string;
}
export interface PluginLiveTransport {
    selfId: string;
    send(pluginId: string, data: unknown, snap?: boolean): void;
}
export declare function createPluginLiveHub(): {
    apiFor(pluginId: string): PluginLiveAPI;
    attach(transport: PluginLiveTransport | null): void;
    receive(msg: PluginLiveInbound): void;
};
