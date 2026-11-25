/**
 * The compatibility names and the tail of the catalog that the main dispatch hands off.
 * Legacy names such as NORMDIST and BINOMDIST are the pre-2010 spellings; they map onto the
 * dotted names already implemented, with the argument differences Excel kept for each one.
 */
import type { FormulaPrimitive, FormulaValue, RangeOrigin } from "./index.js";
import { FormulaError } from "./index.js";
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
/** The rest of the catalog: text conversion, the odd bonds, the French depreciation, and the legacy names. */
export declare function compat(name: string, args: FormulaValue[], bound: Engine): FormulaValue;
export {};
