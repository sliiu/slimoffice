export declare const GENERATE_MODEL_CALL_BUDGET = 8;
export interface PlannedGenerateCallsInput {
    fromOutline?: boolean;
    enableDesignSpec?: boolean;
    enableArtDirector?: boolean;
    hasThemeOverride?: boolean;
}
export declare function plannedGenerateModelCalls(input?: PlannedGenerateCallsInput): number;
export declare class ModelCallBudget {
    readonly limit: number;
    used: number;
    constructor(limit?: number);
    remaining(): number;
    tryConsume(n?: number): boolean;
}
