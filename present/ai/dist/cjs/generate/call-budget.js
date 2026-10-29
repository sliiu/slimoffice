"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCallBudget = exports.GENERATE_MODEL_CALL_BUDGET = void 0;
exports.plannedGenerateModelCalls = plannedGenerateModelCalls;
exports.GENERATE_MODEL_CALL_BUDGET = 8;
function plannedGenerateModelCalls(input = {}) {
    let n = 0;
    if (!input.fromOutline)
        n += 1;
    if (input.enableDesignSpec)
        n += 1;
    n += 1; // research
    n += 1; // organize
    n += 1; // canvas author. Decks of 10+ pages may spend leftover budget on extra chunks; this count does not grow with pages.
    if (input.enableArtDirector)
        n += 1;
    return n;
}
class ModelCallBudget {
    limit;
    used = 0;
    constructor(limit = exports.GENERATE_MODEL_CALL_BUDGET) {
        this.limit = limit;
    }
    remaining() {
        return Math.max(0, this.limit - this.used);
    }
    tryConsume(n = 1) {
        if (this.used + n > this.limit)
            return false;
        this.used += n;
        return true;
    }
}
exports.ModelCallBudget = ModelCallBudget;
