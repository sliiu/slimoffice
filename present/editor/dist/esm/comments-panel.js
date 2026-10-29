import { findShape } from "./selection.js";
import { t } from "./i18n/index.js";
import { AddCommentCmd, DeleteCommentCmd, EditCommentCmd, genCommentId, ResolveCommentCmd, ResolveSlideCommentsCmd, } from "./comment-commands.js";
import { defaultCommentAnchor } from "./comment-pins.js";
import { commentMentionsAi } from "./comment-assign.js";
import { appendCommentText, bindCommentMentionField, commentParticipants } from "./comment-mention.js";
import { commentShapeLabel, shapeAtPoint } from "./comment-target.js";
import { openTextPromptDialog } from "./dialog.js";
import { authorHue, authorInitials, buildCommentThreadForest, collectThreadComments, countThreadReplies, } from "./comment-threads.js";
export function mountCommentsPanel(host, opts) {
    const doc = host.ownerDocument;
    const root = doc.createElement("div");
    root.className = "ppt-comments-panel";
    root.style.cssText =
        "position:absolute;inset:0;display:flex;flex-direction:column;min-height:0;min-width:0;overflow:hidden;background:var(--editor-panel,#191919);font:var(--font-sans, \"Geist\", ui-sans-serif, system-ui, sans-serif)";
    host.appendChild(root);
    const toolbar = doc.createElement("div");
    toolbar.className = "ppt-comments-toolbar";
    root.appendChild(toolbar);
    let statusTab = "open";
    const tablist = doc.createElement("div");
    tablist.className = "ppt-comments-tabs";
    tablist.setAttribute("role", "tablist");
    tablist.setAttribute("aria-label", t("comments.statusTabs"));
    toolbar.appendChild(tablist);
    const makeTab = (id, label) => {
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "ppt-comments-tab";
        btn.setAttribute("role", "tab");
        btn.id = `ppt-comments-tab-${id}`;
        btn.setAttribute("aria-controls", "ppt-comments-list");
        btn.setAttribute("aria-selected", id === statusTab ? "true" : "false");
        btn.append(doc.createTextNode(label));
        const count = doc.createElement("span");
        count.className = "ppt-comments-tab__count";
        count.textContent = "0";
        btn.append(count);
        btn.addEventListener("click", () => {
            if (statusTab === id)
                return;
            statusTab = id;
            openReplyRootId = null;
            render();
        });
        tablist.appendChild(btn);
        return { btn, count };
    };
    const openTab = makeTab("open", t("comments.statusOpen"));
    const resolvedTab = makeTab("resolved", t("comments.statusResolved"));
    tablist.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight")
            return;
        e.preventDefault();
        statusTab = statusTab === "open" ? "resolved" : "open";
        openReplyRootId = null;
        render();
        (statusTab === "open" ? openTab.btn : resolvedTab.btn).focus();
    });
    const actions = doc.createElement("div");
    actions.className = "ppt-comments-actions";
    toolbar.appendChild(actions);
    const addBtn = doc.createElement("button");
    addBtn.type = "button";
    addBtn.className = "ppt-comments-new";
    addBtn.textContent = t("comments.new");
    actions.appendChild(addBtn);
    let currentSlideOnly = false;
    try {
        currentSlideOnly = localStorage.getItem("pp.comments.currentSlideOnly") === "1";
    }
    catch {
        currentSlideOnly = false;
    }
    const currentSlideOnlyBtn = doc.createElement("button");
    currentSlideOnlyBtn.type = "button";
    currentSlideOnlyBtn.className = "ppt-comments-scope";
    currentSlideOnlyBtn.textContent = t("comments.currentSlideOnly");
    currentSlideOnlyBtn.setAttribute("aria-pressed", currentSlideOnly ? "true" : "false");
    actions.appendChild(currentSlideOnlyBtn);
    const resolveSlideBtn = doc.createElement("button");
    resolveSlideBtn.type = "button";
    resolveSlideBtn.className = "ppt-comments-bulk";
    resolveSlideBtn.textContent = t("comments.resolveSlide");
    resolveSlideBtn.hidden = true;
    actions.appendChild(resolveSlideBtn);
    const reopenSlideBtn = doc.createElement("button");
    reopenSlideBtn.type = "button";
    reopenSlideBtn.className = "ppt-comments-bulk";
    reopenSlideBtn.textContent = t("comments.reopenSlide");
    reopenSlideBtn.hidden = true;
    actions.appendChild(reopenSlideBtn);
    const list = doc.createElement("div");
    list.id = "ppt-comments-list";
    list.className = "ppt-scroll";
    list.setAttribute("role", "tabpanel");
    list.style.cssText = "flex:1 1 0;min-width:0;overflow:auto;padding:8px;display:flex;flex-direction:column;gap:10px";
    root.appendChild(list);
    const btnStyle = "background:var(--secondary);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:3px 8px;cursor:pointer;font:inherit;font-size:11px;color:var(--foreground);flex:0 0 auto;white-space:nowrap";
    const collapsedRoots = new Set();
    let openReplyRootId = null;
    /** 已提交的批注默认是正文。只有这一条处于修改中。 */
    let editingId = null;
    let editingDraft = "";
    let rendering = false;
    const assignNotices = new Map();
    const mentionNames = () => commentParticipants((opts.pres.comments ?? []).map((c) => c.author));
    const revealAssignTarget = (commentId) => {
        const all = opts.pres.comments ?? [];
        let node = all.find((c) => c.id === commentId);
        let root = node;
        const seen = new Set();
        while (node?.parentId && !seen.has(node.id)) {
            seen.add(node.id);
            const parent = all.find((c) => c.id === node?.parentId);
            if (!parent)
                break;
            root = parent;
            node = parent;
        }
        if (!root)
            return;
        collapsedRoots.delete(root.id);
        statusTab = root.resolved ? "resolved" : "open";
    };
    const showAssignNotice = (commentId, notice) => {
        assignNotices.set(commentId, notice);
        revealAssignTarget(commentId);
        render();
    };
    const assignUi = (commentId) => ({
        running(stop) {
            showAssignNotice(commentId, { kind: "running", stop });
        },
        busy() {
            showAssignNotice(commentId, { kind: "busy" });
        },
        failed() {
            showAssignNotice(commentId, { kind: "failed" });
        },
        clear() {
            assignNotices.delete(commentId);
            render();
        },
    });
    const renderAssignNotice = (notice) => {
        const line = doc.createElement("div");
        line.className = "ppt-comment-assign";
        line.style.cssText =
            "display:flex;align-items:center;gap:6px;margin-top:6px;min-width:0;font-size:11px;color:var(--muted-foreground)";
        const label = doc.createElement("span");
        label.style.cssText = "min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        label.textContent =
            notice.kind === "running"
                ? t("comments.assign.running")
                : notice.kind === "busy"
                    ? t("comments.assign.busy")
                    : t("comments.assign.failed");
        line.appendChild(label);
        if (notice.kind === "running") {
            const stop = doc.createElement("button");
            stop.type = "button";
            stop.textContent = t("comments.assign.stop");
            stop.style.cssText = btnStyle + ";margin-left:auto";
            stop.addEventListener("click", () => notice.stop());
            line.appendChild(stop);
        }
        return line;
    };
    const fieldStyle = "width:100%;box-sizing:border-box;background:var(--secondary);color:var(--foreground);border:1px solid var(--border);border-radius:var(--radius-sm,6px);padding:6px 8px;font:13px/1.35 var(--font-sans, ui-sans-serif, system-ui, sans-serif);resize:vertical;outline:none";
    const isThreadHighlighted = (thread) => {
        const selected = opts.getSelectedId?.();
        if (!selected)
            return false;
        if (thread.comment.id === selected)
            return true;
        const walk = (nodes) => {
            for (const node of nodes) {
                if (node.comment.id === selected)
                    return true;
                if (walk(node.replies))
                    return true;
            }
            return false;
        };
        return walk(thread.replies);
    };
    const applyCardHighlight = (card, highlighted) => {
        card.style.border = highlighted ? "1px solid var(--warning)" : "1px solid var(--border)";
        card.style.boxShadow = highlighted ? "0 0 0 2px color-mix(in srgb, var(--warning) 35%, transparent)" : "";
    };
    const cardContainsComment = (card, commentId) => {
        if (card.dataset.threadRootId === commentId)
            return true;
        return !!card.querySelector(`[data-comment-id="${commentId}"]`);
    };
    const syncSelectionHighlight = () => {
        const selected = opts.getSelectedId?.();
        for (const card of list.querySelectorAll("[data-thread-root-id]")) {
            applyCardHighlight(card, !!selected && cardContainsComment(card, selected));
        }
    };
    const formatWhen = (ms) => new Date(ms).toLocaleString(undefined, {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
    });
    const avatarEl = (author) => {
        const hue = authorHue(author);
        const el = doc.createElement("span");
        el.textContent = authorInitials(author);
        el.style.cssText = [
            "display:inline-flex",
            "align-items:center",
            "justify-content:center",
            "width:24px",
            "height:24px",
            "border-radius:50%",
            "font-size:10px",
            "font-weight:600",
            "flex-shrink:0",
            `background:hsl(${hue} 45% 32%)`,
            "color:#f8fafc",
        ].join(";");
        return el;
    };
    const commentTarget = (c) => {
        const slide = opts.pres.slides?.[c.slideIndex];
        let shape;
        if (c.shapeId && slide)
            shape = findShape(slide, c.shapeId);
        else if (!c.shapeId && slide && c.x != null && c.y != null)
            shape = shapeAtPoint(slide, c.x, c.y);
        if (c.shapeId && !shape) {
            const missing = doc.createElement("div");
            missing.className = "ppt-comment-target ppt-comment-target--missing";
            missing.textContent = t("comments.missingShape");
            return missing;
        }
        if (!shape)
            return null;
        const label = commentShapeLabel(shape);
        const btn = doc.createElement("button");
        btn.type = "button";
        btn.className = "ppt-comment-target";
        btn.title = t("comments.onShape", { name: label });
        const text = doc.createElement("span");
        text.className = "ppt-comment-target__text";
        text.textContent = label;
        btn.append(text);
        const shapeId = shape.id;
        btn.addEventListener("click", () => {
            opts.onSelect?.(c.id);
            opts.onFocusShape?.(c.slideIndex, shapeId);
        });
        return btn;
    };
    const renderCommentBody = (c, opts2) => {
        const row = doc.createElement("div");
        row.dataset.commentId = c.id;
        row.style.cssText = opts2.compact
            ? "padding:6px 0 6px 8px;border-left:2px solid var(--border);min-width:0"
            : "min-width:0";
        if (opts2.showActions !== false) {
            row.style.cursor = "pointer";
            row.addEventListener("click", (e) => {
                const target = e.target;
                if (target.closest("button"))
                    return;
                if (target.closest("textarea, input, select"))
                    return;
                opts.onSelect?.(c.id);
            });
        }
        const head = doc.createElement("div");
        head.style.cssText = "display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;min-width:0";
        head.appendChild(avatarEl(c.author));
        const metaCol = doc.createElement("div");
        metaCol.style.flex = "1";
        metaCol.style.minWidth = "0";
        const who = doc.createElement("div");
        who.textContent = c.author;
        who.title = c.author;
        who.style.cssText =
            "color:var(--foreground);font-weight:600;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0";
        metaCol.appendChild(who);
        const subLine = doc.createElement("div");
        subLine.style.cssText =
            "margin-top:2px;font-size:10px;color:var(--muted-foreground);overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
        const parts = [];
        if (opts2.compact)
            parts.push(c.resolved ? t("comments.statusResolved") : t("comments.statusOpen"));
        if (!opts2.compact)
            parts.push(t("comments.slideN", { n: c.slideIndex + 1 }));
        parts.push(formatWhen(c.createdAt));
        subLine.textContent = parts.join(" · ");
        metaCol.appendChild(subLine);
        head.appendChild(metaCol);
        row.appendChild(head);
        if (!opts2.compact) {
            const target = commentTarget(c);
            if (target)
                row.appendChild(target);
        }
        if (editingId === c.id) {
            const ta = doc.createElement("textarea");
            ta.value = editingDraft;
            ta.rows = 2;
            ta.dataset.commentEditing = c.id;
            ta.style.cssText = fieldStyle;
            ta.addEventListener("input", () => {
                editingDraft = ta.value;
            });
            ta.addEventListener("focus", () => opts.onSelect?.(c.id, true));
            ta.addEventListener("keydown", (e) => {
                if (e.key === "Escape") {
                    e.preventDefault();
                    editingId = null;
                    render();
                }
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault();
                    ta.blur();
                }
            });
            ta.addEventListener("blur", () => {
                if (rendering || editingId !== c.id)
                    return;
                const next = ta.value.trim();
                editingId = null;
                if (next && next !== c.text) {
                    opts.stack.execute(new EditCommentCmd(c.id, next, c.text));
                    if (commentMentionsAi(next))
                        opts.onAssignAi?.({ ...c, text: next }, assignUi(c.id));
                }
                render();
            });
            row.appendChild(ta);
            bindCommentMentionField(ta, { names: mentionNames });
        }
        else {
            const body = doc.createElement("p");
            body.className = "ppt-comment-text";
            appendCommentText(body, c.text, mentionNames());
            body.title = t("comments.editHint");
            body.addEventListener("dblclick", (e) => {
                e.stopPropagation();
                editingId = c.id;
                editingDraft = c.text;
                render();
            });
            row.appendChild(body);
        }
        const notice = assignNotices.get(c.id);
        if (notice)
            row.appendChild(renderAssignNotice(notice));
        if (opts2.showActions !== false) {
            const actions = doc.createElement("div");
            actions.style.cssText = "display:flex;flex-wrap:nowrap;gap:4px;margin-top:6px;align-items:center;min-width:0";
            if (!opts2.compact && c.slideIndex !== opts.getSlideIndex()) {
                const jumpBtn = doc.createElement("button");
                jumpBtn.textContent = t("comments.goTo");
                jumpBtn.style.cssText = btnStyle;
                jumpBtn.addEventListener("click", () => opts.onJumpToSlide(c.slideIndex));
                actions.appendChild(jumpBtn);
            }
            if (opts2.onReply) {
                const replyBtn = doc.createElement("button");
                replyBtn.textContent = t("comments.reply");
                replyBtn.style.cssText = btnStyle;
                replyBtn.addEventListener("click", opts2.onReply);
                actions.appendChild(replyBtn);
            }
            const resolveBtn = doc.createElement("button");
            resolveBtn.textContent = c.resolved ? t("comments.reopen") : t("comments.resolve");
            resolveBtn.style.cssText = btnStyle;
            resolveBtn.addEventListener("click", () => {
                opts.stack.execute(new ResolveCommentCmd(c.id, !c.resolved, !!c.resolved));
                render();
            });
            actions.appendChild(resolveBtn);
            const delBtn = doc.createElement("button");
            delBtn.textContent = "×";
            delBtn.title = t("comments.delete");
            delBtn.style.cssText = btnStyle + ";margin-left:auto";
            delBtn.addEventListener("click", () => {
                opts.stack.execute(new DeleteCommentCmd(c.id, { ...c }, opts.pres.comments));
                render();
            });
            actions.appendChild(delBtn);
            row.appendChild(actions);
        }
        return row;
    };
    const renderReplyComposer = (rootId, slideIndex) => {
        const box = doc.createElement("div");
        box.dataset.commentComposer = "1";
        box.style.cssText = "margin-top:8px;padding-top:8px;border-top:1px dashed var(--border)";
        const ta = doc.createElement("textarea");
        ta.placeholder = t("comments.writeReply");
        ta.rows = 2;
        ta.style.cssText = fieldStyle;
        box.appendChild(ta);
        bindCommentMentionField(ta, { names: mentionNames });
        ta.addEventListener("focus", () => opts.onSelect?.(rootId, true));
        const actions = doc.createElement("div");
        actions.style.cssText = "display:flex;gap:6px;margin-top:6px;justify-content:flex-end";
        const cancelBtn = doc.createElement("button");
        cancelBtn.textContent = t("comments.cancelReply");
        cancelBtn.style.cssText = btnStyle;
        cancelBtn.addEventListener("click", () => {
            openReplyRootId = null;
            render();
        });
        const sendBtn = doc.createElement("button");
        sendBtn.textContent = t("comments.sendReply");
        sendBtn.style.cssText =
            "background:var(--primary);color:var(--primary-foreground);border:none;border-radius:var(--radius-sm,6px);padding:4px 10px;cursor:pointer;font:inherit;font-size:11px;font-weight:500";
        sendBtn.addEventListener("click", () => {
            const text = ta.value.trim();
            if (!text)
                return;
            const reply = {
                id: genCommentId(),
                slideIndex,
                parentId: rootId,
                author: opts.getAuthor(),
                text,
                createdAt: Date.now(),
            };
            opts.stack.execute(new AddCommentCmd(reply));
            if (commentMentionsAi(text))
                opts.onAssignAi?.(reply, assignUi(reply.id));
            openReplyRootId = null;
            collapsedRoots.delete(rootId);
            render();
        });
        ta.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                sendBtn.click();
            }
            if (e.key === "Escape")
                cancelBtn.click();
        });
        actions.append(cancelBtn, sendBtn);
        box.appendChild(actions);
        return box;
    };
    const renderThread = (thread) => {
        const c = thread.comment;
        const replyCount = countThreadReplies(thread);
        const collapsed = collapsedRoots.has(c.id) && replyCount > 0;
        const highlighted = isThreadHighlighted(thread);
        const card = doc.createElement("article");
        card.dataset.threadRootId = c.id;
        card.style.cssText = [
            "border-radius:var(--radius-md,8px)",
            "padding:10px",
            "background:var(--secondary)",
            "min-width:0",
            "flex:0 0 auto",
            "overflow:hidden",
            "box-sizing:border-box",
            c.resolved ? "opacity:0.72" : "",
        ].join(";");
        applyCardHighlight(card, highlighted);
        card.addEventListener("pointerdown", (e) => {
            if (e.button !== 0)
                return;
            const target = e.target;
            if (target.closest("button"))
                return;
            if (target.closest("textarea, input, select"))
                return;
            if (target.closest("[data-comment-id]"))
                return;
            opts.onSelect?.(c.id, true);
        });
        const header = doc.createElement("div");
        header.style.cssText = "display:flex;align-items:center;gap:8px;margin-bottom:4px;min-width:0";
        if (replyCount > 0) {
            const toggle = doc.createElement("button");
            toggle.type = "button";
            toggle.textContent = collapsed
                ? t("comments.expandReplies", { n: replyCount })
                : t("comments.collapseReplies", { n: replyCount });
            toggle.style.cssText =
                "background:transparent;border:none;padding:0;cursor:pointer;font:inherit;font-size:11px;color:var(--primary);text-align:left;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap";
            toggle.addEventListener("click", () => {
                if (collapsedRoots.has(c.id))
                    collapsedRoots.delete(c.id);
                else
                    collapsedRoots.add(c.id);
                render();
            });
            header.appendChild(toggle);
        }
        if (replyCount > 0)
            card.appendChild(header);
        card.appendChild(renderCommentBody(c, {
            onReply: () => {
                openReplyRootId = c.id;
                collapsedRoots.delete(c.id);
                render();
            },
        }));
        if (!collapsed && thread.replies.length) {
            const repliesBox = doc.createElement("div");
            repliesBox.style.cssText = "margin-top:8px;display:flex;flex-direction:column;gap:8px;padding-left:10px";
            const walk = (nodes) => {
                for (const node of nodes) {
                    repliesBox.appendChild(renderCommentBody(node.comment, {
                        compact: true,
                        showActions: true,
                    }));
                    if (node.replies.length)
                        walk(node.replies);
                }
            };
            walk(thread.replies);
            card.appendChild(repliesBox);
        }
        if (openReplyRootId === c.id) {
            card.appendChild(renderReplyComposer(c.id, c.slideIndex));
        }
        return card;
    };
    const scrollToReplyComposer = (rootId) => {
        const card = list.querySelector(`[data-thread-root-id="${rootId}"]`);
        if (!card)
            return;
        const composer = card.querySelector("[data-comment-composer]");
        (composer ?? card).scrollIntoView({ block: "nearest", behavior: "smooth" });
        const view = host.ownerDocument.defaultView;
        const focusComposer = () => {
            composer?.querySelector("textarea")?.focus();
        };
        if (view && typeof view.requestAnimationFrame === "function")
            view.requestAnimationFrame(focusComposer);
        else
            focusComposer();
    };
    const render = () => {
        rendering = true;
        try {
            const slideIndex = opts.getSlideIndex();
            const all = (opts.pres.comments ?? []).slice();
            const openOnSlide = all.filter((c) => c.slideIndex === slideIndex && !c.resolved).length;
            const resolvedOnSlide = all.filter((c) => c.slideIndex === slideIndex && c.resolved).length;
            resolveSlideBtn.hidden = statusTab !== "open" || openOnSlide === 0;
            reopenSlideBtn.hidden = statusTab !== "resolved" || resolvedOnSlide === 0;
            openTab.btn.setAttribute("aria-selected", statusTab === "open" ? "true" : "false");
            resolvedTab.btn.setAttribute("aria-selected", statusTab === "resolved" ? "true" : "false");
            list.setAttribute("aria-labelledby", statusTab === "open" ? openTab.btn.id : resolvedTab.btn.id);
            currentSlideOnlyBtn.setAttribute("aria-pressed", currentSlideOnly ? "true" : "false");
            const scrollTop = list.scrollTop;
            list.replaceChildren();
            let comments = all;
            if (currentSlideOnly) {
                comments = comments.filter((c) => c.slideIndex === slideIndex);
            }
            const forest = buildCommentThreadForest(comments);
            const threads = forest.filter((node) => statusTab === "resolved" ? !!node.comment.resolved : !node.comment.resolved);
            openTab.count.textContent = String(forest.filter((node) => !node.comment.resolved).length);
            resolvedTab.count.textContent = String(forest.filter((node) => !!node.comment.resolved).length);
            if (!threads.length) {
                const empty = doc.createElement("p");
                empty.textContent = comments.length
                    ? t(statusTab === "open" ? "comments.emptyOpen" : "comments.emptyResolved")
                    : t("comments.empty");
                empty.style.cssText = "margin:12px;color:var(--muted-foreground);font-size:12px";
                list.appendChild(empty);
                return;
            }
            for (const thread of threads) {
                list.appendChild(renderThread(thread));
            }
            if (openReplyRootId) {
                scrollToReplyComposer(openReplyRootId);
            }
            else {
                list.scrollTop = scrollTop;
            }
            const editing = list.querySelector("textarea[data-comment-editing]");
            if (editing) {
                const focusEditing = () => {
                    editing.focus();
                    const n = editing.value.length;
                    editing.setSelectionRange(n, n);
                };
                const view = host.ownerDocument.defaultView;
                if (view?.requestAnimationFrame)
                    view.requestAnimationFrame(focusEditing);
                else
                    focusEditing();
            }
        }
        finally {
            rendering = false;
        }
    };
    const scrollToComment = (commentId) => {
        const all = opts.pres.comments ?? [];
        const hit = all.find((c) => c.id === commentId);
        if (hit) {
            let root = hit;
            let cur = hit.parentId;
            while (cur) {
                const parent = all.find((x) => x.id === cur);
                if (!parent)
                    break;
                root = parent;
                cur = parent.parentId;
            }
            statusTab = root.resolved ? "resolved" : "open";
            collapsedRoots.delete(root.id);
        }
        render();
        const row = list.querySelector(`[data-comment-id="${commentId}"]`);
        row?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    };
    addBtn.addEventListener("click", () => {
        if (opts.onNewComment) {
            opts.onNewComment();
            return;
        }
        void (async () => {
            const text = await openTextPromptDialog(host.ownerDocument, {
                title: t("comments.new"),
                label: t("comments.prompt"),
                placeholder: t("comments.writeReply"),
                multiline: true,
            });
            if (!text)
                return;
            const slideIndex = opts.getSlideIndex();
            const onSlide = (opts.pres.comments ?? []).filter((c) => c.slideIndex === slideIndex).length;
            const anchor = defaultCommentAnchor(opts.pres.size ?? { width: 1280, height: 720 }, onSlide);
            const created = {
                id: genCommentId(),
                slideIndex,
                author: opts.getAuthor(),
                text,
                createdAt: Date.now(),
                x: anchor.x,
                y: anchor.y,
            };
            opts.stack.execute(new AddCommentCmd(created));
            if (commentMentionsAi(text))
                opts.onAssignAi?.(created, assignUi(created.id));
            render();
        })();
    });
    currentSlideOnlyBtn.addEventListener("click", () => {
        currentSlideOnly = !currentSlideOnly;
        try {
            localStorage.setItem("pp.comments.currentSlideOnly", currentSlideOnly ? "1" : "0");
        }
        catch {
            // ignore
        }
        render();
    });
    resolveSlideBtn.addEventListener("click", () => {
        const slideIndex = opts.getSlideIndex();
        const open = (opts.pres.comments ?? []).filter((c) => c.slideIndex === slideIndex && !c.resolved).length;
        if (!open)
            return;
        opts.stack.execute(new ResolveSlideCommentsCmd(slideIndex, true));
        render();
    });
    reopenSlideBtn.addEventListener("click", () => {
        const slideIndex = opts.getSlideIndex();
        const resolved = (opts.pres.comments ?? []).filter((c) => c.slideIndex === slideIndex && c.resolved).length;
        if (!resolved)
            return;
        opts.stack.execute(new ResolveSlideCommentsCmd(slideIndex, false));
        render();
    });
    render();
    return {
        refresh: render,
        destroy: () => root.remove(),
        scrollToComment,
        syncSelectionHighlight,
        noteAssign(commentId) {
            const c = (opts.pres.comments ?? []).find((item) => item.id === commentId);
            if (!c || !commentMentionsAi(c.text))
                return;
            opts.onAssignAi?.(c, assignUi(c.id));
        },
    };
}
// Re-export for tests / consumers that need thread helpers from the panel module.
export { buildCommentThreadForest, collectThreadComments, countThreadReplies };
