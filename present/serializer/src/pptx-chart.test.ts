import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { BarChartDef } from "@ppt/core";
import { renderChartSpaceXml } from "./pptx-chart.js";

const bars: BarChartDef = {
  type: "column",
  categories: ["Free", "Lite", "Pro"],
  series: [{ name: "Quota", values: [50, 300, 1500], color: "#22d3ee" }],
  showValues: true,
};

describe("renderChartSpaceXml chart-wide text / line style", () => {
  it("writes chartSpace txPr + transparent chart area when a text colour is set, with gridline spPr for lineColor", () => {
    const xml = renderChartSpaceXml({ ...bars, textColor: "#f8fafc", textSize: 13, lineColor: "#334155" });
    // CT_ChartSpace: spPr then txPr after </c:chart>.
    assert.match(xml, /<\/c:chart>\s*<c:spPr><a:noFill\/><a:ln><a:noFill\/><\/a:ln><\/c:spPr><c:txPr>/);
    assert.match(xml, /<a:defRPr sz="1000"><a:solidFill><a:srgbClr val="F8FAFC"\/>/);
    assert.match(xml, /<c:majorGridlines><c:spPr><a:ln w="9525"><a:solidFill><a:srgbClr val="334155"\/>/);
    // Axis children keep schema order: gridlines before title / spPr before crossAx.
    assert.match(xml, /<c:valAx>.*<c:majorGridlines>.*<c:spPr>.*<c:crossAx/s);
  });

  it("leaves chartSpace and axes bare when no style is set, so PowerPoint applies its chart style", () => {
    const xml = renderChartSpaceXml(bars);
    assert.doesNotMatch(xml, /<c:txPr>/);
    assert.doesNotMatch(xml, /<a:noFill\/>/);
    assert.match(xml, /<c:majorGridlines\/>/);
  });
});
