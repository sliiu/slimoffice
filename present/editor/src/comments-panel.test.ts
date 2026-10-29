import assert from "node:assert/strict";
import { describe, it } from "node:test";
// @ts-expect-error jsdom ships without types in this repo; tests run via tsx.
import { JSDOM } from "jsdom";
import { CommandStack, identityTransform, type DeckComment, type Presentation, type TextShape } from "@ppt/core";
import { mountCommentsPanel, type CommentAssignUi } from "./comments-panel.js";

function installDom(): Document {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const g = globalThis as unknown as {
    HTMLElement: typeof HTMLElement;
    Node: typeof Node;
    Element: typeof Element;
    Event: typeof Event;
    document: Document;
  };
  g.HTMLElement = dom.window.HTMLElement;
  g.Node = dom.window.Node;
  g.Element = dom.window.Element;
  g.Event = dom.window.Event;
  g.document = dom.window.document;
  dom.window.HTMLElement.prototype.scrollIntoView = () => {};
  return dom.window.document;
}

function comment(partial: Pick<DeckComment, "id" | "text"> & Partial<DeckComment>): DeckComment {
  return {
    slideIndex: 0,
    author: "Ada",
    createdAt: 1,
    ...partial,
  };
}

function mount(
  comments: DeckComment[],
  slideIndex = 0,
  extra?: {
    slides?: Presentation["slides"];
    onFocusShape?: (slideIndex: number, shapeId: string) => void;
    onAssignAi?: (comment: DeckComment, ui: CommentAssignUi) => void;
  },
) {
  const doc = installDom();
  const host = doc.createElement("div");
  doc.body.appendChild(host);
  const pres = {
    comments,
    size: { width: 1280, height: 720 },
    slides: extra?.slides ?? [],
  } as unknown as Presentation;
  const panel = mountCommentsPanel(host, {
    pres,
    stack: new CommandStack(pres),
    getSlideIndex: () => slideIndex,
    getAuthor: () => "Ada",
    onJumpToSlide: () => {},
    onNewComment: () => {},
    onFocusShape: extra?.onFocusShape,
    onAssignAi: extra?.onAssignAi,
  });
  return { doc, pres, panel };
}

function roots(doc: Document): string[] {
  return [...doc.querySelectorAll("[data-thread-root-id]")].map(
    (el) => (el as HTMLElement).dataset.threadRootId ?? "",
  );
}

describe("comments panel status tabs", () => {
  it("offers Reply only on the root and still resolves a reply on its own", () => {
    const { doc, pres } = mount([
      comment({ id: "open", text: "open", createdAt: 1 }),
      comment({ id: "reply", text: "answer", createdAt: 2, parentId: "open" }),
    ]);
    const buttons = (id: string): string[] =>
      [...doc.querySelectorAll(`[data-comment-id="${id}"] button`)].map((b) => b.textContent ?? "");
    assert.ok(buttons("open").includes("Reply"));
    assert.equal(buttons("reply").includes("Reply"), false);
    assert.ok(buttons("reply").includes("Resolve"));
    [...doc.querySelectorAll<HTMLButtonElement>(`[data-comment-id="reply"] button`)]
      .find((b) => b.textContent === "Resolve")!
      .click();
    assert.equal(pres.comments?.find((c) => c.id === "reply")?.resolved, true);
    assert.equal(pres.comments?.find((c) => c.id === "open")?.resolved, undefined);
    assert.deepEqual(roots(doc), ["open"]);
  });

  it("lists open threads by default and keeps a resolved reply on the open card", () => {
    const { doc } = mount([
      comment({ id: "open", text: "open", createdAt: 1 }),
      comment({ id: "reply", text: "done reply", createdAt: 2, parentId: "open", resolved: true }),
      comment({ id: "done", text: "done", createdAt: 3, resolved: true }),
    ]);
    const tabs = [...doc.querySelectorAll<HTMLButtonElement>("[role=tab]")];
    assert.equal(tabs[0]?.getAttribute("aria-selected"), "true");
    assert.equal(tabs[0]?.querySelector(".ppt-comments-tab__count")?.textContent, "1");
    assert.equal(tabs[1]?.querySelector(".ppt-comments-tab__count")?.textContent, "1");
    assert.deepEqual(roots(doc), ["open"]);
    assert.equal(doc.querySelector<HTMLElement>("[data-thread-root-id]")?.style.flex, "0 0 auto");
    assert.ok(doc.querySelector('[data-comment-id="reply"]'));
    assert.equal(doc.querySelectorAll(".ppt-comments-bulk:not([hidden])").length, 1);
    assert.match(doc.querySelector(".ppt-comments-bulk:not([hidden])")?.textContent ?? "", /Resolve all|解决本页/);
  });

  it("moves a resolved root, including an open reply, onto the Resolved tab", () => {
    const { doc } = mount([
      comment({ id: "done", text: "done", createdAt: 1, resolved: true }),
      comment({ id: "still", text: "reply", createdAt: 2, parentId: "done" }),
    ]);
    const resolved = doc.querySelectorAll<HTMLButtonElement>("[role=tab]")[1]!;
    resolved.click();
    assert.equal(resolved.getAttribute("aria-selected"), "true");
    assert.deepEqual(roots(doc), ["done"]);
    assert.ok(doc.querySelector('[data-comment-id="still"]'));
    assert.match(doc.querySelector(".ppt-comments-bulk:not([hidden])")?.textContent ?? "", /Reopen all|重开本页/);
  });

  it("hides the slide bulk action when this slide has nothing in that status", () => {
    const { doc } = mount([
      comment({ id: "other", text: "other slide", createdAt: 1, slideIndex: 1 }),
    ]);
    assert.equal(doc.querySelectorAll(".ppt-comments-bulk:not([hidden])").length, 0);
  });

  it("follows a resolved comment onto the Resolved tab when scrolling to it", () => {
    const { doc, panel } = mount([
      comment({ id: "open", text: "open", createdAt: 1 }),
      comment({ id: "done", text: "done", createdAt: 2, resolved: true }),
    ]);
    panel.scrollToComment("done");
    const resolved = doc.querySelectorAll<HTMLButtonElement>("[role=tab]")[1]!;
    assert.equal(resolved.getAttribute("aria-selected"), "true");
    assert.deepEqual(roots(doc), ["done"]);
  });

  it("names the shape under the pin and leaves out an empty reply line", () => {
    const text: TextShape = {
      id: "title",
      kind: "text",
      name: "Title 1",
      bbox: { x: 40, y: 40, w: 400, h: 80 },
      zIndex: 1,
      visible: true,
      locked: false,
      opacity: 1,
      transform: identityTransform(),
      paragraphs: [{ align: "start", runs: [{ text: "Scoreboard" }] }],
    };
    let focused = "";
    const { doc } = mount(
      [comment({ id: "open", text: "here", createdAt: 1, x: 80, y: 60 })],
      0,
      {
        slides: [{ id: "s0", layers: [{ id: "main", name: "main", visible: true, shapes: [text] }] }] as Presentation["slides"],
        onFocusShape: (_slide, shapeId) => {
          focused = shapeId;
        },
      },
    );
    assert.equal(doc.querySelector(".ppt-comment-target__text")?.textContent, "Scoreboard");
    assert.doesNotMatch(doc.body.textContent ?? "", /0 replies|0 条回复/);
    (doc.querySelector(".ppt-comment-target") as HTMLButtonElement).click();
    assert.equal(focused, "title");
  });

  it("shows submitted text and edits it only after a double-click", () => {
    const { doc, pres } = mount([comment({ id: "open", text: "here", createdAt: 1 })]);
    const card = doc.querySelector("[data-thread-root-id='open']")!;
    assert.equal(card.querySelector("textarea"), null);
    assert.equal(card.querySelector(".ppt-comment-text")?.textContent, "here");

    card.querySelector(".ppt-comment-text")!.dispatchEvent(new Event("dblclick", { bubbles: true }));
    const ta = doc.querySelector("[data-thread-root-id='open'] textarea");
    assert.ok(ta);
    assert.equal((ta as HTMLTextAreaElement).value, "here");
    (ta as HTMLTextAreaElement).value = "there";
    ta!.dispatchEvent(new Event("input"));
    ta!.dispatchEvent(new Event("blur"));

    assert.equal(pres.comments?.find((c) => c.id === "open")?.text, "there");
    assert.equal(doc.querySelector("[data-thread-root-id='open'] textarea"), null);
    assert.equal(doc.querySelector(".ppt-comment-text")?.textContent, "there");
  });

  it("assigns a comment to AI only after a submitted @ai", () => {
    const assigned: string[] = [];
    const { doc } = mount([comment({ id: "open", text: "here", createdAt: 1 })], 0, {
      onAssignAi: (c) => assigned.push(c.id + ":" + c.text),
    });
    const replyBtn = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Reply")!;
    replyBtn.click();
    const composer = doc.querySelector<HTMLTextAreaElement>("[data-comment-composer] textarea")!;
    composer.value = "plain reply";
    [...doc.querySelectorAll("button")].find((b) => b.textContent === "Send")!.click();
    assert.deepEqual(assigned, []);

    const replyAgain = [...doc.querySelectorAll("button")].find((b) => b.textContent === "Reply")!;
    replyAgain.click();
    const composer2 = doc.querySelector<HTMLTextAreaElement>("[data-comment-composer] textarea")!;
    composer2.value = "@ai make the title bigger";
    composer2.dispatchEvent(new Event("input"));
    assert.equal(composer2.parentElement?.querySelector(".ppt-comment-mention")?.textContent, "@ai");
    [...doc.querySelectorAll("button")].find((b) => b.textContent === "Send")!.click();
    assert.equal(assigned.length, 1);
    assert.match(assigned[0] ?? "", /@ai make the title bigger/);
    assert.equal(doc.querySelector(".ppt-comment-text .ppt-comment-mention")?.textContent, "@ai");
  });

  it("keeps assign status on the comment card", () => {
    let ui: CommentAssignUi | undefined;
    let stopped = false;
    const { doc, panel } = mount([comment({ id: "open", text: "here", createdAt: 1 })], 0, {
      onAssignAi: (_c, next) => {
        ui = next;
      },
    });
    [...doc.querySelectorAll("button")].find((b) => b.textContent === "Reply")!.click();
    const composer = doc.querySelector<HTMLTextAreaElement>("[data-comment-composer] textarea")!;
    composer.value = "@ai make the title bigger";
    [...doc.querySelectorAll("button")].find((b) => b.textContent === "Send")!.click();
    ui!.running(() => {
      stopped = true;
    });
    const line = doc.querySelector(".ppt-comment-assign");
    assert.equal(line?.textContent, "WorkingStop");
    [...line!.querySelectorAll("button")].find((b) => b.textContent === "Stop")!.click();
    assert.equal(stopped, true);

    ui!.failed();
    panel.refresh();
    assert.equal(doc.querySelector(".ppt-comment-assign")?.textContent, "Couldn't finish this comment.");

    ui!.clear();
    assert.equal(doc.querySelector(".ppt-comment-assign"), null);

    ui!.busy();
    assert.equal(
      doc.querySelector(".ppt-comment-assign")?.textContent,
      "The assistant is still working. This comment was not sent.",
    );
    assert.equal(doc.querySelector(".ppt-comment-assign button"), null);
  });
});
