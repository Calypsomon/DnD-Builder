/**
 * Small, safe formula evaluator (no eval).
 * Supports numbers, + - * /, parentheses, floor/ceil/min/max/abs,
 * variables (str..cha = modifiers, strScore.. = scores, pb, level, classLevel)
 * and class table lookups "table:<Column Name>" (column names may contain spaces).
 */
export interface FormulaContext {
  vars: Record<string, number>;
  /** Returns the raw cell text of the class table at the current class level */
  table?: (column: string) => string | undefined;
}

type Token = { t: "num"; v: number } | { t: "id"; v: string } | { t: "op"; v: string } | { t: "table"; v: string };

function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (src.startsWith("table:", i)) {
      i += 6;
      let name = "";
      while (i < src.length && !/[+\-*/(),]/.test(src[i])) name += src[i++];
      out.push({ t: "table", v: name.trim() });
      continue;
    }
    if (/[0-9.]/.test(c)) {
      let n = "";
      while (i < src.length && /[0-9.]/.test(src[i])) n += src[i++];
      out.push({ t: "num", v: parseFloat(n) });
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let n = "";
      while (i < src.length && /[a-zA-Z_0-9]/.test(src[i])) n += src[i++];
      out.push({ t: "id", v: n });
      continue;
    }
    if (/[+\-*/(),]/.test(c)) {
      out.push({ t: "op", v: c });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${c}' in formula "${src}"`);
  }
  return out;
}

/** Numeric value of a table cell: "+2" → 2, "1d4" → 4 (die size is not a number; returns count*size), "—" → 0 */
export function cellNumber(text: string | undefined): number {
  if (!text) return 0;
  const m = text.replace(/,/g, "").match(/[+-]?\d+(\.\d+)?/);
  return m ? parseFloat(m[0]) : 0;
}

const FUNCS: Record<string, (...a: number[]) => number> = {
  floor: Math.floor,
  ceil: Math.ceil,
  min: Math.min,
  max: Math.max,
  abs: Math.abs,
  round: Math.round,
};

export function evalFormula(formula: string | number, ctx: FormulaContext): number {
  if (typeof formula === "number") return formula;
  const tokens = tokenize(formula);
  let pos = 0;
  const peek = () => tokens[pos];
  const next = () => tokens[pos++];
  const expectOp = (v: string) => {
    const t = next();
    if (!t || t.t !== "op" || t.v !== v) throw new Error(`Expected '${v}' in formula "${formula}"`);
  };

  function expr(): number {
    let v = term();
    while (peek()?.t === "op" && (peek()!.v === "+" || peek()!.v === "-")) {
      const op = next().v;
      const r = term();
      v = op === "+" ? v + r : v - r;
    }
    return v;
  }
  function term(): number {
    let v = factor();
    while (peek()?.t === "op" && (peek()!.v === "*" || peek()!.v === "/")) {
      const op = next().v;
      const r = factor();
      v = op === "*" ? v * r : v / r;
    }
    return v;
  }
  function factor(): number {
    const t = next();
    if (!t) throw new Error(`Unexpected end of formula "${formula}"`);
    if (t.t === "num") return t.v;
    if (t.t === "table") return cellNumber(ctx.table?.(t.v));
    if (t.t === "op" && t.v === "-") return -factor();
    if (t.t === "op" && t.v === "+") return factor();
    if (t.t === "op" && t.v === "(") {
      const v = expr();
      expectOp(")");
      return v;
    }
    if (t.t === "id") {
      if (FUNCS[t.v] && peek()?.t === "op" && peek()!.v === "(") {
        next();
        const args: number[] = [];
        if (!(peek()?.t === "op" && peek()!.v === ")")) {
          args.push(expr());
          while (peek()?.t === "op" && peek()!.v === ",") {
            next();
            args.push(expr());
          }
        }
        expectOp(")");
        return FUNCS[t.v](...args);
      }
      if (t.v in ctx.vars) return ctx.vars[t.v];
      throw new Error(`Unknown variable '${t.v}' in formula "${formula}"`);
    }
    throw new Error(`Unexpected token in formula "${formula}"`);
  }

  const v = expr();
  if (pos < tokens.length) throw new Error(`Unexpected trailing input in formula "${formula}"`);
  return v;
}

/** Evaluate without throwing (returns fallback and reports the error) */
export function safeEval(formula: string | number, ctx: FormulaContext, onError?: (msg: string) => void, fallback = 0): number {
  try {
    return evalFormula(formula, ctx);
  } catch (e) {
    onError?.((e as Error).message);
    return fallback;
  }
}

/** For text values such as dice: "table:Martial Arts" → "1d4"; numbers are evaluated */
export function evalText(formula: string, ctx: FormulaContext): string {
  const m = formula.trim().match(/^table:(.+)$/);
  if (m) return ctx.table?.(m[1].trim()) ?? "";
  if (/^\d+d\d+$/.test(formula.trim())) return formula.trim();
  try {
    return String(evalFormula(formula, ctx));
  } catch {
    return formula;
  }
}
