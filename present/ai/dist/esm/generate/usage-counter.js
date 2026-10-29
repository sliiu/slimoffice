export { extractLlmUsage } from "../llm/usage.js";
export class UsageCounter {
    metrics = {
        modelCalls: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadTokens: 0,
        cacheCreationTokens: 0,
        wallTimeMs: 0,
        estimatedCostCNY: 0,
    };
    startTime = Date.now();
    addCall(usage) {
        this.metrics.modelCalls += 1;
        if (usage) {
            this.metrics.inputTokens += usage.input_tokens ?? 0;
            this.metrics.outputTokens += usage.output_tokens ?? 0;
            this.metrics.cacheReadTokens += usage.cache_read_tokens ?? 0;
            this.metrics.cacheCreationTokens += usage.cache_creation_tokens ?? 0;
        }
    }
    snapshot() {
        const elapsed = Date.now() - this.startTime;
        const cost = this.estimateCost();
        return { ...this.metrics, wallTimeMs: elapsed, estimatedCostCNY: cost };
    }
    estimateCost() {
        const inputCost = (this.metrics.inputTokens / 1000) * 0.001;
        const outputCost = (this.metrics.outputTokens / 1000) * 0.003;
        const cacheReadCost = (this.metrics.cacheReadTokens / 1000) * 0.0001;
        const cacheCreateCost = (this.metrics.cacheCreationTokens / 1000) * 0.00125;
        return inputCost + outputCost + cacheReadCost + cacheCreateCost;
    }
}
