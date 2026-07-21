import type { CharacterPack } from './types';

export class SpriteAnimator {
  private image: HTMLImageElement | null = null;
  private loaded = false;
  private frame = 0;
  private elapsed = 0;
  private currentAnimation = 'idle';
  private flipX = false;
  private speedMultiplier = 1;
  private peckHold = false;
  private holdPose = false;
  private carryPose = false;
  private carryStrain = 0.55;
  private playOnce = false;

  constructor(private readonly character: CharacterPack) {}

  async load(): Promise<void> {
    if (this.loaded) return;

    await new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        this.image = img;
        this.loaded = true;
        resolve();
      };
      img.onerror = () => reject(new Error(`Failed to load spritesheet: ${this.character.spritesheet}`));
      img.src = this.character.spritesheet;
    });
  }

  setAnimation(name: string, flipX = false): void {
    const resolved = this.character.animations[name] ? name : 'idle';
    if (resolved === this.currentAnimation && flipX === this.flipX) return;
    const lateralFlip =
      (resolved === 'walkLeft' && this.currentAnimation === 'walk') ||
      (resolved === 'walk' && this.currentAnimation === 'walkLeft') ||
      (resolved === 'runLeft' && this.currentAnimation === 'run') ||
      (resolved === 'run' && this.currentAnimation === 'runLeft') ||
      (resolved === 'idleLeft' && this.currentAnimation === 'idle') ||
      (resolved === 'idle' && this.currentAnimation === 'idleLeft');
    const animChanged = resolved !== this.currentAnimation;
    this.currentAnimation = resolved;
    this.flipX = flipX;
    if (animChanged && !lateralFlip) {
      this.frame = 0;
      this.elapsed = 0;
    }
  }

  playAnimation(name: string, flipX = false): void {
    const resolved = this.character.animations[name] ? name : 'idle';
    this.currentAnimation = resolved;
    this.flipX = flipX;
    this.frame = 0;
    this.elapsed = 0;
    this.playOnce = false;
  }

  playAnimationOnce(name: string, flipX = false): void {
    const resolved = this.character.animations[name] ? name : 'idle';
    this.currentAnimation = resolved;
    this.flipX = flipX;
    this.frame = 0;
    this.elapsed = 0;
    this.playOnce = true;
    this.peckHold = false;
  }

  setPlayOnce(once: boolean): void {
    this.playOnce = once;
  }

  setPeckHold(hold: boolean): void {
    this.peckHold = hold;
    if (hold && this.currentAnimation === 'peck') {
      const def = this.character.animations.peck;
      this.frame = Math.max(0, def.frames - 1);
      this.playOnce = false;
    }
  }

  setHoldPose(hold: boolean): void {
    this.holdPose = hold;
    if (hold) {
      const def = this.character.animations[this.currentAnimation];
      if (def) {
        this.frame = Math.max(0, def.frames - 1);
        this.playOnce = false;
      }
    }
  }

  /** Inclina o bico/corpo enquanto arrasta (sem loop de bicada). */
  setCarryPose(carry: boolean): void {
    this.carryPose = carry;
    if (!carry) this.carryStrain = 0.55;
  }

  setCarryStrain(strain: number): void {
    this.carryStrain = Math.max(0, Math.min(1, strain));
  }

  setSpeedMultiplier(multiplier: number): void {
    this.speedMultiplier = Math.max(0.5, Math.min(2.5, multiplier));
  }

  get animation(): string {
    return this.currentAnimation;
  }

  get mirrored(): boolean {
    return this.flipX;
  }

  update(dt: number): void {
    const def = this.character.animations[this.currentAnimation];
    if (!def) return;

    if (this.peckHold && this.currentAnimation === 'peck') {
      this.frame = Math.max(0, def.frames - 1);
      return;
    }

    if (this.holdPose) {
      this.frame = Math.max(0, def.frames - 1);
      return;
    }

    if (def.frames <= 1) return;

    this.elapsed += dt * this.speedMultiplier;
    const frameDuration = 1 / def.fps;
    while (this.elapsed >= frameDuration) {
      this.elapsed -= frameDuration;
      if (this.playOnce) {
        this.frame = Math.min(this.frame + 1, def.frames - 1);
      } else {
        this.frame = (this.frame + 1) % def.frames;
      }
    }
  }

  private poseOverlay(): { lean: number; offsetX: number; offsetY: number } {
    if (this.currentAnimation === 'peck') {
      const def = this.character.animations.peck;
      const t = def.frames <= 1 ? 1 : this.frame / (def.frames - 1);
      const reach = this.peckHold ? 1 : Math.sin(t * Math.PI * 0.92);
      const pull = this.peckHold ? 0.25 : 0;
      return { lean: reach * 2 + pull, offsetX: 0, offsetY: reach * 0.35 };
    }

    if (this.holdPose) {
      return { lean: 4.5, offsetX: 0, offsetY: 0 };
    }

    if (this.carryPose) {
      const pull = this.carryStrain;
      return {
        lean: 3 + pull * 4,
        offsetX: 0,
        offsetY: pull * 0.8,
      };
    }

    if (this.currentAnimation === 'fly' || this.currentAnimation === 'flyLeft') {
      const bob = Math.sin(this.frame * 0.55 + this.elapsed * 5) * 0.75;
      return { lean: 0, offsetX: 0, offsetY: bob };
    }

    return { lean: 0, offsetX: 0, offsetY: 0 };
  }

  draw(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    scale = 2,
    wobble = 0,
    leanDeg = 0,
  ): void {
    const def = this.character.animations[this.currentAnimation] ?? this.character.animations.idle;
    if (!def) return;

    const peck = this.poseOverlay();
    const fw = this.character.frameWidth;
    const fh = this.character.frameHeight;
    const drawW = Math.round(fw * scale);
    const drawH = Math.round(fh * scale);
    const drawX = Math.round(x - drawW / 2 + peck.offsetX);
    const drawY = Math.round(y - drawH / 2 + wobble + peck.offsetY);
    const pivotX = drawX + drawW / 2;
    const pivotY = drawY + drawH * 0.62;
    const totalLean = leanDeg + peck.lean;

    ctx.imageSmoothingEnabled = false;

    if (this.image && this.loaded) {
      const sx = this.frame * fw;
      const sy = def.row * fh;
      ctx.save();
      if (Math.abs(totalLean) > 0.05) {
        ctx.translate(pivotX, pivotY);
        ctx.rotate((totalLean * Math.PI) / 180);
        ctx.translate(-pivotX, -pivotY);
      }
      if (this.flipX) {
        ctx.translate(drawX + drawW, drawY);
        ctx.scale(-1, 1);
        ctx.drawImage(this.image, sx, sy, fw, fh, 0, 0, drawW, drawH);
      } else {
        ctx.drawImage(this.image, sx, sy, fw, fh, drawX, drawY, drawW, drawH);
      }
      ctx.restore();
      return;
    }

    this.drawDuckFallback(ctx, drawX, drawY, drawW, drawH);
  }

  /** Fallback vector duck quando o spritesheet não carrega */
  private drawDuckFallback(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const ox = Math.round(x + w * 0.08);
    const oy = Math.round(y + h * 0.06);
    const s = w / 48;

    const dot = (col: number, row: number, color: string) => {
      ctx.fillStyle = color;
      ctx.fillRect(Math.round(ox + col * s), Math.round(oy + row * s), Math.ceil(s), Math.ceil(s));
    };

    const fillSpan = (row: number, c0: number, c1: number, color: string) => {
      for (let c = c0; c <= c1; c += 1) dot(c, row, color);
    };

    for (let r = 0; r < 6; r += 1) {
      for (let c = 0; c < 12; c += 1) {
        const nx = c - 5;
        const ny = r - 2.5;
        if (nx * nx + ny * ny > 9) continue;
        dot(16 + c, 41 + r, (c + r) % 2 === 0 ? '#5a5a5a' : '#1e1e1e');
      }
    }

    const whiteSpans: Array<[number, number, number]> = [
      [20, 16, 26], [21, 14, 28], [22, 12, 30], [23, 10, 32], [24, 9, 33],
      [25, 8, 34], [26, 7, 34], [27, 7, 34], [28, 7, 34], [29, 7, 34],
      [30, 7, 33], [31, 8, 32], [32, 9, 31], [33, 10, 30], [34, 11, 29],
      [35, 12, 28], [36, 13, 27], [37, 14, 26], [38, 15, 25], [39, 16, 24],
      [40, 17, 23], [41, 18, 22], [29, 11, 31], [28, 12, 32], [27, 13, 33],
      [27, 14, 34], [28, 15, 35], [29, 16, 35], [30, 17, 34], [31, 18, 33],
      [32, 19, 32], [31, 20, 32], [30, 21, 31], [5, 26, 8], [6, 25, 9], [7, 27, 9], [8, 28, 9],
    ];

    for (const [row, c0, c1] of whiteSpans) fillSpan(row, c0, c1, '#fff');

    fillSpan(15, 36, 43, '#ffa500');
    fillSpan(16, 35, 44, '#ffa500');
    fillSpan(17, 36, 43, '#ffa500');
    dot(38, 18, '#d26e00');
    dot(39, 18, '#d26e00');
    dot(40, 18, '#d26e00');
    fillSpan(39, 18, 21, '#ffa500');
    fillSpan(38, 26, 29, '#ffa500');
    dot(30, 14, '#111');
    dot(31, 14, '#111');
  }
}
