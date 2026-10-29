/** JSON snapshot for round-trip idempotent compare. */
export function kinsokuSnapshot(kinsoku) {
    if (!kinsoku)
        return "";
    return JSON.stringify(kinsoku);
}
