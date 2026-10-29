/**
 * Copy voice — the rules that keep generated slide text from reading like a model wrote it.
 *
 * The symptoms are consistent across models: every title an antithesis ("X 不是 Y" / "not X,
 * it's Y"), four-character couplets stacked page after page, launch-copy verbs (赋能 / 打造 /
 * unlock / empower), and copy that narrates the slide's own design ("the photo is the canvas").
 * One prompt block is shared by every stage that writes words — outline, organizer, canvas
 * author, chat — and `lintCopyVoice` gives callers a deterministic check on the result.
 */

/** Prompt lines; the same block for every writing stage. */
export const COPY_VOICE_LINES: readonly string[] = [
  "COPY VOICE — write like a person explaining the subject to a colleague, not like launch copy:",
  "- Titles say what the page shows, in plain words a reader would use. A title may be a claim, but it must be one the page proves with the facts on it.",
  "- No antithesis titles: never frame a title as \"X 不是 Y\" / \"不是…而是…\" / \"not X, it's Y\" / \"Not another …\". At most ONE negation-framed title in the whole deck, and only when the contrast is the actual point.",
  "- No stacked couplets or four-character parallelism (\"打开即还原，改完可回写\") on more than one page; no triads written for rhythm; no exclamation marks; no em-dash chains.",
  "- Banned launch-copy words: 赋能 / 打造 / 重新定义 / 一站式 / 全方位 / 极致 / 助力 / 引领 / 卓越 / 革命性 / 颠覆 / 无缝; seamless / unlock / empower / elevate / supercharge / revolutionize / game-changing / cutting-edge / next-level / effortless / robust / leverage / delve / journey / \"in today's … world\".",
  "- Never narrate the slide's own design: no copy about scrims, contrast, canvases, folios, compositions, layouts, or what the page \"demonstrates\". Copy is about the subject.",
  "- Each bullet is a fact the reader can check or act on: a number with its unit and what it counts, a mechanism, a concrete example. Cut adjectives that carry no fact.",
  "- Speaker notes are spoken language: full sentences, first person is fine, no bullet fragments.",
];

export const COPY_VOICE_BLOCK = COPY_VOICE_LINES.join("\n");

export interface CopyVoiceHit {
  /** Which rule fired. */
  rule: "antithesis" | "buzzword" | "meta" | "exclamation";
  /** The offending text (trimmed, ≤ 80 chars). */
  text: string;
  /** Matched fragment for buzzword / meta hits. */
  match?: string;
}

/** Titles only: a negation anywhere in a ≤ 24-char title is the "X 不是 Y" frame. */
const ANTITHESIS = [
  /不是|并非|绝非|而是/,
  /\b(is|are|was|were) not\b/i,
  /\b(isn|aren|wasn|weren)'?t\b/i,
  /\bnot (just )?(another|a|an|the)\b/i,
  /^not\b/i,
  /\bnot\s+[\w'-]+\s*[,;:—–-]/i,
];

const BUZZWORDS_ZH = ["赋能", "打造", "重新定义", "一站式", "全方位", "极致", "助力", "引领", "卓越", "革命性", "颠覆", "全面升级", "无缝"];
const BUZZWORDS_EN = [
  "seamless",
  "seamlessly",
  "unlock",
  "empower",
  "empowering",
  "elevate",
  "supercharge",
  "revolutionize",
  "revolutionise",
  "game-changing",
  "game changer",
  "cutting-edge",
  "next-level",
  "effortless",
  "effortlessly",
  "leverage",
  "delve",
  "in today's",
  "in today’s",
];

/** Copy about the slide's own construction — a developer's rulebook leaking into the deck. */
const META = [
  /scrim/i,
  /\bfolio\b/i,
  /\bcomposition\b/i,
  /\bWCAG\b/,
  /slide\.background/i,
  /\bfit:? ?cover\b/i,
  /\b(image|photo) shape\b/i,
  /对比度(达标|保证)/,
  /(定向|方向)\s*scrim/,
  /(压|盖)在(文)?字上/,
  /页码是.*决策/,
  /\b(type|copy) still reads\b/i,
  /\bphoto(graphy)? (is|as) the (canvas|paper)\b/i,
  /摄影即画布/,
];

function clip(s: string): string {
  const t = s.replace(/\s+/g, " ").trim();
  return t.length > 80 ? `${t.slice(0, 79)}…` : t;
}

/**
 * Deterministic check over a deck's visible copy. `titles` are checked for antithesis framing
 * (one is tolerated deck-wide); every string is checked for buzzwords, meta copy and exclamation
 * marks. Returns hits in input order; empty = clean.
 */
export function lintCopyVoice(input: { titles?: readonly string[]; body?: readonly string[] }): CopyVoiceHit[] {
  const hits: CopyVoiceHit[] = [];
  const titles = (input.titles ?? []).filter((t) => t && t.trim());
  const body = (input.body ?? []).filter((t) => t && t.trim());
  const antithetical = titles.filter((t) => ANTITHESIS.some((re) => re.test(t.trim())));
  if (antithetical.length > 1) {
    for (const t of antithetical) hits.push({ rule: "antithesis", text: clip(t) });
  }
  for (const t of [...titles, ...body]) {
    const lower = t.toLowerCase();
    const zh = BUZZWORDS_ZH.find((w) => t.includes(w));
    const en = BUZZWORDS_EN.find((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(lower));
    const word = zh ?? en;
    if (word) hits.push({ rule: "buzzword", text: clip(t), match: word });
    const meta = META.find((re) => re.test(t));
    if (meta) hits.push({ rule: "meta", text: clip(t), match: meta.exec(t)?.[0] ?? "" });
    if (/[!！]/.test(t)) hits.push({ rule: "exclamation", text: clip(t) });
  }
  return hits;
}

/**
 * 单句检查。跟整稿 lint 不同：一句「不是…而是…」在这里也算违规。
 * 改写时用它拒绝模型交回来的、仍然带套话的句子。
 */
export function singleCopyIssues(text: string): CopyVoiceHit[] {
  const t = text.trim();
  if (!t) return [];
  const hits: CopyVoiceHit[] = [];
  if (ANTITHESIS.some((re) => re.test(t))) hits.push({ rule: "antithesis", text: clip(t) });
  const lower = t.toLowerCase();
  const zh = BUZZWORDS_ZH.find((w) => t.includes(w));
  const en = BUZZWORDS_EN.find((w) => new RegExp(`(^|[^a-z])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z]|$)`, "i").test(lower));
  const word = zh ?? en;
  if (word) hits.push({ rule: "buzzword", text: clip(t), match: word });
  const meta = META.find((re) => re.test(t));
  if (meta) hits.push({ rule: "meta", text: clip(t), match: meta.exec(t)?.[0] ?? "" });
  if (/[!！]/.test(t)) hits.push({ rule: "exclamation", text: clip(t) });
  return hits;
}

/** One line per hit, for logs and repair prompts. */
export function formatCopyVoiceHits(hits: readonly CopyVoiceHit[]): string[] {
  return hits.map((h) => {
    switch (h.rule) {
      case "antithesis":
        return `antithesis title: "${h.text}" — more than one negation-framed title in the deck; say what the page shows instead`;
      case "buzzword":
        return `launch-copy word "${h.match}" in: "${h.text}"`;
      case "meta":
        return `copy narrates the slide's own design ("${h.match}"): "${h.text}"`;
      default:
        return `exclamation mark in: "${h.text}"`;
    }
  });
}
