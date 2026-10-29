// Port of Calc.kt
// Tiny calculator for input boxes: + - * / ( ) and decimals.
// Also accepts x or × for multiply, ÷ for divide, and comma as decimal point.
// Returns null if the text is not a valid expression.

class Parser {
  constructor(s) {
    this.s = s;
    this.i = 0;
  }

  expr() {
    const s = this.s;
    let v = this.term();
    while (this.i < s.length && (s[this.i] === '+' || s[this.i] === '-')) {
      const op = s[this.i++];
      const r = this.term();
      v = op === '+' ? v + r : v - r;
    }
    return v;
  }

  term() {
    const s = this.s;
    let v = this.factor();
    while (this.i < s.length && (s[this.i] === '*' || s[this.i] === '/')) {
      const op = s[this.i++];
      const r = this.factor();
      v = op === '*' ? v * r : v / r;
    }
    return v;
  }

  factor() {
    const s = this.s;
    if (this.i < s.length && s[this.i] === '-') { this.i++; return -this.factor(); }
    if (this.i < s.length && s[this.i] === '+') { this.i++; return this.factor(); }
    if (this.i < s.length && s[this.i] === '(') {
      this.i++;
      const v = this.expr();
      if (this.i >= s.length || s[this.i] !== ')') throw new Error('IllegalArgumentException');
      this.i++;
      return v;
    }
    const start = this.i;
    while (this.i < s.length && ((s[this.i] >= '0' && s[this.i] <= '9') || s[this.i] === '.')) this.i++;
    if (start === this.i) throw new Error('IllegalArgumentException');
    // Kotlin String.toDouble(): "1." and ".5" are valid, "." and "1.2.3" throw
    const t = s.substring(start, this.i);
    const v = Number(t);
    if (t === '.' || Number.isNaN(v)) throw new Error('NumberFormatException');
    return v;
  }
}

export const Calc = {
  eval(input) {
    const s = String(input).trim()
      .replaceAll('×', '*').replaceAll('x', '*').replaceAll('X', '*')
      .replaceAll('÷', '/').replaceAll(',', '.')
      .replaceAll(' ', '');
    if (s.length === 0) return null;
    const p = new Parser(s);
    try {
      const v = p.expr();
      if (p.i !== s.length || Number.isNaN(v) || !Number.isFinite(v)) return null;
      return v;
    } catch (e) {
      return null;
    }
  },
};

// Display units. Everything inside the app is stored in mm;
// only what you see and type is converted.
export const Units = {
  inch: false,
  get label() { return this.inch ? 'in' : 'mm'; },
  toUser(mm) { return this.inch ? mm / 25.4 : mm; },
  fromUser(v) { return this.inch ? v * 25.4 : v; },
};

// Java String.format(Locale.US, "%.<d>f", v) — HALF_UP rounding applied to the
// shortest decimal representation (like java.util.Formatter), not toFixed's
// exact-binary rounding (e.g. 0.15 -> "0.2" as in Java, toFixed gives "0.1").
export function formatFixed(v, d) {
  if (Number.isNaN(v)) return 'NaN';
  if (!Number.isFinite(v)) return v > 0 ? 'Infinity' : '-Infinity';
  const neg = v < 0 || Object.is(v, -0);
  const a = Math.abs(v);
  let intStr; // the value * 10^d, rounded, as a digit string
  if (a === 0) {
    intStr = '0';
  } else {
    const [mant, expS] = a.toExponential().split('e');
    const exp = parseInt(expS, 10);
    const digits = mant.replace('.', '');
    const keep = exp + 1 + d; // how many significant digits survive
    if (keep < 0) {
      intStr = '0';
    } else if (keep >= digits.length) {
      intStr = digits + '0'.repeat(keep - digits.length);
    } else {
      let kept = digits.substring(0, keep);
      if (digits.charCodeAt(keep) >= 53 /* '5' */) {
        // increment the decimal string
        const arr = (kept.length ? kept : '0').split('');
        let k = arr.length - 1;
        while (k >= 0) {
          if (arr[k] === '9') { arr[k] = '0'; k--; } else { arr[k] = String.fromCharCode(arr[k].charCodeAt(0) + 1); break; }
        }
        kept = (k < 0 ? '1' : '') + arr.join('');
      }
      intStr = kept.length ? kept : '0';
    }
    intStr = intStr.replace(/^0+(?=\d)/, '');
  }
  if (intStr.length < d + 1) intStr = '0'.repeat(d + 1 - intStr.length) + intStr;
  const body = d > 0 ? intStr.substring(0, intStr.length - d) + '.' + intStr.substring(intStr.length - d) : intStr;
  return (neg ? '-' : '') + body;
}
