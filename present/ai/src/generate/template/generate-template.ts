// 阶段 3.2：AI 生成模板。
//
// 输入：ThemeGuidance（topic / scenario / styleHint）
// 输出：core.Template —— 含 1 个 master + 一组常用 layouts（title/title+body/two-col/quote/blank）
//      和 core.Theme（palette → Theme.colors / fonts.title→Theme.fonts.major）。
//
// 与 generateTheme 的关系：
//   - generateTheme 只产 ThemeDef，让你在已经创建的 deck 上换主题；
//   - generateTemplate 产 Template，让你"从零起步建 deck"。
//   - 二者复用同一个 LLM 调用（generateTheme），节省一次 round-trip。
//
// 与 serializer 的关系：
//   - 输出的 Template.masters[].__source 故意不存在 —— 用此模板新建的 deck 同样没有
//     pres.__source，writePptx 会走 **from-scratch** 路径，由 renderSlideMasterXml /
//     renderSlideLayoutXml（packages/serializer/src/pptx-master-layout.ts）把 master
//     背景 + 装饰 shape + 各 layout 的占位符/装饰**完整写进** slideMaster/slideLayout 部件。
//     （历史注释曾说"serializer 会 skip master 写入"，已过时——见 scripts/verify-template.mjs
//      case 4 对 master/layout 部件、装饰 shape、rels、Content-Types 的断言。）
//   - 若 deck 是从既有 .pptx 解析来的（pres.__source 存在）并替换了 master，则走 round-trip
//     的 addNewMasterPart / addNewLayoutPart 新增部件路径。
//
// 设计权衡：
//   - 不让 LLM 直接产 master/layout 结构 —— 那是高 token + 易格式错。
//     改让 LLM 只产 ThemeDef + 简短 "tagline / footer" 文案，剩下的 layout 用代码模板。
//   - 模板的 4-5 个 layouts 来自 AI 包内既有的视觉策略（与 compile 路径一致），保证
//     "用此模板新建" 与 "AI 生成 deck 的整体观感" 视觉对齐。

import {
  type Presentation,
  type SlideSize,
  type Template,
  type TemplateDescriptor,
  createPresentationFromTemplate,
  presentationToTemplate,
} from "@ppt/core";

import { generateTheme } from "../pipeline";
import type { GenerateOptions } from "../pipeline";
import type { ThemeGuidance } from "../prompts";
import {
  buildMastersFromThemeDef,
  themeSpecFromThemeDef,
  type GeneratedThemeSpec,
  type ThemeDef,
} from "../../themes";
import { snapshotThemeShapes } from "./snapshot";

export interface GenerateTemplateOptions extends GenerateOptions {
  /** 模板物理尺寸；默认 1280×720（与 generate.ts 默认 16:9 一致）。 */
  size?: SlideSize;
  /** 自定义 template id 前缀，默认 `ai:<random>`。 */
  idPrefix?: string;
}

export interface GeneratedTemplate {
  /** 完整 core.Template，可直接传给 createPresentationFromTemplate。 */
  template: Template;
  /** 原始 ThemeDef + ThemeSpec，便于复用到 generatePresentation 的 themeOverride。 */
  themeDef: ThemeDef;
  themeSpec: GeneratedThemeSpec;
}

const DEFAULT_SIZE: SlideSize = { width: 1280, height: 720 };

/**
 * 调 generateTheme 拿到 ThemeDef → 翻译成 core.Template。
 *
 * 失败语义：generateTheme 失败抛 —— 调用方负责 fallback (e.g. 用 blank template)。
 */
export async function generateTemplate(
  guidance: ThemeGuidance,
  opts: GenerateTemplateOptions = {},
): Promise<GeneratedTemplate> {
  const size = opts.size ?? DEFAULT_SIZE;
  const { spec, theme } = await generateTheme(guidance, opts);
  const template = realizeTemplate(
    spec,
    theme,
    size,
    opts.idPrefix ?? `ai:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
  );
  return { template, themeDef: theme, themeSpec: spec };
}

/**
 * 把已有的 ThemeDef → Template（不走网络，用于"复用已经生成的主题"）。
 *
 * 用法：用户在 deck 内已经 generateAndApplyTheme 过一次，对结果满意 → 调
 * `templateFromThemeDef(currentTheme)` → registerAiTemplate → 之后新建 deck 直接用。
 */
export function templateFromThemeDef(
  theme: ThemeDef,
  opts: { size?: SlideSize; idPrefix?: string; description?: string; spec?: GeneratedThemeSpec } = {},
): Template {
  const size = opts.size ?? DEFAULT_SIZE;
  const spec = themeSpecFromThemeDef(theme, opts.spec);
  const baseId = opts.idPrefix ?? `ai:${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  return realizeTemplate(spec, theme, size, baseId);
}

function realizeTemplate(spec: GeneratedThemeSpec, theme: ThemeDef, size: SlideSize, baseId: string): Template {
  const { masters, coreTheme } = buildMastersFromThemeDef(theme, size, baseId, spec);
  const master = masters[0]!;

  const thumbnailUrl = snapshotThemeShapes({
    size,
    background: master.background,
    shapes: [...master.shapes, ...(master.layouts?.[0]?.shapes ?? [])],
  });

  const desc: TemplateDescriptor = {
    id: baseId,
    name: spec.name,
    description: spec.description,
    source: "ai",
    size,
    tags: ["ai-generated", spec.decoration],
    thumbnailUrl,
  };

  return {
    ...desc,
    masters,
    theme: { ...coreTheme, id: baseId },
    startSlide: { layoutType: "title" },
  };
}
export async function generatePresentationFromTemplate(
  guidance: ThemeGuidance,
  opts: GenerateTemplateOptions = {},
): Promise<{ pres: Presentation; template: Template }> {
  const { template } = await generateTemplate(guidance, opts);
  const pres = createPresentationFromTemplate(template);
  return { pres, template };
}

// 重导出便于宿主只 import 一处
export { createPresentationFromTemplate, presentationToTemplate };
