import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

function loadMessages(name: "messages-en.ts" | "messages-zh.ts"): string {
  return readFileSync(join(here, "i18n", name), "utf8");
}

function quotedValues(src: string): Array<{ key: string; value: string }> {
  const out: Array<{ key: string; value: string }> = [];
  const re = /"([^"]+)":\s*"((?:\\.|[^"\\])*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) {
    out.push({ key: m[1]!, value: m[2]!.replace(/\\"/g, '"') });
  }
  return out;
}

const GEOMETRY_KEYS = /^(shapeLib\.|dialog\.smartArt\.layout\.)/;
const CHROME_KEYS = /^(tour\.|protect\.|ribbon\.collapse|ribbon\.expand|ribbon\.compactExpand|toolbar\.|rightPanel\.)/;
/** Product / competitive-parity names banned in user-visible editor chrome. */
const BANNED_CHROME =
  /PowerPoint|\bOffice\b|Ribbon|功能区|Fluent|SmartArt|WordArt|ColorTheme|\bDesigner\b|设计器|\bOLE\b|对象（OLE）/i;
/** Office Insert-group titles that must not appear as chrome section labels. */
const BANNED_OFFICE_GROUPS = /^(插图|符号|Illustrations|Symbols)$/;
const OFFICE_TAB_NAMES = /^(Home|Insert|Design|Format|Transitions|Animations|Slide Show|Review|View)$/;
/** English Office tab names that must not reappear as chrome labels (Insert stays a task verb). */
const OFFICE_TAB_LABEL = /^(Home|Design|Transitions|Animations|Slide Show|View)$/;
const OFFICE_TAB_CHROME_KEYS = [
  "toolbar.menu.transitions",
  "toolbar.menu.animations",
  "ribbon.tab.home",
  "ribbon.tab.design",
  "ribbon.tab.transitions",
  "ribbon.tab.animations",
  "ribbon.tab.slideshow",
  "ribbon.tab.view",
  "ribbon.panels.transitions",
  "ribbon.panels.animations",
  "rightPanel.tab.animations",
  "rightPanel.tab.transitions",
  "anim.panel.title",
] as const;
const MORE_LABEL_KEYS = [
  "toolbar.menu.file",
  "toolbar.menu.editText",
  "toolbar.menu.draw",
  "toolbar.menu.lookObject",
  "toolbar.menu.present",
  "toolbar.menu.workspace",
  "toolbar.menu.review",
  "toolbar.menu.helpExperimental",
] as const;
const INSERT_COMMON_ZH = ["新页", "文本框", "图片", "形状"] as const;

describe("editor chrome copy", () => {
  for (const file of ["messages-en.ts", "messages-zh.ts"] as const) {
    it(`${file}: no banned product names in editor chrome`, () => {
      const entries = quotedValues(loadMessages(file));
      const hits = entries.filter(({ key, value }) => {
        if (GEOMETRY_KEYS.test(key)) return false;
        return BANNED_CHROME.test(value);
      });
      assert.deepEqual(
        hits,
        [],
        hits.map((h) => `${h.key}=${h.value}`).join("\n"),
      );
    });

    it(`${file}: protect/tour do not name PowerPoint or Office as the product`, () => {
      const entries = quotedValues(loadMessages(file));
      const hits = entries.filter(
        ({ key, value }) => CHROME_KEYS.test(key) && /PowerPoint|Office/i.test(value),
      );
      assert.deepEqual(
        hits,
        [],
        hits.map((h) => `${h.key}=${h.value}`).join("\n"),
      );
    });
  }

  it("zh task labels are the Plan C groups, not Office tab names", () => {
    const entries = Object.fromEntries(quotedValues(loadMessages("messages-zh.ts")).map((e) => [e.key, e.value]));
    assert.equal(entries["toolbar.menu.file"], "文件");
    assert.equal(entries["toolbar.menu.editText"], "编辑与文本");
    assert.equal(entries["toolbar.menu.draw"], "绘图");
    assert.equal(entries["toolbar.menu.lookObject"], "外观与对象");
    assert.equal(entries["toolbar.menu.present"], "放映");
    assert.equal(entries["toolbar.menu.workspace"], "工作区");
    assert.equal(entries["toolbar.menu.review"], "审阅");
    assert.equal(entries["toolbar.menu.helpExperimental"], "帮助 / 实验");
    assert.notEqual(entries["toolbar.menu.review"], "审阅工具");
    for (const key of MORE_LABEL_KEYS) {
      assert.ok(entries[key], key);
      assert.doesNotMatch(entries[key]!, /Home|Insert|Design|Slide Show|Fluent|Ribbon|功能区/i);
      assert.ok(!OFFICE_TAB_NAMES.test(entries[key]!), `${key}=${entries[key]}`);
    }
  });

  it("rename map: SmartArt/WordArt/ColorTheme/Designer/OLE use task labels", () => {
    const zh = Object.fromEntries(quotedValues(loadMessages("messages-zh.ts")).map((e) => [e.key, e.value]));
    const en = Object.fromEntries(quotedValues(loadMessages("messages-en.ts")).map((e) => [e.key, e.value]));
    assert.equal(zh["ribbon.insert.smartArt"], "插入图示");
    assert.equal(en["ribbon.insert.smartArt"], "Insert diagram");
    assert.equal(zh["inspector.section.smartArt"], "图示");
    assert.equal(en["inspector.section.smartArt"], "Diagram");
    assert.equal(zh["ribbon.insert.wordArt"], "装饰文字");
    assert.equal(en["ribbon.insert.wordArt"], "Decorative text");
    assert.equal(zh["inspector.slide.colorTheme"], "配色");
    assert.equal(en["inspector.slide.colorTheme"], "Colors");
    assert.equal(zh["designer.title"], "版式建议");
    assert.equal(en["designer.title"], "Layout suggestions");
    assert.equal(zh["ribbon.designer.label"], "版式建议");
    assert.equal(en["ribbon.designer.label"], "Layout suggestions");
    assert.equal(zh["ribbon.insert.objectLabel"], "嵌入对象");
    assert.equal(en["ribbon.insert.objectLabel"], "Embedded object");
    assert.equal(zh["cmd.convertToDiagram"], "转为图示");
    assert.equal(en["cmd.convertToDiagram"], "Convert to diagram");
    assert.equal(zh["cmd.editWordArt"], "编辑装饰文字");
    assert.equal(en["cmd.editWordArt"], "Edit decorative text");
    assert.equal(zh["ribbon.zoom.fit"], "适应窗口");
    assert.equal(zh["inspector.slide.colorTheme"], "配色");
  });

  it("EN chrome does not reuse English Office tab names", () => {
    const en = Object.fromEntries(quotedValues(loadMessages("messages-en.ts")).map((e) => [e.key, e.value]));
    for (const key of OFFICE_TAB_CHROME_KEYS) {
      assert.ok(en[key], key);
      assert.ok(!OFFICE_TAB_LABEL.test(en[key]!), `${key}=${en[key]}`);
    }
    assert.equal(en["toolbar.menu.transitions"], "Slide change");
    assert.equal(en["toolbar.menu.animations"], "Motion");
    assert.equal(en["rightPanel.tab.transitions"], "Slide change");
    assert.equal(en["rightPanel.tab.animations"], "Motion");
  });

  it("Insert / View group titles are task names, not Office groups", () => {
    const zh = Object.fromEntries(quotedValues(loadMessages("messages-zh.ts")).map((e) => [e.key, e.value]));
    const en = Object.fromEntries(quotedValues(loadMessages("messages-en.ts")).map((e) => [e.key, e.value]));
    assert.equal(zh["ribbon.group.media"], "媒体");
    assert.equal(en["ribbon.group.media"], "Media");
    assert.equal(zh["ribbon.group.insertExtras"], "字段");
    assert.equal(en["ribbon.group.insertExtras"], "Fields");
    assert.notEqual(zh["ribbon.group.illustrations"], "插图");
    assert.notEqual(zh["ribbon.group.insertExtras"], "符号");
    assert.ok(!BANNED_OFFICE_GROUPS.test(zh["ribbon.group.illustrations"]!));
    assert.ok(!BANNED_OFFICE_GROUPS.test(zh["ribbon.group.insertExtras"]!));
    assert.ok(!BANNED_OFFICE_GROUPS.test(en["ribbon.group.illustrations"]!));
    assert.ok(!BANNED_OFFICE_GROUPS.test(en["ribbon.group.insertExtras"]!));
    assert.equal(zh["ribbon.zoom.fit"], "适应窗口");
    assert.doesNotMatch(en["ribbon.group.startShow"]!, /Slide Show/);
    assert.doesNotMatch(en["ribbon.group.recordShow"]!, /Slide Show/);
    const sectionHits = [
      ...quotedValues(loadMessages("messages-en.ts")),
      ...quotedValues(loadMessages("messages-zh.ts")),
    ].filter(({ key, value }) => {
      if (!key.startsWith("ribbon.group.") && !key.startsWith("ribbon.tab.")) return false;
      return /Slide Show|^Home$|^Design$|^Transitions$|^Illustrations$|^插图$|^符号$/.test(value);
    });
    assert.deepEqual(sectionHits, [], sectionHits.map((h) => `${h.key}=${h.value}`).join("\n"));
  });

  it("right-panel color chips stay labeled 配色 and are not ColorTheme", () => {
    const zh = Object.fromEntries(quotedValues(loadMessages("messages-zh.ts")).map((e) => [e.key, e.value]));
    const en = Object.fromEntries(quotedValues(loadMessages("messages-en.ts")).map((e) => [e.key, e.value]));
    assert.equal(zh["inspector.slide.colorTheme"], "配色");
    assert.equal(en["inspector.slide.colorTheme"], "Colors");
    assert.doesNotMatch(zh["inspector.slide.colorTheme"]!, /ColorTheme|设计器/);
    assert.doesNotMatch(en["inspector.slide.colorTheme"]!, /ColorTheme|Designer/);
  });

  it("zh Insert common cards keep Plan B order", () => {
    const entries = Object.fromEntries(quotedValues(loadMessages("messages-zh.ts")).map((e) => [e.key, e.value]));
    assert.deepEqual(
      [
        entries["toolbar.insert.slide"],
        entries["toolbar.insert.text"],
        entries["toolbar.insert.image"],
        entries["toolbar.insert.shape"],
      ],
      [...INSERT_COMMON_ZH],
    );
  });

  it("zh Plan C quick bar and task copy match the locked shell", () => {
    const entries = Object.fromEntries(quotedValues(loadMessages("messages-zh.ts")).map((e) => [e.key, e.value]));
    assert.equal(entries["toolbar.quick.slide"], "新建幻灯片");
    assert.equal(entries["toolbar.quick.layout"], "版式");
    assert.equal(entries["toolbar.quick.select"], "选择");
    assert.equal(entries["toolbar.timelineHandle"], "时间轴");
    assert.equal(entries["toolbar.notesHandle"], "备注");
    assert.equal(entries["toolbar.insert"], "插入");
    assert.equal(entries["toolbar.menu.file"], "文件");
    assert.deepEqual(
      [
        entries["toolbar.quick.slide"],
        entries["toolbar.quick.layout"],
        entries["toolbar.insert.text"],
        entries["toolbar.insert.image"],
        entries["toolbar.insert.shape"],
        entries["toolbar.insert.icon"],
        entries["toolbar.quick.select"],
      ],
      ["新建幻灯片", "版式", "文本框", "图片", "形状", "图标", "选择"],
    );
    assert.doesNotMatch(entries["tour.editor.step3.desc"]!, /更多菜单|「更多」/);
    assert.doesNotMatch(entries["tour.editor.step3.desc"]!, /插入、主题/);
  });

  it("export chrome copy never says PowerPoint", () => {
    for (const file of ["messages-en.ts", "messages-zh.ts"] as const) {
      const hits = quotedValues(loadMessages(file)).filter(
        ({ key, value }) => key.startsWith("toolbar.export") && /PowerPoint/i.test(value),
      );
      assert.deepEqual(hits, [], hits.map((h) => `${h.key}=${h.value}`).join("\n"));
    }
  });
});
