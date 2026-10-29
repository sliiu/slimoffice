import type { Presentation } from "@sliiu/present-core";
import type { ThemeDef } from "../../themes.js";
/**
 * 在 enrich 插入 0 张图或 AI 熔断后调用。原地 mutate presentation。
 * @returns 升级了背景或补了装饰的页数。
 */
export declare function applyNoImageryAtmosphere(pres: Presentation, theme: ThemeDef | undefined, slideKinds: ReadonlyArray<string | undefined>): {
    upgraded: number;
};
