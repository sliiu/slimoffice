// chat 模块公共类型（宿主注入的存储抽象等）。

/**
 * 宿主聊天存储抽象。
 *
 * 每个 PPT 下可以有 0..N 条独立对话（chatId 在 PPT 内唯一）。`list()` flatten
 * 出每个对话为一条记录，UI / chat-history 工具可以直接定位到 (presentationId, chatId)。
 *
 * @ppt/ai 不直读 localStorage —— playground 侧基于自己的存储格式实现这个接口。
 */
export interface HostChatStore {
  /** 列出所有 (presentationId, presentationName, chatId, chatName, lastTurnAt)。 */
  list: () => Array<{
    presentationId: string;
    presentationName: string;
    chatId: string;
    chatName: string;
    mtime: number;
  }>;
  /** 读某 PPT 下某 chat 的历史 dump（messages + log）。 */
  load: (presentationId: string, chatId: string) => { messages?: unknown; log?: unknown } | null;
  /** 删一条；可选实现。 */
  remove?: (presentationId: string, chatId: string) => void;
}
