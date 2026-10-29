import type { Presentation, SlideMaster, Slide, Theme, SlideSize, EmbeddedFont } from "./slide.js";
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
/** 全空白模板：等价于过去的 buildBlankPresentation —— 留作"什么都不选"的兜底。 */
export declare function getBlankTemplate(): Template;
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
export declare function createPresentationFromTemplate(template: Template, opts?: {
    id?: string;
    /**
     * 覆盖起步 slide 的占位符文案（按 placeholder type 索引），叠加在
     * `template.startSlide.defaultText` 之上。core 不持有 i18n，调用方（playground）
     * 把本地化的示例主副标题注进来，模板本身仍保留自己的兜底文案。
     */
    defaultText?: Record<string, string>;
}): Presentation;
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
export declare function createSlideFromMaster(masters: SlideMaster[] | undefined, opts: {
    index: number;
    id?: string;
    name?: string;
    layoutId?: string;
    layoutType?: string;
    /** 找不到 layoutId/layoutType 时的偏好顺序（默认沿用 pickStartLayout 的封面优先）。 */
    preferredTypes?: string[];
    /** 占位符默认填充文本，键是 placeholder.type（title/body/ctrTitle/subTitle...）。 */
    defaultText?: Record<string, string>;
}): Slide;
/**
 * 反方向：把一份已经解析好的 Presentation 抽成 Template。
 *
 * 典型用法：用户上传 .pptx → parsePptx → presentationToTemplate → 存进 IndexedDB。
 * 抽 template 时只保留 masters / theme / 必要 fonts，slides 全部丢弃（slides 是
 * 用户内容，不是模板）。
 */
export declare function presentationToTemplate(pres: Presentation, desc: TemplateDescriptor): Template;
