"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.kinsokuSnapshot = kinsokuSnapshot;
/** JSON snapshot for round-trip idempotent compare. */
function kinsokuSnapshot(kinsoku) {
    if (!kinsoku)
        return "";
    return JSON.stringify(kinsoku);
}
