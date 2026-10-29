import { type TextConfig } from "../config/types.js";
import { type SourceKind } from "./kinds.js";
/** chat：现有文本客户端的文件块。openai-responses：OpenAI 文件输入。degrade：先问再抽文字。 */
export type ByteRoute = "chat" | "openai-responses" | "degrade";
export declare function byteRouteFor(text: TextConfig, kind: SourceKind): ByteRoute;
export interface ResponsesAuth {
    apiKey: string;
    baseURL: string;
    model: string;
    headers: Record<string, string>;
}
export declare function responsesAuth(text: TextConfig): ResponsesAuth;
export declare function filesNeedingDegrade(text: TextConfig, files: Array<{
    name: string;
    mediaType: string;
}>): string[];
export declare function unknownSourceNames(files: Array<{
    name: string;
    mediaType: string;
}>): string[];
