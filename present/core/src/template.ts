// 阶段 3.1：模板抽象（Template）。
//
// 目的：让"新建 PPT"不再只能 buildBlankPresentation，而是可以基于 template 的
// master/layout/theme 立刻拿到一份"已经像样"的 Presentation。
//
// 模板源优先级（用户已确认）：
//   1) AI 生成模板（运行时 generateTemplate → 直接拿到 Template 对象）
//   2) 内置 .pptx 模板包（启动时 lazy parse → Template）
//   3) 用户上传的 .pptx（上传时抽取 masters → Template）
//
// Template 抽象本身完全独立于来源 —— 不管模板从哪儿来，最终都生成同一种
// `Presentation`，所以这里只需要描述"模板的视觉骨架 + 元数据"。

import type { Presentation, SlideMaster, Slide, Theme, SlideSize, EmbeddedFont } from "./slide";
import type { Shape } from "./shape";

// 模板能预设的"用一张 slide 起步"时挑哪种版式：
//   - "title" / "title+content" / "blank"：按 OOXML SlideLayout.type 枚举映射。
//   - 给个 layoutId 时直接精确匹配（用于 AI 模板或自定义模板）。
export interface TemplateStartSlideSpec {
  /** 优先按 layoutId 精确匹配；找不到则 fallback layoutType。 */
  layoutId?: string;
  /** SlideLayout.type 枚举值（ECMA-376 ST_SlideLayoutType："title"/"obj"/"twoObj"/"secHead"/"picTx"/...）。 */
  layoutType?: string;
  /** 占位符默认填充文本，键是 placeholder type（"title" / "body" / "ctrTitle" / "subTitle" 等）。 */
  defaultText?: Record<string, string>;
}

export interface TemplateDescriptor {
  /** 唯一 id（"builtin:business"、"user:<uuid>"、"ai:<hash>"）。 */
  id: string;
  /** 展示名（短，"Business Pitch"）。 */
  name: string;
  /** 可选简述（"商务路演 · 深色主调 · 6 套版式"）。 */
  description?: string;
  /** 缩略图。Data URL / blob URL / http URL 均可；选择 modal 直接 <img src>。 */
  thumbnailUrl?: string;
  /** 标签（"business" / "dark" / "minimal" / "ai-generated"），用于筛选 / 搜索。 */
  tags?: string[];
  /** 模板来源种类，便于 UI 分组与排序。 */
  source: "ai" | "builtin" | "user" | "blank";
  /** Slide 物理尺寸；默认 16:9 / 960×540（一份 PPT 内不允许混尺寸）。 */
  size?: SlideSize;
  /** 模板携带的内嵌字体（来自 PPTX 解析），新 Presentation 必须继承否则字体丢失。 */
  fonts?: EmbeddedFont[];
}

/**
 * Template 完整对象。除了元数据外，还要带 masters + theme，因为新建 Presentation
 * 时需要 deep-clone 进去。
 *
 * 注意：`masters` 是结构化对象，**不**是 PPTX bytes —— 模板必须先经过 parser
 * 反序列化为 in-memory Presentation 后，再调 {@link presentationToTemplate} 抽出。
 * 这样下游不用区分 ".pptx file" / "AI dict" / "user upload" 三套路径。
 */
export interface Template extends TemplateDescriptor {
  masters: SlideMaster[];
  theme?: Theme;
  /** 新建时默认使用哪种起步 slide（不传则用第一个 layout）。 */
  startSlide?: TemplateStartSlideSpec;
  /**
   * 页上的构图说明：疏密、位置和装饰。不含原文。
   * 有文字占位符时只影响大纲疏密；没有文字占位符时，整页构图是画面来源。
   * 没有幻灯片时缺省。再选同一条模板时还在。
   */
  composition?: string;
}

const BUILTIN_BLANK_TEMPLATE: Template = {
  id: "blank",
  name: "Blank",
  description: "Single blank 16:9 slide with no master decoration.",
  source: "blank",
  size: { width: 960, height: 540 },
  masters: [],
};

/** 全空白模板：等价于过去的 buildBlankPresentation —— 留作"什么都不选"的兜底。 */
export function getBlankTemplate(): Template {
  return BUILTIN_BLANK_TEMPLATE;
}

/**
 * 从模板生成一份全新的 Presentation。
 *
 * 关键约束：
 * - 深克隆 masters / theme，避免不同 Presentation 共享同一对象（编辑时互相污染）。
 * - 不复制 master 上的 __source（serializer 会按"无 partPath → 写新 part"路径处理）。
 * - 至少生成一张起步 slide：根据 template.startSlide 选 layout，layoutRef 指向它。
 * - 不复制 template 上挂的非可枚举元数据（thumbnail / partPath 都是描述性数据，
 *   不应跟着 Presentation 走）。
 */
export function createPresentationFromTemplate(
  template: Template,
  opts: {
    id?: string;
    /**
     * 覆盖起步 slide 的占位符文案（按 placeholder type 索引），叠加在
     * `template.startSlide.defaultText` 之上。core 不持有 i18n，调用方（playground）
     * 把本地化的示例主副标题注进来，模板本身仍保留自己的兜底文案。
     */
    defaultText?: Record<string, string>;
  } = {},
): Presentation {
  const id = opts.id ?? `pres_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const size: SlideSize = template.size ?? { width: 960, height: 540 };

  // deep-clone masters，但要剥掉 __source（new part → 让 serializer 重新分配 partPath）。
  const masters: SlideMaster[] = template.masters.map((m) => stripSource(deepClone(m)));
  const theme = template.theme ? deepClone(template.theme) : undefined;

  // 起步 slide：复用 createSlideFromMaster —— 它会按 startSlide 选 layout、克隆占位符、
  // 并通过 layoutRef 继承 master 背景 + 装饰，保证"用此模板新建"立刻呈现主题效果。
  const slide = createSlideFromMaster(masters, {
    index: 0,
    name: "Slide 1",
    layoutId: template.startSlide?.layoutId,
    layoutType: template.startSlide?.layoutType,
    defaultText: { ...template.startSlide?.defaultText, ...opts.defaultText },
  });

  const pres: Presentation = {
    id,
    size,
    slides: [slide],
    masters: masters.length > 0 ? masters : undefined,
    theme,
    fonts: template.fonts ? template.fonts.map((f) => ({ ...f })) : undefined,
  };
  return pres;
}

/**
 * 基于 deck 的 master/layout 创建一张"继承主题"的新 slide。
 *
 * 这是"新建 slide 跟随主题"的单一实现：模板新建首页、编辑器右键/工具栏"加页"都走它，
 * 避免出现 doAddSlide 那种"凭空塞一张白底空白页、完全无视母版主题"的退化。
 *
 * 行为：
 *   - 有 master + 能解析到 layout 时：
 *       · 设 `slide.layoutRef` → 渲染层经 composeSlideForRender 继承 master 背景 + 装饰
 *         （主题色 / 渐变 / dec_* 装饰 shape），新页和模板观感一致；
 *       · 深克隆 layout 的占位符 shape 进 layer_main —— 这些占位符已带主题字体/字号/颜色，
 *         所以用户立刻能在新页上看到并编辑主题化的 title/body；
 *       · **不**写 slide.background，让它回退到 master.background（切主题时自动联动）。
 *   - 没有可用 master/layout（如 blank 模板 / 无母版 deck）时：返回一张干净空白页
 *     （不写 background，渲染层默认白底），与历史行为等价。
 *
 * layout 选择优先级：layoutId（精确） → layoutType → preferredTypes 顺序 → pickStartLayout 兜底。
 */
export function createSlideFromMaster(
  masters: SlideMaster[] | undefined,
  opts: {
    index: number;
    id?: string;
    name?: string;
    layoutId?: string;
    layoutType?: string;
    /** 找不到 layoutId/layoutType 时的偏好顺序（默认沿用 pickStartLayout 的封面优先）。 */
    preferredTypes?: string[];
    /** 占位符默认填充文本，键是 placeholder.type（title/body/ctrTitle/subTitle...）。 */
    defaultText?: Record<string, string>;
  },
): Slide {
  const firstMaster = masters && masters.length > 0 ? masters[0] : undefined;
  const layout = firstMaster
    ? pickStartLayout(firstMaster, {
        layoutId: opts.layoutId,
        layoutType: opts.layoutType,
        defaultText: opts.defaultText,
      }, opts.preferredTypes)
    : undefined;

  const startShapes: Shape[] = layout
    ? (layout.shapes ?? [])
        .filter((s) => s.placeholder)
        .map((s) => applyDefaultText(deepClone(s), opts.defaultText))
    : [];

  const slide: Slide = {
    id: opts.id ?? `slide_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: opts.name ?? `Slide ${opts.index + 1}`,
    index: opts.index,
    layers: [
      {
        id: "layer_main",
        name: "Main",
        visible: true,
        locked: false,
        shapes: startShapes,
      },
    ],
  };
  if (firstMaster && layout) {
    slide.layoutRef = { masterId: firstMaster.id, layoutId: layout.id };
  }
  return slide;
}

/** 若提供 defaultText 且占位符 type 命中，则把占位符首段首 run 的文本替换为默认文本。 */
function applyDefaultText(shape: Shape, defaultText?: Record<string, string>): Shape {
  if (!defaultText) return shape;
  const ph = shape.placeholder?.type;
  if (!ph || shape.kind !== "text") return shape;
  const text = defaultText[ph];
  if (text === undefined) return shape;
  const ts = shape as Extract<Shape, { kind: "text" }>;
  const firstRun = ts.paragraphs?.[0]?.runs?.[0];
  if (firstRun) firstRun.text = text;
  return shape;
}

/**
 * 反方向：把一份已经解析好的 Presentation 抽成 Template。
 *
 * 典型用法：用户上传 .pptx → parsePptx → presentationToTemplate → 存进 IndexedDB。
 * 抽 template 时只保留 masters / theme / 必要 fonts，slides 全部丢弃（slides 是
 * 用户内容，不是模板）。
 */
export function presentationToTemplate(pres: Presentation, desc: TemplateDescriptor): Template {
  return {
    ...desc,
    size: desc.size ?? pres.size,
    fonts: desc.fonts ?? pres.fonts?.map((f) => ({ ...f })),
    masters: (pres.masters ?? []).map((m) => stripSource(deepClone(m))),
    theme: pres.theme ? deepClone(pres.theme) : undefined,
  };
}

function pickStartLayout(master: SlideMaster, spec?: TemplateStartSlideSpec, preferredTypes?: string[]) {
  const layouts = master.layouts ?? [];
  if (layouts.length === 0) return undefined;
  if (spec?.layoutId) {
    const exact = layouts.find((l) => l.id === spec.layoutId);
    if (exact) return exact;
  }
  if (spec?.layoutType) {
    const byType = layouts.find((l) => l.type === spec.layoutType);
    if (byType) return byType;
  }
  // 偏好顺序：调用方可覆盖（如"加页"偏好内容版式）；默认封面优先。
  const preferred = preferredTypes ?? ["title", "titleOnly", "obj", "blank"];
  for (const t of preferred) {
    const found = layouts.find((l) => l.type === t);
    if (found) return found;
  }
  return layouts[0];
}

function stripSource(master: SlideMaster): SlideMaster {
  // __source 在 deepClone (JSON) 时本来就丢了 —— 但 structuredClone 会保留非可枚举属性吗？
  // 不会，structuredClone 也只复制可枚举属性，所以 __source 已经丢。这里保留显式 delete
  // 作为防御性写法，未来有人改 deepClone 实现也不会回流。
  if (master && "__source" in master) {
    delete (master as { __source?: unknown }).__source;
  }
  if (Array.isArray(master.layouts)) {
    for (const l of master.layouts) {
      if (l && "__source" in l) {
        delete (l as { __source?: unknown }).__source;
      }
    }
  }
  return master;
}

function deepClone<T>(v: T): T {
  if (typeof structuredClone === "function") return structuredClone(v);
  return JSON.parse(JSON.stringify(v)) as T;
}
