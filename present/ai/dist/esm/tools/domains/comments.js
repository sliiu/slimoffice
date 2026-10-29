// 审阅批注（Review → Comments）。走 comment-commands，自动 undo。
import { z } from "zod";
import { AddCommentCmd, DeleteCommentCmd, EditCommentCmd, ResolveCommentCmd, ResolveSlideCommentsCmd, SetCommentAnchorCmd, genCommentId, } from "@sliiu/present-editor/commands";
import { defineTool, ok, err } from "../types.js";
export const commentTools = [
    defineTool({
        name: "listComments",
        description: "List review comments on the deck (optionally filtered to one slide). Returns id / slideIndex / author / text / resolved / parentId / pin x,y. Call before edit / resolve / delete.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0).optional(),
        }),
        tags: ["read", "slide"],
        execute: (rt, { slideIdx }) => {
            const all = rt.getPres().comments ?? [];
            const comments = slideIdx === undefined ? all : all.filter((c) => c.slideIndex === slideIdx);
            return ok({ count: comments.length, comments });
        },
    }),
    defineTool({
        name: "addComment",
        description: "Add a review comment on a slide. Optionally pin it to stage coordinates (x,y) or thread it under parentId. Author defaults to 'AI'.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            text: z.string().min(1),
            author: z.string().max(80).optional(),
            x: z.number().optional(),
            y: z.number().optional(),
            parentId: z.string().optional(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, text, author, x, y, parentId }) => {
            const pres = rt.getPres();
            if (!pres.slides[slideIdx])
                return err(`slideIdx ${slideIdx} out of range`);
            const comment = {
                id: genCommentId(),
                slideIndex: slideIdx,
                author: author ?? "AI",
                text,
                createdAt: Date.now(),
                ...(x !== undefined ? { x } : {}),
                ...(y !== undefined ? { y } : {}),
                ...(parentId ? { parentId } : {}),
            };
            const res = rt.apply(new AddCommentCmd(comment));
            if (!res.ok)
                return res;
            return ok({ commentId: comment.id, slideIdx });
        },
    }),
    defineTool({
        name: "editComment",
        description: "Replace the text of an existing comment. Call listComments first to get the id.",
        inputSchema: z.object({
            commentId: z.string(),
            text: z.string().min(1),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId, text }) => {
            const prev = rt.getPres().comments?.find((c) => c.id === commentId);
            if (!prev)
                return err(`comment ${commentId} not found`);
            return rt.apply(new EditCommentCmd(commentId, text, prev.text));
        },
    }),
    defineTool({
        name: "resolveComment",
        description: "Mark a comment resolved or reopen it. Pass resolved=false to reopen.",
        inputSchema: z.object({
            commentId: z.string(),
            resolved: z.boolean(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId, resolved }) => {
            const prev = rt.getPres().comments?.find((c) => c.id === commentId);
            if (!prev)
                return err(`comment ${commentId} not found`);
            return rt.apply(new ResolveCommentCmd(commentId, resolved, !!prev.resolved));
        },
    }),
    defineTool({
        name: "setCommentAnchor",
        description: "Move a comment pin to new stage coordinates (slide px).",
        inputSchema: z.object({
            commentId: z.string(),
            x: z.number(),
            y: z.number(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId, x, y }) => {
            const prev = rt.getPres().comments?.find((c) => c.id === commentId);
            if (!prev)
                return err(`comment ${commentId} not found`);
            return rt.apply(new SetCommentAnchorCmd(commentId, { x, y }, { x: prev.x, y: prev.y }));
        },
    }),
    defineTool({
        name: "resolveSlideComments",
        description: "Resolve or reopen every comment on a slide in one call.",
        inputSchema: z.object({
            slideIdx: z.number().int().min(0),
            resolved: z.boolean(),
        }),
        tags: ["mutate", "slide"],
        execute: (rt, { slideIdx, resolved }) => rt.apply(new ResolveSlideCommentsCmd(slideIdx, resolved)),
    }),
    defineTool({
        name: "deleteComment",
        description: "Delete a comment and its reply thread.",
        inputSchema: z.object({ commentId: z.string() }),
        tags: ["mutate", "slide"],
        execute: (rt, { commentId }) => {
            const all = rt.getPres().comments ?? [];
            const snapshot = all.find((c) => c.id === commentId);
            if (!snapshot)
                return err(`comment ${commentId} not found`);
            return rt.apply(new DeleteCommentCmd(commentId, snapshot, all));
        },
    }),
];
