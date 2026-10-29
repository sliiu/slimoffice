import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

describe("editor chrome Share indigo", () => {
  it("defines a Share-only indigo CTA class", () => {
    const css = readFileSync(join(here, "ui-style.ts"), "utf8");
    assert.match(css, /\.ppt-topbar-btn--share\s*\{[^}]*#4f46e5/s);
    assert.match(css, /Design v1: Share is the only indigo-filled CTA in the top bar/);
    assert.match(css, /\.ppt-view-bar-play\s*\{[^}]*#4f46e5/s);
    assert.match(
      css,
      /\.ppt-topbar-btn\.ppt-topbar-btn--share:hover[\s\S]*?#4338ca/,
    );
  });

  it("applies the Share class only to the Share button", () => {
    const ribbon = readFileSync(join(here, "ribbon.ts"), "utf8");
    const shareBlock = ribbon.match(
      /const shareBtn = mkTopBtn[\s\S]{0,240}shareBtn\.classList\.add\("ppt-topbar-btn--share"\)/,
    );
    assert.ok(shareBlock, "Share button must add ppt-topbar-btn--share");

    const classAdds = [...ribbon.matchAll(/classList\.add\("ppt-topbar-btn--share"\)/g)];
    assert.equal(classAdds.length, 1, "only Share may receive the indigo class");

    assert.match(ribbon, /const exportBtn = mkBtn\(t\("toolbar\.export"\)/);
    assert.doesNotMatch(ribbon, /const exportBtn = [\s\S]{0,200}ppt-topbar-btn--share/);
    assert.doesNotMatch(ribbon, /const themeBtn = mkTopBtn/);
    const css = readFileSync(join(here, "ui-style.ts"), "utf8");
    assert.doesNotMatch(css, /\.ppt-group-pill\s*\{[^}]*#4[Ff]46[Ee]5/s);
    assert.doesNotMatch(css, /\.ppt-group-chip\[aria-selected="true"\]\s*\{[^}]*#4[Ff]46[Ee]5/s);
    assert.doesNotMatch(ribbon, /const insertBtn = mkTopBtn/);
    assert.doesNotMatch(ribbon, /const moreBtn = mkTopBtn/);
  });

  it("Share modal copy is indigo; other Plan B surfaces stay neutral", () => {
    const css = readFileSync(join(here, "ui-style.ts"), "utf8");
    assert.match(css, /\.ppt-chrome-share-copy\s*\{[^}]*#4F46E5/s);
    assert.match(css, /\.ppt-chrome-share-overlay\s*\{[^}]*0\.4/s);
    assert.match(css, /\.ppt-chrome-share-modal\s*\{[^}]*440px/s);
    assert.match(css, /\.ppt-chrome-popover[\s\S]*border-radius:\s*16px/);
    assert.match(css, /\.ppt-chrome-card:focus-visible[\s\S]*#4F46E5/);
    assert.doesNotMatch(css, /\.ppt-chrome-card\s*\{[^}]*#4[Ff]46[Ee]5/s);
    assert.doesNotMatch(css, /\.ppt-chrome-more-item\s*\{[^}]*#4[Ff]46[Ee]5/s);
    assert.doesNotMatch(css, /\.ppt-topbar-btn\s*\{[^}]*#4[Ff]46[Ee]5/s);
  });
});
