import type { EditCommand } from "@sliiu/present-core";
export interface CollabCommandWire {
    type: string;
    payload: unknown;
}
export declare function serializeCollabCommand(cmd: EditCommand): CollabCommandWire | null;
export declare function deserializeCollabCommand(wire: CollabCommandWire): EditCommand | null;
