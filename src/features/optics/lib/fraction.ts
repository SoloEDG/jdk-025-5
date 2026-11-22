// 精确分数：所有阈值判定都基于 bigint 有理数，杜绝浮点近似跨过阈值的歧义。
export class Fraction {
  readonly num: bigint;
  readonly den: bigint; // 恒为正，gcd 约分后为 1

  constructor(numerator: bigint, denominator: bigint = 1n) {
    if (denominator === 0n) throw new Error("Fraction: 分母不能为零");
    if (denominator < 0n) {
      numerator = -numerator;
      denominator = -denominator;
    }
    if (numerator === 0n) {
      this.num = 0n;
      this.den = 1n;
      return;
    }
    const g = gcd(
      numerator < 0n ? -numerator : numerator,
      denominator,
    );
    this.num = numerator / g;
    this.den = denominator / g;
  }

  static ZERO = new Fraction(0n);
  static ONE = new Fraction(1n);

  static of(value: number): Fraction {
    if (!Number.isFinite(value)) throw new Error("Fraction.of: 非有限数");
    const s = value.toString();
    if (s.includes("e") || s.includes("E")) {
      // 科学计数法兜底
      const [m, e] = s.split(/e/i);
      const mantissa = Fraction.of(Number(m));
      const exp = Number(e);
      const ten = (k: number) => 10n ** BigInt(Math.abs(k));
      return exp >= 0
        ? new Fraction(mantissa.num * ten(exp), mantissa.den)
        : new Fraction(mantissa.num, mantissa.den * ten(-exp));
    }
    const neg = value < 0;
    const abs = neg ? s.slice(1) : s;
    const [intPart, fracPart = ""] = abs.split(".");
    const digits = intPart + fracPart;
    const den = 10n ** BigInt(fracPart.length);
    const num = BigInt(digits || "0") * (neg ? -1n : 1n);
    return new Fraction(num, den);
  }

  add(o: Fraction): Fraction {
    return new Fraction(
      this.num * o.den + o.num * this.den,
      this.den * o.den,
    );
  }

  sub(o: Fraction): Fraction {
    return new Fraction(
      this.num * o.den - o.num * this.den,
      this.den * o.den,
    );
  }

  mul(o: Fraction): Fraction {
    return new Fraction(this.num * o.num, this.den * o.den);
  }

  div(o: Fraction): Fraction {
    if (o.num === 0n) throw new Error("Fraction.div: 除数为零");
    return new Fraction(this.num * o.den, this.den * o.num);
  }

  neg(): Fraction {
    return new Fraction(-this.num, this.den);
  }

  isZero(): boolean {
    return this.num === 0n;
  }

  isPositive(): boolean {
    return this.num > 0n;
  }

  equals(o: Fraction): boolean {
    return this.num === o.num && this.den === o.den;
  }

  cmp(o: Fraction): number {
    const d = this.num * o.den - o.num * this.den;
    return d < 0n ? -1 : d > 0n ? 1 : 0;
  }

  toNumber(): number {
    // 仅供展示与浮点交叉验证，不参与阈值判定
    return Number(this.num) / Number(this.den);
  }

  // 展示用：最多 keep 位小数
  format(keep = 4): string {
    if (this.isZero()) return "0";
    const whole =
      (this.num < 0n ? -this.num : this.num) / this.den;
    const rem =
      (this.num < 0n ? -this.num : this.num) % this.den;
    if (rem === 0n) return (this.num < 0n ? "-" : "") + whole.toString();
    const factor = 10n ** BigInt(keep);
    const rounded = (rem * factor * 2n >= this.den * factor
      ? (rem * factor) / this.den + 1n
      : (rem * factor) / this.den);
    let dec = rounded.toString().padStart(keep, "0").replace(/0+$/, "");
    if (dec === "") dec = "0";
    return `${this.num < 0n ? "-" : ""}${whole}.${dec}`;
  }

  toJSON(): string {
    return `${this.num}/${this.den}`;
  }

  static parse(text: string): Fraction | null {
    const m = /^(-?\d+)\/(\d+)$/.exec(text);
    if (!m) return null;
    try {
      return new Fraction(BigInt(m[1]), BigInt(m[2]));
    } catch {
      return null;
    }
  }
}

export function gcd(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b !== 0n) {
    const t = a % b;
    a = b;
    b = t;
  }
  return a;
}

// 十进制小数字符串（UI 输入，如 0.85）→ 精确分数
export function decimalToFraction(text: string): Fraction | null {
  if (!/^\d+(\.\d+)?$/.test(text.trim())) return null;
  try {
    return Fraction.of(Number(text.trim()));
  } catch {
    return null;
  }
}
