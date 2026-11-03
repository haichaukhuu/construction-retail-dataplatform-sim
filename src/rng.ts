function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export class Rng {
  private n: () => number;
  constructor(seed: number) { this.n = mulberry32(seed); }
  float() { return this.n(); }
  int(min: number, max: number) { return Math.floor(this.n() * (max - min + 1)) + min; }
  chance(p: number) { return this.n() < p; }
  pick<T>(a: T[]): T { return a[Math.floor(this.n() * a.length)]; }
  weighted<T>(items: [T, number][]): T {
    const total = items.reduce((s, [, w]) => s + w, 0);
    let r = this.n() * total;
    for (const [v, w] of items) { if ((r -= w) <= 0) return v; }
    return items[items.length - 1][0];
  }
  shuffle<T>(a: T[]): T[] {
    const x = [...a];
    for (let i = x.length - 1; i > 0; i--) { const j = this.int(0, i); [x[i], x[j]] = [x[j], x[i]]; }
    return x;
  }
}
