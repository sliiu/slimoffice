// GENERATED — do not edit. Source of truth: 本目录下的 *.md 文件。
// Regenerate with: node scripts/sync-skills.mjs
// 内嵌为字符串常量以同时支持浏览器（Vite）与 Node（MCP server）加载。

export const RAW_PRESENT_AGENT_LOOP = "---\nid: present_agent_loop\nname: Present agent loop\ndescription: Open a pptx, edit it, screenshot the designed slide, and save. Use whenever you change layout, color, or text on an existing deck.\nstage: chat\n---\n\nWhen you change an existing deck:\n\n1. If a file path was given, call `open_pptx` with that path. In the editor the deck is already open; do not ask for a path.\n2. Call `getPresentationSummary`, then `listShapesOnSlide` for each slide you will change. Use the ids it returns.\n3. Edit with the mutation tools. Recheck contrast when the background or a large shape changes.\n4. Before you say the layout is finished, call `screenshot_slide` for every slide you changed. On the file server, `screenshot_sheet` shows up to 8 slides in one image. The picture is the designed slide, with entrance targets visible. It does not play clicks. Look for overlap, overflow, and low contrast. Fix and screenshot again.\n5. Call `save_pptx` when the file on disk should change. Say it is saved only after that tool returns `saved: true`. In the editor, the host saves; do not invent a path.\n";

export const BUILTIN_SKILL_RAWS: string[] = [RAW_PRESENT_AGENT_LOOP];
