import { describe, it } from "node:test";
import * as assert from "node:assert/strict";
import {
  GENERATE_MODEL_CALL_BUDGET,
  ModelCallBudget,
  plannedGenerateModelCalls,
} from "./call-budget";

describe("generate model-call budget", () => {
  it("keeps 16-page class planned path at or under 8 calls", () => {
    const fromWizard = plannedGenerateModelCalls({ enableArtDirector: true });
    const withSpec = plannedGenerateModelCalls({ enableDesignSpec: true, enableArtDirector: true });
    const fromOutline = plannedGenerateModelCalls({ fromOutline: true, enableArtDirector: true });
    assert.ok(fromWizard <= GENERATE_MODEL_CALL_BUDGET, `presentation planned=${fromWizard}`);
    assert.ok(withSpec <= GENERATE_MODEL_CALL_BUDGET, `designSpec planned=${withSpec}`);
    assert.ok(fromOutline <= GENERATE_MODEL_CALL_BUDGET, `fromOutline planned=${fromOutline}`);
    assert.equal(fromWizard, 5);
    assert.ok(fromWizard < 16, "must not scale with page count");
  });

  it("hard-caps consume at 8", () => {
    const budget = new ModelCallBudget();
    for (let i = 0; i < 8; i++) assert.equal(budget.tryConsume(), true);
    assert.equal(budget.tryConsume(), false);
    assert.equal(budget.used, 8);
    assert.equal(budget.remaining(), 0);
  });
});
