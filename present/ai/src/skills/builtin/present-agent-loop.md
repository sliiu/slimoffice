---
id: present_agent_loop
name: Present agent loop
description: Open a pptx, edit it, screenshot the designed slide, and save. Use whenever you change layout, color, or text on an existing deck.
stage: chat
---

When you change an existing deck:

1. If a file path was given, call `open_pptx` with that path. In the editor the deck is already open; do not ask for a path.
2. Call `getPresentationSummary`, then `listShapesOnSlide` for each slide you will change. Use the ids it returns.
3. Edit with the mutation tools. Recheck contrast when the background or a large shape changes.
4. Before you say the layout is finished, call `screenshot_slide` for every slide you changed. On the file server, `screenshot_sheet` shows up to 8 slides in one image. The picture is the designed slide, with entrance targets visible. It does not play clicks. Look for overlap, overflow, and low contrast. Fix and screenshot again.
5. Call `save_pptx` when the file on disk should change. Say it is saved only after that tool returns `saved: true`. In the editor, the host saves; do not invent a path.
