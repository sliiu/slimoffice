"use strict";
// 审阅批注（Review → Comments）。走 comment-commands，自动 undo。
Object.defineProperty(exports, "__esModule", { value: true });
exports.commentTools = void 0;
const zod_1 = require("zod");
const commands_1 = require("@sliiu/present-editor/commands");
const types_1 = require("../types");
exports.commentTools = [
    (0, types_1.defineTool)({
        name: "listComments",
        description: "List review comments on the deck (optionally filtered to one slide). Returns id / slideIndex / author / text / resolved / parentId / pin x,y. Call before edit / resolve / delete.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0).optional(),
        }),
        tags: ["read", "slide"],
        execute: (rt, { slideIdx }) => {
            const all = rt.getPres().comments ?? [];
            const comments = slideIdx === undefined ? all : all.filter((c) => c.slideIndex === slideIdx);
            return (0, types_1.ok)({ count: comments.length, comments });
        },
    }),
    (0, types_1.defineTool)({
        name: "addComment",
        description: "Add a review comment on a slide. Optionally pin it to stage coordinates (x,y) or thread it under parentId. Author defaults to 'AI'.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            text: zod_1.z.string().min(1),
            author: zod_1.z.string().max(80).optional(),
            x: zod_1.z.number().optional(),
            y: zod_1.z.number().optional(),
            parentId: zod_1.z.string().optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, text, author, x, y, parentId }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return (0, types_1.err)(`slideIdx ${slideIdx} out of range`);
            const comment = {
                id: (0, commands_1.genCommentId)(),
                slideIndex: slideIdx,
                author: author ?? "AI",
                text,
                createdAt: Date.now(),
                ...(x !== undefined ? { x } : {}),
                ...(y !== undefined ? { y } : {}),
                ...(parentId ? { parentId } : {}),
            };
            const res = rt.apply(new commands_1.AddCommentCmd(comment));
            if (!res.ok)
                return res;
            return (0, types_1.ok)({ commentId: comment.id, slideIdx });
        },
    }),
    (0, types_1.defineTool)({
        name: "editComment",
        description: "Replace the text of an existing comment. Call listComments first to get the id.",
        inputSchema: zod_1.z.object({
            commentId: zod_1.z.string(),
            text: zod_1.z.string().min(1),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId, text }) => {
            const prev = rt.getPres().comments?.find((c) => c.id === commentId);
            if (!prev)
                return (0, types_1.err)(`comment ${commentId} not found`);
            return rt.apply(new commands_1.EditCommentCmd(commentId, text, prev.text));
        },
    }),
    (0, types_1.defineTool)({
        name: "resolveComment",
        description: "Mark a comment resolved or reopen it. Pass resolved=false to reopen.",
        inputSchema: zod_1.z.object({
            commentId: zod_1.z.string(),
            resolved: zod_1.z.boolean(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId, resolved }) => {
            const prev = rt.getPres().comments?.find((c) => c.id === commentId);
            if (!prev)
                return (0, types_1.err)(`comment ${commentId} not found`);
            return rt.apply(new commands_1.ResolveCommentCmd(commentId, resolved, !!prev.resolved));
        },
    }),
    (0, types_1.defineTool)({
        name: "setCommentAnchor",
        description: "Move a comment pin to new stage coordinates (slide px).",
        inputSchema: zod_1.z.object({
            commentId: zod_1.z.string(),
            x: zod_1.z.number(),
            y: zod_1.z.number(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId, x, y }) => {
            const prev = rt.getPres().comments?.find((c) => c.id === commentId);
            if (!prev)
                return (0, types_1.err)(`comment ${commentId} not found`);
            return rt.apply(new commands_1.SetCommentAnchorCmd(commentId, { x, y }, { x: prev.x, y: prev.y }));
        },
    }),
    (0, types_1.defineTool)({
        name: "resolveSlideComments",
        description: "Resolve or reopen every comment on a slide in one call.",
        inputSchema: zod_1.z.object({
            slideIdx: zod_1.z.number().int().min(0),
            resolved: zod_1.z.boolean(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, resolved }) => rt.apply(new commands_1.ResolveSlideCommentsCmd(slideIdx, resolved)),
    }),
    (0, types_1.defineTool)({
        name: "deleteComment",
        description: "Delete a comment and its reply thread.",
        inputSchema: zod_1.z.object({ commentId: zod_1.z.string() }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId }) => {
            const all = rt.getPres().comments ?? [];
            const snapshot = all.find((c) => c.id === commentId);
            if (!snapshot)
                return (0, types_1.err)(`comment ${commentId} not found`);
            return rt.apply(new commands_1.DeleteCommentCmd(commentId, snapshot, all));
        },
    }),
];
