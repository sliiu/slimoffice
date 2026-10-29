export interface CommentTextPart {
    kind: "text" | "mention";
    text: string;
    /** ai 交给助手；person 只是点名。 */
    who?: "ai" | "person";
}
export interface CommentMentionOption {
    kind: "ai" | "person";
    /** 插入到正文里的名字，不含 @。 */
    token: string;
}
/** 本文档里写过批注的人。同名只留第一次出现的写法，助手作者 AI 不算人。 */
export declare function commentParticipants(authors: Iterable<string>): string[];
/** `@` 后面正在输入的那段。邮箱里的 @ 不算。 */
export declare function commentMentionQuery(value: string, caret: number): {
    start: number;
    query: string;
} | null;
export declare function commentMentionOptions(query: string, authors: Iterable<string>): CommentMentionOption[];
/** 把正文拆成普通文字和提及。人名按本文档的参与者来认，长名字优先。 */
export declare function splitCommentMentions(text: string, authors?: Iterable<string>): CommentTextPart[];
export declare function commentMentionsAi(text: string): boolean;
export declare function appendCommentText(parent: HTMLElement, text: string, authors?: Iterable<string>): void;
/** 输入框背后铺一层同样的文字。输入 `@` 时在光标旁列出 AI 和本文档的批注参与者。 */
export declare function bindCommentMentionField(textarea: HTMLTextAreaElement, opts?: {
    names?: () => string[];
}): void;
