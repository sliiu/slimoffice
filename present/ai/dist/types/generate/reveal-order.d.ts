import type { RevealCue } from "../animations.js";
import type { OutlineItem } from "./schema.js";
/** 把一页大纲收成动画能用的出场提示。编码行（图表类型、表头、对比栏名）不单独成拍。 */
export declare function speechPlanFromOutlineItem(item: OutlineItem): RevealCue;
