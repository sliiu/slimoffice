"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRESENT_AGENT_INSTRUCTIONS = void 0;
/** 外部 agent 和编辑器对话共用的用法说明。 */
exports.PRESENT_AGENT_INSTRUCTIONS = `Edit a .pptx with these tools, then look at the rendered page before you call the layout done.

1. On this file server, open_pptx with the .pptx path. In the editor the deck is already open.
2. getPresentationSummary, then listShapesOnSlide, before you change shapes.
3. Edit with the mutation tools. They share one undo stack.
4. screenshot_slide for each slide you changed. screenshot_sheet shows up to 8 slides in one image. The picture is the designed slide (entrance targets are visible). It does not play the click sequence. Judge overlap, overflow, and contrast from the picture, fix, and screenshot again.
5. save_pptx writes the open deck back to disk. Do not say the file is saved unless that tool returns saved:true. In the editor the host saves; this server's save_pptx is the disk write.`;
