import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SourceFileError } from "./extract";
import { fetchUrlMaterial, htmlToText, htmlTitle, looksLikeUrl, normalizeSourceUrl, urlMaterialBlock, type PageFetcher } from "./url";

const PAGE = `<!doctype html><html><head><title>2025 Q3 新能源汽车销量复盘 &amp; 展望</title>
<style>.x{color:red}</style><script>var a = "<p>not body</p>";</script></head>
<body><nav><a href="/">首页</a><a href="/news">新闻</a></nav>
<article><h1>销量复盘</h1>
<p>三季度合计 <strong>412 万辆</strong>，同比增长 23%。</p>
<h2>分品牌</h2>
<table><tr><th>品牌</th><th>销量</th></tr><tr><td>A</td><td>120</td></tr></table>
<ul><li>价格战继续</li><li>出口占比提升</li></ul>
</article><footer>© 2025</footer></body></html>`;

const fetcher = (body: string, url = "https://example.com/a"): PageFetcher => async (req) => ({ url, truncated: false, html: body });

describe("url material", () => {
  it("normalizes bare hosts and rejects non-http schemes", () => {
    assert.equal(normalizeSourceUrl("example.com/a"), "https://example.com/a");
    assert.equal(normalizeSourceUrl(" http://x.test/ "), "http://x.test/");
    assert.throws(() => normalizeSourceUrl("file:///etc/passwd"), SourceFileError);
    assert.throws(() => normalizeSourceUrl("javascript:alert(1)"), SourceFileError);
    assert.throws(() => normalizeSourceUrl("   "), SourceFileError);
  });

  it("detects a pasted link without mistaking a topic for one", () => {
    assert.ok(looksLikeUrl("https://www.nextslide.io"));
    assert.ok(looksLikeUrl("example.com/zh"));
    assert.ok(!looksLikeUrl("AI 如何重塑企业知识管理"));
    assert.ok(!looksLikeUrl("一款记账 App 发布会"));
    assert.ok(!looksLikeUrl(""));
  });

  it("drops script, style, nav and footer; keeps structure as lines", () => {
    const text = htmlToText(PAGE);
    assert.ok(text.includes("412 万辆"), text);
    assert.ok(!text.includes("not body"));
    assert.ok(!text.includes("color:red"));
    assert.ok(!text.includes("首页"));
    assert.ok(!text.includes("© 2025"));
    const lines = text.split("\n");
    assert.ok(lines.includes("销量复盘"));
    assert.ok(lines.includes("分品牌"));
  });

  it("reads the title from <title>, decoding entities", () => {
    assert.equal(htmlTitle(PAGE, "https://example.com/a"), "2025 Q3 新能源汽车销量复盘 & 展望");
  });

  it("fetches through the injected fetcher and reports the final url", async () => {
    const m = await fetchUrlMaterial("example.com/a", fetcher(PAGE));
    assert.equal(m.url, "https://example.com/a");
    assert.equal(m.finalUrl, "https://example.com/a");
    assert.equal(m.truncated, false);
    assert.ok(m.title);
    const block = urlMaterialBlock(m);
    assert.ok(block.startsWith(`# ${m.title}`), block);
    assert.ok(block.includes("来源链接：https://example.com/a"));
    assert.ok(block.includes("412 万辆"));
  });

  it("follows a redirect and says so", async () => {
    const m = await fetchUrlMaterial("https://old.test/x", fetcher(PAGE, "https://new.test/y"));
    assert.equal(m.url, "https://old.test/x");
    assert.equal(m.finalUrl, "https://new.test/y");
    assert.ok(urlMaterialBlock(m).includes("(https://new.test/y)"));
  });

  it("refuses a page with no readable body", async () => {
    await assert.rejects(() => fetchUrlMaterial("https://x.test/", fetcher("<html><body><script>1</script></body></html>")), SourceFileError);
  });

  it("clips long pages and marks them truncated", async () => {
    const long = `<html><body>${"<p>一段正文。</p>".repeat(3000)}</body></html>`;
    const m = await fetchUrlMaterial("https://x.test/", fetcher(long));
    assert.equal(m.truncated, true);
    assert.ok(m.text.length < 13000, `text length ${m.text.length}`);
    assert.ok(m.text.endsWith("…（已截断）"));
  });
});
