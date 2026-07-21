import { randomCard } from './cards/resolve-cards';
import { isDeviceVisible } from './config/device';
import { resolveJeremiasConfig, type ResolvedJeremiasConfig } from './config/resolve-config';
import { SpriteAnimator } from './animator';
import { OverlayLayer } from './overlay';
import type {
  JeremiasCard,
  JeremiasConfig,
  JeremiasInstance,
  JeremiasTaskId,
  Vec2,
} from './types';
import { clamp, Deck, distance, lerp, pickRandom, prefersReducedMotion, randomRange } from './utils';
import { WINDOWS_ARROW_CURSOR_DATA_URL, WINDOWS_CURSOR_SIZE } from './windows-cursor';

const PECK_DURATION_MS = 680;

/** Distância horizontal mínima para virar perfil (evita flicker esq/dir). */
const SIDE_FACE_FLIP_PX = 72;
/** Tempo mínimo entre trocas de perfil. */
const FACE_LOCK_MS = 380;

interface TaskState {
  id: JeremiasTaskId;
  startedAt: number;
  endsAt?: number;
  stage?: string;
  panel?: HTMLDivElement;
  bringCard?: JeremiasCard;
  panelTarget?: Vec2;
  peckTarget?: Vec2;
  peckFacingLeft?: boolean;
  peckOrient?: 'side' | 'front' | 'back';
  peckStartedAt?: number;
  peckStand?: Vec2;
  waitUntil?: number;
  offscreenDir?: 'left' | 'right' | 'top';
  targetEl?: HTMLElement;
  /** Voo rápido até o alvo (ex.: clique em Assinar). */
  rushFly?: boolean;
  /** Fechar notepad → perseguir e roubar cursor. */
  forceCursorGrab?: boolean;
  pendingCarry?: {
    el: HTMLElement;
    attachX: number;
    attachY: number;
    pinned: boolean;
  };
}

interface DragCarryState {
  el: HTMLElement;
  x: number;
  y: number;
  vx: number;
  vy: number;
  attachX: number;
  attachY: number;
  tilt: number;
  pinned: boolean;
}

export class JeremiasEngine implements JeremiasInstance {
  private readonly config: ResolvedJeremiasConfig;

  private readonly mount: HTMLElement;
  private readonly layer: HTMLDivElement;
  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly overlay: OverlayLayer;
  private readonly animator: SpriteAnimator;
  private readonly cards: JeremiasCard[];
  private readonly taskDeck: Deck;
  private weightedTasks: JeremiasTaskId[];

  private position: Vec2 = { x: -120, y: 120 };
  private renderPos: Vec2 = { x: -120, y: 120 };
  private velocity: Vec2 = { x: 0, y: 0 };
  private target: Vec2 = { x: 200, y: 200 };
  private mouse: Vec2 = { x: 0, y: 0 };
  private task: TaskState = { id: 'wander', startedAt: 0 };
  private maxSpeed: number;
  private facingLeft = false;
  private flyFlipTarget = false;
  private groundFlipTarget = false;
  private faceLockUntil = 0;
  private currentAnim = 'idle';
  private angryUntil = 0;
  private raf = 0;
  private lastTime = 0;
  private destroyed = false;
  private escHoldStart = 0;
  private introDone = false;
  private dismissButton: HTMLButtonElement | null = null;
  private readonly fakeCursor: HTMLDivElement;
  private cursorGrabbed = false;
  private cursorGrabUntil = 0;
  private fakeCursorPos: Vec2 = { x: 0, y: 0 };
  private readonly cursorHideClass = 'jeremias-cursor-hidden';
  private dragCarry: DragCarryState | null = null;

  constructor(config: JeremiasConfig) {
    this.config = resolveJeremiasConfig(config);
    this.maxSpeed = this.config.speed.walk;

    this.cards = this.config.cards;
    this.animator = new SpriteAnimator(config.character);
    this.weightedTasks = this.buildWeightedTasks();
    this.taskDeck = new Deck(this.weightedTasks.length);

    this.mount = config.mount ?? document.body;
    this.layer = document.createElement('div');
    this.layer.className = 'jeremias-root';
    this.layer.style.cssText = [
      'position:fixed',
      'inset:0',
      'pointer-events:none',
      `z-index:${this.config.render.layerZIndex}`,
      'overflow:hidden',
    ].join(';');

    const panelZ = this.config.render.panelZIndex;
    const spriteZ = panelZ + 1;
    const cursorZ = spriteZ + 1;
    const chromeZ = cursorZ + 1;

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'jeremias-canvas';
    this.canvas.style.cssText =
      `position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:${spriteZ}`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D not available');
    }
    this.ctx = ctx;

    this.overlay = new OverlayLayer(this.layer, panelZ, {
      onPanelClose: (panel) => this.handlePanelClosed(panel),
      onUserPanelDragStart: (panel) => this.handleUserPanelDragStart(panel),
    });
    this.layer.appendChild(this.canvas);
    this.fakeCursor = this.createFakeCursor(cursorZ);
    this.layer.appendChild(this.fakeCursor);
    this.injectCursorHideStyle();
    this.mount.appendChild(this.layer);

    if (this.config.dismissible) {
      this.dismissButton = this.createDismissButton(chromeZ);
      this.layer.appendChild(this.dismissButton);
    }

    this.bindEvents();
    void this.start();
  }

  setAggression(value: number): void {
    this.config.behavior.aggression = clamp(value, 0, 1);
    this.weightedTasks = this.buildWeightedTasks();
  }

  grabElement(target: string | HTMLElement): void {
    if (this.destroyed) return;

    const el = typeof target === 'string' ? document.querySelector(target) : target;
    if (!(el instanceof HTMLElement)) return;

    const rect = el.getBoundingClientRect();
    if (rect.width < 8 || rect.height < 8) return;

    const time = performance.now();
    this.releaseCursor();
    this.releaseDragCarry(false);

    this.target = this.elementApproachPoint(el, { preferSide: true });
    const faceLeft = this.resolvePeckFaceLeft(rect);
    this.groundFlipTarget = faceLeft;
    this.flyFlipTarget = faceLeft;
    this.facingLeft = faceLeft;
    this.task = {
      id: 'grabTarget',
      startedAt: time,
      stage: 'approach',
      targetEl: el,
      rushFly: true,
    };
    this.maxSpeed = this.config.speed.fly;
    this.setFlyAnim();
  }

  destroy(): void {
    if (this.destroyed) {
      return;
    }
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener('mousemove', this.onMouseMove);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('resize', this.onResize);
    window.removeEventListener('pointerdown', this.onPetPointerDown);
    this.releaseCursor();
    this.releaseDragCarry(true);
    this.overlay.destroy();
    document.getElementById('jeremias-cursor-style')?.remove();
    this.layer.remove();
    this.config.onDismiss?.();
  }

  private async start(): Promise<void> {
    this.resizeCanvas();
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    try {
      await this.animator.load();
    } catch {
      // vector fallback
    }

    if (prefersReducedMotion()) {
      this.config.behavior.aggression = Math.min(this.config.behavior.aggression, 0.25);
    }

    const now = performance.now();
    const entryDir = pickRandom(['left', 'right', 'top'] as const);
    this.placeOffscreen(entryDir);
    this.renderPos = { x: this.position.x, y: this.position.y };
    this.task.offscreenDir = entryDir;

    if (this.config.tasks.showCards && this.cards.length) {
      this.introDone = true;
      this.task = {
        id: 'bringNote',
        startedAt: now,
        stage: 'dragging',
        offscreenDir: entryDir,
      };
      this.beginBringNoteDrag(now);
    } else {
      this.task = {
        id: 'wander',
        startedAt: now,
        stage: 'enter',
        endsAt: now + randomRange(8000, 14000),
        offscreenDir: entryDir,
      };
      this.target = this.entryTargetFromDir(entryDir);
      this.orientForEntry(entryDir, now);
      this.setSideLocomotionAnim('run');
    }

    this.lastTime = now;
    this.loop(now);
  }

  private buildWeightedTasks(): JeremiasTaskId[] {
    const t = this.config.tasks;
    const list: JeremiasTaskId[] = [];
    const push = (id: JeremiasTaskId, count: number) => {
      for (let i = 0; i < count; i += 1) list.push(id);
    };

    const chaos = this.config.behavior.aggression;
    if (t.showCards && this.cards.length) push('bringNote', Math.round(7 + chaos * 8));
    if (t.chaseCursor) push('chaseCursor', Math.round(1 + chaos * 3));
    if (t.dragCursor && this.config.behavior.stealCursor) push('dragCursor', Math.round(1 + chaos * 2));
    if (t.grabTarget && this.config.behavior.targets.length) {
      push('grabTarget', Math.round(2 + chaos * 3));
    }
    if (t.wander) push('wander', 2);

    return list.length ? list : ['wander'];
  }

  private bindEvents(): void {
    window.addEventListener('mousemove', this.onMouseMove, { passive: true });
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('resize', this.onResize);
    window.addEventListener('pointerdown', this.onPetPointerDown);
  }

  private readonly onMouseMove = (event: MouseEvent): void => {
    this.mouse.x = event.clientX;
    this.mouse.y = event.clientY;
  };

  private readonly onResize = (): void => {
    this.resizeCanvas();
  };

  private readonly onPetPointerDown = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Element && target.closest('.jeremias-panel, .jeremias-fake-cursor, button[aria-label="Despedir o JEREMIAS"]')) {
      return;
    }

    if (distance(this.renderPos, { x: event.clientX, y: event.clientY }) < 40) {
      this.triggerAngry('chaseCursor');
    }
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!this.config.dismissible || event.key !== 'Escape') return;
    if (this.escHoldStart === 0) this.escHoldStart = performance.now();
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.key === 'Escape') this.escHoldStart = 0;
  };

  private createDismissButton(zIndex: number): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Dismiss JEREMIAS';
    btn.setAttribute('aria-label', 'Despedir o JEREMIAS');
    btn.style.cssText = [
      'position:fixed', 'right:12px', 'bottom:12px', 'pointer-events:auto',
      `z-index:${zIndex}`, 'border:1px solid #666', 'background:#fff',
      'padding:6px 10px', 'border-radius:999px', 'font:12px system-ui,sans-serif',
      'cursor:pointer', 'box-shadow:0 2px 8px rgba(0,0,0,.15)',
    ].join(';');
    btn.addEventListener('click', () => this.destroy());
    return btn;
  }

  private resizeCanvas(): void {
    const dpr = window.devicePixelRatio || 1;
    const { clientWidth: w, clientHeight: h } = document.documentElement;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  private loop = (time: number): void => {
    if (this.destroyed) return;

    const dt = Math.min(0.032, (time - this.lastTime) / 1000);
    this.lastTime = time;
    if (this.config.dismissible && this.escHoldStart > 0 && time - this.escHoldStart > 1500) {
      this.destroy();
      return;
    }

    this.updateTask(dt, time);
    this.updateFakeCursor(dt);
    this.syncAnimationSpeed();
    this.animator.update(dt);
    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const flying = this.currentAnim === 'fly' || this.currentAnim === 'flyLeft';
    const moving = speed > 10;
    const follow = flying
      ? Math.min(1, 22 * dt)
      : moving
        ? Math.min(1, 18 * dt)
        : 1;
    if (follow >= 1) {
      this.renderPos.x = this.position.x;
      this.renderPos.y = this.position.y;
    } else {
      this.renderPos.x = lerp(this.renderPos.x, this.position.x, follow);
      this.renderPos.y = lerp(this.renderPos.y, this.position.y, follow);
    }
    this.render(time);
    this.raf = requestAnimationFrame(this.loop);
  };

  private syncAnimationSpeed(): void {
    if (this.dragCarry) {
      const speed = Math.hypot(this.velocity.x, this.velocity.y);
      const base = this.maxSpeed || this.config.speed.walk;
      this.animator.setSpeedMultiplier(clamp(0.48 + (speed / Math.max(base, 1)) * 0.38, 0.48, 0.82));
      return;
    }
    if (this.currentAnim === 'peck') {
      this.animator.setSpeedMultiplier(0.85);
      return;
    }
    if (this.currentAnim === 'fly' || this.currentAnim === 'flyLeft') {
      const speed = Math.hypot(this.velocity.x, this.velocity.y);
      this.animator.setSpeedMultiplier(clamp(0.9 + (speed / this.config.speed.fly) * 0.35, 0.9, 1.35));
      return;
    }

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    const base = this.maxSpeed || this.config.speed.walk;
    this.animator.setSpeedMultiplier(clamp(0.72 + (speed / Math.max(base, 1)) * 0.48, 0.72, 1.15));
  }

  /** Perfil lateral com histerese — não alterna esq/dir quando dx ≈ 0. */
  private resolveSideFaceLeft(dx: number): boolean {
    if (dx <= -SIDE_FACE_FLIP_PX) return true;
    if (dx >= SIDE_FACE_FLIP_PX) return false;
    return this.facingLeft;
  }

  /** Virar para a direção do movimento real (evita moonwalk). */
  private resolveMovementFaceLeft(vx: number, steerDx: number, fallback = this.facingLeft): boolean {
    if (Math.abs(vx) >= 6) return vx < 0;
    if (Math.abs(steerDx) >= 18) return steerDx < 0;
    return fallback;
  }

  /** Pato à direita do alvo → perfil esquerdo (bico apontando pro item). */
  private resolvePeckFaceLeft(rect: DOMRect): boolean {
    const cx = rect.left + rect.width * 0.5;
    if (Math.abs(this.position.x - cx) >= 12) {
      return this.position.x > cx;
    }
    return this.facingLeft;
  }

  /** Sprite de peck no sheet aponta pro lado oposto do mirror de walk — corrige o flip. */
  private peckMirror(faceLeft: boolean): boolean {
    return !faceLeft;
  }

  private planPeckAgainstRect(
    rect: DOMRect,
    gap = 38,
    approachSide?: 'left' | 'right',
  ): {
    faceLeft: boolean;
    stand: Vec2;
    aim: Vec2;
    attach: { attachX: number; attachY: number };
  } {
    const faceLeft =
      approachSide === 'right' ? true : approachSide === 'left' ? false : this.resolvePeckFaceLeft(rect);
    const y = rect.top + rect.height * 0.5;
    const stand: Vec2 = {
      x: faceLeft ? rect.right + gap : rect.left - gap,
      y,
    };
    const edgeInset = clamp(rect.width * 0.18, 10, 28);
    const aim: Vec2 = {
      x: faceLeft ? rect.right - edgeInset : rect.left + edgeInset,
      y: rect.top + rect.height * 0.42,
    };
    const attach = faceLeft
      ? { attachX: rect.width - 10, attachY: rect.height * 0.36 }
      : { attachX: 10, attachY: rect.height * 0.36 };

    return { faceLeft, stand, aim, attach };
  }

  private updateSideFacing(toward: Vec2, time = performance.now()): void {
    if (time < this.faceLockUntil) return;

    const steerDx = toward.x - this.position.x;
    const wantLeft = this.resolveMovementFaceLeft(this.velocity.x, steerDx, this.resolveSideFaceLeft(steerDx));

    if (wantLeft === this.facingLeft) return;

    this.facingLeft = wantLeft;
    this.groundFlipTarget = wantLeft;
    this.flyFlipTarget = wantLeft;
    this.faceLockUntil = time + FACE_LOCK_MS;
  }

  /** Perfil durante bringNote — segue movimento, não o lado do card. */
  private syncBringNoteFacing(time: number, steerToward: Vec2): void {
    if (time < this.faceLockUntil) return;

    const steerDx = steerToward.x - this.position.x;
    let fallback = this.facingLeft;

    if (this.task.stage === 'exit') {
      const dir = this.task.offscreenDir;
      if (dir === 'right') fallback = false;
      else if (dir === 'left') fallback = true;
    }

    const wantLeft = this.resolveMovementFaceLeft(this.velocity.x, steerDx, fallback);

    if (wantLeft === this.facingLeft) return;

    this.facingLeft = wantLeft;
    this.groundFlipTarget = wantLeft;
    this.flyFlipTarget = wantLeft;
    this.task.peckFacingLeft = wantLeft;
    this.faceLockUntil = time + FACE_LOCK_MS;
  }

  /** Perfil enquanto arrasta — movimento manda, sem voltar para carryFace. */
  private syncCarryFacing(steerToward: Vec2, time: number): void {
    if (time < this.faceLockUntil) return;

    const steerDx = steerToward.x - this.position.x;
    const wantLeft = this.resolveMovementFaceLeft(this.velocity.x, steerDx, this.facingLeft);

    if (wantLeft === this.facingLeft) return;

    this.facingLeft = wantLeft;
    this.groundFlipTarget = wantLeft;
    this.flyFlipTarget = wantLeft;
    this.task.peckFacingLeft = wantLeft;
    this.faceLockUntil = time + FACE_LOCK_MS;
  }

  private sideLocomotionAnim(kind: 'idle' | 'walk' | 'run', faceLeft: boolean): string {
    if (kind === 'idle') return faceLeft ? 'idleLeft' : 'idle';
    if (kind === 'walk') return faceLeft ? 'walkLeft' : 'walk';
    return faceLeft ? 'runLeft' : 'run';
  }

  private pickSideLocomotionKind(speed: number, runRatio: number): 'idle' | 'walk' | 'run' {
    const base = this.maxSpeed || this.config.speed.walk;
    const canRun = base >= this.config.speed.run * 0.85;
    const running = canRun && speed >= base * Math.max(runRatio, 0.9);
    if (speed < 12) return 'idle';
    return running ? 'run' : 'walk';
  }

  private setSideLocomotionAnim(kind: 'idle' | 'walk' | 'run'): void {
    this.setAnim(this.sideLocomotionAnim(kind, this.facingLeft));
  }

  /** Sprites nativos de voo (sem espelhar — evita voar “de costas”). */
  private setFlyAnim(): void {
    const name = this.facingLeft ? 'flyLeft' : 'fly';
    this.setAnim(name, false);
  }

  /** Vira perfil com histerese + lock curto (sem deslizar de costas). */
  private updateGroundSteering(dt: number, toward: Vec2): void {
    void dt;
    this.updateSideFacing(toward);
  }

  private updateFlySteering(dt: number, toward: Vec2): void {
    void dt;
    this.updateSideFacing(toward);
  }

  private resolveFlyMoveTarget(el: HTMLElement): Vec2 {
    const plan = this.planPeckAgainstRect(el.getBoundingClientRect());
    return distance(this.position, plan.aim) > 72 ? plan.stand : plan.aim;
  }

  private isAngry(time: number): boolean {
    return time < this.angryUntil;
  }

  private syncLocomotionAnim(
    dt: number,
    steerToward: Vec2,
    runRatio = 0.82,
    time = performance.now(),
  ): void {
    if (this.dragCarry) {
      this.animator.setPeckHold(false);
      this.animator.setHoldPose(false);
      this.animator.setPlayOnce(false);
      this.animator.setCarryPose(true);

      const speed = Math.hypot(this.velocity.x, this.velocity.y);
      const base = this.maxSpeed || this.config.speed.walk;
      const canRun = base >= this.config.speed.run * 0.85;
      const pulling = canRun && speed >= base * Math.max(runRatio, 0.9) * 0.75;
      this.animator.setCarryStrain(clamp(speed / Math.max(base, 1), 0.3, 1));

      this.syncCarryFacing(steerToward, time);
      this.setSideLocomotionAnim(pulling ? 'run' : speed < 12 ? 'idle' : 'walk');
      return;
    }

    this.animator.setCarryPose(false);

    if (this.task.stage === 'peck') {
      return;
    }

    this.animator.setPeckHold(false);
    this.animator.setHoldPose(false);
    this.animator.setPlayOnce(false);

    const speed = Math.hypot(this.velocity.x, this.velocity.y);
    if (
      this.task.id === 'grabTarget' &&
      this.task.stage === 'approach' &&
      this.task.rushFly
    ) {
      this.setFlyAnim();
      return;
    }

    if (this.isAngry(time) && speed > 10) {
      this.setFlyAnim();
      return;
    }

    if (this.task.id === 'bringNote') {
      this.syncBringNoteFacing(time, steerToward);
      this.setSideLocomotionAnim(this.pickSideLocomotionKind(speed, runRatio));
      return;
    }

    this.updateGroundSteering(dt, steerToward);
    this.setSideLocomotionAnim(this.pickSideLocomotionKind(speed, runRatio));
  }

  private startPeckIntro(): void {
    const faceLeft = this.task.peckFacingLeft ?? false;
    this.currentAnim = 'peck';
    this.facingLeft = faceLeft;
    this.animator.playAnimationOnce('peck', this.peckMirror(faceLeft));
  }

  private beginPeckStage(
    plan: {
      aim: Vec2;
      stand: Vec2;
      faceLeft: boolean;
    },
    time: number,
    carryEl?: HTMLElement,
    carryAttach?: { attachX: number; attachY: number },
  ): void {
    this.task.stage = 'peck';
    this.task.endsAt = time + PECK_DURATION_MS;
    this.task.peckStartedAt = time;
    this.task.peckTarget = plan.aim;
    this.task.peckStand = plan.stand;
    this.task.peckOrient = 'side';
    this.task.peckFacingLeft = plan.faceLeft;
    this.groundFlipTarget = plan.faceLeft;
    this.flyFlipTarget = plan.faceLeft;
    this.facingLeft = plan.faceLeft;
    this.faceLockUntil = time + PECK_DURATION_MS;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.maxSpeed = 0;
    this.startPeckIntro();

    if (carryEl && carryAttach) {
      if (carryEl.classList.contains('jeremias-panel')) {
        carryEl.dataset.jeremiasCarried = 'true';
      }
      this.task.pendingCarry = {
        el: carryEl,
        attachX: carryAttach.attachX,
        attachY: carryAttach.attachY,
        pinned: carryEl !== this.task.panel,
      };
    } else {
      this.task.pendingCarry = undefined;
    }
  }

  private attachPendingCarry(): void {
    const pending = this.task.pendingCarry;
    if (!pending || this.dragCarry) return;

    if (pending.pinned) {
      this.pinElement(pending.el);
    }
    this.beginDragCarry(pending.el, pending.attachX, pending.attachY, pending.pinned);
    this.task.pendingCarry = undefined;
  }

  private updatePeck(dt: number, aim: Vec2, time: number): void {
    const faceLeft = this.task.peckFacingLeft ?? false;
    const stand = this.task.peckStand ?? aim;

    const started = this.task.peckStartedAt ?? time;
    const duration = PECK_DURATION_MS;
    const progress = clamp((time - started) / duration, 0, 1);
    const eased =
      progress < 0.55
        ? 2 * progress * progress
        : 1 - Math.pow(-2 * progress + 2, 2) / 2;

    this.maxSpeed = 0;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.facingLeft = faceLeft;
    this.groundFlipTarget = faceLeft;
    this.flyFlipTarget = faceLeft;

    if (this.currentAnim !== 'peck') {
      this.startPeckIntro();
    }

    if (progress >= 0.48) {
      this.attachPendingCarry();
    }

    if (progress >= 0.72) {
      this.animator.setPeckHold(true);
    }

    const moveTarget = progress < 0.4 ? stand : aim;
    const dx = moveTarget.x - this.position.x;
    const dy = moveTarget.y - this.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const step = dt * lerp(3, 24, eased);
    this.position.x += (dx / dist) * step;
    this.position.y += (dy / dist) * step;

    if (this.dragCarry) {
      const pullStrength = clamp((progress - 0.48) / 0.52, 0.15, 1);
      this.updateDragCarry(dt, pullStrength);
    }
  }

  private walkWobble(): number {
    return 0;
  }

  private movementLeanDeg(): number {
    return 0;
  }

  private setAnim(name: string, flipX = false): void {
    const left = flipX || name.endsWith('Left') || name === 'flyLeft';
    const mirror = name === 'peck' ? this.peckMirror(flipX) : false;

    if (name === 'peck') {
      if (this.currentAnim !== 'peck') {
        this.currentAnim = 'peck';
        this.facingLeft = left;
        this.animator.playAnimationOnce('peck', mirror);
      } else if (this.facingLeft !== left || this.animator.mirrored !== mirror) {
        this.facingLeft = left;
        this.animator.setAnimation('peck', mirror);
      }
      return;
    }

    if (name === this.currentAnim && left === this.facingLeft) return;
    this.currentAnim = name;
    this.facingLeft = left;
    this.animator.setAnimation(name, false);
  }

  private updateTask(dt: number, time: number): void {
    if (this.task.stage === 'enter') {
      this.updateEnterScreen(dt, time);
      return;
    }

    switch (this.task.id) {
      case 'wander':
        this.updateWander(dt, time);
        break;
      case 'chaseCursor':
        this.updateChaseCursor(dt, time);
        break;
      case 'dragCursor':
        this.updateDragCursor(dt, time);
        break;
      case 'grabTarget':
        this.updateGrabTarget(dt, time);
        break;
      case 'bringNote':
        this.updateBringPanel(dt, time);
        break;
    }
  }

  private updateWander(dt: number, time: number): void {
    this.maxSpeed = this.config.speed.walk;

    if (distance(this.position, this.target) < 20 || time > (this.task.endsAt ?? 0)) {
      if (!this.introDone) {
        this.introDone = true;
        if (this.config.tasks.showCards && this.cards.length) {
          this.setTask('bringNote', time);
        } else {
          this.chooseNextTask(time);
        }
        return;
      }
      this.chooseNextTask(time);
      return;
    }

    this.moveToward(this.target, dt, 520);
    this.syncLocomotionAnim(dt, this.target);
  }

  /** Entra na viewport a partir da borda offscreen. */
  private updateEnterScreen(dt: number, time: number): void {
    this.maxSpeed = this.config.speed.run;
    this.moveToward(this.target, dt, 980);
    this.syncLocomotionAnim(dt, this.target, 0.78, time);

    if (!this.isOnScreen() || distance(this.position, this.target) > 36) return;

    this.task.stage = undefined;

    if (this.task.id === 'wander' && !this.introDone) {
      this.target = this.randomPoint();
      this.task.endsAt = time + randomRange(4000, 9000);
      this.maxSpeed = this.config.speed.walk;
      return;
    }

    if (this.task.id === 'wander') {
      this.target = this.randomPoint();
      this.task.endsAt = time + randomRange(4000, 9000);
      this.maxSpeed = this.config.speed.walk;
    }
  }

  private updateChaseCursor(dt: number, time: number): void {
    if (this.cursorGrabbed) {
      this.maxSpeed = this.config.speed.walk;
      if (distance(this.position, this.target) < 24) {
        this.target = this.randomPoint();
      }
      this.moveToward(this.target, dt, 520);
      this.syncLocomotionAnim(dt, this.target, 0.9);
      if (time > this.cursorGrabUntil) {
        this.releaseCursor();
        this.setTask('wander', time);
      }
      return;
    }

    const angry = this.isAngry(time);
    this.maxSpeed = angry ? this.config.speed.fly : this.config.speed.charge;
    const aim = { x: this.mouse.x, y: this.mouse.y };
    if (angry) {
      this.updateFlySteering(dt, aim);
    }
    this.moveToward(aim, dt, angry ? 2200 : 1400);
    this.syncLocomotionAnim(dt, aim, 0.72, time);

    const grabRadius = this.task.forceCursorGrab ? 96 : 34;
    if (distance(this.position, this.mouse) < grabRadius) {
      if (this.config.tasks.dragCursor) {
        this.beginCursorDrag(
          time,
          this.task.forceCursorGrab ? randomRange(6500, 11000) : randomRange(3500, 6500),
        );
        this.task.forceCursorGrab = false;
        this.target = this.randomPoint();
        return;
      }

      this.angryUntil = time + 900;
      this.velocity.x = 0;
      this.velocity.y = 0;
      this.facingLeft = this.mouse.x < this.position.x;
      this.currentAnim = 'peck';
      this.animator.playAnimationOnce('peck', this.peckMirror(this.facingLeft));
      if (time > this.task.startedAt + 3500) {
        this.setTask('wander', time);
      }
    } else if (time > this.task.startedAt + 7000) {
      this.setTask('wander', time);
    }
  }

  private updateDragCursor(dt: number, time: number): void {
    if (!this.cursorGrabbed) {
      if (this.task.stage === 'peck') {
        this.updatePeck(dt, this.mouse, time);
        if (time > (this.task.endsAt ?? 0)) {
          this.beginCursorDrag(time, randomRange(4500, 8000));
          this.target = this.randomPoint();
          this.task.stage = undefined;
        }
        return;
      }

      this.maxSpeed = this.config.speed.charge;
      this.moveToward(this.mouse, dt, 1400);
      this.syncLocomotionAnim(dt, this.mouse, 0.72);

      if (distance(this.position, this.mouse) < 38) {
        const dx = this.mouse.x - this.position.x;
        const faceLeft = Math.abs(dx) >= SIDE_FACE_FLIP_PX ? dx < 0 : this.facingLeft;
        this.beginPeckStage(
          {
            aim: { x: this.mouse.x, y: this.mouse.y },
            stand: {
              x: this.position.x + (faceLeft ? 30 : -30),
              y: this.position.y + (this.mouse.y - this.position.y) * 0.12,
            },
            faceLeft,
          },
          time,
        );
        return;
      }
      return;
    }

    this.maxSpeed = this.config.speed.walk;

    if (distance(this.position, this.target) < 24 || time > (this.task.endsAt ?? 0)) {
      this.target = this.randomPoint();
      this.task.endsAt = time + randomRange(1200, 2800);
    }

    this.moveToward(this.target, dt, 520);
    this.syncLocomotionAnim(dt, this.target, 0.9);

    if (time > this.cursorGrabUntil) {
      this.releaseCursor();
      this.chooseNextTask(time);
    }
  }

  private updateGrabTarget(dt: number, time: number): void {
    const stage = this.task.stage ?? 'approach';

    if (stage === 'approach') {
      if (!this.task.targetEl) {
        const picked = this.pickVisibleTarget();
        if (!picked) {
          this.chooseNextTask(time);
          return;
        }
        this.task.targetEl = picked.el;
        this.target = picked.point;
      } else {
        this.target = this.task.rushFly
          ? this.resolveFlyMoveTarget(this.task.targetEl)
          : this.elementApproachPoint(this.task.targetEl, { preferSide: true });
      }

      const rushing = this.task.rushFly === true;
      this.maxSpeed = rushing ? this.config.speed.fly : this.config.speed.run;
      if (rushing && this.task.targetEl) {
        const plan = this.planPeckAgainstRect(this.task.targetEl.getBoundingClientRect());
        this.updateFlySteering(dt, distance(this.position, plan.stand) > 48 ? plan.stand : plan.aim);
      }
      this.moveToward(this.target, dt, rushing ? 2400 : 980);
      this.syncLocomotionAnim(dt, this.target, rushing ? 0.55 : 0.75, time);

      if (this.task.targetEl && distance(this.position, this.target) < 42) {
        const rect = this.task.targetEl.getBoundingClientRect();
        const side = this.pickApproachSide(rect);
        const plan = this.planPeckAgainstRect(rect, 38, side);
        this.beginPeckStage(plan, time, this.task.targetEl, plan.attach);
      }
      return;
    }

    if (stage === 'peck') {
      const aim = this.task.peckTarget ?? this.target;
      this.updatePeck(dt, aim, time);
      if (time > (this.task.endsAt ?? 0)) {
        this.animator.setPeckHold(false);
        this.animator.setHoldPose(false);
        this.task.stage = 'dragging';
        this.task.endsAt = time + randomRange(3200, 6500);
        this.target = this.randomDragDestination(this.task.targetEl);
        this.faceLockUntil = time + 280;
        this.angryUntil = time + 700;
      }
      return;
    }

    this.maxSpeed = this.config.speed.walk / this.carryMassFactor();
    this.updateDragCarry(dt, 1);

    const untilDrop = (this.task.endsAt ?? 0) - time;
    const nearingDrop = untilDrop <= 1800;

    if (!nearingDrop && distance(this.position, this.target) < 28) {
      this.target = this.randomDragDestination(this.task.targetEl);
      this.faceLockUntil = time + 320;
    }

    this.moveToward(this.target, dt, nearingDrop ? 320 : 460);
    this.syncLocomotionAnim(dt, this.target, 0.9, time);

    if (time > (this.task.endsAt ?? 0)) {
      this.dropDragCarry();
      this.chooseNextTask(time);
    }
  }

  private updateBringPanel(dt: number, time: number): void {
    if (this.task.stage === 'exit' || !this.task.stage) {
      this.task.stage = 'exit';
      this.task.offscreenDir = this.task.offscreenDir ?? pickRandom(['left', 'right', 'top'] as const);
      this.target = this.offscreenPoint(this.task.offscreenDir);
      this.maxSpeed = this.config.speed.run;
      this.moveToward(this.target, dt, 1100);
      this.syncLocomotionAnim(dt, this.target, 0.7, time);
      if (this.isOffscreen()) {
        this.beginBringNoteDrag(time);
      }
      return;
    }

    if (this.task.stage === 'waiting') {
      this.beginBringNoteDrag(time);
      return;
    }

    if (this.task.stage === 'dragging') {
      const panel = this.task.panel;
      if (!panel) {
        this.chooseNextTask(time);
        return;
      }
      const entering = !this.isPanelOnScreen(panel);
      if (entering) {
        const dir = this.task.offscreenDir ?? 'left';
        this.target = this.bringEntryTarget(dir, panel);
        this.maxSpeed = this.config.speed.run / this.carryMassFactor();
      } else {
        this.maxSpeed = this.config.speed.walk / this.carryMassFactor();
      }
      this.updateDragCarry(dt, 1, 'snap');

      const untilDrop = (this.task.endsAt ?? 0) - time;
      const nearingDrop = untilDrop <= 1800;

      if (!entering && !nearingDrop && distance(this.position, this.target) < 28) {
        this.target = this.randomDragDestination(panel);
        this.faceLockUntil = time + 420;
      }

      this.moveToward(this.target, dt, nearingDrop ? 320 : 460);
      this.syncLocomotionAnim(dt, this.target, 0.9, time);

      if (time > (this.task.endsAt ?? 0)) {
        if (this.dragCarry?.el === panel) {
          panel.dataset.jeremiasCarried = 'false';
          this.dropPanelCarry(panel);
          if (this.task.bringCard?.style === 'notepad') {
            this.overlay.typeNotepadContent(panel, this.task.bringCard);
          }
        }
        this.task.panel = undefined;
        this.task.bringCard = undefined;
        this.chooseNextTask(time);
      }
    }
  }

  /** Card preso no bico — arrasto desde offscreen, sem surgir solto na tela. */
  private attachPanelCarryForBring(
    panel: HTMLDivElement,
    dir: 'left' | 'right' | 'top',
    time: number,
  ): void {
    const layout = this.layoutOffscreenCarry(panel, dir);
    this.facingLeft = layout.faceLeft;
    this.groundFlipTarget = layout.faceLeft;
    this.flyFlipTarget = layout.faceLeft;
    this.task.peckFacingLeft = layout.faceLeft;
    this.faceLockUntil = time + 140;

    this.position.x = layout.duckX;
    this.position.y = layout.duckY;
    this.renderPos.x = layout.duckX;
    this.renderPos.y = layout.duckY;

    panel.dataset.jeremiasCarried = 'true';
    this.overlay.movePanel(panel, layout.panelX, layout.panelY);
    panel.style.visibility = 'visible';
    this.beginDragCarry(panel, layout.attachX, layout.attachY, false, {
      x: layout.panelX,
      y: layout.panelY,
    });
    this.animator.setCarryPose(true);
    this.animator.setPeckHold(false);
  }

  private layoutOffscreenCarry(
    panel: HTMLDivElement,
    dir: 'left' | 'right' | 'top',
  ): {
    panelX: number;
    panelY: number;
    attachX: number;
    attachY: number;
    faceLeft: boolean;
    duckX: number;
    duckY: number;
  } {
    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const pad = 24;
    const maxY = Math.max(pad, window.innerHeight - h - pad - 52);
    const carryReach = 0.85;
    const billOffX = lerp(10, 22, carryReach) * this.config.render.scale;
    const billOffY = lerp(-10, -1, carryReach) * this.config.render.scale;

    if (dir === 'left') {
      const attachX = w - 10;
      const attachY = h * 0.36;
      const panelX = -w - pad;
      const panelY = clamp(this.position.y - attachY, pad, maxY);
      const attachScreenX = panelX + attachX;
      const attachScreenY = panelY + attachY;
      return {
        panelX,
        panelY,
        attachX,
        attachY,
        faceLeft: false,
        duckX: attachScreenX - billOffX,
        duckY: attachScreenY - billOffY,
      };
    }

    if (dir === 'right') {
      const attachX = 10;
      const attachY = h * 0.36;
      const panelX = window.innerWidth + pad;
      const panelY = clamp(this.position.y - attachY, pad, maxY);
      const attachScreenX = panelX + attachX;
      const attachScreenY = panelY + attachY;
      return {
        panelX,
        panelY,
        attachX,
        attachY,
        faceLeft: true,
        duckX: attachScreenX + billOffX,
        duckY: attachScreenY - billOffY,
      };
    }

    const faceLeft = this.position.x > window.innerWidth * 0.5;
    const attachX = faceLeft ? w - 10 : 10;
    const attachY = h - 10;
    const panelX = clamp(
      this.position.x - (faceLeft ? w * 0.72 : w * 0.28),
      pad,
      Math.max(pad, window.innerWidth - w - pad),
    );
    const panelY = -h - pad;
    const attachScreenX = panelX + attachX;
    const attachScreenY = panelY + attachY;
    return {
      panelX,
      panelY,
      attachX,
      attachY,
      faceLeft,
      duckX: faceLeft ? attachScreenX + billOffX : attachScreenX - billOffX,
      duckY: attachScreenY - billOffY,
    };
  }

  private beginBringNoteDrag(time: number): void {
    if (!this.cards.length) return;
    if (!this.task.panel) {
      this.spawnPanel();
    }
    const panel = this.task.panel;
    if (!panel) return;

    const dir = this.task.offscreenDir ?? pickRandom(['left', 'right', 'top'] as const);
    this.task.offscreenDir = dir;

    if (this.dragCarry?.el !== panel) {
      this.attachPanelCarryForBring(panel, dir, time);
    }

    this.task.stage = 'dragging';
    if (!this.task.endsAt || this.task.endsAt <= time) {
      this.task.endsAt = time + randomRange(4200, 7500);
    }
    this.target = this.bringEntryTarget(dir, panel);
    this.maxSpeed = this.config.speed.run / this.carryMassFactor();
  }

  private panelCarryAttach(
    panel: HTMLElement,
    dir: 'left' | 'right' | 'top',
  ): { attachX: number; attachY: number; faceLeft: boolean } {
    const attachY = panel.offsetHeight * 0.36;
    if (dir === 'left') {
      return { attachX: panel.offsetWidth - 10, attachY, faceLeft: false };
    }
    if (dir === 'right') {
      return { attachX: 10, attachY, faceLeft: true };
    }
    const faceLeft = this.position.x > window.innerWidth * 0.5;
    return {
      attachX: faceLeft ? panel.offsetWidth - 10 : 10,
      attachY,
      faceLeft,
    };
  }

  private isPanelOnScreen(panel: HTMLElement): boolean {
    const rect = panel.getBoundingClientRect();
    const pad = 8;
    return (
      rect.right > pad &&
      rect.left < window.innerWidth - pad &&
      rect.bottom > pad &&
      rect.top < window.innerHeight - pad
    );
  }

  /** Primeiro destino visível ao entrar arrastando o card. */
  private bringEntryTarget(dir: 'left' | 'right' | 'top', panel: HTMLElement): Vec2 {
    const base = this.entryTargetFromDir(dir, 72);
    const hh = panel.offsetHeight * 0.35;
    return {
      x: base.x,
      y: clamp(base.y, 72 + hh, window.innerHeight - 72 - hh - 52),
    };
  }

  private spawnPanel(): void {
    if (!this.cards.length) return;
    const note = randomCard(this.cards);
    this.task.bringCard = note;
    this.task.panel = this.overlay.createPanel(note, {});
  }

  private releasePanelFromEngine(panel: HTMLDivElement): void {
    panel.dataset.jeremiasCarried = 'false';
    if (this.dragCarry?.el === panel) {
      this.finalizeDragCarry();
      this.animator.setCarryPose(false);
      this.animator.setPeckHold(false);
    }
    if (this.task.panel === panel) {
      this.task.panel = undefined;
      if (this.task.id === 'bringNote') {
        this.chooseNextTask(performance.now());
      }
    }
  }

  private handleUserPanelDragStart(panel: HTMLDivElement): void {
    if (this.dragCarry?.el !== panel) {
      panel.dataset.jeremiasCarried = 'false';
      panel.style.transform = 'none';
      panel.style.transformOrigin = '';
      panel.style.willChange = '';
      panel.style.pointerEvents = 'auto';
      return;
    }

    this.releasePanelFromEngine(panel);
    panel.style.pointerEvents = 'auto';
  }

  private handlePanelClosed(panel: HTMLDivElement): void {
    this.releasePanelFromEngine(panel);

    const time = performance.now();
    this.angryUntil = time + 5200;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.currentAnim = 'peck';
    this.facingLeft = this.mouse.x < this.position.x;
    this.animator.playAnimationOnce('peck', this.peckMirror(this.facingLeft));

    if (!this.config.behavior.stealCursor || !this.config.tasks.chaseCursor) return;

    this.task = {
      id: 'chaseCursor',
      startedAt: time,
      forceCursorGrab: true,
    };
    this.maxSpeed = this.config.speed.fly;
    this.groundFlipTarget = this.mouse.x < this.position.x;
    this.flyFlipTarget = this.groundFlipTarget;
    this.facingLeft = this.groundFlipTarget;
    this.setFlyAnim();
  }

  private triggerAngry(next: JeremiasTaskId = 'chaseCursor'): void {
    if (!this.config.tasks.chaseCursor) return;
    this.angryUntil = performance.now() + 2800;
    this.velocity.x = 0;
    this.velocity.y = 0;
    this.currentAnim = 'peck';
    this.animator.playAnimationOnce('peck', this.peckMirror(this.facingLeft));
    this.setTask(next, performance.now());
  }

  private chooseNextTask(time: number): void {
    const id = this.weightedTasks[this.taskDeck.next()] ?? 'wander';
    if (!this.introDone && id === 'chaseCursor' && this.config.behavior.aggression < 0.5) {
      this.setTask('wander', time);
      return;
    }
    this.setTask(id, time);
  }

  private setTask(id: JeremiasTaskId, time: number): void {
    const taskId = id;

    if (taskId !== 'dragCursor' && taskId !== 'chaseCursor') {
      this.releaseCursor();
    }
    if (taskId !== 'grabTarget' && taskId !== 'bringNote') {
      this.releaseDragCarry(false);
    }

    this.task = { id: taskId, startedAt: time };

    if (taskId === 'wander') {
      if (this.isOffscreen()) {
        const dir = this.task.offscreenDir ?? pickRandom(['left', 'right', 'top'] as const);
        this.task.offscreenDir = dir;
        this.task.stage = 'enter';
        this.target = this.entryTargetFromDir(dir);
        this.orientForEntry(dir, time);
        this.maxSpeed = this.config.speed.run;
        this.setSideLocomotionAnim('run');
      } else {
        this.target = this.randomPoint();
        this.maxSpeed = this.config.speed.walk;
        if (time >= this.faceLockUntil) {
          this.groundFlipTarget = this.target.x < this.position.x;
          this.facingLeft = this.groundFlipTarget;
        }
        this.setSideLocomotionAnim('walk');
      }
      this.task.endsAt = time + randomRange(4000, 9000);
    } else if (taskId === 'chaseCursor') {
      this.maxSpeed = this.config.speed.charge;
      this.groundFlipTarget = this.mouse.x < this.position.x;
      this.facingLeft = this.groundFlipTarget;
      this.setSideLocomotionAnim('run');
    } else if (taskId === 'dragCursor') {
      this.maxSpeed = this.config.speed.charge;
      this.groundFlipTarget = this.mouse.x < this.position.x;
      this.facingLeft = this.groundFlipTarget;
      this.setSideLocomotionAnim('run');
    } else if (taskId === 'grabTarget') {
      this.task.stage = 'approach';
      this.maxSpeed = this.config.speed.run;
      const picked = this.pickVisibleTarget();
      if (picked) {
        this.task.targetEl = picked.el;
        this.target = picked.point;
        this.groundFlipTarget = this.target.x < this.position.x;
        this.facingLeft = this.groundFlipTarget;
      }
      this.setSideLocomotionAnim('run');
    } else if (taskId === 'bringNote') {
      this.task.panel = undefined;
      this.task.bringCard = undefined;
      this.finalizeDragCarry();
      if (this.isOffscreen()) {
        this.task.stage = 'waiting';
        this.task.offscreenDir = this.task.offscreenDir ?? pickRandom(['left', 'right', 'top'] as const);
      } else {
        this.task.stage = 'exit';
        this.task.offscreenDir = pickRandom(['left', 'right', 'top'] as const);
      }
    }
  }

  private placeOffscreen(dir: 'left' | 'right' | 'top'): void {
    const point = this.offscreenPoint(dir);
    this.position.x = point.x;
    this.position.y = point.y;
  }

  private orientForEntry(dir: 'left' | 'right' | 'top', time: number): void {
    if (dir === 'right') {
      this.facingLeft = true;
    } else if (dir === 'left') {
      this.facingLeft = false;
    }
    this.groundFlipTarget = this.facingLeft;
    this.flyFlipTarget = this.facingLeft;
    this.faceLockUntil = time + 160;
  }

  /** Ponto visível de entrada, alinhado à borda de origem. */
  private entryTargetFromDir(dir: 'left' | 'right' | 'top', pad = 72): Vec2 {
    const maxY = Math.max(pad, window.innerHeight - pad - 52);
    if (dir === 'left') {
      return {
        x: randomRange(pad, window.innerWidth * 0.45),
        y: randomRange(pad, maxY),
      };
    }
    if (dir === 'right') {
      return {
        x: randomRange(window.innerWidth * 0.55, window.innerWidth - pad),
        y: randomRange(pad, maxY),
      };
    }
    return {
      x: randomRange(pad, window.innerWidth - pad),
      y: randomRange(pad, Math.min(window.innerHeight * 0.45, maxY)),
    };
  }

  private isOnScreen(): boolean {
    const pad = 28;
    return (
      this.position.x >= pad &&
      this.position.x <= window.innerWidth - pad &&
      this.position.y >= pad &&
      this.position.y <= window.innerHeight - pad
    );
  }

  private moveToward(point: Vec2, dt: number, acceleration: number): void {
    const dx = point.x - this.position.x;
    const dy = point.y - this.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const desiredX = (dx / dist) * this.maxSpeed;
    const desiredY = (dy / dist) * this.maxSpeed;
    const blend = Math.min(1, acceleration * dt / Math.max(this.maxSpeed, 1));
    this.velocity.x = lerp(this.velocity.x, desiredX, blend);
    this.velocity.y = lerp(this.velocity.y, desiredY, blend);

    if (dist < 16) {
      this.velocity.x *= 0.85;
      this.velocity.y *= 0.85;
    }

    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
  }

  private randomPoint(): Vec2 {
    const pad = 72;
    return {
      x: randomRange(pad, window.innerWidth - pad),
      y: randomRange(pad, window.innerHeight - pad),
    };
  }

  private randomVisiblePanelPoint(width: number, height: number): Vec2 {
    const pad = 20;
    const minX = pad + width * 0.5;
    const maxX = window.innerWidth - pad - width * 0.5;
    const minY = pad + height * 0.5;
    const maxY = window.innerHeight - pad - height * 0.5;
    return {
      x: randomRange(Math.min(minX, maxX), Math.max(minX, maxX)),
      y: randomRange(Math.min(minY, maxY), Math.max(minY, maxY)),
    };
  }

  /** Destino caótico — pode ser fora da tela ou em outro canto. */
  private randomDragDestination(el?: HTMLElement | null): Vec2 {
    const width = el?.offsetWidth ?? 140;
    const height = el?.offsetHeight ?? 90;
    const hw = width * 0.5;
    const hh = height * 0.5;

    if (
      this.config.behavior.allowOffscreenDrag &&
      Math.random() < this.config.behavior.offscreenDragChance
    ) {
      const side = pickRandom(['left', 'right', 'top', 'bottom'] as const);
      switch (side) {
        case 'left':
          return {
            x: randomRange(-hw - 60, hw + 10),
            y: randomRange(hh + 24, window.innerHeight - hh - 24),
          };
        case 'right':
          return {
            x: randomRange(window.innerWidth - hw - 10, window.innerWidth + hw + 80),
            y: randomRange(hh + 24, window.innerHeight - hh - 24),
          };
        case 'top':
          return {
            x: randomRange(hw + 24, window.innerWidth - hw - 24),
            y: randomRange(-hh - 50, hh + 20),
          };
        case 'bottom':
          return {
            x: randomRange(hw + 24, window.innerWidth - hw - 24),
            y: randomRange(window.innerHeight - hh - 20, window.innerHeight + hh + 100),
          };
      }
    }

    return this.randomVisiblePanelPoint(width, height);
  }

  private clampElementToViewport(el: HTMLElement, padding = 16): void {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    const rect = el.getBoundingClientRect();
    let x = Number.isFinite(rect.left) ? rect.left : parseFloat(el.style.left) || 0;
    let y = Number.isFinite(rect.top) ? rect.top : parseFloat(el.style.top) || 0;

    if (!this.config.behavior.allowOffscreenDrag) {
      x = clamp(x, padding, window.innerWidth - w - padding);
      y = clamp(y, padding, window.innerHeight - h - padding);
    } else {
      const minVisible = 40;
      x = clamp(x, -w + minVisible, window.innerWidth - minVisible);
      y = clamp(y, -h + minVisible, window.innerHeight - minVisible);
    }

    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
  }

  private offscreenPoint(dir: 'left' | 'right' | 'top'): Vec2 {
    if (dir === 'left') return { x: -80, y: randomRange(80, window.innerHeight - 80) };
    if (dir === 'right') return { x: window.innerWidth + 80, y: randomRange(80, window.innerHeight - 80) };
    return { x: randomRange(80, window.innerWidth - 80), y: -80 };
  }

  private isOffscreen(): boolean {
    return this.position.x < -50 || this.position.x > window.innerWidth + 50 || this.position.y < -50;
  }

  private pickVisibleTarget(): { el: HTMLElement; point: Vec2 } | null {
    const selectors = [...this.config.behavior.targets].sort(() => Math.random() - 0.5);
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!(el instanceof HTMLElement)) continue;

      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      if (rect.right < 0 || rect.left > window.innerWidth) continue;

      return { el, point: this.elementApproachPoint(el, { preferSide: true }) };
    }
    return null;
  }

  private elementApproachPoint(el: HTMLElement, opts?: { preferSide?: boolean }): Vec2 {
    const rect = el.getBoundingClientRect();
    const cy = rect.top + rect.height * 0.58;

    if (opts?.preferSide) {
      const side = this.pickApproachSide(rect);
      return side === 'left'
        ? { x: rect.left - 34, y: cy }
        : { x: rect.right + 34, y: cy };
    }

    const cx = rect.left + rect.width * 0.5;
    const duckLeft = this.position.x < cx;
    return {
      x: duckLeft ? rect.left - 34 : rect.right + 34,
      y: cy,
    };
  }

  private pickApproachSide(rect: DOMRect): 'left' | 'right' {
    const cy = rect.top + rect.height * 0.58;
    const leftPoint = { x: rect.left - 34, y: cy };
    const rightPoint = { x: rect.right + 34, y: cy };
    const distLeft = distance(this.position, leftPoint);
    const distRight = distance(this.position, rightPoint);

    if (Math.abs(distLeft - distRight) < 48) {
      return this.facingLeft ? 'left' : 'right';
    }

    return distLeft <= distRight ? 'left' : 'right';
  }

  private carryMassFactor(): number {
    if (!this.dragCarry) return 1;
    const w = this.dragCarry.el.offsetWidth;
    const h = this.dragCarry.el.offsetHeight;
    return clamp(0.84 + (w * h) / 85000, 0.84, 1.38);
  }

  private beginDragCarry(
    el: HTMLElement,
    attachX: number,
    attachY: number,
    pinned: boolean,
    origin?: Vec2,
  ): void {
    const rect = el.getBoundingClientRect();
    const x = origin?.x ?? rect.left;
    const y = origin?.y ?? rect.top;
    el.style.transition = 'none';
    el.style.willChange = 'transform, left, top';

    this.dragCarry = {
      el,
      x,
      y,
      vx: 0,
      vy: 0,
      attachX,
      attachY,
      tilt: 0,
      pinned,
    };
    this.applyDragCarryTransform();
  }

  private updateDragCarry(dt: number, strength = 1, mode: 'spring' | 'snap' = 'spring'): void {
    if (!this.dragCarry) return;

    const bill = this.billAnchor();
    const pullLag = lerp(0.08, 0.22, strength);
    const bob = Math.sin(performance.now() * 0.012) * pullLag * 2.5;
    const targetX = bill.x - this.dragCarry.attachX;
    const targetY = bill.y - this.dragCarry.attachY + bob;

    if (mode === 'snap') {
      this.dragCarry.x = targetX;
      this.dragCarry.y = targetY;
      this.dragCarry.vx = 0;
      this.dragCarry.vy = 0;
      this.dragCarry.tilt = clamp(this.velocity.x * 0.035, -6, 6);
    } else {
      const stiffness = lerp(140, 260, strength);
      const damping = lerp(32, 22, strength);

      const dx = targetX - this.dragCarry.x;
      const dy = targetY - this.dragCarry.y;
      this.dragCarry.vx += (dx * stiffness - this.dragCarry.vx * damping) * dt;
      this.dragCarry.vy += (dy * stiffness - this.dragCarry.vy * damping) * dt;
      this.dragCarry.x += this.dragCarry.vx * dt;
      this.dragCarry.y += this.dragCarry.vy * dt;

      const pullTilt = clamp(
        this.dragCarry.vx * 0.06 + this.velocity.x * 0.045,
        -10,
        10,
      );
      this.dragCarry.tilt = lerp(this.dragCarry.tilt, pullTilt, Math.min(1, 12 * dt));
    }
    this.applyDragCarryTransform();
  }

  private applyDragCarryTransform(): void {
    if (!this.dragCarry) return;
    const { el, x, y, attachX, attachY, tilt } = this.dragCarry;
    el.style.left = `${Math.round(x)}px`;
    el.style.top = `${Math.round(y)}px`;
    el.style.transform = `rotate(${tilt.toFixed(2)}deg)`;
    el.style.transformOrigin = `${attachX}px ${attachY}px`;
  }

  private finalizeDragCarry(): void {
    if (!this.dragCarry) return;
    const el = this.dragCarry.el;
    el.style.left = `${Math.round(this.dragCarry.x)}px`;
    el.style.top = `${Math.round(this.dragCarry.y)}px`;
    el.style.transform = 'none';
    el.style.transformOrigin = '';
    el.style.willChange = '';
    el.style.pointerEvents = 'auto';
    if (el.classList.contains('jeremias-panel')) {
      el.dataset.jeremiasCarried = 'false';
      this.overlay.bringPanelToFront(el);
      this.overlay.clampPanelInViewport(el);
    }
    this.dragCarry = null;
  }

  private dropPanelCarry(panel: HTMLElement): void {
    if (!this.dragCarry || this.dragCarry.el !== panel) return;
    panel.dataset.jeremiasCarried = 'false';
    panel.style.transform = 'none';
    panel.style.transformOrigin = '';
    panel.style.willChange = '';
    panel.style.pointerEvents = 'auto';
    this.dragCarry = null;
    this.overlay.bringPanelToFront(panel);
    this.overlay.clampPanelInViewport(panel);
    this.animator.setCarryPose(false);
    this.animator.setPeckHold(false);
    this.faceLockUntil = performance.now() + 520;
  }

  private dropDragCarry(): void {
    if (!this.dragCarry) return;
    const el = this.dragCarry.el;
    el.style.left = `${Math.round(this.dragCarry.x)}px`;
    el.style.top = `${Math.round(this.dragCarry.y)}px`;
    el.style.transform = 'rotate(0deg)';
    el.style.transformOrigin = '';
    el.style.willChange = '';
    this.dragCarry = null;
    if (el.classList.contains('jeremias-panel')) {
      this.overlay.clampPanelInViewport(el);
    } else {
      this.clampElementToViewport(el);
    }
    el.style.pointerEvents = '';
    this.animator.setCarryPose(false);
    this.animator.setPeckHold(false);
    this.faceLockUntil = performance.now() + 520;
  }

  private pinElement(el: HTMLElement): void {
    const rect = el.getBoundingClientRect();
    el.dataset.jeremiasPrevStyle = el.getAttribute('style') ?? '';

    el.style.position = 'fixed';
    el.style.left = `${rect.left}px`;
    el.style.top = `${rect.top}px`;
    el.style.width = `${rect.width}px`;
    el.style.height = `${rect.height}px`;
    el.style.margin = '0';
    el.style.boxSizing = 'border-box';
    el.style.zIndex = '2147483640';
    el.style.pointerEvents = 'none';
  }

  private releaseDragCarry(restore: boolean): void {
    if (!this.dragCarry) return;

    const el = this.dragCarry.el;
    if (this.dragCarry.pinned && restore) {
      if (el.dataset.jeremiasPrevStyle !== undefined) {
        if (el.dataset.jeremiasPrevStyle) {
          el.setAttribute('style', el.dataset.jeremiasPrevStyle);
        } else {
          el.removeAttribute('style');
        }
      }
      delete el.dataset.jeremiasPrevStyle;
    } else if (!restore) {
      el.style.transform = 'rotate(0deg)';
      el.style.transformOrigin = '';
      el.style.willChange = '';
      this.clampElementToViewport(el);
      el.style.pointerEvents = '';
    }

    this.dragCarry = null;
  }

  private createFakeCursor(zIndex: number): HTMLDivElement {
    const el = document.createElement('div');
    el.className = 'jeremias-fake-cursor';
    el.setAttribute('aria-hidden', 'true');

    const img = document.createElement('img');
    img.src = WINDOWS_ARROW_CURSOR_DATA_URL;
    img.alt = '';
    img.draggable = false;
    img.width = WINDOWS_CURSOR_SIZE;
    img.height = WINDOWS_CURSOR_SIZE;
    img.decoding = 'sync';
    img.style.cssText = [
      'display:block',
      `width:${WINDOWS_CURSOR_SIZE}px`,
      `height:${WINDOWS_CURSOR_SIZE}px`,
      'image-rendering:auto',
      '-webkit-user-drag:none',
      'user-select:none',
    ].join(';');
    el.appendChild(img);

    el.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `width:${WINDOWS_CURSOR_SIZE}px`,
      `height:${WINDOWS_CURSOR_SIZE}px`,
      'pointer-events:none',
      `z-index:${zIndex}`,
      'transform:translate(-100px,-100px)',
      'transform-origin:0 0',
      'opacity:0',
      'transition:opacity .12s ease',
      'will-change:transform',
    ].join(';');
    return el;
  }

  private injectCursorHideStyle(): void {
    if (document.getElementById('jeremias-cursor-style')) return;
    const style = document.createElement('style');
    style.id = 'jeremias-cursor-style';
    style.textContent = `
      html.${this.cursorHideClass},
      html.${this.cursorHideClass} * {
        cursor: none !important;
      }
    `;
    document.head.appendChild(style);
  }

  private billAnchor(): Vec2 {
    const peckReach =
      this.currentAnim === 'peck' || this.dragCarry || this.task.stage === 'peck' ? 1 : 0;
    const peckT =
      this.task.stage === 'peck' && this.task.peckStartedAt
        ? clamp((performance.now() - this.task.peckStartedAt) / PECK_DURATION_MS, 0, 1)
        : peckReach;
    const reach = this.dragCarry ? Math.max(peckReach, 0.85) : peckT;
    const faceLeft =
      this.task.stage === 'peck' && this.task.peckFacingLeft !== undefined
        ? this.task.peckFacingLeft
        : this.facingLeft;
    const offsetX = (faceLeft ? -1 : 1) * lerp(10, 22, reach) * this.config.render.scale;
    const offsetY = lerp(-10, -1, reach) * this.config.render.scale;
    return {
      x: Math.round(this.renderPos.x + offsetX),
      y: Math.round(this.renderPos.y + offsetY),
    };
  }

  private beginCursorDrag(time: number, durationMs: number): void {
    if (this.cursorGrabbed) {
      this.cursorGrabUntil = Math.max(this.cursorGrabUntil, time + durationMs);
      return;
    }

    this.cursorGrabbed = true;
    this.cursorGrabUntil = time + durationMs;
    this.fakeCursorPos = { x: this.mouse.x, y: this.mouse.y };
    document.documentElement.classList.add(this.cursorHideClass);
    this.fakeCursor.style.opacity = '1';
    this.syncFakeCursorDom();
  }

  private releaseCursor(): void {
    if (!this.cursorGrabbed) return;
    this.cursorGrabbed = false;
    this.cursorGrabUntil = 0;
    document.documentElement.classList.remove(this.cursorHideClass);
    this.fakeCursor.style.opacity = '0';
    this.fakeCursor.style.transform = 'translate(-100px,-100px)';
  }

  private updateFakeCursor(dt: number): void {
    if (!this.cursorGrabbed) return;
    const anchor = this.billAnchor();
    const follow = Math.min(1, 16 * dt);
    this.fakeCursorPos.x = lerp(this.fakeCursorPos.x, anchor.x, follow);
    this.fakeCursorPos.y = lerp(this.fakeCursorPos.y, anchor.y, follow);
    this.syncFakeCursorDom();
  }

  private syncFakeCursorDom(): void {
    const x = Math.round(this.fakeCursorPos.x);
    const y = Math.round(this.fakeCursorPos.y);
    this.fakeCursor.style.transform = `translate(${x}px, ${y}px)`;
  }

  private drawGroundShadow(wobble: number, leanDeg: number): void {
    const frameH = this.config.character.frameHeight;
    const drawH = frameH * this.config.render.scale;
    const leanRad = (leanDeg * Math.PI) / 180;
    // Pés ficam na base do sprite; inclinação desloca levemente o ponto de contato.
    const footX = this.renderPos.x + drawH * 0.36 * Math.sin(leanRad);
    const footY = this.renderPos.y + drawH * 0.5 + wobble * 0.25;
    const pulse = 1;
    const rx = 21 * this.config.render.scale * pulse;
    const ry = 5 * this.config.render.scale * (1 + Math.abs(wobble) * 0.02);

    this.ctx.save();
    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.14)';
    this.ctx.beginPath();
    this.ctx.ellipse(footX, footY, rx * 1.06, ry * 1.12, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.fillStyle = 'rgba(0, 0, 0, 0.26)';
    this.ctx.beginPath();
    this.ctx.ellipse(footX, footY, rx * 0.84, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();
    this.ctx.restore();
  }

  private drawAngryAura(time: number, intensity: number): void {
    const frameH = this.config.character.frameHeight;
    const drawH = frameH * this.config.render.scale;
    const pulse = 0.88 + Math.sin(time * 0.024) * 0.12;
    const rx = drawH * 0.62 * pulse;
    const ry = drawH * 0.48 * pulse;

    this.ctx.save();
    this.ctx.translate(this.renderPos.x, this.renderPos.y - drawH * 0.06);

    const glow = this.ctx.createRadialGradient(0, 0, 4, 0, 0, rx);
    glow.addColorStop(0, `rgba(255, 92, 48, ${0.34 * intensity})`);
    glow.addColorStop(0.45, `rgba(255, 48, 48, ${0.18 * intensity})`);
    glow.addColorStop(1, 'rgba(255, 32, 32, 0)');

    this.ctx.fillStyle = glow;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    this.ctx.fill();

    this.ctx.strokeStyle = `rgba(255, 70, 50, ${0.22 * intensity})`;
    this.ctx.lineWidth = 2;
    this.ctx.beginPath();
    this.ctx.ellipse(0, 0, rx * 0.92, ry * 0.9, 0, 0, Math.PI * 2);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawAngryMarks(time: number, intensity: number): void {
    const frameH = this.config.character.frameHeight;
    const drawH = frameH * this.config.render.scale;
    const headX = this.renderPos.x + drawH * 0.14;
    const headY = this.renderPos.y - drawH * 0.34;
    const bob = Math.sin(time * 0.03) * 1.5;

    this.ctx.save();
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';

    const drawVein = (cx: number, cy: number, scale: number, rot: number) => {
      this.ctx.save();
      this.ctx.translate(cx, cy + bob);
      this.ctx.rotate(rot);
      this.ctx.scale(scale, scale);

      this.ctx.strokeStyle = `rgba(190, 20, 20, ${0.92 * intensity})`;
      this.ctx.lineWidth = 2.4;
      this.ctx.beginPath();
      this.ctx.moveTo(-5, 4);
      this.ctx.lineTo(0, -1);
      this.ctx.lineTo(5, 4);
      this.ctx.moveTo(-3, 1);
      this.ctx.lineTo(0, -4);
      this.ctx.lineTo(3, 1);
      this.ctx.stroke();

      this.ctx.strokeStyle = `rgba(255, 130, 90, ${0.55 * intensity})`;
      this.ctx.lineWidth = 1.1;
      this.ctx.beginPath();
      this.ctx.moveTo(-2.5, 2);
      this.ctx.lineTo(0, -2);
      this.ctx.lineTo(2.5, 2);
      this.ctx.stroke();
      this.ctx.restore();
    };

    drawVein(headX + 10, headY - 2, 1.05, -0.35);
    drawVein(headX - 8, headY - 6, 0.9, 0.45);

    const puffs = [
      { ox: -16, oy: -8, phase: 0 },
      { ox: 18, oy: -12, phase: 1.4 },
      { ox: 0, oy: -20, phase: 2.8 },
    ];

    for (const puff of puffs) {
      const t = (time * 0.004 + puff.phase) % 1;
      const px = headX + puff.ox + Math.sin(time * 0.01 + puff.phase) * 2;
      const py = headY + puff.oy - t * 18;
      const r = (1 - t) * 5.5;
      const a = (1 - t) * 0.55 * intensity;
      if (a < 0.04) continue;

      this.ctx.fillStyle = `rgba(255, 110, 80, ${a})`;
      this.ctx.beginPath();
      this.ctx.arc(px, py, r, 0, Math.PI * 2);
      this.ctx.fill();
    }

    this.ctx.fillStyle = `rgba(255, 245, 230, ${0.95 * intensity})`;
    this.ctx.strokeStyle = `rgba(160, 20, 20, ${0.95 * intensity})`;
    this.ctx.lineWidth = 1.5;
    this.ctx.font = 'bold 11px system-ui, sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    const label = '!';
    const lx = headX + 20;
    const ly = headY - 10 + bob;
    this.ctx.strokeText(label, lx, ly);
    this.ctx.fillText(label, lx, ly);

    this.ctx.restore();
  }

  private drawAngryFx(time: number): void {
    const remaining = this.angryUntil - time;
    if (remaining <= 0) return;

    const intensity = clamp(remaining / 900, 0.25, 1);
    this.drawAngryAura(time, intensity);
  }

  private drawAngryFxOverlay(time: number): void {
    const remaining = this.angryUntil - time;
    if (remaining <= 0) return;

    const intensity = clamp(remaining / 900, 0.25, 1);
    this.drawAngryMarks(time, intensity);
  }

  private render(time: number): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.ctx.clearRect(0, 0, w, h);

    if (time < this.angryUntil) {
      this.drawAngryFx(time);
    }

    const wobble = this.walkWobble();
    const dragLean = this.dragCarry
      ? clamp(this.dragCarry.tilt * 0.2 + Math.hypot(this.velocity.x, this.velocity.y) * 0.012, -3.5, 3.5)
      : 0;
    const lean = this.movementLeanDeg() + dragLean;

    this.drawGroundShadow(wobble, lean);
    this.animator.draw(
      this.ctx,
      Math.round(this.renderPos.x),
      Math.round(this.renderPos.y),
      this.config.render.scale,
      Math.round(wobble),
      lean,
    );

    if (time < this.angryUntil) {
      this.drawAngryFxOverlay(time);
    }
  }
}

export function createJeremias(config: JeremiasConfig): JeremiasInstance {
  if (typeof window === 'undefined') {
    throw new Error('JEREMIAS can only run in the browser');
  }

  const resolved = resolveJeremiasConfig(config);
  if (
    !isDeviceVisible(resolved.behavior.device, resolved.behavior.mobileBreakpoint)
  ) {
    return {
      destroy: () => {},
      setAggression: () => {},
      grabElement: () => {},
    };
  }

  const stale = document.querySelector('.jeremias-root');
  if (stale) stale.remove();
  return new JeremiasEngine(config);
}
