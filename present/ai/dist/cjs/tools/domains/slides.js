"use strict";
// Slide 列表级工具：建页 / 复制 / 删除 / 重排 / 命名 / 讲稿 / 可见性 / 背景 / 尺寸 / 主题。
Object.defineProperty(exports, "__esModule", { value: true });
exports.slideTools = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const slide_commands_1 = require("../commands/slide-commands");
const themes_1 = require("../../themes");
const schema_1 = require("../../generate/schema");
const types_1 = require("../types");
const images_1 = require("../helpers/images");
exports.slideTools = [
    (0, types_1.defineTool)({
        name: "createSlide",
        description: "Create a new slide with a chosen layout (cover/section/bullets/two-column/quote/image-text/table/closing/content). Use insertAt to control position; defaults to the end.",
        inputSchema: zod_1.z.object({
            spec: schema_1.SlideSpecSchema.describe("Slide spec matching one of the supported layout kinds."),
            insertAt: zod_1.z
                .number()
                .int()
                .min(0)
                .optional()
                .describe("Insert position (0-based). Defaults to the end of the deck."),
            themeId: zod_1.z.enum(themes_1.THEME_IDS).optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { spec, insertAt, themeId }) => {
            const pres = rt.getPres();
            const at = insertAt ?? pres.slides.length;
            return rt.apply(new slide_commands_1.CreateSlideFromSpecCmd(at, spec, themeId));
        },
    }),
    (0, types_1.defineTool)({
        name: "duplicateSlide",
        description: "Duplicate a slide; the copy is inserted immediately after the original.",
        inputSchema: zod_1.z.object({ slideIdx: zod_1.z.number().int().min(0) }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx }) => rt.apply(new slide_commands_1.DuplicateSlideCmd(slideIdx)),
    }),
    (0, types_1.defineTool)({
        name: "deleteSlide",
        description: "Delete the slide at slideIdx (0-based).",
        inputSchema: zod_1.z.object({ slideIdx: zod_1.z.number().int().min(0) }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx }) => rt.apply(new slide_commands_1.DeleteSlideCmd(slideIdx)),
    }),
    (0, types_1.defineTool)({
        name: "moveSlide",
        description: "Reorder a slide: move from index `from` to index `to`.",
        inputSchema: zod_1.z.object({
            from: zod_1.z.number().int().min(0),
            to: zod_1.z.number().int().min(0),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { from, to }) => rt.apply(new slide_commands_1.MoveSlideCmd(from, to)),
    }),
    (0, types_1.defineTool)({
        name: "insertSlideFromCurrent",
        description: "Insert a slide from an inline SlideSpec at a given index.",
        inputSchema: zod_1.z.object({
            spec: schema_1.SlideSpecSchema,
            insertAt: zod_1.z.number().int().min(0),
            themeId: zod_1.z.enum(themes_1.THEME_IDS).optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { spec, insertAt, themeId }) => {
            const pres = rt.getPres();
            const theme = (themeId ?? pres.theme?.id);
            // 与 createSlide 同命令；保留两个 tool 名是为了 LLM 区分"新建一页"和
            // "插入到具体位置"两种意图。
            return rt.apply(new slide_commands_1.CreateSlideFromSpecCmd(insertAt, spec, theme));
        },
    }),
    (0, types_1.defineTool)({
        name: "insertBlankSlide",
        description: "Insert an empty white slide at the given index (no content).",
        inputSchema: zod_1.z.object({ insertAt: zod_1.z.number().int().min(0) }),
        tags: ["mutate", "slide"],
        execute: (rt, { insertAt }) => {
            const id = `slide_${Date.now().toString(36)}`;
            const slide = {
                id,
                name: "Slide",
                index: 0,
                background: { kind: "solid", color: "#ffffff" },
                layers: [{ id: "layer_main", name: "Main", visible: true, locked: false, shapes: [] }],
            };
            return rt.apply(new slide_commands_1.InsertSlideCmd(insertAt, slide));
        },
    }),
    (0, types_1.defineTool)({
        name: "renameSlide",
        description: "Set a slide's display name (shown in the thumbnail list).",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            name: zod_1.z.string().min(1).max(80),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, name }) => rt.apply(new slide_commands_1.SetSlideNameCmd(slideIdx, name)),
    }),
    (0, types_1.defineTool)({
        name: "setSlideNotes",
        description: "Set the speaker notes for a slide (replaces existing notes).",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            notes: zod_1.z.string().max(2000),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, notes }) => rt.apply(new slide_commands_1.SetSlideNotesCmd(slideIdx, notes)),
    }),
    // OOXML sld@show — 与 PowerPoint 的「隐藏幻灯片」语义一致。
    (0, types_1.defineTool)({
        name: "setSlideVisibility",
        description: "Show or hide a slide in slideshow playback. Hidden slides stay editable but are skipped when the deck plays — useful for backup slides, draft variants, or 'optional appendix' pages.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            show: zod_1.z.boolean(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, show }) => rt.apply(new commands_1.SetSlideShowCmd(slideIdx, show)),
    }),
    // 一统的 slide 背景设置：solid / linear / radial / image / none。
    //
    // 关键点：背景图像必须走 slide.background（kind: "image"），渲染层会把它铺满
    // 整张 slide 并放在所有 shape 之下。**绝对不要**为了"加背景图"而 insertImage
    // 一个全屏 shape，否则会遮住文本（参见 .cursor/rules/ppt-design-rules.mdc 第 2 节）。
    (0, types_1.defineTool)({
        name: "setSlideBackground",
        description: [
            "Set a slide's background. The background lives BELOW all shapes — this is the correct way to add a background image, gradient, or solid color.",
            'If you want a full-slide photo, choose kind="image" with a dataURL (e.g. obtained via stock_images_use { asBackground: true } or generateImage).',
            'If you want a colored gradient header look, pick kind="linear" (angle 0=L→R, 90=T→B) or kind="radial".',
            'Pass kind="none" to clear the background back to theme default.',
            "Ripple effect: after changing the background, re-check every text shape's color against the new background (body ≥4.5:1, title ≥3:1 contrast) and fix with setShapeTextStyle if needed. Image backgrounds MUST use alpha 0.4–0.6 or add a translucent dark overlay rect below the text.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            paint: zod_1.z.discriminatedUnion("kind", [
                zod_1.z.object({
                    kind: zod_1.z.literal("solid"),
                    color: zod_1.z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, "must be #rrggbb or #rrggbbaa"),
                    alpha: zod_1.z.number().min(0).max(1).optional(),
                }),
                zod_1.z.object({
                    kind: zod_1.z.literal("linear"),
                    angle: zod_1.z.number().min(0).max(360).describe("0=left→right, 90=top→bottom, 45=TL→BR."),
                    stops: zod_1.z
                        .array(zod_1.z.object({
                        offset: zod_1.z.number().min(0).max(1),
                        color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
                        alpha: zod_1.z.number().min(0).max(1).optional(),
                    }))
                        .min(2)
                        .max(6),
                }),
                zod_1.z.object({
                    kind: zod_1.z.literal("radial"),
                    stops: zod_1.z
                        .array(zod_1.z.object({
                        offset: zod_1.z.number().min(0).max(1),
                        color: zod_1.z.string().regex(/^#[0-9a-fA-F]{6,8}$/),
                        alpha: zod_1.z.number().min(0).max(1).optional(),
                    }))
                        .min(2)
                        .max(6),
                }),
                zod_1.z.object({
                    kind: zod_1.z.literal("image"),
                    src: zod_1.z
                        .string()
                        .describe("dataURL (data:image/...) or https URL. For chat-tool callers it MUST already be a dataURL — use stock_images_use { asBackground: true } if you only have a remote URL."),
                    fit: zod_1.z.enum(["fill", "contain", "cover", "tile"]).optional().describe("Default: cover (recommended for bg photos)."),
                    alpha: zod_1.z
                        .number()
                        .min(0)
                        .max(1)
                        .optional()
                        .describe("Image opacity, 0..1. Use 0.5 with a dark overlay shape to ensure text readability."),
                }),
                zod_1.z.object({
                    kind: zod_1.z.literal("none"),
                }),
            ]),
        }),
        tags: ["mutate", "slide"],
        execute: async (rt, { slideIdx, paint }) => {
            // image 默认 fit=cover：背景图必须铺满整页，否则会留白破坏 layout。
            let normalized = paint;
            if (paint.kind === "image") {
                // natural 尺寸随手探测：serializer 导出 cover/contain 时靠它换算
                // <a:srcRect>/<a:fillRect>（保持 PowerPoint 里比例不变形）。探测失败不阻断。
                const natural = await (0, images_1.probeImageSize)(paint.src).catch(() => undefined);
                normalized = {
                    ...paint,
                    fit: paint.fit ?? "cover",
                    ...(natural && natural.w > 0 && natural.h > 0 ? { natural } : {}),
                };
            }
            return rt.apply(new commands_1.SetSlideBackgroundCmd(slideIdx, normalized));
        },
    }),
    (0, types_1.defineTool)({
        name: "clearSlideBackground",
        description: 'Clear a slide\'s background (reverts to theme default). Equivalent to setSlideBackground with paint.kind="none".',
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx }) => rt.apply(new commands_1.SetSlideBackgroundCmd(slideIdx, undefined)),
    }),
    (0, types_1.defineTool)({
        name: "setSlideSize",
        description: "Set the slide size (width × height in px). Common: 1280×720 (16:9), 1024×768 (4:3).",
        inputSchema: zod_1.z.object({
            width: zod_1.z.number().int().min(320).max(4096),
            height: zod_1.z.number().int().min(240).max(4096),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { width, height }) => rt.apply(new commands_1.SetSlideSizeCmd({ width, height })),
    }),
    (0, types_1.defineTool)({
        name: "applyTheme",
        description: [
            `Apply a built-in theme by id (${themes_1.THEME_IDS.join(" | ")}). Rewrites slide backgrounds (solid/gradient), decoration shapes (dec_*), pres.theme metadata, and syncs default text colors.`,
            'By default PRESERVES slides whose background is a user-placed image (kind="image") — they keep their photo background and skip new decorations.',
            "Pass preserveImageBackgrounds=false ONLY when the user EXPLICITLY wants to wipe image-backed slides too.",
            "Ripple effect: after applying, spot-check a few slides for leftover hard-coded text colors from earlier edits that clash with the new theme.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            themeId: zod_1.z.enum(themes_1.THEME_IDS),
            preserveImageBackgrounds: zod_1.z
                .boolean()
                .optional()
                .describe("Default true: skip slides whose background.kind==='image'. Pass false to overwrite every slide."),
        }),
        tags: ["mutate", "theme"],
        execute: (rt, { themeId, preserveImageBackgrounds }) => rt.apply(new slide_commands_1.ApplyCustomThemeCmd((0, themes_1.getTheme)(themeId), {
            preserveImageBackgrounds: preserveImageBackgrounds ?? true,
        })),
    }),
    // 兜底辅助：适合"把第 3 页标题改成 X"这种不带 shapeId 的高频指令。
    (0, types_1.defineTool)({
        name: "setSlideTitle",
        description: "Convenience: find the first non-empty text shape on a slide (treated as the title) and replace its text.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            title: zod_1.z.string(),
        }),
        tags: ["mutate", "slide", "text"],
        execute: (rt, { slideIdx, title }) => {
            const pres = rt.getPres();
            const slide = pres.slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            let target;
            for (const layer of slide.layers) {
                for (const s of layer.shapes) {
                    if (s.kind === "text" && s.paragraphs.some((p) => p.runs.some((r) => r.text.length > 0))) {
                        target = s;
                        break;
                    }
                }
                if (target)
                    break;
            }
            if (!target)
                return (0, types_1.err)("No text shape found on this slide. Use createSlide or insertBlankSlide first.");
            return rt.apply(new slide_commands_1.ReplaceTextCmd(slideIdx, target.id, [title]));
        },
    }),
    (0, types_1.defineTool)({
        name: "applySlideLayout",
        description: "Apply a master layout to a slide AND reset placeholders to that layout's defaults (like PowerPoint Home → Layout). This replaces the main-layer placeholder shapes. Use list_masters_and_layouts first. Distinct from set_slide_layout, which only updates the layoutRef and leaves existing shapes.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            masterId: zod_1.z.string(),
            layoutId: zod_1.z.string(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, masterId, layoutId }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const master = pres.masters?.find((m) => m.id === masterId);
            if (!master)
                return (0, types_1.err)(`master "${masterId}" not found`);
            if (!master.layouts?.some((l) => l.id === layoutId)) {
                return (0, types_1.err)(`layout "${layoutId}" not found under master "${masterId}"`);
            }
            return rt.apply(new commands_1.ApplySlideLayoutCmd(slideIdx, { masterId, layoutId }));
        },
    }),
    (0, types_1.defineTool)({
        name: "resetSlideToLayout",
        description: "Reset a slide's placeholders to the CURRENT layout defaults and drop extra main-layer shapes. Destructive — only use when the user asks to reset / 重置版式.",
        inputSchema: zod_1.z.object({ slideIdx: zod_1.z.number().int().min(0) }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx }) => rt.apply(new commands_1.ResetSlideToLayoutCmd(slideIdx)),
    }),
    (0, types_1.defineTool)({
        name: "setSlideHeaderFooter",
        description: "Set this slide's header/footer placeholder visibility (p:hf): sldNum (slide number), hdr, ftr, dt (date). Pass null to clear the override and inherit from the master.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            sldNum: zod_1.z.boolean().optional(),
            hdr: zod_1.z.boolean().optional(),
            ftr: zod_1.z.boolean().optional(),
            dt: zod_1.z.boolean().optional(),
            clear: zod_1.z.boolean().optional().describe("If true, remove the slide-level hf override."),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, sldNum, hdr, ftr, dt, clear }) => {
            if (clear)
                return rt.apply(new commands_1.SetSlideHfCmd(slideIdx, undefined));
            return rt.apply(new commands_1.SetSlideHfCmd(slideIdx, { sldNum, hdr, ftr, dt }));
        },
    }),
    (0, types_1.defineTool)({
        name: "addDeckSection",
        description: "Add (or rename) a deck section starting at startIndex (0-based slide index). Sections group slides in the sorter.",
        inputSchema: zod_1.z.object({
            startIndex: zod_1.z.number().int().min(0),
            name: zod_1.z.string().min(1).max(80),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { startIndex, name }) => {
            const next = (0, commands_1.addSectionAt)(rt.getPres().sections, startIndex, name);
            return rt.apply(new commands_1.SetDeckSectionsCmd(next));
        },
    }),
    (0, types_1.defineTool)({
        name: "renameDeckSection",
        description: "Rename a deck section by id. Call getPresentationSummary first to see section ids.",
        inputSchema: zod_1.z.object({
            sectionId: zod_1.z.string(),
            name: zod_1.z.string().min(1).max(80),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { sectionId, name }) => {
            const next = (0, commands_1.renameSection)(rt.getPres().sections, sectionId, name);
            return rt.apply(new commands_1.SetDeckSectionsCmd(next));
        },
    }),
    (0, types_1.defineTool)({
        name: "removeDeckSection",
        description: "Remove a section heading by id. Slides stay in the deck and join the previous section.",
        inputSchema: zod_1.z.object({ sectionId: zod_1.z.string() }),
        tags: ["mutate", "slide"],
        execute: (rt, { sectionId }) => {
            const next = (0, commands_1.removeSection)(rt.getPres().sections, sectionId);
            return rt.apply(new commands_1.SetDeckSectionsCmd(next));
        },
    }),
    (0, types_1.defineTool)({
        name: "clearInkOnSlide",
        description: "Delete all ink / handwriting strokes (ids starting with sp_ink_) on a slide. Does not convert ink to shapes.",
        inputSchema: zod_1.z.object({ slideIdx: zod_1.z.number().int().min(0) }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx }) => rt.apply(new commands_1.ClearInkOnSlideCmd(slideIdx)),
    }),
    (0, types_1.defineTool)({
        name: "convertInkToShape",
        description: "Convert ink strokes to regular freeform path shapes (new ids). Pass the ink shape ids from listShapesOnSlide. Use when the user wants to edit ink as normal shapes.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeIds: zod_1.z.array(zod_1.z.string()).min(1),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, shapeIds }) => rt.apply(new commands_1.ConvertInkToShapeCmd(slideIdx, shapeIds)),
    }),
    (0, types_1.defineTool)({
        name: "convertInkToText",
        description: "Replace ink strokes with a text box containing recognizedText (OCR happens outside this tool — pass the text you already have). bbox optional; defaults to the union of the ink shapes.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            shapeIds: zod_1.z.array(zod_1.z.string()).min(1),
            recognizedText: zod_1.z.string().min(1),
            bbox: zod_1.z
                .object({ x: zod_1.z.number(), y: zod_1.z.number(), w: zod_1.z.number().min(1), h: zod_1.z.number().min(1) })
                .optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, shapeIds, recognizedText, bbox }) => {
            const slide = rt.getPres().slides[slideIdx];
            if (!slide)
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            let textBbox = bbox;
            if (!textBbox) {
                const idSet = new Set(shapeIds);
                let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
                for (const layer of slide.layers) {
                    for (const s of layer.shapes) {
                        if (!idSet.has(s.id))
                            continue;
                        minX = Math.min(minX, s.bbox.x);
                        minY = Math.min(minY, s.bbox.y);
                        maxX = Math.max(maxX, s.bbox.x + s.bbox.w);
                        maxY = Math.max(maxY, s.bbox.y + s.bbox.h);
                    }
                }
                if (!Number.isFinite(minX))
                    return (0, types_1.err)("None of the given shapeIds were found on this slide.");
                textBbox = { x: minX, y: minY, w: Math.max(1, maxX - minX), h: Math.max(1, maxY - minY) };
            }
            return rt.apply(new commands_1.ConvertInkToTextCmd(slideIdx, shapeIds, recognizedText, textBbox));
        },
    }),
    (0, types_1.defineTool)({
        name: "setProofingLanguage",
        description: "Set the deck proofing / spell-check language (en / zh / ja / ko / fr / de / es / pt). Affects export default run language, not existing hardcoded runs.",
        inputSchema: zod_1.z.object({
            langId: zod_1.z.enum(["en", "zh", "ja", "ko", "fr", "de", "es", "pt"]),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { langId }) => rt.apply(new commands_1.SetProofingLanguageCmd(langId)),
    }),
    (0, types_1.defineTool)({
        name: "createPhotoAlbum",
        description: "Insert a photo-album sequence of slides (1 / 2 / 4 pictures per slide). Each image src should be a data URL. Optional captions appear under pictures when showCaptions is true. Does not replace existing slides — inserts at insertAt (default: end).",
        inputSchema: zod_1.z.object({
            images: zod_1.z
                .array(zod_1.z.object({
                src: zod_1.z.string().min(8).describe("data: URL of the picture."),
                caption: zod_1.z.string().max(200).optional(),
                natural: zod_1.z.object({ w: zod_1.z.number().positive(), h: zod_1.z.number().positive() }).optional(),
            }))
                .min(1)
                .max(80),
            insertAt: zod_1.z.number().int().min(0).optional(),
            layout: zod_1.z.enum(["fitToSlide", "2pic", "4pic"]).optional().describe("Pictures per slide. Default fitToSlide (one per slide)."),
            bw: zod_1.z.boolean().optional().describe("Render pictures in grayscale."),
            showCaptions: zod_1.z.boolean().optional(),
            frame: zod_1.z.string().optional().describe("Optional frame style id from the editor photo-album UI."),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { images, insertAt, layout, bw, showCaptions, frame }) => {
            const pres = rt.getPres();
            const at = insertAt ?? pres.slides.length;
            const album = {};
            if (bw !== undefined)
                album.bw = bw;
            if (showCaptions !== undefined)
                album.showCaptions = showCaptions;
            if (layout)
                album.layout = layout;
            if (frame)
                album.frame = frame;
            return rt.apply(new commands_1.ApplyPhotoAlbumCmd(at, images.map((img) => ({
                src: img.src,
                ...(img.natural ? { natural: img.natural } : {}),
                ...(img.caption ? { caption: img.caption } : {}),
            })), album));
        },
    }),
    (0, types_1.defineTool)({
        name: "listViewGuides",
        description: "Read drawing guides / grid snap from ppt/viewProps.xml (pres.viewGuides). Returns slide/notes guide lines (orient vert|horz + pos in slide px), showGuides, snapToGrid, snapToObjects, gridSpacing. Call before setViewGuides.",
        inputSchema: zod_1.z.object({}),
        tags: ["read", "slide"],
        execute: (rt) => {
            const g = rt.getPres().viewGuides;
            return (0, types_1.ok)({
                viewGuides: g ?? { slide: [] },
                showGuides: g?.showGuides ?? false,
                snapToGrid: g?.snapToGrid ?? false,
                snapToObjects: g?.snapToObjects ?? false,
                gridSpacing: g?.gridSpacing ?? null,
                slideGuides: g?.slide ?? [],
                notesGuides: g?.notes ?? [],
            });
        },
    }),
    (0, types_1.defineTool)({
        name: "setViewGuides",
        description: [
            "Update drawing guides and snap flags (ECMA-376 viewPr). Merges with the current pres.viewGuides.",
            "Pass showGuides / snapToGrid / snapToObjects / gridSpacing to toggle View-tab options.",
            "Pass `slide` to REPLACE all slide guides, or `addGuide` / `removeGuideIndex` to edit one line (pos is slide pixels; orient vert = vertical line at x, horz = horizontal line at y).",
            "Ripple: this is a deck-wide view setting, not per-slide. Does not change shape layout by itself unless snap is on while the user drags.",
        ].join(" "),
        inputSchema: zod_1.z.object({
            showGuides: zod_1.z.boolean().optional(),
            snapToGrid: zod_1.z.boolean().optional(),
            snapToObjects: zod_1.z.boolean().optional(),
            gridSpacing: zod_1.z.object({ x: zod_1.z.number().positive(), y: zod_1.z.number().positive() }).optional(),
            slide: zod_1.z
                .array(zod_1.z.object({ orient: zod_1.z.enum(["vert", "horz"]), pos: zod_1.z.number() }))
                .optional()
                .describe("Replace the entire slide guide list."),
            addGuide: zod_1.z.object({ orient: zod_1.z.enum(["vert", "horz"]), pos: zod_1.z.number() }).optional(),
            removeGuideIndex: zod_1.z.number().int().min(0).optional().describe("Index into the current slide guide list."),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, args) => {
            const cur = rt.getPres().viewGuides;
            const slide = [...(args.slide ?? cur?.slide ?? [])];
            if (args.addGuide)
                slide.push(args.addGuide);
            if (args.removeGuideIndex !== undefined) {
                if (args.removeGuideIndex >= slide.length) {
                    return (0, types_1.err)(`removeGuideIndex ${args.removeGuideIndex} out of range (have ${slide.length})`);
                }
                slide.splice(args.removeGuideIndex, 1);
            }
            const next = {
                slide,
                notes: cur?.notes,
                showGuides: args.showGuides ?? cur?.showGuides,
                snapToGrid: args.snapToGrid ?? cur?.snapToGrid,
                snapToObjects: args.snapToObjects ?? cur?.snapToObjects,
                gridSpacing: args.gridSpacing ?? cur?.gridSpacing,
            };
            return rt.apply(new commands_1.SetViewGuidesCmd(next));
        },
    }),
    (0, types_1.defineTool)({
        name: "getShowProperties",
        description: "Read slideshow settings from ppt/presProps.xml (pres.showPr): loop, kiosk/browse/present, range, narration, timings, pen color. Distinct from per-slide hide (setSlideShow).",
        inputSchema: zod_1.z.object({}),
        tags: ["read", "slide"],
        execute: (rt) => (0, types_1.ok)({ showPr: rt.getPres().showPr ?? null }),
    }),
    (0, types_1.defineTool)({
        name: "setShowProperties",
        description: [
            "Update slideshow settings (ECMA-376 p:showPr). Merges with the current pres.showPr.",
            "kind: present = full screen, browse = windowed, kiosk = kiosk (no click-advance).",
            "slides: 'all' or { start, end } 1-based inclusive range. Distinct from hiding a single slide (setSlideShow).",
        ].join(" "),
        inputSchema: zod_1.z.object({
            loop: zod_1.z.boolean().optional(),
            kind: zod_1.z.enum(["present", "browse", "kiosk"]).optional(),
            showNarration: zod_1.z.boolean().optional(),
            showAnimation: zod_1.z.boolean().optional(),
            useTimings: zod_1.z.boolean().optional(),
            browseShowScrollbar: zod_1.z.boolean().optional(),
            showMediaControls: zod_1.z.boolean().optional(),
            penColor: zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
            slides: zod_1.z
                .union([
                zod_1.z.literal("all"),
                zod_1.z.object({ start: zod_1.z.number().int().min(1), end: zod_1.z.number().int().min(1) }),
            ])
                .optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, patch) => {
            const prev = rt.getPres().showPr ?? {};
            const next = { ...prev };
            for (const [k, v] of Object.entries(patch)) {
                if (v !== undefined)
                    next[k] = v;
            }
            return rt.apply(new commands_1.SetShowPropertiesCmd(next));
        },
    }),
];
