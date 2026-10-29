/** 从用户 guidance 提取视觉风格提示，供 theme / motion 生成使用。 */
export declare function guidanceStyleHint(g: {
    extraNotes?: string;
    scenario?: string;
    goals?: string;
    topic?: string;
}): string | undefined;
