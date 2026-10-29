// 装饰 shape 构建器 —— 供 compile.ts（AI 生成 slide）和 template.ts（新建模板）共用。
//
// 每种 ThemeDecoration 对应一套独立的视觉语言，由多个 Shape 组合实现。
// Shape 使用最小原语（rect / ellipse / line），任何渲染管线 / 序列化器均可直接处理。
//
// 约定：
//   - id 前缀统一用 "dec_"，切主题时 ApplyCustomThemeCmd 按前缀批量清除再重建。
//   - zIndex = -1（位于 shapes 数组最底部），不遮挡内容。
//   - locked 由调用方传入：template master 用 true（母版装饰不可选），
//     compile.ts（slide 内装饰）用 false（用户可在画布上微调）。
//   - **不要再用「左上 + 右下两枚出血大圆」这套构图**。它一度被 aurora / neon-burst /
//     organic-blobs / confetti / ink-wash 共用，导致换主题只是换个颜色、feature 页
//     还每页重复同一对圆。大面积氛围元素一律走「左右出血的横向光带 / 山脊」或贴边
//     灯管，纵向收在版心之外；角部只留细线、括号、角标这类结构性小元素。
import { identityTransform } from "@sliiu/present-core";
/**
 * content 页允许保留的装饰单体最大面积占比（相对 slide 面积）。
 * 实测分布：氛围光晕/大色块类（Glow/Blob/Arc/Mist/Soft）全部 >5%，
 * 结构类（线/栏/括号/散点/印章）全部 <3% —— 4% 是干净的分界线。
 */
const CONTENT_DECOR_MAX_AREA_RATIO = 0.04;
export function buildDecorationShapesShared(dec, ctx) {
    if (dec === "none")
        return [];
    const { palette: p, size: { width: W, height: H }, locked, idPrefix } = ctx;
    let n = 0;
    const nextId = () => `dec_${idPrefix}_${++n}`;
    const base = () => ({
        zIndex: -1,
        visible: true,
        locked,
        opacity: 1,
        transform: identityTransform(),
    });
    const mkRect = (bbox, color, alpha, name = "Decor") => ({
        ...base(),
        id: nextId(),
        kind: "rect",
        name,
        bbox,
        fill: alpha !== undefined ? { kind: "solid", color, alpha } : { kind: "solid", color },
    });
    const mkEllipse = (bbox, color, alpha, name = "Decor") => ({
        ...base(),
        id: nextId(),
        kind: "ellipse",
        name,
        bbox,
        fill: alpha !== undefined ? { kind: "solid", color, alpha } : { kind: "solid", color },
    });
    /**
     * 渐变氛围块：从 fromAlpha 淡入到 toAlpha 的线性渐变矩形。
     * 光晕类元素必须用它而不是实心椭圆 —— 实心填充没有羽化，边缘会读成一枚
     * 「透镜 / 山丘」。角度沿用项目约定：0 = L→R，90 = T→B。
     * 逐 stop 的 alpha 会被 serializer 完整写进 <a:gs>，导出无损。
     */
    const mkGlow = (bbox, color, fromAlpha, toAlpha, angle, name = "Glow") => ({
        ...base(),
        id: nextId(),
        kind: "rect",
        name,
        bbox,
        fill: {
            kind: "linear",
            angle,
            stops: [
                { offset: 0, color, alpha: fromAlpha },
                { offset: 1, color, alpha: toAlpha },
            ],
        },
    });
    const out = [];
    switch (dec) {
        // ── 极光光幕（Dark 主题）──────────────────────────────────────────────────
        // 上下两道全宽渐变光幕（顶部 violet 垂落、底部 cyan 升起），中间留出干净版心，
        // 叠在渐变黑背景上形成极光层次。用渐变而非实心椭圆，边缘自然消隐。
        case "corner-gradient-shape": // legacy 别名：渲染为 aurora（与 namedDecoration 的映射一致）
        case "aurora": {
            out.push(mkGlow({ x: 0, y: 0, w: W, h: H * 0.42 }, p.accent2, 0.13, 0, 90, "Aurora Veil"));
            out.push(mkGlow({ x: 0, y: H * 0.48, w: W, h: H * 0.52 }, p.accent1, 0, 0.2, 90, "Aurora Veil 2"));
            // 底部极细分割线
            out.push(mkRect({ x: W * 0.06, y: H * 0.92, w: W * 0.88, h: 1 }, p.divider, 0.4, "Rule"));
            break;
        }
        // ── 科技 L 形 bracket（Tech 主题）────────────────────────────────────────
        // 左侧细竖条（导航轨道感）+ 右下 L 角标 + 右下小亮点（焦点坐标）。
        case "tech-bracket": {
            // 左侧轨道条
            out.push(mkRect({ x: W * 0.028, y: H * 0.08, w: 2, h: H * 0.84 }, p.accent1, 0.55, "Rail"));
            // 左侧轨道顶部亮点
            out.push(mkEllipse({ x: W * 0.028 - 3, y: H * 0.08 - 3, w: 8, h: 8 }, p.accent1, 0.9, "Rail Dot"));
            // 右下角 L 形 bracket：横向
            out.push(mkRect({ x: W * 0.72, y: H * 0.88, w: W * 0.24, h: 2 }, p.accent2, 0.6, "Bracket H"));
            // 右下角 L 形 bracket：纵向
            out.push(mkRect({ x: W * 0.96 - 2, y: H * 0.72, w: 2, h: H * 0.17 }, p.accent2, 0.6, "Bracket V"));
            // 角落高亮节点
            out.push(mkEllipse({ x: W * 0.96 - 5, y: H * 0.88 - 3, w: 8, h: 8 }, p.accent1, 1, "Node"));
            break;
        }
        // ── 霓虹灯管（Creative 主题）─────────────────────────────────────────────
        // 顶部全宽亮条 + 右侧竖灯管 + 左下横灯管（均为「细亮条 + 外扩柔光晕」两件套）
        // + 右上散点 → 霓虹夜场感。灯管贴边走，不侵占版心。
        case "neon-burst": {
            // 顶部亮条
            out.push(mkRect({ x: 0, y: 0, w: W, h: 3 }, p.accent1, 1, "Top Bar"));
            // 右侧竖灯管：柔光晕向版心方向消隐（R→L），亮管压在光晕右端
            out.push(mkGlow({ x: W * 0.88, y: H * 0.16, w: W * 0.078, h: H * 0.62 }, p.accent2, 0, 0.16, 0, "Tube Halo"));
            out.push(mkRect({ x: W * 0.955, y: H * 0.16, w: 3, h: H * 0.62 }, p.accent2, 0.85, "Tube"));
            // 左下横灯管（短，呼应竖管）：光晕向上消隐
            out.push(mkGlow({ x: W * 0.06, y: H * 0.79, w: W * 0.3, h: H * 0.07 }, p.accent1, 0, 0.16, 90, "Underline Halo"));
            out.push(mkRect({ x: W * 0.06, y: H * 0.86, w: W * 0.3, h: 3 }, p.accent1, 0.85, "Underline"));
            // 右上散点（3 枚）
            const dotPositions = [
                { x: W * 0.80, y: H * 0.08 },
                { x: W * 0.86, y: H * 0.05 },
                { x: W * 0.92, y: H * 0.10 },
            ];
            for (const dp of dotPositions) {
                out.push(mkEllipse({ x: dp.x, y: dp.y, w: 5, h: 5 }, p.accent3, 0.6, "Dot"));
            }
            break;
        }
        // ── 权威双条（Business 主题）─────────────────────────────────────────────
        // 左侧全高纵条（主色）+ 底部全宽横条双段（主 + 次色）→ 权威、信任感。
        case "authority": {
            // 左侧纵条
            out.push(mkRect({ x: 0, y: 0, w: 5, h: H }, p.accent1, 1, "Left Strip"));
            // 底部主色大段
            out.push(mkRect({ x: 0, y: H - 5, w: W * 0.72, h: 5 }, p.accent1, 1, "Bottom Bar"));
            // 底部次色小段
            out.push(mkRect({ x: W * 0.72, y: H - 5, w: W * 0.28, h: 5 }, p.accent2, 1, "Bottom Bar 2"));
            break;
        }
        // ── 手稿双线（Academic 主题）─────────────────────────────────────────────
        // 顶部横线 + 底部横线（双线如书页边框）+ 居中微型装饰圆点。
        case "manuscript": {
            // 顶部规则线
            out.push(mkRect({ x: W * 0.06, y: H * 0.07, w: W * 0.88, h: 1.5 }, p.text, 0.15, "Top Rule"));
            // 次级顶线（更细，稍低）
            out.push(mkRect({ x: W * 0.06, y: H * 0.072, w: W * 0.88, h: 0.5 }, p.accent1, 0.25, "Top Rule 2"));
            // 底部规则线
            out.push(mkRect({ x: W * 0.06, y: H * 0.915, w: W * 0.88, h: 1.5 }, p.text, 0.12, "Bottom Rule"));
            // 居中装饰点（顶线正中）
            out.push(mkEllipse({ x: W * 0.5 - 3, y: H * 0.068, w: 6, h: 6 }, p.accent1, 0.7, "Ornament"));
            // 左侧页码竖线（文稿页面感）
            out.push(mkRect({ x: W * 0.038, y: H * 0.12, w: 1, h: H * 0.76 }, p.divider, 0.6, "Margin"));
            break;
        }
        // ── 墨线单划（Minimal 主题）──────────────────────────────────────────────
        // 单条精准横线，留白哲学：少即是多。
        case "ink-thread": {
            out.push(mkRect({ x: W * 0.08, y: H * 0.14, w: W * 0.84, h: 1 }, p.accent1, 0.35, "Thread"));
            break;
        }
        // ── 层叠远山（Nature 主题）───────────────────────────────────────────────
        // 两道左右出血的扁平山脊自下而上层叠（近深远淡）+ 顶部地平细线 → 生命感、自然感。
        // 枚举值沿用 organic-blobs（已落库的主题依赖它），几何已不再是角部圆球。
        case "organic-blobs": {
            out.push(mkEllipse({ x: -W * 0.12, y: H * 0.72, w: W * 1.24, h: H * 0.46 }, p.accent1, 0.1, "Ridge A"));
            out.push(mkEllipse({ x: -W * 0.18, y: H * 0.82, w: W * 1.36, h: H * 0.38 }, p.accent2, 0.08, "Ridge B"));
            // 顶部细线（如地平线）
            out.push(mkRect({ x: W * 0.06, y: H * 0.065, w: W * 0.88, h: 1 }, p.divider, 0.7, "Horizon"));
            break;
        }
        // ── 朝阳弧（Warm 主题）───────────────────────────────────────────────────
        // 底部半圆弧（只露出上半部分）+ 底部全宽横条 → 日出能量、暖意迸发。
        case "sunrise-arc": {
            // 朝阳大圆（圆心在 slide 底边以下，只有弧顶露出）
            const r = W * 0.55;
            out.push(mkEllipse({ x: W * 0.5 - r, y: H - r * 0.28, w: r * 2, h: r * 1.1 }, p.accent1, 0.12, "Sun Arc"));
            // 底部实色横条
            out.push(mkRect({ x: 0, y: H - 5, w: W, h: 5 }, p.accent1, 1, "Base Bar"));
            // 底部次色窄条（叠加在横条上，右侧 30%）
            out.push(mkRect({ x: W * 0.70, y: H - 5, w: W * 0.30, h: 5 }, p.accent3, 1, "Base Bar 2"));
            break;
        }
        // ── 杂志报头（Editorial 主题）────────────────────────────────────────────
        // 顶部粗实色报头条 + 紧贴的细分隔线 + 左侧整高页边竖线 + 底部页码块，
        // 模拟杂志/报纸版式的强栏目感。
        case "masthead": {
            // 顶部粗报头条（文字主色）
            out.push(mkRect({ x: 0, y: 0, w: W, h: 10 }, p.text, 1, "Masthead"));
            // 报头条右侧强调段（accent1）
            out.push(mkRect({ x: W * 0.74, y: 0, w: W * 0.26, h: 10 }, p.accent1, 1, "Masthead Accent"));
            // 报头下方细分隔线
            out.push(mkRect({ x: W * 0.06, y: H * 0.12, w: W * 0.88, h: 1.5 }, p.text, 0.22, "Hairline"));
            // 左侧整高页边竖线（栏目分隔）
            out.push(mkRect({ x: W * 0.045, y: H * 0.14, w: 1, h: H * 0.74 }, p.divider, 0.7, "Margin"));
            // 底部页码块（accent1 实色小方）
            out.push(mkRect({ x: W * 0.06, y: H - 14, w: 26, h: 6 }, p.accent1, 1, "Folio"));
            break;
        }
        // ── 终端扫描线（Terminal 主题）───────────────────────────────────────────
        // 左上光标块 + 命令提示符短条 + 横向扫描线（CRT 残影）+ 四角 L 形括号。
        case "terminal": {
            // 左上"光标"实块
            out.push(mkRect({ x: W * 0.035, y: H * 0.085, w: 12, h: 22 }, p.accent1, 0.9, "Cursor"));
            // 命令提示符短条（光标右侧）
            out.push(mkRect({ x: W * 0.035 + 18, y: H * 0.105, w: W * 0.1, h: 3 }, p.accent2, 0.7, "Prompt"));
            // 横向扫描线（CRT 残影，多条极淡）
            for (let i = 0; i < 5; i++) {
                out.push(mkRect({ x: 0, y: H * (0.28 + i * 0.13), w: W, h: 1 }, p.accent1, 0.05, `Scanline ${i}`));
            }
            // 四角 L 形括号（仅左上 + 右下，避免过满）
            out.push(mkRect({ x: W * 0.03, y: H * 0.07, w: 20, h: 2 }, p.accent1, 0.5, "TL H"));
            out.push(mkRect({ x: W * 0.03, y: H * 0.07, w: 2, h: 20 }, p.accent1, 0.5, "TL V"));
            out.push(mkRect({ x: W * 0.97 - 20, y: H * 0.93, w: 20, h: 2 }, p.accent2, 0.5, "BR H"));
            out.push(mkRect({ x: W * 0.97 - 2, y: H * 0.93 - 18, w: 2, h: 20 }, p.accent2, 0.5, "BR V"));
            break;
        }
        // ── 彩纸礼花（Pastel 主题）───────────────────────────────────────────────
        // 底部一道左右出血的柔和色带 + 散落的多彩圆点 → 活泼、亲和。
        // 散点才是这套装饰的识别点，色带只负责托住画面下沿。
        case "confetti": {
            out.push(mkGlow({ x: 0, y: H * 0.6, w: W, h: H * 0.4 }, p.accent1, 0, 0.16, 90, "Soft Band"));
            // 散落彩点（轮流用 4 个 accent）
            const confettiColors = [p.accent1, p.accent2, p.accent3, p.accent4];
            const confettiPos = [
                { x: 0.18, y: 0.16, s: 10 }, { x: 0.34, y: 0.10, s: 7 }, { x: 0.5, y: 0.14, s: 12 },
                { x: 0.66, y: 0.09, s: 8 }, { x: 0.82, y: 0.18, s: 10 }, { x: 0.9, y: 0.4, s: 7 },
                { x: 0.12, y: 0.5, s: 9 }, { x: 0.24, y: 0.82, s: 8 },
            ];
            confettiPos.forEach((c, i) => {
                out.push(mkEllipse({ x: W * c.x, y: H * c.y, w: c.s, h: c.s }, confettiColors[i % 4], 0.55, `Confetti ${i}`));
            });
            break;
        }
        // ── 鎏金细框（Luxe 主题）─────────────────────────────────────────────────
        // 四边内嵌金色细线框 + 四角节点 → 高奢品牌的克制精致感。
        case "gilded": {
            const inset = Math.round(Math.min(W, H) * 0.05);
            const lw = 1.2;
            // 四边细线
            out.push(mkRect({ x: inset, y: inset, w: W - inset * 2, h: lw }, p.accent1, 0.85, "Frame Top"));
            out.push(mkRect({ x: inset, y: H - inset - lw, w: W - inset * 2, h: lw }, p.accent1, 0.85, "Frame Bottom"));
            out.push(mkRect({ x: inset, y: inset, w: lw, h: H - inset * 2 }, p.accent1, 0.85, "Frame Left"));
            out.push(mkRect({ x: W - inset - lw, y: inset, w: lw, h: H - inset * 2 }, p.accent1, 0.85, "Frame Right"));
            // 四角节点小方块
            const corners = [
                { x: inset, y: inset }, { x: W - inset, y: inset },
                { x: inset, y: H - inset }, { x: W - inset, y: H - inset },
            ];
            corners.forEach((c, i) => {
                out.push(mkRect({ x: c.x - 3, y: c.y - 3, w: 6, h: 6 }, p.accent2, 1, `Corner ${i}`));
            });
            break;
        }
        // ── 水墨留白（Ink 主题）──────────────────────────────────────────────────
        // 下半部横向远山淡墨 + 右下朱红印章方块 + 左侧竖向墨线 → 国风文气。
        // 墨晕压在下半部并保持极低透明度：宣纸底 + 深色正文，任何加深都会吃掉对比度。
        case "ink-wash": {
            out.push(mkGlow({ x: 0, y: H * 0.55, w: W, h: H * 0.45 }, p.text, 0, 0.07, 90, "Ink Wash"));
            // 远山剪影：墨韵之外留一道实体山脊线，避免整片只有均匀的灰
            out.push(mkEllipse({ x: W * 0.26, y: H * 0.74, w: W * 0.62, h: H * 0.4 }, p.accent2, 0.06, "Distant Ridge"));
            // 左侧竖向墨线（卷轴边）
            out.push(mkRect({ x: W * 0.05, y: H * 0.14, w: 2, h: H * 0.72 }, p.text, 0.5, "Scroll Line"));
            // 右下朱红印章方块（描边 + 内点）
            out.push(mkRect({ x: W * 0.9, y: H * 0.8, w: 34, h: 34 }, p.accent1, 0.85, "Seal"));
            out.push(mkRect({ x: W * 0.9 + 5, y: H * 0.8 + 5, w: 24, h: 24 }, p.bg, 0.9, "Seal Inner"));
            out.push(mkRect({ x: W * 0.9 + 10, y: H * 0.8 + 10, w: 14, h: 14 }, p.accent1, 0.9, "Seal Core"));
            break;
        }
        // ── 兼容：通用几何线（AI 生成主题）──────────────────────────────────────
        case "geometric-lines": {
            out.push(mkRect({ x: W * 0.03, y: H * 0.1, w: 2, h: H * 0.8 }, p.accent1, 0.6, "VLine"));
            out.push(mkRect({ x: W * 0.5, y: H * 0.04, w: W * 0.18, h: 2 }, p.accent2, 0.5, "HLine"));
            break;
        }
        // ── 兼容：通用底栏（AI 生成主题）────────────────────────────────────────
        case "bottom-accent-bar": {
            out.push(mkRect({ x: 0, y: H - 6, w: W, h: 6 }, p.accent1, undefined, "Bottom Bar"));
            out.push(mkRect({ x: 0, y: H - 6, w: W * 0.18, h: 6 }, p.accent2, undefined, "Bottom Bar 2"));
            break;
        }
        // ── 兼容：通用点阵（AI 生成主题）────────────────────────────────────────
        case "dotted-grid": {
            const cols = 6, rows = 4, gap = 14;
            const startX = W * 0.04;
            const startY = H - rows * gap - 12;
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    out.push(mkEllipse({ x: startX + c * gap, y: startY + r * gap, w: 3, h: 3 }, p.accent1, 0.35, `Dot ${r}-${c}`));
                }
            }
            break;
        }
    }
    // content 页静默化：滤掉大面积氛围元素（按几何面积判定，对所有装饰风格通用，
    // 不需要逐 case 维护）。feature 页（缺省）保留完整装饰。
    if (ctx.role === "content") {
        const maxArea = W * H * CONTENT_DECOR_MAX_AREA_RATIO;
        return out.filter((sh) => {
            const b = sh.bbox;
            if (!b)
                return true;
            return b.w * b.h <= maxArea;
        });
    }
    return out;
}
