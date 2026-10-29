import type { Presentation } from "@sliiu/present-core";
export interface RoundTripOptions {
    debug?: boolean;
}
export declare function writePptxRoundTrip(pres: Presentation, opts?: RoundTripOptions): Map<string, Uint8Array>;
