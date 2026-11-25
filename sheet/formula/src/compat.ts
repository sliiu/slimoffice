/**
 * The compatibility names and the tail of the catalog that the main dispatch hands off.
 * Legacy names such as NORMDIST and BINOMDIST are the pre-2010 spellings; they map onto the
 * dotted names already implemented, with the argument differences Excel kept for each one.
 */
import type { FormulaPrimitive, FormulaValue, RangeOrigin } from "./index.js";
import { FormulaError, E } from "./index.js";

interface ComplexValue {
  real: number;
  imag: number;
}

interface Engine {
  flatten(args: FormulaValue[]): FormulaPrimitive[];
  numbers(args: FormulaValue[]): number[];
  asNumber(value: FormulaValue): number | FormulaError;
  asText(value: FormulaValue): string;
  asBool(value: FormulaValue): boolean | FormulaError;
  withWidth(values: FormulaPrimitive[], width: number): FormulaPrimitive[];
  rangeWidth(table: FormulaPrimitive[]): number;
  rangeOrigin(value: FormulaValue | undefined): RangeOrigin | undefined;
  variance(args: FormulaValue[], population: boolean): FormulaValue;
  stdev(args: FormulaValue[], population: boolean): FormulaValue;
  distFn(name: string, args: FormulaValue[]): FormulaValue;
  distMore(name: string, args: FormulaValue[]): FormulaValue;
  distTail(name: string, args: FormulaValue[]): FormulaValue;
  distInverse(name: string, args: FormulaValue[]): FormulaValue;
  distSolve(name: string, args: FormulaValue[]): FormulaValue;
  normalDist(name: string, args: FormulaValue[]): FormulaValue;
  covariance(name: string, args: FormulaValue[]): FormulaValue;
  tests(name: string, args: FormulaValue[]): FormulaValue;
  coupon(name: string, settle: number, mature: number, frequency: number): FormulaValue;
  yearFrac(start: number, end: number, basis: number): FormulaValue;
  regression(name: string, ys: number[], xs: number[]): FormulaValue;
  normalInv(p: number): number;
  parseComplex(text: string): ComplexValue | undefined;
  formatComplex(value: ComplexValue): string;
}

let engine: Engine;

/** The main module hands over its helpers on the first call, after they all exist. */
function bind(value: Engine): void {
  engine = value;
}

function num(value: FormulaValue): number | FormulaError {
  return engine.asNumber(value);
}

/** The pre-2010 names. Each one differs from its dotted replacement in at most one argument. */
function legacy(name: string, args: FormulaValue[]): FormulaValue {
  if (name === "NORMDIST") return engine.normalDist("NORM.DIST", args);
  if (name === "NORMINV") return engine.normalDist("NORM.INV", args);
  if (name === "BINOMDIST") return engine.distFn("BINOM.DIST", args);
  if (name === "CRITBINOM") return engine.distInverse("BINOM.INV", args);
  if (name === "POISSON") return engine.distFn("POISSON.DIST", args);
  if (name === "EXPONDIST") return engine.distFn("EXPON.DIST", args);
  if (name === "WEIBULL") return engine.distMore("WEIBULL.DIST", args);
  if (name === "GAMMADIST") return engine.distMore("GAMMA.DIST", args);
  if (name === "GAMMAINV") return engine.distSolve("GAMMA.INV", args);
  if (name === "BETADIST") return engine.distMore("BETA.DIST", args);
  if (name === "BETAINV") return engine.distSolve("BETA.INV", [args[0] ?? 0, args[3] ?? 1, args[4] ?? 1]);
  if (name === "HYPGEOMDIST") return engine.distMore("HYPGEOM.DIST", [args[0] ?? 0, args[1] ?? 0, args[2] ?? 0, args[3] ?? 0, false]);
  if (name === "NEGBINOMDIST") return engine.distMore("NEGBINOM.DIST", [args[0] ?? 0, args[1] ?? 0, args[2] ?? 0, false]);
  if (name === "LOGNORMDIST") return engine.distFn("LOGNORM.DIST", args);
  if (name === "LOGINV") return engine.distInverse("LOGNORM.INV", args);
  if (name === "CHIDIST") return engine.distTail("CHISQ.DIST.RT", args);
  if (name === "CHIINV") return engine.distTail("CHISQ.INV.RT", args);
  if (name === "CHITEST") return engine.tests("CHISQ.TEST", args);
  if (name === "ZTEST") return engine.tests("Z.TEST", args);
  if (name === "FDIST") return engine.distTail("F.DIST.RT", args);
  if (name === "FINV") return engine.distTail("F.INV.RT", args);
  if (name === "TDIST") {
    const tails = num(args[2] ?? 1);
    if (tails instanceof FormulaError) return tails;
    return engine.distTail(tails === 2 ? "T.DIST.2T" : "T.DIST.RT", args.slice(0, 2));
  }
  if (name === "TINV") return engine.distTail("T.INV.2T", args);
  if (name === "COVAR") return engine.covariance("COVARIANCE.P", args);
  if (name === "CONFIDENCE") return engine.distFn("CONFIDENCE.NORM", args);
  if (name === "CEILING.PRECISE" || name === "ISO.CEILING") return roundTo(args, 1);
  if (name === "FLOOR.PRECISE") return roundTo(args, -1);
  if (name === "ERF.PRECISE") return engine.distFn("ERF", args.slice(0, 1));
  if (name === "ERFC.PRECISE") return engine.distFn("ERFC", args);
  return engine.distFn("GAMMALN", args);
}

/** CEILING.PRECISE and FLOOR.PRECISE always round away from and toward zero, ignoring the step's sign. */
function roundTo(args: FormulaValue[], direction: number): FormulaValue {
  const value = num(args[0] ?? 0);
  const step = num(args[1] ?? 1);
  if (value instanceof FormulaError) return value;
  if (step instanceof FormulaError) return step;
  const size = Math.abs(step) || 1;
  const units = value / size;
  return (direction > 0 ? Math.ceil(units) : Math.floor(units)) * size;
}

/** A variance that counts text as zero, sample or population. */
function textVariance(args: FormulaValue[], population: boolean): FormulaValue {
  const values = engine.flatten(args).map((item) => (typeof item === "number" ? item : typeof item === "boolean" ? Number(item) : 0));
  const divisor = values.length - (population ? 0 : 1);
  if (divisor <= 0) return E.DIV0();
  const mean = values.reduce((sum, item) => sum + item, 0) / values.length;
  return values.reduce((sum, item) => sum + (item - mean) ** 2, 0) / divisor;
}

/** F.TEST and T.TEST compare two samples. The legacy FTEST and TTEST spellings share them. */
function sampleTest(name: string, args: FormulaValue[]): FormulaValue {
  const left = engine.numbers(args.slice(0, 1));
  const right = engine.numbers(args.slice(1, 2));
  if (left.length < 2 || right.length < 2) return E.DIV0();
  const spread = (data: number[]): number => {
    const mean = data.reduce((sum, item) => sum + item, 0) / data.length;
    return data.reduce((sum, item) => sum + (item - mean) ** 2, 0) / (data.length - 1);
  };
  if (name === "F.TEST" || name === "FTEST") {
    const ratio = spread(left) / spread(right);
    const tail = engine.distFn("F.DIST", [ratio, left.length - 1, right.length - 1, true]);
    if (typeof tail !== "number") return tail;
    return 2 * Math.min(tail, 1 - tail);
  }
  const kind = num(args[2] ?? 1);
  const tails = num(args[3] ?? 2);
  if (kind instanceof FormulaError) return kind;
  if (tails instanceof FormulaError) return tails;
  const meanOf = (data: number[]): number => data.reduce((sum, item) => sum + item, 0) / data.length;
  const n1 = left.length;
  const n2 = right.length;
  const v1 = spread(left);
  const v2 = spread(right);
  let stat: number;
  let freedom: number;
  if (kind === 1) {
    const count = Math.min(n1, n2);
    let diff = 0;
    for (let i = 0; i < count; i += 1) diff += left[i]! - right[i]!;
    const mean = diff / count;
    let square = 0;
    for (let i = 0; i < count; i += 1) square += (left[i]! - right[i]! - mean) ** 2;
    stat = mean / Math.sqrt(square / (count - 1) / count);
    freedom = count - 1;
  } else {
    stat = (meanOf(left) - meanOf(right)) / Math.sqrt(v1 / n1 + v2 / n2);
    const se1 = v1 / n1;
    const se2 = v2 / n2;
    freedom = (se1 + se2) ** 2 / (se1 ** 2 / (n1 - 1) + se2 ** 2 / (n2 - 1));
  }
  const tail = engine.distFn("T.DIST", [Math.abs(stat), freedom, true]);
  if (typeof tail !== "number") return tail;
  return tails === 1 ? 1 - tail : 2 * (1 - tail);
}

/** The trigonometric functions of a complex number, written back in Excel's text form. */
function complexTrig(name: string, args: FormulaValue[]): FormulaValue {
  const value = engine.parseComplex(engine.asText(args[0] ?? "0"));
  if (!value) return E.NUM();
  const { real: x, imag: y } = value;
  const sinh = Math.sinh(y);
  const cosh = Math.cosh(y);
  const sin = Math.sin(x);
  const cos = Math.cos(x);
  const pair = (real: number, imag: number): FormulaValue => engine.formatComplex({ real, imag });
  if (name === "IMSIN") return pair(sin * cosh, cos * sinh);
  if (name === "IMCOS") return pair(cos * cosh, -sin * sinh);
  if (name === "IMSINH") return pair(Math.sinh(x) * Math.cos(y), Math.cosh(x) * Math.sin(y));
  if (name === "IMCOSH") return pair(Math.cosh(x) * Math.cos(y), Math.sinh(x) * Math.sin(y));
  const divide = (a: ComplexValue, b: ComplexValue): FormulaValue => {
    const denominator = b.real ** 2 + b.imag ** 2;
    if (denominator === 0) return E.NUM();
    return pair((a.real * b.real + a.imag * b.imag) / denominator, (a.imag * b.real - a.real * b.imag) / denominator);
  };
  if (name === "IMTAN") return divide({ real: sin * cosh, imag: cos * sinh }, { real: cos * cosh, imag: -sin * sinh });
  if (name === "IMCOT") return divide({ real: cos * cosh, imag: -sin * sinh }, { real: sin * cosh, imag: cos * sinh });
  if (name === "IMCSC") return divide({ real: 1, imag: 0 }, { real: sin * cosh, imag: cos * sinh });
  if (name === "IMSEC") return divide({ real: 1, imag: 0 }, { real: cos * cosh, imag: -sin * sinh });
  const sinhX = Math.sinh(x);
  const sinY = Math.sin(y);
  if (name === "IMCSCH") return divide({ real: 1, imag: 0 }, { real: sinhX * Math.cos(y), imag: Math.cosh(x) * sinY });
  return divide({ real: 1, imag: 0 }, { real: Math.cosh(x) * Math.cos(y), imag: sinhX * sinY });
}

const HALF_WIDTH = " 　!”#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\]^_`abcdefghijklmnopqrstuvwxyz{|}~";
const FULL_WIDTH = "　　！”＃＄％＆＇（）＊＋，－．／０１２３４５６７８９：；＜＝＞？＠ＡＢＣＤＥＦＧＨＩＪＫＬＭＮＯＰＱＲＳＴＵＶＷＸＹＺ［＼］＾＿｀ａｂｃｄｅｆｇｈｉｊｋｌｍｎｏｐｑｒｓｔｕｖｗｘｙｚ｛｜｝～～";

/** Half-width ASCII to its full-width form, the conversion JIS performs. */
function toFullWidth(text: string): string {
  return [...text].map((char) => {
    const index = HALF_WIDTH.indexOf(char);
    return index < 0 ? char : FULL_WIDTH[index] ?? char;
  }).join("");
}

/** Fixed rates into the euro and back out, from the table the euro conversion froze in 1999. */
const EURO_RATES: Record<string, number> = {
  ATS: 13.7603, BEF: 40.3399, DEM: 1.95583, ESP: 166.386, FIM: 5.94573, FRF: 6.55957,
  IEP: 0.787564, ITL: 1936.27, LUF: 40.3399, NLG: 2.20371, PTE: 200.482, EUR: 1,
};

function euroConvert(args: FormulaValue[]): FormulaValue {
  const amount = num(args[0] ?? 0);
  const from = engine.asText(args[1] ?? "").toUpperCase();
  const to = engine.asText(args[2] ?? "").toUpperCase();
  if (amount instanceof FormulaError) return amount;
  const fromRate = EURO_RATES[from];
  const toRate = EURO_RATES[to];
  if (fromRate === undefined || toRate === undefined) return E.VALUE();
  return amount / fromRate * toRate;
}

/** The French depreciation systems. AMORLINC is linear, AMORDEGRC applies a coefficient to the life. */
function amor(name: string, args: FormulaValue[]): FormulaValue {
  const cost = num(args[0] ?? 0);
  const purchased = num(args[1] ?? 0);
  const first = num(args[2] ?? 0);
  const salvage = num(args[3] ?? 0);
  const period = num(args[4] ?? 0);
  const rate = num(args[5] ?? 0);
  if (cost instanceof FormulaError) return cost;
  if (purchased instanceof FormulaError) return purchased;
  if (first instanceof FormulaError) return first;
  if (salvage instanceof FormulaError) return salvage;
  if (period instanceof FormulaError) return period;
  if (rate instanceof FormulaError) return rate;
  if (rate <= 0 || cost <= 0 || period < 0) return E.NUM();
  const life = 1 / rate;
  const coefficient = name === "AMORLINC" ? 1 : life < 3 ? 1 : life < 5 ? 1.5 : life <= 6 ? 2 : 2.5;
  const perYear = cost * rate * coefficient;
  const fraction = first === purchased ? 1 : Math.min(1, Math.max(0, (first - purchased) / 365));
  const firstYear = perYear * fraction;
  if (period === 0) return firstYear;
  const elapsed = firstYear + perYear * (period - 1);
  const remaining = cost - salvage - elapsed;
  if (remaining <= 0) return 0;
  return Math.min(perYear, remaining);
}

/** Reads the six date and rate arguments the odd-period bond functions share. */
function bondArgs(args: FormulaValue[]): number[] | FormulaError {
  const out: number[] = [];
  for (const arg of args.slice(0, 8)) {
    const value = num(arg ?? 0);
    if (value instanceof FormulaError) return value;
    out.push(value);
  }
  return out;
}

/**
 * Price and yield of a bond whose first or last coupon period is shorter or longer than the rest.
 * Cash flows are discounted at the yield per period, and the odd period is scaled by its day count.
 */
function oddBond(name: string, args: FormulaValue[]): FormulaValue {
  const values = bondArgs(args);
  if (values instanceof FormulaError) return values;
  // ODDF takes the issue and first-coupon dates; ODDL takes only the last-interest date, one argument fewer.
  const first = name.startsWith("ODDF");
  const settlement = values[0];
  const maturity = values[1];
  const odd = first ? values[3] : values[2];
  const anchor = first ? values[2] : values[1];
  const rate = first ? values[4] : values[3];
  const priceOrYield = first ? values[5] : values[4];
  const redemption = first ? values[6] : values[5];
  const frequency = first ? values[7] : values[6];
  if (odd === undefined || anchor === undefined || frequency === undefined) return E.NUM();
  if (![1, 2, 4].includes(frequency)) return E.NUM();
  const fraction = engine.yearFrac(Math.min(odd, anchor), Math.max(odd, anchor), 0);
  if (typeof fraction !== "number" || fraction <= 0) return E.NUM();
  const periods = engine.coupon("COUPNUM", settlement!, maturity!, frequency!);
  if (typeof periods !== "number") return periods;
  const coupon = redemption! * rate! / frequency!;
  const scale = fraction * frequency!;
  const price = (yieldRate: number): number => {
    const perYield = yieldRate / frequency!;
    let total = 0;
    for (let period = 1; period <= periods; period += 1) {
      const cash = coupon + (period === periods ? redemption! : 0);
      const exponent = first && period === 1 ? scale : period - 1 + scale;
      total += cash / (1 + perYield) ** exponent;
    }
    return total;
  };
  if (name.endsWith("PRICE")) return price(priceOrYield!);
  let low = 0;
  let high = 1;
  for (let step = 0; step < 60; step += 1) {
    const mid = (low + high) / 2;
    if (price(mid) > priceOrYield!) low = mid;
    else high = mid;
  }
  return (low + high) / 2;
}

/** Holt's linear exponential smoothing, the core of FORECAST.ETS. */
function holt(data: number[], horizon: number): { forecast: number; residuals: number[] } {
  const alpha = 0.3;
  const beta = 0.1;
  let level = data[0]!;
  let trend = data.length > 1 ? data[1]! - data[0]! : 0;
  const residuals: number[] = [];
  for (let i = 1; i < data.length; i += 1) {
    const previous = level;
    residuals.push(data[i]! - (level + trend));
    level = alpha * data[i]! + (1 - alpha) * (level + trend);
    trend = beta * (level - previous) + (1 - beta) * trend;
  }
  return { forecast: level + horizon * trend, residuals };
}

function forecastEts(name: string, args: FormulaValue[]): FormulaValue {
  const target = num(args[0] ?? 0);
  // numbers() keeps only the first cell of an array constant, so flatten before counting.
  const values = engine.numbers(engine.flatten(args.slice(1, 2)));
  const timeline = engine.numbers(engine.flatten(args.slice(2, 3)));
  if (target instanceof FormulaError) return target;
  const count = Math.min(values.length, timeline.length);
  if (count < 2) return E.VALUE();
  const order = [...Array(count).keys()].sort((a, b) => timeline[a]! - timeline[b]!);
  const data = order.map((index) => values[index]!);
  const times = order.map((index) => timeline[index]!);
  const step = (times[count - 1]! - times[0]!) / (count - 1);
  if (step <= 0) return E.NUM();
  const horizon = Math.max(0, Math.round((target - times[count - 1]!) / step));
  const { forecast, residuals } = holt(data, horizon);
  if (name === "FORECAST.ETS") return forecast;
  const mean = residuals.reduce((sum, item) => sum + item, 0) / residuals.length;
  const deviation = Math.sqrt(residuals.reduce((sum, item) => sum + (item - mean) ** 2, 0) / Math.max(1, residuals.length - 1));
  if (name === "FORECAST.ETS.CONFINT") {
    const level = num(args[3] ?? 0.95);
    if (level instanceof FormulaError) return level;
    return engine.normalInv((1 + level) / 2) * deviation;
  }
  if (name === "FORECAST.ETS.SEASONALITY") return 1;
  const statistic = num(args[3] ?? 1);
  if (statistic instanceof FormulaError) return statistic;
  const index = Math.floor(statistic);
  if (index === 2) return deviation;
  if (index === 3) return count;
  return 0.3;
}

/** One cell rendered the way ARRAYTOTEXT and VALUETOTEXT write it. */
function renderCell(value: FormulaPrimitive, strict: boolean): string {
  if (typeof value === "string") return strict ? `"${value.replace(/"/g, "\"\"")}"` : value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  return String(value);
}

/** The rest of the catalog: text conversion, the odd bonds, the French depreciation, and the legacy names. */
export function compat(name: string, args: FormulaValue[], bound: Engine): FormulaValue {
  bind(bound);
  if (name === "IMSIN" || name === "IMCOS" || name === "IMTAN" || name === "IMCOT" || name === "IMCSC" || name === "IMSEC" || name === "IMSINH" || name === "IMCOSH" || name === "IMCSCH" || name === "IMSECH") return complexTrig(name, args);
  if (name === "MUNIT") {
    const size = num(args[0] ?? 0);
    if (size instanceof FormulaError) return size;
    const n = Math.floor(size);
    if (n < 1) return E.VALUE();
    const out: FormulaPrimitive[] = [];
    for (let row = 0; row < n; row += 1) for (let col = 0; col < n; col += 1) out.push(row === col ? 1 : 0);
    return engine.withWidth(out, n);
  }
  if (name === "ARRAYTOTEXT" || name === "VALUETOTEXT") {
    const strict = engine.asBool(args[1] ?? false);
    if (strict instanceof FormulaError) return strict;
    const values = engine.flatten(args.slice(0, 1));
    if (name === "VALUETOTEXT") return engine.withWidth(values.map((item) => renderCell(item, strict)), engine.rangeWidth(values));
    const table = args[0];
    const width = Array.isArray(table) ? engine.rangeWidth(table) : 1;
    const rows: string[] = [];
    for (let start = 0; start < values.length; start += width) {
      rows.push(values.slice(start, start + width).map((item) => renderCell(item, strict)).join(strict ? "," : ", "));
    }
    return strict ? `{${rows.map((row) => (width > 1 ? row : row)).join(";")}}` : rows.join("; ");
  }
  if (name === "REGEXTEST" || name === "REGEXEXTRACT" || name === "REGEXREPLACE") {
    const text = engine.asText(args[0] ?? "");
    const pattern = engine.asText(args[1] ?? "");
    let expression: RegExp;
    try {
      expression = new RegExp(pattern, "u");
    } catch {
      return E.VALUE();
    }
    if (name === "REGEXTEST") return expression.test(text);
    if (name === "REGEXEXTRACT") {
      const found = expression.exec(text);
      return found ? found[1] ?? found[0] ?? "" : E.NA();
    }
    const replacement = engine.asText(args[2] ?? "");
    const all = new RegExp(expression.source, expression.flags.includes("g") ? expression.flags : `${expression.flags}g`);
    return text.replace(all, replacement);
  }
  if (name === "JIS") return toFullWidth(engine.asText(args[0] ?? ""));
  if (name === "PHONETIC") return engine.asText(args[0] ?? "");
  if (name === "INFO") {
    const key = engine.asText(args[0] ?? "").toLowerCase();
    if (key === "system" || key === "osversion") return "mac";
    if (key === "release") return "1";
    if (key === "numfile") return 1;
    return E.VALUE();
  }
  if (name === "AREAS") return args.length;
  if (name === "PERCENTOF") {
    const part = num(args[0] ?? 0);
    const whole = num(args[1] ?? 0);
    if (part instanceof FormulaError) return part;
    if (whole instanceof FormulaError) return whole;
    return whole === 0 ? E.DIV0() : part / whole;
  }
  if (name === "VARPA" || name === "STDEVPA") {
    const spread = textVariance(args, true);
    return name === "VARPA" || typeof spread !== "number" ? spread : Math.sqrt(spread);
  }
  if (name === "F.TEST" || name === "T.TEST" || name === "FTEST" || name === "TTEST") return sampleTest(name, args);
  if (name === "EUROCONVERT") return euroConvert(args);
  if (name === "AMORDEGRC" || name === "AMORLINC") return amor(name, args);
  if (name === "ODDFPRICE" || name === "ODDFYIELD" || name === "ODDLPRICE" || name === "ODDLYIELD") return oddBond(name, args);
  if (name.startsWith("FORECAST.ETS")) return forecastEts(name, args);
  if (name === "TRIMRANGE") {
    const table = args[0];
    if (!Array.isArray(table)) return table ?? E.VALUE();
    const width = engine.rangeWidth(table);
    const kept = table.filter((item) => item !== "" && item !== null);
    return engine.withWidth(kept.length ? kept : [""], width);
  }
  if (name === "IMAGE") return engine.asText(args[0] ?? "");
  return legacy(name, args);
}
