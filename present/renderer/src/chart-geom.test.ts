import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { barGeometry, barLabelAnchor, chart3DOffset, chartPadding, chartTextStyle, linearFit, niceTicks, seriesXyPoints, shadeHex } from "./chart-geom.js";
import type { BarChartDef, ChartDef, ChartSeries } from "@ppt/core";

describe("chart-geom", () => {
  it("fits a line, falls back to index points, and shades hex", () => {
    const fit = linearFit([0, 1, 2], [1, 3, 5]);
    assert.ok(fit);
    assert.equal(Math.round(fit.a), 1);
    assert.equal(Math.round(fit.b), 2);
    assert.equal(linearFit([1], [2]), null);
    const series = { name: "s", values: [4, 5] } as ChartSeries;
    const def = { type: "bar", series: [series] } as ChartDef;
    assert.deepEqual(seriesXyPoints(def, series), [
      { x: 0, y: 4 },
      { x: 1, y: 5 },
    ]);
    assert.equal(shadeHex("#ffffff", 0.5), "#808080");
    assert.equal(chart3DOffset(def), null);
  });

  it("niceTicks picks 1/2/5 steps around the requested count instead of one line per unit", () => {
    assert.deepEqual(niceTicks(0, 1500, 5), [0, 500, 1000, 1500]);
    assert.deepEqual(niceTicks(0, 100, 5), [0, 20, 40, 60, 80, 100]);
    assert.deepEqual(niceTicks(0, 7, 5), [0, 2, 4, 6, 8]);
    assert.deepEqual(niceTicks(0, 0, 5), [0, 1]);
  });

  it("chartTextStyle derives label / tick / grid colours from the chart-wide text colour", () => {
    const dflt = chartTextStyle({});
    assert.equal(dflt.text, "#111827");
    assert.equal(dflt.size, 13);
    const dark = chartTextStyle({ textColor: "#f8fafc", lineColor: "#334155", textSize: 12 });
    assert.equal(dark.text, "#f8fafc");
    assert.equal(dark.grid, "#334155");
    assert.equal(dark.axis, "#334155");
    assert.equal(dark.size, 12);
    assert.notEqual(dark.muted, dark.text);
  });

  it("puts clustered column labels over their own bar and leaves room for category labels and legend", () => {
    const def: BarChartDef = {
      type: "column",
      categories: ["Free", "Lite", "Pro"],
      series: [
        { name: "a", values: [100, 100, 100] },
        { name: "b", values: [50, 300, 1000] },
      ],
      legend: true,
    };
    const plot = { x: 0, y: 0, w: 300, h: 200 };
    const geo = barGeometry(def, plot);
    assert.equal(geo.groupStep, 100);
    assert.equal(geo.barW, 35);
    // Series b, category Pro: centred on the second bar of the third group, above its top.
    const a = barLabelAnchor(geo, plot, 1, 2, 1000);
    assert.equal(a.x, 200 + 15 + 35 + 17.5);
    assert.equal(a.anchor, "middle");
    assert.equal(a.baseline, "bottom");
    assert.ok(a.y < 1, `label sits at the top of the tallest bar (${a.y})`);
    // Series a, category Free: first bar of the first group, so the two labels never share an x.
    const b = barLabelAnchor(geo, plot, 0, 0, 100);
    assert.equal(b.x, 15 + 17.5);
    assert.notEqual(b.x, barLabelAnchor(geo, plot, 1, 0, 50).x);
    // Horizontal bars label past the free end.
    const hgeo = barGeometry({ ...def, type: "bar" }, plot);
    const hb = barLabelAnchor(hgeo, plot, 1, 2, 1000);
    assert.equal(hb.anchor, "start");
    assert.ok(hb.x > 300 - 1, `at the right end (${hb.x})`);
    // Stacked: centred inside the segment, in the stacked scale.
    const sgeo = barGeometry({ ...def, stacked: true }, plot);
    const sb = barLabelAnchor(sgeo, plot, 1, 2, 1000, 100);
    assert.equal(sb.baseline, "middle");
    assert.ok(sb.y > 0 && sb.y < 200);
    // Padding: category labels get a row of their own under the plot, and the legend another.
    const pads = chartPadding(def, 13);
    assert.equal(pads.legend, 23);
    assert.equal(pads.bottom, 46);
    assert.equal(chartPadding({ ...def, legend: false }, 13).bottom, 23);
    assert.equal(chartPadding({ type: "pie", series: [{ values: [1] }], categories: ["x"] } as ChartDef, 13).bottom, 8);
    // A horizontal bar chart puts its value axis along the bottom; the tick row needs the same room.
    assert.equal(chartPadding({ ...def, type: "bar", legend: false }, 13).bottom, 23);
  });
});
