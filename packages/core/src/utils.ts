import type { Vec2 } from './types';

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function distance(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function pickRandom<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)]!;
}

/** Fisher–Yates shuffle deck for fair task rotation */
export class Deck {
  readonly indices: number[];

  constructor(size: number) {
    this.indices = Array.from({ length: size }, (_, i) => i);
    this.shuffle();
  }

  next(): number {
    if (this.indices.length === 0) {
      return 0;
    }
    const value = this.indices.pop()!;
    if (this.indices.length === 0) {
      this.shuffle();
    }
    return value;
  }

  private shuffle(): void {
    for (let i = this.indices.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.indices[i], this.indices[j]] = [this.indices[j]!, this.indices[i]!];
    }
  }
}

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
